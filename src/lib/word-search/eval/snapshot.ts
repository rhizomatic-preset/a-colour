import type { EvalCase, EvalCategory } from "@/lib/word-search/eval/queries";
import type { CaseResult, RunResult } from "@/lib/word-search/eval/runner";

export type SnapshotCase = {
  query: string;
  expectedFamily?: EvalCase["expectedFamily"];
  expectedName?: string;
  results: CaseResult["results"];
  pass: { at1: boolean; at3: boolean };
};

export type SnapshotShape = {
  library: string;
  engine: string;
  /** Omitted (and treated as "noop") for back-compat with snapshots written before the expander layer landed. */
  expander?: string;
  threshold: number | null;
  generatedAt: string;
  casesByCategory: Record<string, SnapshotCase[]>;
};

const CATEGORY_ORDER: EvalCategory[] = [
  "trivial",
  "modified-family",
  "literal-name",
  "css-literal",
  "object-rooted",
  "cultural",
  "compound",
  "te-reo",
  "weather",
  "open-vocab",
  "common-noun",
  "ood-noun",
  "poetic",
];

export function toSnapshot(run: RunResult): SnapshotShape {
  const grouped: Record<string, SnapshotCase[]> = {};
  for (const c of run.cases) {
    const cat = c.case.category;
    const entry: SnapshotCase = {
      query: c.case.query,
      results: c.results,
      pass: c.pass,
    };
    if (c.case.expectedFamily !== undefined) {
      entry.expectedFamily = c.case.expectedFamily;
    }
    if (c.case.expectedName !== undefined) {
      entry.expectedName = c.case.expectedName;
    }
    const bucket = grouped[cat];
    if (bucket) bucket.push(entry);
    else grouped[cat] = [entry];
  }

  // Preserve canonical category ordering, drop empty buckets.
  const ordered: Record<string, SnapshotCase[]> = {};
  for (const category of CATEGORY_ORDER) {
    const bucket = grouped[category];
    if (bucket && bucket.length > 0) ordered[category] = bucket;
  }

  // Omit `expander` for the default noop so pre-1.5a snapshots stay byte-identical.
  const snapshot: SnapshotShape = {
    library: run.library,
    engine: run.engine,
    threshold: null,
    generatedAt: run.generatedAt,
    casesByCategory: ordered,
  };
  if (run.expander && run.expander !== "noop") {
    snapshot.expander = run.expander;
  }
  return snapshot;
}

export function formatSnapshot(snapshot: SnapshotShape): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

/**
 * Naive line-based diff. Returns `null` when the two snapshots are deeply
 * equal, otherwise a unified-diff-ish string of differing lines.
 *
 * We intentionally ignore `generatedAt` for equality so re-runs at different
 * times don't produce spurious diffs.
 */
export function diffSnapshots(current: SnapshotShape, expected: SnapshotShape): string | null {
  const currentExpander = current.expander ?? "noop";
  const expectedExpander = expected.expander ?? "noop";
  if (currentExpander !== expectedExpander) {
    return `expander mismatch: snapshot was generated with "${expectedExpander}", current run used "${currentExpander}". Compare like-for-like.`;
  }
  const stripTime = (s: SnapshotShape): SnapshotShape => ({
    ...s,
    generatedAt: "",
  });
  const a = formatSnapshot(stripTime(current));
  const b = formatSnapshot(stripTime(expected));
  if (a === b) return null;

  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const out: string[] = [];
  out.push("--- expected (committed snapshot)");
  out.push("+++ current  (this run)");
  for (let i = 0; i < max; i++) {
    const aLine = aLines[i];
    const bLine = bLines[i];
    if (aLine === bLine) continue;
    if (bLine !== undefined) out.push(`- ${bLine}`);
    if (aLine !== undefined) out.push(`+ ${aLine}`);
  }
  return out.join("\n");
}
