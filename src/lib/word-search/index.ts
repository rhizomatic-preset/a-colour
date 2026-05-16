import type { ColorReference } from "@/lib/color-matcher";
import { type BlendStrategy, blendResults } from "@/lib/word-search/blend";
import { type Embedder, NullEmbedder } from "@/lib/word-search/embedder";
import { NoopExpander, type QueryExpander } from "@/lib/word-search/expander";
import { queryTfidf, type TfidfIndex } from "@/lib/word-search/tfidf-index";
import { tokenize } from "@/lib/word-search/tokenize";

export type WordSearchResult = ColorReference & {
  score: number;
  engineId: string;
};

export type SearchOptions = {
  topN?: number;
  threshold?: number;
  expander?: QueryExpander;
  blend?: BlendStrategy;
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
