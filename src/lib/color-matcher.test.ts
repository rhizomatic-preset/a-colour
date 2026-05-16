import { describe, expect, it } from "vitest";
import realColorsCsv from "../../guidance/references/colors.csv?raw";
import {
  buildNameVectorIndex,
  DEFAULT_WEIGHTS,
  findClosestColorNames,
  getClosestColors,
  getPrimaryColorName,
  isValidHex,
  normalizeHex,
  parseColorCsv,
} from "./color-matcher";

const realColors = parseColorCsv(realColorsCsv);

const sampleCsv = `
red,"Pure Red",#ff0000,255,0,0
green,"Pure Green",#00ff00,0,255,0
blue,"Pure Blue",#0000ff,0,0,255
lemon,"Lemon Yellow",#fff44f,255,244,79
gray_mid,"Mid Gray",#808080,128,128,128
off_white,"Off White",#f5f5f0,245,245,240
`.trim();

const colors = parseColorCsv(sampleCsv);

describe("normalizeHex", () => {
  it("expands 3-digit hex", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
  });

  it("adds the # if missing", () => {
    expect(normalizeHex("aabbcc")).toBe("#aabbcc");
  });

  it("lowercases", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
  });
});

describe("isValidHex", () => {
  it("accepts 6-digit lowercase hex with #", () => {
    expect(isValidHex("#aabbcc")).toBe(true);
  });

  it("rejects 3-digit hex (must be normalized first)", () => {
    expect(isValidHex("#abc")).toBe(false);
  });

  it("rejects missing #", () => {
    expect(isValidHex("aabbcc")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidHex("#gghhii")).toBe(false);
  });
});

describe("parseColorCsv", () => {
  it("parses well-formed rows with quoted names", () => {
    expect(colors).toHaveLength(6);
    expect(colors[0]).toEqual({
      id: "red",
      name: "Pure Red",
      hex: "#ff0000",
      r: 255,
      g: 0,
      b: 0,
    });
  });

  it("skips malformed rows", () => {
    const parsed = parseColorCsv('good,"Good",#ff0000,255,0,0\nbad,incomplete');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("good");
  });
});

describe("getClosestColors", () => {
  it("returns exact match first with closeness 100", () => {
    const matches = getClosestColors("#ff0000", colors, 3);
    expect(matches[0].id).toBe("red");
    expect(matches[0].closeness).toBe(100);
  });

  it("ranks red-ish inputs as closer to red than to blue", () => {
    const matches = getClosestColors("#e02020", colors, colors.length);
    const red = matches.find((m) => m.id === "red");
    const blue = matches.find((m) => m.id === "blue");
    expect(red).toBeDefined();
    expect(blue).toBeDefined();
    expect(red?.distance).toBeLessThan(blue?.distance ?? Infinity);
  });

  it("does not return a vivid hue as top match for a near-neutral input (neutral penalty)", () => {
    const matches = getClosestColors("#7e7f80", colors, 3);
    expect(matches[0].id).not.toBe("red");
    expect(matches[0].id).not.toBe("lemon");
    expect(["gray_mid", "off_white"]).toContain(matches[0].id);
  });

  it("respects the limit argument", () => {
    expect(getClosestColors("#ff0000", colors, 2)).toHaveLength(2);
  });

  it("hue bias toward yellow (60°) shifts a dark mustard's top match away from the brown family", () => {
    const darkYellow = "#806800";
    const noBias = getClosestColors(darkYellow, realColors, 1, DEFAULT_WEIGHTS, null)[0];
    const yellowBiased = getClosestColors(darkYellow, realColors, 1, DEFAULT_WEIGHTS, 60)[0];
    expect(noBias.id).not.toBe(yellowBiased.id);
    // Yellow-biased top match should not contain "brown" in its name.
    expect(yellowBiased.name.toLowerCase()).not.toContain("brown");
  });

  it("the real 865-colour library reshuffles when weights change (dark yellow #806800)", () => {
    const darkYellow = "#806800";
    const defaultTop = getClosestColors(darkYellow, realColors, 3, DEFAULT_WEIGHTS).map(
      (m) => m.name,
    );
    const hueBiased = getClosestColors(darkYellow, realColors, 3, {
      lightness: 0.4,
      chroma: 1.2,
      hue: 2.5,
    }).map((m) => m.name);
    // The top match under defaults is *not* the top under hue-biased weights.
    expect(defaultTop[0]).not.toBe(hueBiased[0]);
    // And the full ordered triples differ.
    expect(defaultTop).not.toEqual(hueBiased);
  });

  it("respects custom distance weights — zero lightness weight lets a dark yellow match a light yellow", () => {
    const darkYellow = "#806800"; // L ≈ 0.49, but hue-wise yellow
    // With default weights, dark yellow's closest in our 6-colour library is gray_mid (lightness wins).
    const defaultTop = getClosestColors(darkYellow, colors, 1, DEFAULT_WEIGHTS)[0];
    // Zero out lightness emphasis and crank hue: the lemon should win.
    const hueBiased = getClosestColors(darkYellow, colors, 1, {
      lightness: 0,
      chroma: 1.2,
      hue: 2,
    })[0];
    expect(defaultTop.id).not.toBe("lemon");
    expect(hueBiased.id).toBe("lemon");
  });
});

describe("getPrimaryColorName", () => {
  it.each([
    ["#000000", "black"],
    ["#ffffff", "white"],
    ["#808080", "gray"],
    ["#ff0000", "red"],
    ["#00ff00", "green"],
    ["#0000ff", "blue"],
    ["#ffff00", "yellow"],
    ["#8b4513", "brown"],
  ])("classifies %s as %s", (hex, expected) => {
    expect(getPrimaryColorName(hex)).toBe(expected);
  });
});

describe("findClosestColorNames", () => {
  const index = buildNameVectorIndex(colors);

  it("matches by name token", () => {
    const matches = findClosestColorNames(["lemon"], index, 2);
    expect(matches[0].id).toBe("lemon");
  });

  it("returns [] for empty query", () => {
    expect(findClosestColorNames([], index, 3)).toEqual([]);
  });
});
