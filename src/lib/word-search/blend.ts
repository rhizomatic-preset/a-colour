import type { WordSearchResult } from "@/lib/word-search";

export type BlendStrategy = "rrf" | "max";

/** Standard RRF constant from the literature. */
export const RRF_K = 60;

type Accum = {
  result: WordSearchResult;
  /** Engine score retained for UI: highest per-colour score across phrases. */
  bestEngineScore: number;
  /** Lowest rank seen across phrases (1-indexed). Tie-breaker on blended-score ties. */
  bestRank: number;
  /** Blended score used for ranking only — not surfaced to callers. */
  blendedScore: number;
};

export function blendResults(
  lists: Array<{ weight: number; results: WordSearchResult[] }>,
  topN: number,
  strategy: BlendStrategy = "rrf",
): WordSearchResult[] {
  if (topN <= 0 || lists.length === 0) return [];

  const merged = new Map<string, Accum>();

  for (const { weight, results } of lists) {
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const rank = i + 1;
      // RRF (1-indexed rank): contribution_p = weight_p / (RRF_K + rank_p).
      // Max: contribution_p = weight_p * score_p.
      const contribution = strategy === "max" ? weight * result.score : weight / (RRF_K + rank);

      const existing = merged.get(result.id);
      if (existing) {
        if (strategy === "max") {
          if (contribution > existing.blendedScore) existing.blendedScore = contribution;
        } else {
          existing.blendedScore += contribution;
        }
        if (result.score > existing.bestEngineScore) {
          existing.bestEngineScore = result.score;
          existing.result = result;
        }
        if (rank < existing.bestRank) existing.bestRank = rank;
      } else {
        merged.set(result.id, {
          result,
          bestEngineScore: result.score,
          bestRank: rank,
          blendedScore: contribution,
        });
      }
    }
  }

  const all = Array.from(merged.values());
  all.sort((a, b) => {
    if (b.blendedScore !== a.blendedScore) return b.blendedScore - a.blendedScore;
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    return a.result.name.localeCompare(b.result.name);
  });

  // Surface the engine score (not the blended score) so closeness % stays
  // interpretable as a TF-IDF cosine. The blended score is ranking-only.
  return all.slice(0, topN).map((a) => ({
    ...a.result,
    score: a.bestEngineScore,
  }));
}
