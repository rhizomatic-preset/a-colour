import { describe, expect, it } from "vitest";
import { loadTfidfIndex, queryTfidf, type TfidfIndex } from "./tfidf-index";

// Vocab indexes: red=0, dark=1, blue=2, ocean=3.
// Three colours with documents loosely shaped like:
//   0 "red"          → [red]
//   1 "dark blue"    → [dark, blue]
//   2 "ocean blue"   → [ocean, blue]
const fixture: TfidfIndex = {
  vocab: ["red", "dark", "blue", "ocean"],
  idf: [1.5, 2.0, 1.0, 2.0],
  vectors: [
    [[0, 1.5]],
    [
      [1, 2.0],
      [2, 1.0],
    ],
    [
      [3, 2.0],
      [2, 1.0],
    ],
  ],
};

describe("loadTfidfIndex", () => {
  it("returns a well-formed index unchanged", () => {
    const out = loadTfidfIndex(fixture);
    expect(out).toEqual(fixture);
  });

  it("throws when vocab and idf lengths disagree", () => {
    expect(() => loadTfidfIndex({ vocab: ["a", "b"], idf: [1], vectors: [] })).toThrow(
      /vocab.length/,
    );
  });

  it("throws when vectors contains a malformed tuple", () => {
    expect(() =>
      loadTfidfIndex({
        vocab: ["a"],
        idf: [1],
        vectors: [[[0, 1, 2]]],
      }),
    ).toThrow(/\[number, number\]/);
  });

  it("throws when the top-level object is missing fields", () => {
    expect(() => loadTfidfIndex(null)).toThrow();
    expect(() => loadTfidfIndex({})).toThrow();
  });
});

describe("queryTfidf", () => {
  it("returns [] for an empty token list", () => {
    expect(queryTfidf(fixture, [])).toEqual([]);
  });

  it("returns [] when no tokens are in vocab", () => {
    expect(queryTfidf(fixture, ["xyzqwerty", "nonsense"])).toEqual([]);
  });

  it("matches a single in-vocab token", () => {
    const hits = queryTfidf(fixture, ["red"]);
    expect(hits.length).toBe(1);
    expect(hits[0].colorIndex).toBe(0);
    expect(hits[0].score).toBeCloseTo(1, 10);
  });

  it("ranks the better match first for a compound query", () => {
    const hits = queryTfidf(fixture, ["dark", "blue"]);
    // Colour 1 has both tokens, colour 2 only shares "blue" — colour 1 wins.
    expect(hits[0].colorIndex).toBe(1);
    expect(hits.map((h) => h.colorIndex)).toEqual([1, 2]);
  });

  it("respects the limit parameter", () => {
    const hits = queryTfidf(fixture, ["dark", "blue", "ocean"], 1);
    expect(hits.length).toBe(1);
  });

  it("skips colours with no overlap (score === 0)", () => {
    const hits = queryTfidf(fixture, ["red"]);
    expect(hits.every((h) => h.colorIndex === 0)).toBe(true);
  });

  it("breaks score ties by lower colorIndex (stable sort)", () => {
    const tied: TfidfIndex = {
      vocab: ["red"],
      idf: [1.5],
      vectors: [[[0, 1.0]], [[0, 1.0]], [[0, 1.0]]],
    };
    const hits = queryTfidf(tied, ["red"]);
    expect(hits.map((h) => h.colorIndex)).toEqual([0, 1, 2]);
    expect(hits.every((h) => h.score === hits[0].score)).toBe(true);
  });
});
