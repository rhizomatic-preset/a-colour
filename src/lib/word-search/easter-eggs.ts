// Easter eggs for word mode. Opinionated overrides for queries where the right
// answer is a *display*, not a colour name from the library.
//
// Two categories so far:
//
//   Originals — `rainbow` (ROYGBIV), `static` (animated noise), `zomp` (joke)
//
//   Pride flags — canonical stripe sequences, one const per flag, multiple
//   triggers aliasing the same cards. e.g. "trans" and "transgender" both
//   resolve to TRANS. Flags live in the file as named consts so the trigger
//   list stays readable.
//
// If the customer types a trigger we short-circuit the whole search pipeline.

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

// ── Pride flags ──────────────────────────────────────────────────────────────
//
// Progress Pride flag (Daniel Quasar, 2018) — the widely-used contemporary
// rainbow. Used for `pride`, `lgbtq`, `queer`.
const PROGRESS_PRIDE: EasterEggCard[] = [
  { name: "Red", hex: "#e40303", display: "default" },
  { name: "Orange", hex: "#ff8c00", display: "default" },
  { name: "Yellow", hex: "#ffed00", display: "default" },
  { name: "Green", hex: "#008026", display: "default" },
  { name: "Blue", hex: "#004dff", display: "default" },
  { name: "Violet", hex: "#750787", display: "default" },
  { name: "White", hex: "#ffffff", display: "default" },
  { name: "Pink", hex: "#ffafc8", display: "default" },
  { name: "Light Blue", hex: "#74d7ee", display: "default" },
  { name: "Brown", hex: "#613915", display: "default" },
  { name: "Black", hex: "#000000", display: "default" },
];

// Transgender flag (Monica Helms, 1999).
const TRANS: EasterEggCard[] = [
  { name: "Light Blue", hex: "#55cdfc", display: "default" },
  { name: "Pink", hex: "#f7a8b8", display: "default" },
  { name: "White", hex: "#ffffff", display: "default" },
  { name: "Pink", hex: "#f7a8b8", display: "default" },
  { name: "Light Blue", hex: "#55cdfc", display: "default" },
];

// Bisexual flag (Michael Page, 1998).
const BISEXUAL: EasterEggCard[] = [
  { name: "Pink", hex: "#d60270", display: "default" },
  { name: "Purple", hex: "#9b4f96", display: "default" },
  { name: "Blue", hex: "#0038a8", display: "default" },
];

// Non-binary flag (Kye Rowan, 2014).
const NONBINARY: EasterEggCard[] = [
  { name: "Yellow", hex: "#fcf434", display: "default" },
  { name: "White", hex: "#ffffff", display: "default" },
  { name: "Purple", hex: "#9c59d1", display: "default" },
  { name: "Black", hex: "#2c2c2c", display: "default" },
];

// Pansexual flag (2010).
const PANSEXUAL: EasterEggCard[] = [
  { name: "Pink", hex: "#ff218c", display: "default" },
  { name: "Yellow", hex: "#ffd800", display: "default" },
  { name: "Blue", hex: "#21b1ff", display: "default" },
];

// Lesbian flag (Emily Gwen, 2018) — the modern orange/pink gradient design.
const LESBIAN: EasterEggCard[] = [
  { name: "Dark Orange", hex: "#d52d00", display: "default" },
  { name: "Orange", hex: "#ef7627", display: "default" },
  { name: "Light Orange", hex: "#ff9a56", display: "default" },
  { name: "White", hex: "#ffffff", display: "default" },
  { name: "Light Pink", hex: "#d162a4", display: "default" },
  { name: "Pink", hex: "#b55690", display: "default" },
  { name: "Dark Rose", hex: "#a50062", display: "default" },
];

// Asexual flag (AVEN, 2010).
const ASEXUAL: EasterEggCard[] = [
  { name: "Black", hex: "#000000", display: "default" },
  { name: "Grey", hex: "#a3a3a3", display: "default" },
  { name: "White", hex: "#ffffff", display: "default" },
  { name: "Purple", hex: "#800080", display: "default" },
];

// Genderqueer flag (Marilyn Roxie, 2011).
const GENDERQUEER: EasterEggCard[] = [
  { name: "Lavender", hex: "#b57edc", display: "default" },
  { name: "White", hex: "#ffffff", display: "default" },
  { name: "Green", hex: "#4a8123", display: "default" },
];

export const EASTER_EGGS: EasterEgg[] = [
  { trigger: "rainbow", cards: ROYGBIV },
  { trigger: "static", cards: STATIC_NOISE },
  { trigger: "zomp", cards: ZOMP },

  // Pride flags — multiple triggers per flag
  { trigger: "pride", cards: PROGRESS_PRIDE },
  { trigger: "lgbtq", cards: PROGRESS_PRIDE },
  { trigger: "lgbtq+", cards: PROGRESS_PRIDE },
  { trigger: "queer", cards: PROGRESS_PRIDE },
  { trigger: "rainbow flag", cards: PROGRESS_PRIDE },

  { trigger: "trans", cards: TRANS },
  { trigger: "transgender", cards: TRANS },

  { trigger: "bi", cards: BISEXUAL },
  { trigger: "bisexual", cards: BISEXUAL },

  { trigger: "nonbinary", cards: NONBINARY },
  { trigger: "non-binary", cards: NONBINARY },
  { trigger: "enby", cards: NONBINARY },

  { trigger: "pan", cards: PANSEXUAL },
  { trigger: "pansexual", cards: PANSEXUAL },

  { trigger: "lesbian", cards: LESBIAN },

  { trigger: "ace", cards: ASEXUAL },
  { trigger: "asexual", cards: ASEXUAL },

  { trigger: "genderqueer", cards: GENDERQUEER },
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
