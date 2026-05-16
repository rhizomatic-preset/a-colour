/**
 * Phase 2A — GloVe bake-off candidate embedders.
 *
 * One source file, two candidate IDs (`glove-50d`, `glove-300d`). The two
 * differ only in dimension and input txt path. Both implement the same
 * Embedder contract used by `scripts/eval.ts --engine=<id>`.
 *
 * Build-time only — never imported by the running app.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import type { ColorReference } from "../../../src/lib/color-matcher.ts";
import type { Embedder, LibraryVariant } from "../../../src/lib/word-search/embedder.ts";
import { tokenize } from "../../../src/lib/word-search/tokenize.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../../..");
const CACHE = resolve(ROOT, "scripts/data/.cache");
const OUT = resolve(ROOT, "src/generated");

export type GloveConfig = {
  id: "glove-50d" | "glove-300d";
  displayName: string;
  /** Filename inside scripts/data/.cache/. */
  txtFile: string;
  dim: number;
};

export const GLOVE_CONFIGS: Record<string, GloveConfig> = {
  "glove-50d": {
    id: "glove-50d",
    displayName: "GloVe 6B 50d",
    txtFile: "glove.6B.50d.txt",
    dim: 50,
  },
  "glove-300d": {
    id: "glove-300d",
    displayName: "GloVe 6B 300d",
    txtFile: "glove.6B.300d.txt",
    dim: 300,
  },
};

/**
 * Stream the GloVe text file, materialising only the requested tokens into a
 * vocab→Float32Array map. The full file is 171 MB (50d) / 1 GB (300d), so we
 * never hold all of it in memory.
 */
export async function loadVocabSubset(
  config: GloveConfig,
  tokens: Set<string>,
): Promise<Map<string, Float32Array>> {
  const path = resolve(CACHE, config.txtFile);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path.replace(`${ROOT}/`, "")} — run \`just fetch-glove\` to populate the cache (then extract the .300d.txt entry from the zip if you want 300d).`,
    );
  }
  const out = new Map<string, Float32Array>();
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const token = line.slice(0, sp);
    if (!tokens.has(token)) continue;
    const parts = line.slice(sp + 1).split(" ");
    const v = new Float32Array(parts.length);
    for (let i = 0; i < parts.length; i++) v[i] = Number.parseFloat(parts[i]);
    out.set(token, v);
  }
  return out;
}

/** Per-document token enrichment matches the TF-IDF build (name + family + descriptions). */
export function colorDocTokens(c: ColorReference, descTokens?: string[]): string[] {
  const tokens = new Set<string>();
  for (const t of tokenize(c.name)) tokens.add(t);
  for (const t of descTokens ?? []) tokens.add(t);
  return Array.from(tokens);
}

export function averageVector(
  tokens: string[],
  vocab: Map<string, Float32Array>,
  dim: number,
): Float32Array {
  const sum = new Float32Array(dim);
  let count = 0;
  for (const tok of tokens) {
    const v = vocab.get(tok);
    if (!v) continue;
    for (let i = 0; i < dim; i++) sum[i] += v[i];
    count += 1;
  }
  if (count === 0) return sum;
  for (let i = 0; i < dim; i++) sum[i] /= count;
  return sum;
}

export function l2normalise(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (n === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/**
 * Bake-off Embedder factory. The query encoder loads the GloVe subset on
 * first use (cached for the lifetime of the script); the colour-vectors are
 * read from the pre-built `.bin` file emitted by `build-embeddings.ts`.
 */
export function makeGloveEmbedder(
  config: GloveConfig,
  library: ColorReference[],
  queryVocabHint?: Iterable<string>,
): Embedder {
  let vocabPromise: Promise<Map<string, Float32Array>> | null = null;

  return {
    id: config.id,
    displayName: config.displayName,
    assetBytes: 0,
    isReady(): boolean {
      // Lazily loaded; bake-off scripts treat this as "ready when needed".
      return true;
    },
    async load(): Promise<void> {
      // No-op for the script-only candidate. The actual GloVe subset is
      // streamed on first encodeQuery call.
      return;
    },
    async encodeQuery(text: string): Promise<Float32Array> {
      const queryTokens = tokenize(text);
      if (vocabPromise === null) {
        // We need a vocabulary that covers (a) all eval-side query tokens so
        // the average isn't empty, (b) the colour-name tokens (rarely used by
        // the query encoder but cheap to include), and (c) a handful of family
        // words. The bake-off script passes (a) explicitly via queryVocabHint.
        const needed = new Set<string>(queryTokens);
        for (const c of library) {
          for (const t of tokenize(c.name)) needed.add(t);
        }
        if (queryVocabHint) {
          for (const t of queryVocabHint) needed.add(t.toLowerCase());
        }
        for (const fam of [
          "red",
          "orange",
          "yellow",
          "green",
          "blue",
          "purple",
          "pink",
          "brown",
          "black",
          "white",
          "gray",
          "grey",
          "silver",
          "teal",
          "magenta",
        ]) {
          needed.add(fam);
        }
        vocabPromise = loadVocabSubset(config, needed);
      }
      const vocab = await vocabPromise;
      return averageVector(queryTokens, vocab, config.dim);
    },
    async loadColorVectors(libraryId: LibraryVariant): Promise<Float32Array[]> {
      const binPath = resolve(OUT, `embeddings-${config.id}-${libraryId}.bin`);
      const metaPath = resolve(OUT, `embeddings-${config.id}-${libraryId}.json`);
      if (!existsSync(binPath) || !existsSync(metaPath)) {
        throw new Error(
          `Missing precomputed colour vectors for ${config.id}/${libraryId}. ` +
            `Run \`just build-embeddings ${config.id}\` first.`,
        );
      }
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
        dim: number;
        count: number;
      };
      if (meta.dim !== config.dim) {
        throw new Error(
          `Dim mismatch: meta says ${meta.dim}, candidate config says ${config.dim}.`,
        );
      }
      const buf = readFileSync(binPath);
      const f32 = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
      const out: Float32Array[] = [];
      for (let i = 0; i < meta.count; i++) {
        out.push(f32.slice(i * meta.dim, (i + 1) * meta.dim));
      }
      return out;
    },
  };
}

/** Used by build-embeddings.ts. */
export function writeEmbeddings(
  config: GloveConfig,
  libraryId: LibraryVariant,
  library: ColorReference[],
  vectors: Float32Array[],
): { binPath: string; metaPath: string } {
  const binPath = resolve(OUT, `embeddings-${config.id}-${libraryId}.bin`);
  const metaPath = resolve(OUT, `embeddings-${config.id}-${libraryId}.json`);
  // Concatenate into one Float32Array so the file is a flat row-major dump.
  const concat = new Float32Array(library.length * config.dim);
  for (let i = 0; i < library.length; i++) {
    concat.set(vectors[i], i * config.dim);
  }
  writeFileSync(binPath, Buffer.from(concat.buffer));
  const meta = { engine: config.id, library: libraryId, dim: config.dim, count: library.length };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  return { binPath, metaPath };
}
