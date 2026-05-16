import { DEFAULT_WEIGHTS, type DistanceWeights } from "@/lib/color-matcher";

export type MatchCount = 1 | 3 | 5;
export type SampleKernel = 1 | 3 | 5 | 7;

export type WordModeLibrary = "small" | "large";
export type WordModeEngine = "literal" | (string & {});
/**
 * Query-expander layer. `noop` is the literal-only path; `handcurated` was
 * Phase 1.5a; `static` and `static-handcurated` arrived in Phase 1.5b backed by
 * a precomputed GloVe nearest-neighbour table. Held as a separate axis from
 * `engine` because the eval rig has always treated them as independent (see
 * `scripts/eval.ts --engine= --expander=`).
 */
export type WordModeExpander =
  | "noop"
  | "handcurated"
  | "static"
  | "static-handcurated"
  | (string & {});

export type WordModeSettings = {
  library: WordModeLibrary;
  engine: WordModeEngine;
  expander: WordModeExpander;
};

export type Settings = {
  matchCount: MatchCount;
  sampleKernel: SampleKernel;
  weights: DistanceWeights;
  /** Hue bias in degrees (0–360), or null when no bias is applied. */
  hueBias: number | null;
  wordMode: WordModeSettings;
};

export const DEFAULT_SETTINGS: Settings = {
  matchCount: 3,
  sampleKernel: 3,
  weights: DEFAULT_WEIGHTS,
  hueBias: null,
  // Phase 1.5b: default the runtime to the blended expander now that the static
  // table ships in the bundle (it's tiny — ~14 KB). The kid's first query
  // benefits from the recall lift without any configuration.
  wordMode: { library: "small", engine: "literal", expander: "static-handcurated" },
};

const STORAGE_KEY = "color-trickser:settings";
const LAST_COLOR_KEY = "color-trickser:lastColor";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      weights: { ...DEFAULT_SETTINGS.weights, ...(parsed.weights ?? {}) },
      wordMode: { ...DEFAULT_SETTINGS.wordMode, ...(parsed.wordMode ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable (private mode, full quota); silently skip
  }
}

export function loadLastColor(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(LAST_COLOR_KEY);
    if (stored && /^#[0-9a-f]{6}$/i.test(stored)) return stored;
  } catch {
    // fall through
  }
  return fallback;
}

export function saveLastColor(hex: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_COLOR_KEY, hex);
  } catch {
    // skip
  }
}
