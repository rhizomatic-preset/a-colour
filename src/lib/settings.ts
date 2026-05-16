import { DEFAULT_WEIGHTS, type DistanceWeights } from "@/lib/color-matcher";

export type MatchCount = 1 | 3 | 5;
export type SampleKernel = 1 | 3 | 5 | 7;

export type Settings = {
  matchCount: MatchCount;
  sampleKernel: SampleKernel;
  weights: DistanceWeights;
  /** Hue bias in degrees (0–360), or null when no bias is applied. */
  hueBias: number | null;
};

export const DEFAULT_SETTINGS: Settings = {
  matchCount: 3,
  sampleKernel: 3,
  weights: DEFAULT_WEIGHTS,
  hueBias: null,
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
