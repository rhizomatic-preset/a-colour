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

/** Phase 0 stub. Real impl arrives in Phase 1A. */
export async function searchByWord(
  query: string,
  _library: ColorReference[],
  _tfidf: TfidfIndex,
  _embedder: Embedder = NullEmbedder,
  _options: SearchOptions = {},
): Promise<WordSearchResult[]> {
  void tokenize(query);
  void queryTfidf;
  return [];
}
