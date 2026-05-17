import type { ColorReference } from "@/lib/color-matcher";
import { type BlendStrategy, blendResults } from "@/lib/word-search/blend";
import {
  buildFamilyIndex,
  type DistillationLookup,
  type FamilyIndex,
  searchDistilled,
} from "@/lib/word-search/distillation/lookup";
import { type Embedder, NullEmbedder } from "@/lib/word-search/embedder";
import { NoopExpander, type QueryExpander } from "@/lib/word-search/expander";
import { queryTfidf, type TfidfIndex } from "@/lib/word-search/tfidf-index";
import { tokenize } from "@/lib/word-search/tokenize";
import { rankByCosine } from "@/lib/word-search/transformers-embedder";

export type WordSearchResult = ColorReference & {
  score: number;
  engineId: string;
};

export type SearchOptions = {
  topN?: number;
  threshold?: number;
  expander?: QueryExpander;
  blend?: BlendStrategy;
  /** Build-time-distilled common-noun lookup. When present and the query matches
   * with confidence ≥ medium, its result short-circuits the TF-IDF + expander path. */
  distillation?: DistillationLookup;
  /** Optional precomputed family index for `distillation`. Built lazily otherwise. */
  familyIndex?: FamilyIndex;
};

export async function searchByWord(
  query: string,
  library: ColorReference[],
  tfidf: TfidfIndex,
  embedder: Embedder = NullEmbedder,
  options: SearchOptions = {},
): Promise<WordSearchResult[]> {
  const topN = options.topN ?? 3;
  const expander = options.expander;

  // Phase-distillation layer: build-time-distilled common-noun → family + hex
  // map. When the query (one of its tokens) is in the lookup with confidence
  // ≥ medium, return the family-filtered Oklab-nearest library entries and
  // skip the TF-IDF path entirely. This is the primary path for queries like
  // "wood", "ginger", "denim" where TF-IDF (even with expansion) had no signal.
  if (options.distillation) {
    const familyIndex = options.familyIndex ?? buildFamilyIndex(library);
    const distilled = searchDistilled(query, library, options.distillation, familyIndex, topN);
    if (distilled !== null) return distilled;
  }

  // Phase B — fine-tuned sentence-transformer. After the lookup misses (or
  // returns confidence:low), the encoder takes over: cosine-rank the query
  // against precomputed library-name embeddings. Generalises semantically
  // beyond the 693 hand-curated entries — handles birds, fabrics, vegetables,
  // wines, materials, foods. Fires only when an Embedder is wired in and
  // already loaded; load is async + lazy so first-paint isn't blocked.
  if (embedder && embedder !== NullEmbedder && embedder.isReady()) {
    const queryVector = await embedder.encodeQuery(query);
    const ranked = rankByCosine(queryVector, topN);
    if (ranked.length > 0) {
      return ranked.map((hit) => ({
        ...library[hit.index],
        score: hit.score,
        engineId: embedder.id,
      }));
    }
  }

  // Bypass: when no expander is wired in (or it's the noop), keep the original
  // single-pass path verbatim. RRF over a single phrase ranks the same but
  // produces different score values, which would diff the eval snapshots.
  if (!expander || expander === NoopExpander) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    const hits = queryTfidf(tfidf, tokens, topN);
    return hits.map((hit) => ({
      ...library[hit.colorIndex],
      score: hit.score,
      engineId: embedder.id,
    }));
  }

  const phrases = await expander.expand(query);
  if (phrases.length === 0) return [];

  const lists = phrases.map(({ phrase, weight }) => {
    const tokens = tokenize(phrase);
    if (tokens.length === 0) return { weight, results: [] as WordSearchResult[] };
    const hits = queryTfidf(tfidf, tokens, topN);
    const results: WordSearchResult[] = hits.map((hit) => ({
      ...library[hit.colorIndex],
      score: hit.score,
      engineId: embedder.id,
    }));
    return { weight, results };
  });

  return blendResults(lists, topN, options.blend ?? "rrf");
}
