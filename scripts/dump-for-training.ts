#!/usr/bin/env tsx
/**
 * Dumps the inputs the Phase B Python eval needs:
 *   - training/data/eval-cases.json  — EVAL_QUERIES verbatim
 *   - training/data/colors-small.json — small library with families pre-classified
 *
 * The TS side stays the single source of truth for both EVAL_QUERIES and the
 * `getPrimaryColorName` band classifier; Python reads JSON only. Run before
 * `just train-eval` (the recipe chains this automatically).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPrimaryColorName, parseColorCsv } from "../src/lib/color-matcher.ts";
import {
  buildFamilyIndex,
  type DistillationLookup,
  searchDistilled,
} from "../src/lib/word-search/distillation/lookup.ts";
import { EVAL_QUERIES } from "../src/lib/word-search/eval/queries.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "training/data");
const LIBRARY = "small";
const TOP_K_PAIRS = 3;

mkdirSync(OUT_DIR, { recursive: true });

const csv = readFileSync(resolve(ROOT, `src/generated/colors-${LIBRARY}.csv`), "utf8");
const colors = parseColorCsv(csv);

const library = colors.map((c) => ({
  id: c.id,
  name: c.name,
  hex: c.hex,
  family: getPrimaryColorName(c.hex),
}));

writeFileSync(resolve(OUT_DIR, `colors-${LIBRARY}.json`), `${JSON.stringify(library, null, 2)}\n`);
writeFileSync(resolve(OUT_DIR, "eval-cases.json"), `${JSON.stringify(EVAL_QUERIES, null, 2)}\n`);

// Distillation training pairs: for each entry in the lookup, compute the top-K
// library names the runtime's family-filtered Oklab nearest would actually
// return. Trains the encoder to map (noun → real library name) instead of
// (noun → hex-string), which the encoder can't generalise across.
const lookup = JSON.parse(
  readFileSync(resolve(ROOT, "src/generated/colour-distillation.json"), "utf8"),
) as DistillationLookup;
const familyIndex = buildFamilyIndex(colors);

type TrainingEntry = {
  noun: string;
  family: string;
  hex: string;
  confidence: string;
  libraryNames: string[];
};

const pairs: TrainingEntry[] = [];
for (const [noun, entry] of Object.entries(lookup.entries)) {
  // Reuse the actual runtime path so training and runtime stay in lockstep.
  // searchDistilled returns null on confidence:low; we keep those entries in
  // the pairs file with an empty libraryNames so the training script can skip
  // them itself without a second source of truth on the filter.
  const hits = searchDistilled(noun, colors, lookup, familyIndex, TOP_K_PAIRS);
  pairs.push({
    noun,
    family: entry.family,
    hex: entry.hex,
    confidence: entry.confidence,
    libraryNames: hits ? hits.map((h) => h.name) : [],
  });
}

writeFileSync(
  resolve(OUT_DIR, "training-pairs.json"),
  `${JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), topK: TOP_K_PAIRS, pairs }, null, 2)}\n`,
);

console.log(`dumped ${library.length} library entries → training/data/colors-${LIBRARY}.json`);
console.log(`dumped ${EVAL_QUERIES.length} eval cases → training/data/eval-cases.json`);
console.log(
  `dumped ${pairs.length} training pairs (top-${TOP_K_PAIRS}) → training/data/training-pairs.json`,
);
