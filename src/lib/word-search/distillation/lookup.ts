import { type ColorReference, getPrimaryColorName } from "@/lib/color-matcher";
import type { WordSearchResult } from "@/lib/word-search";
import { tokenize } from "@/lib/word-search/tokenize";

/** Family labels match getPrimaryColorName's output exactly. */
export type DistilledFamily =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "magenta"
  | "pink"
  | "brown"
  | "olive"
  | "black"
  | "charcoal"
  | "gray"
  | "silver"
  | "white";

export type DistilledConfidence = "high" | "medium" | "low";

export type DistilledEntry = {
  family: DistilledFamily;
  hex: string;
  confidence: DistilledConfidence;
  /** Secondary families to fall back to if `family` has too few library matches. */
  alternates?: DistilledFamily[];
};

export type DistillationLookup = {
  schema_version: number;
  generated_at: string;
  method: string;
  entry_count: number;
  entries: Record<string, DistilledEntry>;
};

/**
 * Index a library by family so lookups don't rescan every entry per query.
 * Built lazily; the index is cheap (~1 KB) but caching avoids repeating it for
 * the eval where the same library is hit dozens of times.
 */
export type FamilyIndex = Map<DistilledFamily, ColorReference[]>;

export function buildFamilyIndex(library: ColorReference[]): FamilyIndex {
  const index: FamilyIndex = new Map();
  for (const color of library) {
    const family = getPrimaryColorName(color.hex) as DistilledFamily;
    const bucket = index.get(family);
    if (bucket) bucket.push(color);
    else index.set(family, [color]);
  }
  return index;
}

/**
 * Pick the best distilled match for a tokenized query. For multi-token queries
 * the highest-confidence single-token entry wins; ties resolve to the
 * later-appearing token (right-to-left noun bias — `wooden sheep` → `sheep`).
 */
export function pickEntry(
  tokens: string[],
  lookup: DistillationLookup,
): { token: string; entry: DistilledEntry } | null {
  const confidenceRank = { high: 3, medium: 2, low: 1 } as const;
  let best: { token: string; entry: DistilledEntry; rank: number; position: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const entry = lookup.entries[token];
    if (!entry) continue;
    const rank = confidenceRank[entry.confidence];
    if (
      best === null ||
      rank > best.rank ||
      (rank === best.rank && i > best.position)
    ) {
      best = { token, entry, rank, position: i };
    }
  }
  return best ? { token: best.token, entry: best.entry } : null;
}

function srgbToLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

type Oklab = { L: number; a: number; b: number };

function rgbToOklab(r: number, g: number, b: number): Oklab {
  const red = srgbToLinear(r / 255);
  const green = srgbToLinear(g / 255);
  const blue = srgbToLinear(b / 255);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function hexToRgb(hex: string) {
  const clean = hex.replace(/^#/, "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function oklabChroma(c: Oklab) {
  return Math.hypot(c.a, c.b);
}

function normalizeHueDelta(delta: number) {
  let d = delta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Same weighted Oklab distance as color-matcher.ts's DEFAULT_WEIGHTS. */
function distance(a: Oklab, b: Oklab): number {
  const dL = a.L - b.L;
  const ca = oklabChroma(a);
  const cb = oklabChroma(b);
  const dC = ca - cb;
  const ha = Math.atan2(a.b, a.a);
  const hb = Math.atan2(b.b, b.a);
  const dh = normalizeHueDelta(ha - hb);
  const hueWeight = Math.max(ca, cb);
  return Math.hypot(dL * 1.6, dC * 1.2, dh * hueWeight * 0.7);
}

const ENGINE_ID = "distilled";

/**
 * Phase distillation — single-pass lookup against the build-time-distilled
 * common-noun map. Returns top-N closest library entries by Oklab distance to
 * the distilled hex, **filtered by the distilled family** so the search lands
 * inside the right band even when the library has noisier entries closer in
 * raw Oklab. Falls back to the entry's alternates only if the primary family
 * has fewer than N candidates.
 *
 * Returns `null` (not `[]`) when the lookup has nothing for this query, so the
 * caller can distinguish "skip me, defer to TF-IDF" from "I matched but found
 * zero hits" (which shouldn't happen with a well-curated lookup).
 */
export function searchDistilled(
  query: string,
  library: ColorReference[],
  lookup: DistillationLookup,
  familyIndex: FamilyIndex,
  topN: number = 3,
): WordSearchResult[] | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;

  const picked = pickEntry(tokens, lookup);
  if (!picked) return null;
  // Low-confidence entries defer to the existing engines; treat as a miss.
  if (picked.entry.confidence === "low") return null;

  const { entry } = picked;
  const target = rgbToOklab(...Object.values(hexToRgb(entry.hex)));

  const primary = familyIndex.get(entry.family) ?? [];
  const ranked = primary
    .map((color) => ({
      color,
      d: distance(target, rgbToOklab(color.r, color.g, color.b)),
    }))
    .sort((a, b) => a.d - b.d);

  const hits = ranked.slice(0, topN);

  // Fall back to alternates only when the primary band underflows topN.
  if (hits.length < topN && entry.alternates) {
    for (const alt of entry.alternates) {
      if (hits.length >= topN) break;
      const altPool = familyIndex.get(alt) ?? [];
      const altRanked = altPool
        .map((color) => ({
          color,
          d: distance(target, rgbToOklab(color.r, color.g, color.b)),
        }))
        .sort((a, b) => a.d - b.d);
      for (const h of altRanked) {
        if (hits.length >= topN) break;
        if (hits.some((existing) => existing.color.id === h.color.id)) continue;
        hits.push(h);
      }
    }
  }

  if (hits.length === 0) return null;

  // Use inverse-distance as the surfaced score so it's comparable to TF-IDF
  // cosine scale (0..1). Squashed so the very-near hits don't pin at 1.
  return hits.map(({ color, d }) => ({
    ...color,
    score: 1 / (1 + d * 3),
    engineId: ENGINE_ID,
  }));
}

/** Identifier surfaced on WordSearchResult.engineId — useful in eval reports. */
export const DISTILLED_ENGINE_ID = ENGINE_ID;
