export type TfidfIndex = {
  vocab: string[];
  idf: number[];
  /** Sparse vectors: per-colour list of [tokenIdx, weight] pairs. */
  vectors: Array<Array<[number, number]>>;
};

export type TfidfHit = { colorIndex: number; score: number };

export function loadTfidfIndex(json: unknown): TfidfIndex {
  if (!json || typeof json !== "object") {
    throw new Error("loadTfidfIndex: expected object");
  }
  const obj = json as Record<string, unknown>;
  const { vocab, idf, vectors } = obj;

  if (!Array.isArray(vocab) || !vocab.every((v) => typeof v === "string")) {
    throw new Error("loadTfidfIndex: vocab must be string[]");
  }
  if (!Array.isArray(idf) || !idf.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("loadTfidfIndex: idf must be number[]");
  }
  if (vocab.length !== idf.length) {
    throw new Error(
      `loadTfidfIndex: vocab.length (${vocab.length}) !== idf.length (${idf.length})`,
    );
  }
  if (!Array.isArray(vectors)) {
    throw new Error("loadTfidfIndex: vectors must be an array");
  }
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (!Array.isArray(v)) {
      throw new Error(`loadTfidfIndex: vectors[${i}] must be an array`);
    }
    for (let j = 0; j < v.length; j++) {
      const pair = v[j];
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== "number" ||
        typeof pair[1] !== "number" ||
        !Number.isFinite(pair[0]) ||
        !Number.isFinite(pair[1])
      ) {
        throw new Error(`loadTfidfIndex: vectors[${i}][${j}] must be a [number, number] tuple`);
      }
    }
  }

  return { vocab, idf, vectors } as TfidfIndex;
}

export function queryTfidf(index: TfidfIndex, tokens: string[], limit = 10): TfidfHit[] {
  if (tokens.length === 0 || limit <= 0) return [];

  // Token-to-index lookup via Map; cheaper than repeated indexOf for short queries
  // but the real win is clarity over repeating an O(V) scan per token.
  const tokenIndex = new Map<string, number>();
  for (let i = 0; i < index.vocab.length; i++) {
    tokenIndex.set(index.vocab[i], i);
  }

  // Query TF-IDF vector keyed by token index. Unknown tokens are silently dropped.
  const qWeights = new Map<number, number>();
  for (const token of tokens) {
    const idx = tokenIndex.get(token);
    if (idx === undefined) continue;
    qWeights.set(idx, (qWeights.get(idx) ?? 0) + index.idf[idx]);
  }

  if (qWeights.size === 0) return [];

  let qNormSq = 0;
  for (const w of qWeights.values()) qNormSq += w * w;
  const qNorm = Math.sqrt(qNormSq);
  if (qNorm === 0) return [];

  const hits: TfidfHit[] = [];
  for (let colorIndex = 0; colorIndex < index.vectors.length; colorIndex++) {
    const cv = index.vectors[colorIndex];
    let dot = 0;
    let cNormSq = 0;
    for (const [tokenIdx, weight] of cv) {
      cNormSq += weight * weight;
      const qw = qWeights.get(tokenIdx);
      if (qw !== undefined) dot += qw * weight;
    }
    if (dot === 0 || cNormSq === 0) continue;
    const score = dot / (qNorm * Math.sqrt(cNormSq));
    if (!Number.isFinite(score) || score === 0) continue;
    hits.push({ colorIndex, score });
  }

  // V8/JSC Array.sort is stable; insertion order is ascending colorIndex,
  // so equal scores naturally resolve to lower colorIndex first.
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
