#!/usr/bin/env tsx
/**
 * Verifies the distillation lookup against the eval set: for each scored case
 * whose query (or one of its tokens) matches an entry in the lookup, run the
 * distillation path and report whether the top library hit's family / name
 * matches the case's expectation. Surfaces regressions before they land in the
 * full eval run.
 *
 * Also flags entries whose declared `family` field disagrees with
 * `getPrimaryColorName(entry.hex)` — those are recoverable (the runtime uses
 * `family`, not the hex's band), but they hint at a bad hex choice.
 *
 * Run: `pnpm tsx scripts/verify-distillation.ts`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { getPrimaryColorName, parseColorCsv } from "../src/lib/color-matcher.ts";
import {
  buildFamilyIndex,
  type DistillationLookup,
  searchDistilled,
} from "../src/lib/word-search/distillation/lookup.ts";
import { EVAL_QUERIES } from "../src/lib/word-search/eval/queries.ts";
import { tokenize } from "../src/lib/word-search/tokenize.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIBRARY = "small";

const csv = readFileSync(resolve(ROOT, `src/generated/colors-${LIBRARY}.csv`), "utf8");
const colors = parseColorCsv(csv);
const lookup = JSON.parse(
  readFileSync(resolve(ROOT, "src/generated/colour-distillation.json"), "utf8"),
) as DistillationLookup;
const familyIndex = buildFamilyIndex(colors);

// 1. Internal consistency: declared family vs band-classified hex
const declaredMismatches: Array<{ token: string; declared: string; band: string; hex: string }> = [];
for (const [token, entry] of Object.entries(lookup.entries)) {
  const band = getPrimaryColorName(entry.hex);
  if (band !== entry.family) {
    declaredMismatches.push({ token, declared: entry.family, band, hex: entry.hex });
  }
}

// 2. Eval interaction: for every scored case, run searchDistilled and verify
type CaseHit = {
  query: string;
  category: string;
  expectedFamily?: string;
  expectedName?: string;
  lookupToken?: string;
  topFamily?: string;
  topName?: string;
  status: "no-hit" | "pass-family" | "pass-name" | "fail-family" | "fail-name" | "no-expectation";
};

const cases: CaseHit[] = [];
for (const c of EVAL_QUERIES) {
  const tokens = tokenize(c.query);
  const matchedToken = tokens.find((t) => lookup.entries[t] !== undefined);
  if (!matchedToken) continue;
  const hits = searchDistilled(c.query, colors, lookup, familyIndex, 3);
  if (!hits || hits.length === 0) {
    cases.push({
      query: c.query,
      category: c.category,
      expectedFamily: c.expectedFamily,
      expectedName: c.expectedName,
      lookupToken: matchedToken,
      status: "no-hit",
    });
    continue;
  }
  const top = hits[0];
  const topFamily = getPrimaryColorName(top.hex);
  const topName = top.name;
  let status: CaseHit["status"] = "no-expectation";
  if (c.expectedFamily) {
    status = topFamily === c.expectedFamily ? "pass-family" : "fail-family";
  } else if (c.expectedName) {
    status =
      topName.toLowerCase() === c.expectedName.toLowerCase() ? "pass-name" : "fail-name";
  }
  cases.push({
    query: c.query,
    category: c.category,
    expectedFamily: c.expectedFamily,
    expectedName: c.expectedName,
    lookupToken: matchedToken,
    topFamily,
    topName,
    status,
  });
}

// Report
console.log(`Lookup: ${Object.keys(lookup.entries).length} entries`);
console.log(`Library: ${colors.length} colours\n`);

if (declaredMismatches.length > 0) {
  console.log("Declared family vs HSL-band mismatches (recoverable, but worth a look):");
  for (const m of declaredMismatches) {
    console.log(`  ${m.token.padEnd(20)} declared=${m.declared.padEnd(10)} band=${m.band.padEnd(10)} hex=${m.hex}`);
  }
  console.log();
}

const failures = cases.filter((c) => c.status === "fail-family" || c.status === "fail-name" || c.status === "no-hit");
const passes = cases.filter((c) => c.status === "pass-family" || c.status === "pass-name");
console.log(`Eval interaction: ${passes.length} passes, ${failures.length} regressions/misses`);

if (failures.length > 0) {
  console.log("\nFAILURES (distillation breaks eval expectation):");
  for (const f of failures) {
    const exp = f.expectedFamily ?? f.expectedName ?? "?";
    const got = f.topFamily ?? f.topName ?? "?";
    console.log(`  [${f.category}] "${f.query}" via "${f.lookupToken}" → expected ${exp}, got ${got} (${f.topName})`);
  }
  process.exit(1);
}

console.log("\nAll lookup-intercepted cases pass.");
process.exit(0);
