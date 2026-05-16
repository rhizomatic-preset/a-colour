export type PrimaryColorFamily =
  | "black"
  | "charcoal"
  | "gray"
  | "silver"
  | "white"
  | "brown"
  | "olive"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "magenta"
  | "pink";

export type EvalCategory =
  | "trivial"
  | "modified-family"
  | "literal-name"
  | "css-literal"
  | "object-rooted"
  | "cultural"
  | "compound"
  | "te-reo"
  | "weather"
  | "open-vocab"
  | "poetic";

export type EvalCase = {
  query: string;
  expectedFamily?: PrimaryColorFamily;
  expectedName?: string;
  category: EvalCategory;
  notes?: string;
};

/** Populated in Phase 1A. */
export const EVAL_QUERIES: EvalCase[] = [
  // trivial (10) — bedrock colour vocabulary; anything below 100% acc@1 is a bug.
  { query: "red", expectedFamily: "red", category: "trivial" },
  { query: "blue", expectedFamily: "blue", category: "trivial" },
  { query: "green", expectedFamily: "green", category: "trivial" },
  { query: "orange", expectedFamily: "orange", category: "trivial" },
  { query: "yellow", expectedFamily: "yellow", category: "trivial" },
  { query: "purple", expectedFamily: "purple", category: "trivial" },
  { query: "pink", expectedFamily: "pink", category: "trivial" },
  { query: "brown", expectedFamily: "brown", category: "trivial" },
  { query: "black", expectedFamily: "black", category: "trivial" },
  { query: "white", expectedFamily: "white", category: "trivial" },

  // modified-family (8) — adjective + family; tests TF-IDF document enrichment.
  { query: "dark blue", expectedFamily: "blue", category: "modified-family" },
  { query: "light pink", expectedFamily: "pink", category: "modified-family" },
  { query: "pale yellow", expectedFamily: "yellow", category: "modified-family" },
  { query: "bright red", expectedFamily: "red", category: "modified-family" },
  { query: "deep purple", expectedFamily: "purple", category: "modified-family" },
  { query: "light green", expectedFamily: "green", category: "modified-family" },
  { query: "dark brown", expectedFamily: "brown", category: "modified-family" },
  { query: "pastel pink", expectedFamily: "pink", category: "modified-family" },

  // literal-name (5) — xkcd names a user types verbatim. expectedName carries the check;
  // expectedFamily is intentionally omitted because the user's success criterion here is
  // "did the right *name* land top-1", not whether getPrimaryColorName agrees on a family.
  { query: "eggshell", expectedName: "Eggshell", category: "literal-name" },
  { query: "salmon", expectedName: "Salmon", category: "literal-name" },
  { query: "mustard", expectedName: "Mustard", category: "literal-name" },
  { query: "teal", expectedName: "Teal", category: "literal-name" },
  { query: "coral", expectedName: "Coral", category: "literal-name" },

  // css-literal (5) — run-together CSS names; guards the TF-IDF alias mechanism.
  { query: "aliceblue", expectedFamily: "blue", category: "css-literal" },
  {
    query: "gainsboro",
    expectedFamily: "silver",
    category: "css-literal",
    notes: "#dcdcdc L≈0.86 → silver per getPrimaryColorName (L>0.7 threshold)",
  },
  {
    query: "mediumvioletred",
    expectedFamily: "magenta",
    category: "css-literal",
    notes: "#c71585 → HSL h≈322 → magenta per getPrimaryColorName",
  },
  {
    query: "darkslateblue",
    expectedFamily: "blue",
    category: "css-literal",
    notes: "#483d8b → HSL h≈248 → blue per getPrimaryColorName (boundary with purple)",
  },
  { query: "palegoldenrod", expectedFamily: "yellow", category: "css-literal" },

  // object-rooted (12) — xkcd is rich in these; TF-IDF should already do well.
  { query: "ocean", expectedFamily: "blue", category: "object-rooted" },
  { query: "sunset", expectedFamily: "orange", category: "object-rooted" },
  { query: "lemon", expectedFamily: "yellow", category: "object-rooted" },
  { query: "mud", expectedFamily: "brown", category: "object-rooted" },
  { query: "forest", expectedFamily: "green", category: "object-rooted" },
  { query: "sky", expectedFamily: "blue", category: "object-rooted" },
  { query: "cherry", expectedFamily: "red", category: "object-rooted" },
  { query: "grass", expectedFamily: "green", category: "object-rooted" },
  { query: "lavender", expectedFamily: "purple", category: "object-rooted" },
  { query: "ice", expectedFamily: "white", category: "object-rooted" },
  { query: "fire", expectedFamily: "orange", category: "object-rooted" },
  { query: "leaf", expectedFamily: "green", category: "object-rooted" },

  // cultural (4) — Phase 2 targets; TF-IDF expected to fail.
  {
    query: "minecraft creeper pants",
    expectedFamily: "green",
    category: "cultural",
    notes: "Phase 2 target — TF-IDF expected to fail",
  },
  {
    query: "taylor swift red",
    expectedFamily: "red",
    category: "cultural",
    notes: "Phase 2 target — TF-IDF expected to fail",
  },
  {
    query: "mario hat",
    expectedFamily: "red",
    category: "cultural",
    notes: "Phase 2 target — TF-IDF expected to fail",
  },
  {
    query: "tiktok pink",
    expectedFamily: "pink",
    category: "cultural",
    notes: "Phase 2 target — TF-IDF expected to fail",
  },

  // compound (6) — multi-token phrases combining known tokens.
  { query: "ocean beach", expectedFamily: "blue", category: "compound" },
  { query: "forest moss", expectedFamily: "green", category: "compound" },
  { query: "dusty rose", expectedFamily: "pink", category: "compound" },
  { query: "dark forest green", expectedFamily: "green", category: "compound" },
  { query: "faded denim", expectedFamily: "blue", category: "compound" },
  { query: "autumn leaves", expectedFamily: "orange", category: "compound" },

  // te-reo (8) — Te Reo Māori colour vocabulary. Macronned spellings exercise the
  // tokenizer's NFD diacritic fold AND the macron-less dictionary keys end-to-end.
  { query: "whero", expectedFamily: "red", category: "te-reo" },
  {
    query: "kākāriki",
    expectedFamily: "green",
    category: "te-reo",
    notes: "macron fold: kākāriki → kakariki",
  },
  {
    query: "kōwhai",
    expectedFamily: "yellow",
    category: "te-reo",
    notes: "macron fold: kōwhai → kowhai",
  },
  { query: "kahurangi", expectedFamily: "blue", category: "te-reo" },
  {
    query: "māwhero",
    expectedFamily: "pink",
    category: "te-reo",
    notes: "macron fold: māwhero → mawhero",
  },
  { query: "mangu", expectedFamily: "black", category: "te-reo" },
  { query: "kiwikiwi", expectedFamily: "gray", category: "te-reo" },
  { query: "waiporoporo", expectedFamily: "purple", category: "te-reo" },

  // weather (6) — atmospheric / outdoor terms; companion to object-rooted.
  { query: "cloud", expectedFamily: "white", category: "weather" },
  { query: "cloudy", expectedFamily: "gray", category: "weather" },
  { query: "rain", expectedFamily: "gray", category: "weather" },
  { query: "rainy", expectedFamily: "gray", category: "weather" },
  { query: "lightning", expectedFamily: "yellow", category: "weather" },
  { query: "puddle", expectedFamily: "brown", category: "weather" },

  // open-vocab (10) — Phase 1.5b targets. Inputs no in-vocab token or hand-dictionary
  // entry can reach. Static word-embedding expansion is the only path. Expected to score
  // ~0/0 under literal + handcurated; the lift here is the headline number for 1.5b.
  // Reference: design/open-vocabulary.md.
  {
    query: "rainbow trout",
    expectedFamily: "pink",
    category: "open-vocab",
    notes: "Phase 1.5b target — pinkish-silver fish; needs static-embedding expansion",
  },
  {
    query: "ender dragon",
    expectedFamily: "purple",
    category: "open-vocab",
    notes: "Phase 1.5b target — Minecraft Ender Dragon is dark purple/magenta",
  },
  {
    query: "caterpillar",
    expectedFamily: "green",
    category: "open-vocab",
    notes: "Phase 1.5b target — default kid mental model is green",
  },
  {
    query: "salamander",
    expectedFamily: "orange",
    category: "open-vocab",
    notes: "Phase 1.5b target — fire salamander connotations; orange / yellow",
  },
  {
    query: "octopus",
    expectedFamily: "pink",
    category: "open-vocab",
    notes: "Phase 1.5b target — common octopus is pinkish/red/magenta",
  },
  {
    query: "charizard",
    expectedFamily: "orange",
    category: "open-vocab",
    notes: "Phase 1.5b target — Charizard is orange with flame",
  },
  {
    query: "kirby",
    expectedFamily: "pink",
    category: "open-vocab",
    notes: "Phase 1.5b target — Kirby is bubble-gum pink",
  },
  {
    query: "lego car",
    expectedFamily: "red",
    category: "open-vocab",
    notes: "Phase 1.5b target — classic Lego is bright primary red/yellow/blue",
  },
  {
    query: "pumpkin spice",
    expectedFamily: "orange",
    category: "open-vocab",
    notes: "Phase 1.5b target — orange / brown autumnal cluster",
  },
  {
    query: "deku cosplay",
    expectedFamily: "green",
    category: "open-vocab",
    notes: "Phase 1.5b target — My Hero Academia Deku is green",
  },

  // poetic (3) — inspection-only; no expectedFamily so they aren't scored.
  { query: "melancholy", category: "poetic", notes: "inspection-only" },
  { query: "joy", category: "poetic", notes: "inspection-only" },
  { query: "ocean at dawn", category: "poetic", notes: "inspection-only" },
];
