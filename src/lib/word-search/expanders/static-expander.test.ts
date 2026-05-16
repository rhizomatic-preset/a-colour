/**
 * Tests for the static-embedding expander layer (Phase 1.5b).
 *
 * The factory itself is a thin wrapper around the shared dictionary-expander
 * core; the interesting surface is the blended expander, where handcurated
 * entries take precedence and static fills in the gaps. We test against
 * synthetic dictionaries so the assertions don't depend on which GloVe build
 * was used to generate the committed `src/generated/expansions-static.json`.
 */
import { describe, expect, it } from "vitest";
import {
  buildBlendedExpander,
  buildStaticExpander,
  HANDCURATED_EXPANSION_WEIGHT,
  MAX_PHRASES_PER_QUERY,
  MAX_STATIC_EXPANSIONS_PER_TOKEN,
  mergeDictionaries,
  STATIC_EXPANSION_WEIGHT,
} from "../expander";

describe("buildStaticExpander", () => {
  const dict = {
    dragon: ["golden", "ghost", "frog", "sapphire", "scarlet", "purple", "emerald", "blue"],
    caterpillar: ["apple", "sap", "shell"],
  };

  it("returns the original query verbatim with weight 1", async () => {
    const exp = buildStaticExpander(dict);
    const out = await exp.expand("dragon");
    expect(out[0]).toEqual({ phrase: "dragon", weight: 1 });
  });

  it("identifies as 'static'", () => {
    const exp = buildStaticExpander(dict);
    expect(exp.id).toBe("static");
  });

  it("expands up to MAX_STATIC_EXPANSIONS_PER_TOKEN replacements per token", async () => {
    const exp = buildStaticExpander(dict);
    const out = await exp.expand("dragon");
    // Original + capped neighbours, all at the static weight.
    expect(out).toHaveLength(1 + MAX_STATIC_EXPANSIONS_PER_TOKEN);
    for (const e of out.slice(1)) {
      expect(e.weight).toBe(STATIC_EXPANSION_WEIGHT);
    }
  });

  it("returns just the original when the token has no entry", async () => {
    const exp = buildStaticExpander(dict);
    const out = await exp.expand("xyzzy");
    expect(out).toEqual([{ phrase: "xyzzy", weight: 1 }]);
  });
});

describe("buildBlendedExpander", () => {
  // Handcurated is the precision layer; static is the recall layer.
  // The blended expander emits handcurated entries first at the handcurated
  // weight, then fills the per-token budget with static entries at the lower
  // static weight.
  const handcurated = {
    creeper: ["green", "grass", "moss"],
  };
  const staticDict = {
    creeper: ["zombie", "minecraft", "bush"],
    dragon: ["golden", "ghost", "frog", "sapphire", "scarlet", "purple"],
  };

  it("prefers handcurated entries when both layers have the token", async () => {
    const exp = buildBlendedExpander(handcurated, staticDict);
    const out = await exp.expand("creeper");
    const phrases = out.slice(1).map((e) => e.phrase);
    expect(phrases.slice(0, 3)).toEqual(["green", "grass", "moss"]);
    // All handcurated picks carry the handcurated weight.
    for (const e of out.slice(1, 4)) {
      expect(e.weight).toBe(HANDCURATED_EXPANSION_WEIGHT);
    }
  });

  it("falls back to static when handcurated is silent for a token", async () => {
    const exp = buildBlendedExpander(handcurated, staticDict);
    const out = await exp.expand("dragon");
    expect(out.length).toBeGreaterThan(1);
    // Every replacement on a static-only token is at the static weight.
    for (const e of out.slice(1)) {
      expect(e.weight).toBe(STATIC_EXPANSION_WEIGHT);
    }
  });

  it("deduplicates so handcurated and static can't double-emit the same phrase", async () => {
    const exp = buildBlendedExpander(
      { x: ["alpha", "beta"] },
      { x: ["alpha", "gamma"] }, // alpha overlaps with handcurated
    );
    const out = await exp.expand("x");
    const phrases = out.map((e) => e.phrase);
    expect(phrases).toEqual(["x", "alpha", "beta", "gamma"]);
  });

  it("emits original first with weight 1", async () => {
    const exp = buildBlendedExpander(handcurated, staticDict);
    const out = await exp.expand("dragon");
    expect(out[0]).toEqual({ phrase: "dragon", weight: 1 });
  });

  it("identifies as 'static-handcurated'", () => {
    const exp = buildBlendedExpander(handcurated, staticDict);
    expect(exp.id).toBe("static-handcurated");
  });

  it("hard-caps total phrases at MAX_PHRASES_PER_QUERY", async () => {
    // Build a giant handcurated + static dictionary that would otherwise
    // produce > cap phrases for a many-token query.
    const giantHand: Record<string, string[]> = {};
    const giantStatic: Record<string, string[]> = {};
    for (let i = 0; i < 12; i++) {
      giantHand[`t${i}`] = ["a", "b", "c"];
      giantStatic[`t${i}`] = ["d", "e", "f", "g", "h"];
    }
    const exp = buildBlendedExpander(giantHand, giantStatic);
    const query = Array.from({ length: 12 }, (_, i) => `t${i}`).join(" ");
    const out = await exp.expand(query);
    expect(out.length).toBeLessThanOrEqual(MAX_PHRASES_PER_QUERY);
  });
});

describe("mergeDictionaries", () => {
  it("preserves primary order then appends secondary uniques", () => {
    const merged = mergeDictionaries(
      { red: ["crimson", "scarlet"] },
      { red: ["scarlet", "ruby"], blue: ["azure"] },
    );
    expect(merged.red).toEqual(["crimson", "scarlet", "ruby"]);
    expect(merged.blue).toEqual(["azure"]);
  });

  it("is case-insensitive on keys", () => {
    const merged = mergeDictionaries({ RED: ["crimson"] }, { red: ["scarlet"] });
    expect(merged.red).toEqual(["crimson", "scarlet"]);
  });
});

describe("static-expander integration with committed dictionary", () => {
  // Sanity check that the committed expansions-static.json yields plausible
  // neighbours for the canonical open-vocab queries from design/open-vocabulary.md.
  // Test imports the JSON directly so this catches accidental rebuilds with
  // pathological --k / --min-score settings.
  it("has open-vocab neighbours wired up for caterpillar and dragon", async () => {
    const committed = (await import("@/generated/expansions-static.json")).default as Record<
      string,
      string[]
    >;
    expect(Object.keys(committed).length).toBeGreaterThan(50);
    // We don't pin specific neighbours (GloVe builds are deterministic but the
    // committed table can be regenerated with different K), just that these
    // motivating tokens land *something*.
    expect(committed.caterpillar?.length).toBeGreaterThan(0);
    expect(committed.dragon?.length).toBeGreaterThan(0);
    expect(committed.octopus?.length).toBeGreaterThan(0);
  });
});
