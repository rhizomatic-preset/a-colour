// Easter eggs for word mode. Tiny set of opinionated overrides for queries
// where the right answer is a *display*, not a colour name from the library.
//
// `rainbow` — return seven cards, one per ROYGBIV stripe.
// `static`  — return one card that renders animated TV-static.
// `zomp`    — return the Resene colour joke card.
//
// Add sparingly; each entry is a deliberate gift, not a behavioural escape
// hatch. If the customer types one of the triggers we short-circuit the
// whole search pipeline.

export type EasterEggCard = {
  name: string;
  hex: string;
  /** Render hint for `<WordResultCard>`. `default` shows a solid swatch;
   *  other values pick custom swatch renderers. */
  display: "default" | "static";
};

export type EasterEgg = {
  trigger: string;
  cards: EasterEggCard[];
};

// ROYGBIV — the canonical seven stripes. Indigo is debated (Newton-era; some
// modern teachings drop it) but seven feels right for a kid's rainbow.
const ROYGBIV: EasterEggCard[] = [
  { name: "Red", hex: "#e53935", display: "default" },
  { name: "Orange", hex: "#fb8c00", display: "default" },
  { name: "Yellow", hex: "#fdd835", display: "default" },
  { name: "Green", hex: "#43a047", display: "default" },
  { name: "Blue", hex: "#1e88e5", display: "default" },
  { name: "Indigo", hex: "#3949ab", display: "default" },
  { name: "Violet", hex: "#8e24aa", display: "default" },
];

const STATIC_NOISE: EasterEggCard[] = [{ name: "Static", hex: "#888888", display: "static" }];
const ZOMP: EasterEggCard[] = [{ name: "ZOMP", hex: "#39A78E", display: "default" }];

export const EASTER_EGGS: EasterEgg[] = [
  { trigger: "rainbow", cards: ROYGBIV },
  { trigger: "static", cards: STATIC_NOISE },
  { trigger: "zomp", cards: ZOMP },
];

/** Returns the cards if the query (case-insensitive, trimmed) matches a known
 * easter-egg trigger; otherwise null. Callers should short-circuit normal
 * search when this returns non-null. */
export function getEasterEgg(query: string): EasterEggCard[] | null {
  const normalised = query.trim().toLowerCase();
  if (normalised.length === 0) return null;
  for (const egg of EASTER_EGGS) {
    if (egg.trigger === normalised) return egg.cards;
  }
  return null;
}
