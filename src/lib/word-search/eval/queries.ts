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
export const EVAL_QUERIES: EvalCase[] = [];
