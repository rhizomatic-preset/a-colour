import { describe, expect, it } from "vitest";
import {
  buildNameVectorIndex,
  findClosestColorNames,
  getClosestColors,
  getPrimaryColorName,
  isValidHex,
  normalizeHex,
  parseColorCsv,
} from "./color-matcher";

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
