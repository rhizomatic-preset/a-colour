/**
 * Phase 2A — bake-off search pipeline that exercises a candidate embedder.
 *
 * Implements the "strict-fallback" hybrid from design/word-mode.md:
 *   1. Run TF-IDF first.
 *   2. If TF-IDF's top-1 score >= threshold OR the embedder has no result,
 *      return TF-IDF top-N.
 *   3. Otherwise rank by embedding cosine against the precomputed colour
 *      vectors and return those top-N.
 *
 * Lives under scripts/candidates/ so the Vite bundle never imports it.
 * Decision rule from the epic: pick the engine whose `acc@3` on
 * cultural ∪ object-rooted ∪ open-vocab is highest WITHOUT trivial or
 * literal-name dropping below the Phase 1A baseline.
 */
import type { ColorReference } from "../../src/lib/color-matcher.ts";
import type { Embedder, LibraryVariant } from "../../src/lib/word-search/embedder.ts";
import type { WordSearchResult } from "../../src/lib/word-search/index.ts";
import { queryTfidf, type TfidfIndex } from "../../src/lib/word-search/tfidf-index.ts";
import { tokenize } from "../../src/lib/word-search/tokenize.ts";

export type HybridOptions = {
  topN: number;
  /** TF-IDF top-1 score above which the embedder is bypassed. */
  threshold: number;
};

function cosineRank(
  query: Float32Array,
  colorVectors: Float32Array[],
  library: ColorReference[],
  topN: number,
  engineId: string,
): WordSearchResult[] {
  const qNorm = Math.sqrt(query.reduce((acc, x) => acc + x * x, 0));
  if (qNorm === 0) return [];

  const scored: Array<{ idx: number; score: number }> = [];
  for (let i = 0; i < colorVectors.length; i++) {
    const cv = colorVectors[i];
    let dot = 0;
    let cNormSq = 0;
    for (let j = 0; j < cv.length; j++) {
      dot += query[j] * cv[j];
      cNormSq += cv[j] * cv[j];
    }
    const cNorm = Math.sqrt(cNormSq);
    if (cNorm === 0) continue;
    const score = dot / (qNorm * cNorm);
    if (!Number.isFinite(score)) continue;
    scored.push({ idx: i, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map(({ idx, score }) => ({
    ...library[idx],
    score,
    engineId,
  }));
}

export async function searchHybrid(
  query: string,
  library: ColorReference[],
  tfidf: TfidfIndex,
  embedder: Embedder,
  colorVectors: Float32Array[],
  libraryId: LibraryVariant,
  options: HybridOptions,
): Promise<WordSearchResult[]> {
  void libraryId;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const tfidfHits = queryTfidf(tfidf, tokens, options.topN);
  const tfidfTop = tfidfHits[0]?.score ?? 0;
  const tfidfResults: WordSearchResult[] = tfidfHits.map((hit) => ({
    ...library[hit.colorIndex],
    score: hit.score,
    engineId: embedder.id,
  }));

  // Strict-fallback: if TF-IDF has a confident hit, trust it.
  if (tfidfTop >= options.threshold) return tfidfResults;

  const queryVec = await embedder.encodeQuery(query);
  if (queryVec.length === 0) return tfidfResults;

  const embRanked = cosineRank(queryVec, colorVectors, library, options.topN, embedder.id);
  // If embeddings produced nothing useful (all-zero query, all-zero docs), keep the TF-IDF fallback.
  return embRanked.length > 0 ? embRanked : tfidfResults;
}
