import { env, pipeline } from "@huggingface/transformers";
import type { Embedder, LibraryVariant } from "@/lib/word-search/embedder";

// Phase B — fine-tuned `sentence-transformers/all-MiniLM-L6-v2` exported to
// int8-quantised ONNX. Trained on the 693-entry distillation lookup to push
// `wood` near `Earth`, `wolf` near `Warm Grey`, etc. Runtime path: lazy-load
// the model + tokeniser via transformers.js, lazy-fetch the precomputed
// library embeddings binary, then cosine-rank the query against the library.
//
// Files served from public/ (Vite copies verbatim to dist/):
//   /word-encoder/onnx/model_quantized.onnx
//   /word-encoder/tokenizer.json + config.json + etc.
//   /colour-embeddings.bin
//
// Sized at 384-dim Float32 vectors × 980 library entries ≈ 1.5 MB binary plus
// ~22 MB ONNX + ~700 KB tokeniser. Precached by the PWA on install.

const MODEL_ID = "word-encoder";
const EMBEDDINGS_URL = "/colour-embeddings.bin";

type FeatureExtractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;

type Loaded = {
  extractor: FeatureExtractor;
  libraryVectors: Float32Array;
  vectorCount: number;
  vectorDim: number;
};

export type EncoderLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

let loaded: Loaded | undefined;
let loadingPromise: Promise<Loaded> | undefined;
let currentState: EncoderLoadState = { status: "idle" };
const listeners = new Set<(state: EncoderLoadState) => void>();

/**
 * Subscribe to encoder load-state updates. The subscriber is immediately
 * called with the current state and again on every change until unsubscribed.
 * Used by the WordPicker to render a loading indicator that survives a load
 * kicked off by App-level idle preloading.
 *
 * Note: state changes are coarse (idle → loading → ready/error). Earlier
 * versions exposed per-chunk progress aggregated from transformers.js's
 * progress_callback, but that fired too aggressively and tripped Vite's HMR
 * error reporting in a tight loop. Coarse state is enough — the loading bar
 * is indeterminate during download, instant once the cache is warm.
 */
export function subscribeEncoderLoad(cb: (state: EncoderLoadState) => void): () => void {
  listeners.add(cb);
  // Wrap to keep one bad listener from breaking others / propagating to
  // transformers.js callbacks higher up the stack.
  try {
    cb(currentState);
  } catch (err) {
    console.error("[encoder] subscriber threw on initial call:", err);
  }
  return () => {
    listeners.delete(cb);
  };
}

function setState(next: EncoderLoadState): void {
  if (
    currentState.status === next.status &&
    (currentState.status !== "error" ||
      (next.status === "error" && currentState.message === next.message))
  ) {
    return;
  }
  currentState = next;
  for (const l of listeners) {
    try {
      l(next);
    } catch (err) {
      console.error("[encoder] subscriber threw:", err);
    }
  }
}

async function ensureLoaded(signal?: AbortSignal): Promise<Loaded> {
  if (loaded) return loaded;
  if (loadingPromise) return loadingPromise;

  setState({ status: "loading" });

  loadingPromise = (async () => {
    try {
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = "/";

      // No progress_callback — see comment on subscribeEncoderLoad above.
      // The model + tokeniser come in via the transformers.js pipeline's
      // own fetch caching; we just await its completion.
      const extractor = await pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
      });

      const response = await fetch(EMBEDDINGS_URL, { signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${EMBEDDINGS_URL}: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const libraryVectors = new Float32Array(buffer);
      const vectorDim = 384;
      if (libraryVectors.length % vectorDim !== 0) {
        throw new Error(
          `colour-embeddings.bin length (${libraryVectors.length}) not divisible by dim ${vectorDim}`,
        );
      }
      const vectorCount = libraryVectors.length / vectorDim;

      loaded = { extractor, libraryVectors, vectorCount, vectorDim };
      setState({ status: "ready" });
      return loaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message });
      throw err;
    }
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = undefined;
  }
}

export const TransformersEmbedder: Embedder = {
  id: "transformers" as Embedder["id"],
  displayName: "Fine-tuned MiniLM",
  // Approximate bundle cost — model + tokeniser + embeddings combined.
  assetBytes: 22 * 1024 * 1024 + 1.5 * 1024 * 1024 + 700 * 1024,

  isReady(): boolean {
    return loaded !== undefined;
  },

  // onProgress on Embedder is kept for interface compatibility but is unused
  // — callers should subscribeEncoderLoad() to receive aggregate progress
  // updates that survive across concurrent load() calls (idle preload from
  // App.tsx + on-mount load from WordPicker share the same load).
  async load(_onProgress, signal) {
    await ensureLoaded(signal);
  },

  async encodeQuery(text: string): Promise<Float32Array> {
    const { extractor } = await ensureLoaded(undefined);
    // Mean-pool + L2-normalise to match the training distribution exactly.
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data as Float32Array);
  },

  // The library vectors are loaded once and never re-fetched; callers are
  // expected to honour LibraryVariant === "small" (the only library Phase B
  // has trained against). Loading any other variant returns the small vectors
  // — we don't yet support per-library encoders.
  async loadColorVectors(_library: LibraryVariant): Promise<Float32Array[]> {
    const { libraryVectors, vectorCount, vectorDim } = await ensureLoaded(undefined);
    const out: Float32Array[] = new Array(vectorCount);
    for (let i = 0; i < vectorCount; i += 1) {
      out[i] = libraryVectors.subarray(i * vectorDim, (i + 1) * vectorDim);
    }
    return out;
  },
};

/** Synchronous cosine ranking against the loaded library vectors. */
export function rankByCosine(
  query: Float32Array,
  topN: number,
): { index: number; score: number }[] {
  if (!loaded) return [];
  const { libraryVectors, vectorCount, vectorDim } = loaded;
  const scores: { index: number; score: number }[] = new Array(vectorCount);
  for (let i = 0; i < vectorCount; i += 1) {
    let dot = 0;
    const offset = i * vectorDim;
    for (let d = 0; d < vectorDim; d += 1) {
      dot += query[d] * libraryVectors[offset + d];
    }
    scores[i] = { index: i, score: dot };
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topN);
}
