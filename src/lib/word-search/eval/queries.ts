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

  // poetic (3) — inspection-only; no expectedFamily so they aren't scored.
  { query: "melancholy", category: "poetic", notes: "inspection-only" },
  { query: "joy", category: "poetic", notes: "inspection-only" },
  { query: "ocean at dawn", category: "poetic", notes: "inspection-only" },
];
