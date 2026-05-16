import { describe, expect, it } from "vitest";
import {
  buildHandcuratedExpander,
  HANDCURATED_EXPANSION_WEIGHT,
  MAX_EXPANSIONS_PER_TOKEN,
  MAX_PHRASES_PER_QUERY,
  NoopExpander,
} from "./expander";

describe("NoopExpander", () => {
  it("returns the original query verbatim with weight 1", async () => {
    expect(await NoopExpander.expand("red")).toEqual([{ phrase: "red", weight: 1 }]);
    expect(await NoopExpander.expand("ocean beach")).toEqual([
      { phrase: "ocean beach", weight: 1 },
    ]);
  });

  it("has id 'noop'", () => {
    expect(NoopExpander.id).toBe("noop");
  });
});

describe("buildHandcuratedExpander", () => {
  const dict = {
    sunset: ["orange", "dusk", "amber"],
    creeper: ["green", "mob", "minecraft"],
    pants: ["dark", "denim"],
    fire: ["red", "flame"],
  };

  it("returns original query first with weight 1", async () => {
    const exp = buildHandcuratedExpander(dict);
    const out = await exp.expand("sunset");
    expect(out[0]).toEqual({ phrase: "sunset", weight: 1 });
  });

  it("expands a single token into up to MAX_EXPANSIONS_PER_TOKEN phrases at the expansion weight", async () => {
    const exp = buildHandcuratedExpander(dict);
    const out = await exp.expand("sunset");
    expect(out).toHaveLength(1 + 3);
    expect(out.slice(1)).toEqual([
      { phrase: "orange", weight: HANDCURATED_EXPANSION_WEIGHT },
      { phrase: "dusk", weight: HANDCURATED_EXPANSION_WEIGHT },
      { phrase: "amber", weight: HANDCURATED_EXPANSION_WEIGHT },
    ]);
  });

  it("caps replacements per token at MAX_EXPANSIONS_PER_TOKEN", async () => {
    const exp = buildHandcuratedExpander({
      x: ["a", "b", "c", "d", "e"],
    });
    const out = await exp.expand("x");
    expect(out).toHaveLength(1 + MAX_EXPANSIONS_PER_TOKEN);
  });

  it("expands each token of a multi-token query independently (drop-in substitution, not Cartesian)", async () => {
    const exp = buildHandcuratedExpander(dict);
    const out = await exp.expand("creeper pants");
    // 1 original + 3 creeper-substitutions + 2 pants-substitutions = 6.
    expect(out).toHaveLength(6);
    expect(out[0]).toEqual({ phrase: "creeper pants", weight: 1 });
    const phrases = out.slice(1).map((e) => e.phrase);
    expect(phrases).toEqual([
      "green pants",
      "mob pants",
      "minecraft pants",
      "creeper dark",
      "creeper denim",
    ]);
    for (const e of out.slice(1)) {
      expect(e.weight).toBe(HANDCURATED_EXPANSION_WEIGHT);
    }
  });

  it("leaves unknown tokens untouched", async () => {
    const exp = buildHandcuratedExpander(dict);
    const out = await exp.expand("unknownword");
    expect(out).toEqual([{ phrase: "unknownword", weight: 1 }]);
  });

  it("is case-insensitive on lookup", async () => {
    const exp = buildHandcuratedExpander(dict);
    const out = await exp.expand("Sunset");
    expect(out.length).toBeGreaterThan(1);
  });

  it("returns just the original when the query has no tokens", async () => {
    const exp = buildHandcuratedExpander(dict);
    const out = await exp.expand("");
    expect(out).toEqual([{ phrase: "", weight: 1 }]);
  });

  it("hard-caps total phrases at MAX_PHRASES_PER_QUERY", async () => {
    const giant: Record<string, string[]> = {};
    for (let i = 0; i < 20; i++) giant[`t${i}`] = ["a", "b", "c"];
    const query = Array.from({ length: 20 }, (_, i) => `t${i}`).join(" ");
    const exp = buildHandcuratedExpander(giant);
    const out = await exp.expand(query);
    expect(out.length).toBeLessThanOrEqual(MAX_PHRASES_PER_QUERY);
  });

  it("never duplicates the original verbatim as an expansion", async () => {
    const exp = buildHandcuratedExpander({ red: ["red", "crimson"] });
    const out = await exp.expand("red");
    const phrases = out.map((e) => e.phrase);
    // "red" should appear once (the original); the self-replacement is skipped.
    expect(phrases.filter((p) => p === "red")).toHaveLength(1);
    expect(phrases).toContain("crimson");
  });
});
