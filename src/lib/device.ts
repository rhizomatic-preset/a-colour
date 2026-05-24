/**
 * Coarse device heuristic for deciding whether to auto-load the ~24 MB Phase-B
 * word encoder. We err on the side of "treat as mobile" — three signals,
 * any one trips the hint:
 *
 * - `(pointer: coarse)` — touch-only input.
 * - viewport ≤ 820 px on its shortest side — phones and small tablets.
 * - `navigator.connection.saveData === true` — explicit user request to save.
 *
 * SSR-safe: returns `false` when `window` is unavailable.
 */
export function isLikelyMobile(): boolean {
  if (typeof window === "undefined") return false;

  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const smallViewport =
    Math.min(window.innerWidth || Infinity, window.innerHeight || Infinity) <= 820;

  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean };
    }
  ).connection;
  const saveData = conn?.saveData === true;

  return coarsePointer || smallViewport || saveData;
}
