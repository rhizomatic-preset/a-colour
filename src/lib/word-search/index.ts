import type { ColorReference } from "@/lib/color-matcher";
import { type Embedder, NullEmbedder } from "@/lib/word-search/embedder";
import { queryTfidf, type TfidfIndex } from "@/lib/word-search/tfidf-index";
import { tokenize } from "@/lib/word-search/tokenize";

export type WordSearchResult = ColorReference & {
  score: number;
  engineId: string;
};

export type SearchOptions = {
  topN?: number;
  threshold?: number;
};

export async function searchByWord(
  query: string,
  library: ColorReference[],
  tfidf: TfidfIndex,
  embedder: Embedder = NullEmbedder,
  options: SearchOptions = {},
): Promise<WordSearchResult[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const topN = options.topN ?? 3;
  const hits = queryTfidf(tfidf, tokens, topN);

  return hits.map((hit) => ({
    ...library[hit.colorIndex],
    score: hit.score,
    engineId: embedder.id,
  }));
}
