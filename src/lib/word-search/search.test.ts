import { describe, expect, it } from "vitest";
import type { ColorReference } from "@/lib/color-matcher";
import { NullEmbedder } from "@/lib/word-search/embedder";
import type { TfidfIndex } from "@/lib/word-search/tfidf-index";
import { searchByWord } from "./index";

const library: ColorReference[] = [
  { id: "red", name: "Red", hex: "#ff0000", r: 255, g: 0, b: 0 },
  { id: "crimson", name: "Crimson", hex: "#dc143c", r: 220, g: 20, b: 60 },
  { id: "ocean", name: "Ocean Blue", hex: "#1ca9c9", r: 28, g: 169, b: 201 },
  { id: "navy", name: "Navy", hex: "#000080", r: 0, g: 0, b: 128 },
  { id: "lemon", name: "Lemon Yellow", hex: "#fff44f", r: 255, g: 244, b: 79 },
];

// Vocab: red=0, crimson=1, ocean=2, blue=3, navy=4, lemon=5, yellow=6.
const tfidf: TfidfIndex = {
  vocab: ["red", "crimson", "ocean", "blue", "navy", "lemon", "yellow"],
  idf: [1.5, 2.5, 2.5, 1.0, 2.5, 2.5, 2.0],
  vectors: [
    [[0, 1.5]],
    [
      [1, 2.5],
      [0, 1.5],
    ],
    [
      [2, 2.5],
      [3, 1.0],
    ],
    [
      [4, 2.5],
      [3, 1.0],
    ],
    [
      [5, 2.5],
      [6, 2.0],
    ],
  ],
};

describe("searchByWord", () => {
  it("returns the red entry as top-1 for 'red'", async () => {
    const out = await searchByWord("red", library, tfidf);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].name).toBe("Red");
    expect(out[0].hex).toBe("#ff0000");
  });

  it("returns [] for empty query", async () => {
    expect(await searchByWord("", library, tfidf)).toEqual([]);
    expect(await searchByWord("   ", library, tfidf)).toEqual([]);
  });

  it("returns [] for query with no in-vocab tokens", async () => {
    expect(await searchByWord("xyzqwerty", library, tfidf)).toEqual([]);
    expect(await searchByWord("minecraft creeper pants", library, tfidf)).toEqual([]);
  });

  it("respects topN", async () => {
    const out = await searchByWord("blue", library, tfidf, NullEmbedder, {
      topN: 1,
    });
    expect(out.length).toBe(1);
  });

  it("attaches engineId from the embedder", async () => {
    const out = await searchByWord("red", library, tfidf, NullEmbedder);
    expect(out[0].engineId).toBe(NullEmbedder.id);
  });

  it("returns full ColorReference fields plus score and engineId", async () => {
    const [top] = await searchByWord("red", library, tfidf);
    expect(top).toMatchObject({
      id: "red",
      name: "Red",
      hex: "#ff0000",
      r: 255,
      g: 0,
      b: 0,
      engineId: NullEmbedder.id,
    });
    expect(typeof top.score).toBe("number");
    expect(top.score).toBeGreaterThan(0);
  });

  it("defaults topN to 3", async () => {
    // "blue" hits both Ocean Blue and Navy (two colours share the token).
    const out = await searchByWord("blue", library, tfidf);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out.length).toBeGreaterThan(0);
  });
});
