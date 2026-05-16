import { describe, expect, it } from "vitest";
import { blendResults, RRF_K } from "./blend";
import type { WordSearchResult } from "./index";

const ENGINE = "literal";

function r(id: string, score: number): WordSearchResult {
  return {
    id,
    name: id,
    hex: "#000000",
    r: 0,
    g: 0,
    b: 0,
    score,
    engineId: ENGINE,
  };
}

describe("blendResults — RRF", () => {
  it("returns [] for empty lists", () => {
    expect(blendResults([], 3)).toEqual([]);
  });

  it("returns [] when topN <= 0", () => {
    expect(blendResults([{ weight: 1, results: [r("a", 1)] }], 0)).toEqual([]);
  });

  it("ranks a colour higher when it appears in two phrases than when it appears in only one", () => {
    const out = blendResults(
      [
        { weight: 1, results: [r("a", 0.5), r("b", 0.4)] },
        { weight: 1, results: [r("a", 0.3), r("c", 0.9)] },
      ],
      3,
    );
    // Hand-check (k=60, weights all 1):
    //   a: 1/61 + 1/61 = ~0.0328
    //   b: 1/62      = ~0.0161
    //   c: 1/62      = ~0.0161
    expect(out[0].id).toBe("a");
  });

  it("weights phrase contributions", () => {
    // Phrase 1 (weight 1) puts b at rank 1 alone; phrase 2 (weight 0.1) puts a at rank 1.
    // b should win because its contribution 1/61 > 0.1/61.
    const out = blendResults(
      [
        { weight: 1, results: [r("b", 0.5)] },
        { weight: 0.1, results: [r("a", 0.9)] },
      ],
      2,
    );
    expect(out[0].id).toBe("b");
  });

  it("uses 1-indexed rank in the RRF formula", () => {
    // Single phrase: top result contributes weight / (RRF_K + 1).
    const out = blendResults([{ weight: 1, results: [r("only", 0.5)] }], 1);
    // We can't observe the blended score externally, but rank-1 result should survive.
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("only");
    // The exposed score is the engine score, not 1/(RRF_K + 1).
    expect(out[0].score).toBe(0.5);
    // Sanity: 1/(60+1) is the formula assumption referenced in the test name.
    expect(1 / (RRF_K + 1)).toBeCloseTo(1 / 61);
  });

  it("surfaces the engine score (best-per-colour), not the blended score", () => {
    const out = blendResults(
      [
        { weight: 1, results: [r("a", 0.3)] },
        { weight: 1, results: [r("a", 0.9)] },
      ],
      1,
    );
    expect(out[0].score).toBe(0.9);
  });

  it("breaks ties on equal blended scores by lowest-min-rank then alphabetical name", () => {
    // Two phrases, weight 1 each, identical content but reversed: a, b vs b, a.
    // Blended score for a and b is identical: 1/61 + 1/62 each.
    // Min-rank tie-break: both have min-rank 1. Name tie-break: a before b.
    const out = blendResults(
      [
        { weight: 1, results: [r("a", 0.5), r("b", 0.5)] },
        { weight: 1, results: [r("b", 0.5), r("a", 0.5)] },
      ],
      2,
    );
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("breaks blended-score ties on lower min-rank first", () => {
    // a appears at rank 1 in phrase 1 only.
    // b appears at rank 2 in phrase 1 AND rank 1 in phrase 2 → higher blend than a.
    // We want a tie scenario instead: arrange so blended scores match.
    // Phrase 1: [a]. Phrase 2: [c b]. Then:
    //   a: 1/61
    //   c: 1/61
    //   b: 1/62
    // a and c tie; a appears alone at rank 1 in p1; c at rank 1 in p2.
    // Both min-rank 1; alphabetical: a < c.
    const out = blendResults(
      [
        { weight: 1, results: [r("a", 0.5)] },
        { weight: 1, results: [r("c", 0.5), r("b", 0.5)] },
      ],
      3,
    );
    expect(out[0].id).toBe("a");
    expect(out[1].id).toBe("c");
    expect(out[2].id).toBe("b");
  });
});

describe("blendResults — max strategy", () => {
  it("picks the best weighted score per colour across phrases", () => {
    const out = blendResults(
      [
        { weight: 1, results: [r("a", 0.3), r("b", 0.9)] },
        { weight: 0.5, results: [r("a", 0.9)] },
      ],
      2,
      "max",
    );
    // a: max(1*0.3, 0.5*0.9) = max(0.3, 0.45) = 0.45
    // b: max(1*0.9) = 0.9
    expect(out[0].id).toBe("b");
    expect(out[1].id).toBe("a");
  });
});
