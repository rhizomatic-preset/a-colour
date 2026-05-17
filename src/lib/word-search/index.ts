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
  /**
   * Minimum cosine score for the encoder's top-1 result to be accepted. Below
   * this, the encoder returns nothing — abstract or out-of-vocabulary nouns
   * (`power`, `fake`) don't return random colours. Defaults to 0.35.
   */
  semanticThreshold?: number;
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
  const semanticThreshold = options.semanticThreshold ?? 0.449;

  // Layer 1 — Distillation lookup. Authoritative for the 693 hand-curated
  // common-noun → family/hex entries. Microseconds; short-circuits everything.
  if (options.distillation) {
    const familyIndex = options.familyIndex ?? buildFamilyIndex(library);
    const distilled = searchDistilled(query, library, options.distillation, familyIndex, topN);
    if (distilled !== null) return distilled;
  }

  // Layer 2 — Expander + TF-IDF. Handles Te Reo (whero, kakariki) and weather
  // (cloud, drizzle) via the handcurated expansion dictionary, plus literal
  // colour names (eggshell, terracotta) and run-together CSS names
  // (mediumvioletred, palegoldenrod) via TF-IDF over the library. Runs BEFORE
  // the encoder so authoritative hand-curated answers always win — the
  // encoder doesn't know Te Reo and would otherwise return weak guesses for
  // those queries.
  const expanderResults = await runExpanderTfidf(
    query,
    library,
    tfidf,
    expander,
    topN,
    options.blend ?? "rrf",
    embedder.id,
  );
  if (expanderResults.length > 0) return expanderResults;

  // Layer 3 — Phase B encoder. Last resort before "no results". Cosine-rank
  // the query against precomputed library-name embeddings, accept only if
  // top-1 cosine ≥ semanticThreshold. This is the layer that catches
  // unconstrained adult vocabulary (silk, pigeon, hammer, cabernet) and
  // gates out abstract nouns (power, fake) whose nearest neighbour is
  // essentially noise.
  if (embedder && embedder !== NullEmbedder && embedder.isReady()) {
    const queryVector = await embedder.encodeQuery(query);
    const ranked = rankByCosine(queryVector, topN);
    if (ranked.length > 0 && ranked[0].score >= semanticThreshold) {
      return ranked.map((hit) => ({
        ...library[hit.index],
        score: hit.score,
        engineId: embedder.id,
      }));
    }
  }

  return [];
}

async function runExpanderTfidf(
  query: string,
  library: ColorReference[],
  tfidf: TfidfIndex,
  expander: QueryExpander | undefined,
  topN: number,
  blend: BlendStrategy,
  engineId: string,
): Promise<WordSearchResult[]> {
  // Bypass when no expander is wired in (or it's the noop): single-pass TF-IDF
  // over the raw query tokens. Keeps the eval snapshot identical to the
  // pre-expander baseline when run with `--expander=noop`.
  if (!expander || expander === NoopExpander) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    const hits = queryTfidf(tfidf, tokens, topN);
    return hits.map((hit) => ({
      ...library[hit.colorIndex],
      score: hit.score,
      engineId,
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
      engineId,
    }));
    return { weight, results };
  });

  return blendResults(lists, topN, blend);
}
