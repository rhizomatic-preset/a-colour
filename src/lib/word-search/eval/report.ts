import type { EvalCategory } from "@/lib/word-search/eval/queries";
import type { CaseResult, RunResult } from "@/lib/word-search/eval/runner";

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
  "poetic",
];

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "  -  ";
  const value = Math.round((numerator / denominator) * 100);
  return `${value.toString().padStart(3)}%`;
}

function formatResults(results: CaseResult["results"]): string {
  if (results.length === 0) return "(no results)";
  return results.map((r) => r.family).join(", ");
}

function formatInspectionResults(results: CaseResult["results"]): string {
  if (results.length === 0) return "(no results)";
  return results.map((r) => r.name.toLowerCase()).join(", ");
}

export function formatReport(run: RunResult): string {
  const generated = run.generatedAt.slice(0, 10);
  // Only surface the expander when it's non-default; keeps the header for noop
  // runs identical to the pre-1.5a format the committed phase-1a reports use.
  const expanderSegment =
    run.expander && run.expander !== "noop" ? `  Expander: ${run.expander}` : "";
  const header = `Engine: ${run.engine}  Library: ${run.library}${expanderSegment}  Generated: ${generated}`;
  const rule = "─".repeat(69);

  if (run.cases.length === 0) {
    return [
      header,
      rule,
      "No eval cases registered yet — populate EVAL_QUERIES in Phase 1A.",
      "",
    ].join("\n");
  }

  // Bucket by category.
  const buckets = new Map<EvalCategory, CaseResult[]>();
  for (const c of run.cases) {
    const cat = c.case.category;
    const bucket = buckets.get(cat);
    if (bucket) bucket.push(c);
    else buckets.set(cat, [c]);
  }

  const lines: string[] = [];
  lines.push(header);
  lines.push(rule);
  lines.push("Category              n     acc@1     acc@3");

  let totalN = 0;
  let totalAt1 = 0;
  let totalAt3 = 0;

  for (const category of CATEGORY_ORDER) {
    const bucket = buckets.get(category);
    if (!bucket || bucket.length === 0) continue;
    const n = bucket.length;
    const at1 = bucket.filter((c) => c.pass.at1).length;
    const at3 = bucket.filter((c) => c.pass.at3).length;
    totalN += n;
    totalAt1 += at1;
    totalAt3 += at3;
    const name = category.padEnd(22);
    const nStr = n.toString().padStart(2);
    lines.push(`${name}${nStr}    ${pct(at1, n)}      ${pct(at3, n)}`);
  }

  lines.push(rule);
  const overallName = "overall".padEnd(22);
  const overallN = totalN.toString().padStart(2);
  lines.push(`${overallName}${overallN}    ${pct(totalAt1, totalN)}      ${pct(totalAt3, totalN)}`);
  lines.push("");

  // Failures (acc@3): cases with an expectation that didn't pass at 3.
  const failures = run.cases.filter(
    (c) => (c.case.expectedFamily || c.case.expectedName) && !c.pass.at3,
  );
  if (failures.length > 0) {
    lines.push("Failures (acc@3):");
    const queryWidth = Math.max(...failures.map((c) => c.case.query.length + 2));
    for (const c of failures) {
      const expected = c.case.expectedFamily ?? c.case.expectedName ?? "?";
      const quoted = `"${c.case.query}"`.padEnd(queryWidth);
      lines.push(`  ${quoted} → expected ${expected}, got: ${formatResults(c.results)}`);
    }
    lines.push("");
  }

  // Inspection-only (poetic): always shown, no pass/fail.
  const poetic = run.cases.filter((c) => c.case.category === "poetic");
  if (poetic.length > 0) {
    lines.push("Inspection-only (poetic):");
    const queryWidth = Math.max(...poetic.map((c) => c.case.query.length + 2));
    for (const c of poetic) {
      const quoted = `"${c.case.query}"`.padEnd(queryWidth);
      lines.push(`  ${quoted} → ${formatInspectionResults(c.results)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
