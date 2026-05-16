export type TfidfIndex = {
  vocab: string[];
  idf: number[];
  /** Sparse vectors: per-colour list of [tokenIdx, weight] pairs. */
  vectors: Array<Array<[number, number]>>;
};

export type TfidfHit = { colorIndex: number; score: number };

/** Phase 0 stub. Real impl arrives in Phase 1A. */
export function loadTfidfIndex(json: unknown): TfidfIndex {
  return json as TfidfIndex;
}

/** Phase 0 stub. Real impl arrives in Phase 1A. */
export function queryTfidf(_index: TfidfIndex, _tokens: string[], _limit = 10): TfidfHit[] {
  return [];
}
