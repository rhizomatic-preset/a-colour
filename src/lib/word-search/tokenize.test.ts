import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("returns [] for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns [] for whitespace-only input", () => {
    expect(tokenize("   \t\n")).toEqual([]);
  });

  it("lowercases", () => {
    expect(tokenize("Red")).toEqual(["red"]);
    expect(tokenize("Minecraft Creeper Pants")).toEqual(["minecraft", "creeper", "pants"]);
  });

  it("splits on whitespace", () => {
    expect(tokenize("ocean beach")).toEqual(["ocean", "beach"]);
  });

  it("splits on hyphens and punctuation", () => {
    expect(tokenize("dark-blue")).toEqual(["dark", "blue"]);
    expect(tokenize("hello, world!")).toEqual(["hello", "world"]);
  });

  it("collapses consecutive separators", () => {
    expect(tokenize("dark   blue")).toEqual(["dark", "blue"]);
    expect(tokenize("dark---blue")).toEqual(["dark", "blue"]);
    expect(tokenize("  dark blue  ")).toEqual(["dark", "blue"]);
  });

  it("preserves numbers and splits at non-alphanumeric boundaries", () => {
    // The implementation splits on every non-[a-z0-9] character, so the dot
    // in "web2.0" becomes a separator.
    expect(tokenize("web2.0 blue")).toEqual(["web2", "0", "blue"]);
  });

  it("strips leading and trailing punctuation", () => {
    expect(tokenize("!!red!!")).toEqual(["red"]);
  });

  it("folds Te Reo macrons onto plain ASCII", () => {
    expect(tokenize("kākāriki")).toEqual(["kakariki"]);
    expect(tokenize("kōwhai")).toEqual(["kowhai"]);
    expect(tokenize("Māori")).toEqual(["maori"]);
    expect(tokenize("MĀWHERO")).toEqual(["mawhero"]);
  });

  it("folds common diacritics for free", () => {
    expect(tokenize("café")).toEqual(["cafe"]);
    expect(tokenize("naïve")).toEqual(["naive"]);
  });
});
