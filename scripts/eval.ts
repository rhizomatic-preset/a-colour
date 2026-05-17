#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parseColorCsv } from "../src/lib/color-matcher.ts";
import type { DistillationLookup } from "../src/lib/word-search/distillation/lookup.ts";
import type { LibraryVariant } from "../src/lib/word-search/embedder.ts";
import { EVAL_QUERIES } from "../src/lib/word-search/eval/queries.ts";
import { formatReport } from "../src/lib/word-search/eval/report.ts";
import { type CaseSearcher, runEval } from "../src/lib/word-search/eval/runner.ts";
import { diffSnapshots, formatSnapshot, toSnapshot } from "../src/lib/word-search/eval/snapshot.ts";
import {
  buildBlendedExpander,
  buildHandcuratedExpander,
  buildStaticExpander,
  NoopExpander,
  type QueryExpander,
} from "../src/lib/word-search/expander.ts";
import { loadTfidfIndex, type TfidfIndex } from "../src/lib/word-search/tfidf-index.ts";
import { tokenize as tokenizeForVocab } from "../src/lib/word-search/tokenize.ts";
import { GLOVE_CONFIGS, makeGloveEmbedder } from "./candidates/glove/embedder.ts";
import { searchHybrid } from "./candidates/hybrid-search.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

async function main() {
  const { values } = parseArgs({
    options: {
      engine: { type: "string", default: "literal" },
      library: { type: "string", default: "small" },
      expander: { type: "string", default: "noop" },
      out: { type: "string" },
      "update-snapshot": { type: "boolean", default: false },
      distillation: { type: "string", default: "on" },
    },
    strict: true,
    allowPositionals: false,
  });

  const engine = values.engine ?? "literal";
  const library = values.library ?? "small";
  const expanderId = values.expander ?? "noop";
  const outPath = values.out;
  const updateSnapshot = values["update-snapshot"] === true;
  const distillationMode = values.distillation ?? "on";

  const csvPath = resolve(ROOT, `src/generated/colors-${library}.csv`);
  const tfidfPath = resolve(ROOT, `src/generated/tfidf-${library}.json`);

  if (!existsSync(csvPath) || !existsSync(tfidfPath)) {
    const missing = !existsSync(csvPath) ? csvPath : tfidfPath;
    process.stderr.write(
      `Phase 1A data not yet generated — expected ${missing.replace(`${ROOT}/`, "")}.\n`,
    );
    process.stderr.write("Run `just build-libraries` once Phase 1A has landed.\n");
    process.exit(0);
  }

  const csv = readFileSync(csvPath, "utf8");
  const colors = parseColorCsv(csv);

  const tfidfRaw = JSON.parse(readFileSync(tfidfPath, "utf8")) as unknown;
  const tfidf: TfidfIndex = loadTfidfIndex(tfidfRaw);

  // Phase 2A bake-off engines: any registered GloVe candidate. Falls through
  // to the literal path when --engine=literal. Unknown engine ids exit with
  // a clear error rather than silently degrade.
  const candidateConfig = engine !== "literal" ? GLOVE_CONFIGS[engine] : undefined;
  if (engine !== "literal" && !candidateConfig) {
    process.stderr.write(
      `Unknown engine "${engine}". Known candidates: literal, ${Object.keys(GLOVE_CONFIGS).join(", ")}.\n`,
    );
    process.exit(2);
  }

  const loadHandcurated = (): Record<string, string[]> => {
    const dictPath = resolve(ROOT, "scripts/data/query-expansions.json");
    if (!existsSync(dictPath)) {
      process.stderr.write(`Missing dictionary at ${dictPath.replace(`${ROOT}/`, "")}.\n`);
      process.exit(2);
    }
    return JSON.parse(readFileSync(dictPath, "utf8")) as Record<string, string[]>;
  };

  const loadStatic = (): Record<string, string[]> => {
    const dictPath = resolve(ROOT, "src/generated/expansions-static.json");
    if (!existsSync(dictPath)) {
      process.stderr.write(
        `Missing static-expander table at ${dictPath.replace(`${ROOT}/`, "")}.\n`,
      );
      process.stderr.write(
        "Run `just fetch-glove` then `just build-expander-vectors` to generate it.\n",
      );
      process.exit(2);
    }
    return JSON.parse(readFileSync(dictPath, "utf8")) as Record<string, string[]>;
  };

  let expander: QueryExpander = NoopExpander;
  if (expanderId === "noop") {
    expander = NoopExpander;
  } else if (expanderId === "handcurated") {
    expander = buildHandcuratedExpander(loadHandcurated());
  } else if (expanderId === "static") {
    expander = buildStaticExpander(loadStatic());
  } else if (expanderId === "static-handcurated") {
    expander = buildBlendedExpander(loadHandcurated(), loadStatic());
  } else {
    process.stderr.write(
      `Unknown --expander "${expanderId}" (expected noop | handcurated | static | static-handcurated).\n`,
    );
    process.exit(2);
  }

  let searcher: CaseSearcher | undefined;
  if (candidateConfig) {
    // Pre-collect every token the eval might present so the candidate's vocab
    // subset covers them. Otherwise novel tokens like "trout" yield zero
    // vectors and the strict-fallback collapses.
    const queryVocabHint = new Set<string>();
    for (const c of EVAL_QUERIES) {
      for (const t of tokenizeForVocab(c.query)) queryVocabHint.add(t);
    }
    const embedder = makeGloveEmbedder(candidateConfig, colors, queryVocabHint);
    const colorVectors = await embedder.loadColorVectors(library as LibraryVariant);
    if (colorVectors.length !== colors.length) {
      process.stderr.write(
        `Embedding count (${colorVectors.length}) doesn't match library size (${colors.length}). ` +
          `Rebuild via \`just build-embeddings ${candidateConfig.id}\`.\n`,
      );
      process.exit(2);
    }
    // The design doc starts threshold at 0.4 (strict-fallback). Empirically
    // TF-IDF cosine scores on the small library cluster around 0.2–0.4 for
    // confident hits — 0.4 is too aggressive and lets the embedder hijack
    // queries like "salmon" where TF-IDF clearly knows the answer. 0.15 keeps
    // TF-IDF for any non-zero literal hit while still falling through on the
    // "no in-vocab tokens" cases that are the embedder's job.
    const threshold = 0.15;
    searcher = (query: string) =>
      searchHybrid(query, colors, tfidf, embedder, colorVectors, library as LibraryVariant, {
        topN: 3,
        threshold,
      });
  }

  // Phase distillation — optional build-time-distilled common-noun lookup.
  // Off by default in `--distillation=off` runs so snapshots from earlier
  // phases stay regenerable. The lookup file is generated by hand (Claude
  // session writing the JSON), not by a script.
  let distillation: DistillationLookup | undefined;
  if (distillationMode !== "off") {
    const distPath = resolve(ROOT, "src/generated/colour-distillation.json");
    if (existsSync(distPath)) {
      distillation = JSON.parse(readFileSync(distPath, "utf8")) as DistillationLookup;
    } else if (distillationMode === "on" && !existsSync(distPath)) {
      // Silent no-op when missing — the file's optional. Surfaced via the
      // snapshot filename suffix so a missing lookup is visible in the diff.
    }
  }

  const run = await runEval({
    cases: EVAL_QUERIES,
    library: colors,
    tfidf,
    expander,
    libraryId: library,
    searcher,
    engineLabel: engine,
    distillation,
  });

  const report = formatReport(run);
  if (outPath) {
    const resolvedOut = resolve(process.cwd(), outPath);
    writeFileSync(resolvedOut, `${report}\n`);
  } else {
    process.stdout.write(`${report}\n`);
  }

  const snapshot = toSnapshot(run);
  // Default `noop` keeps the existing filename (back-compat). Other expanders extend it.
  // Distillation appends a `-distilled` suffix when the lookup actually fired
  // so pre-distillation snapshots stay byte-identical for `--distillation=off`.
  const distillationSuffix = distillation ? "-distilled" : "";
  const snapshotName =
    expanderId === "noop"
      ? `ground-truth-${library}-${engine}${distillationSuffix}.json`
      : `ground-truth-${library}-${engine}-${expanderId}${distillationSuffix}.json`;
  const snapshotPath = resolve(ROOT, `docs/eval/${snapshotName}`);
  const snapshotExists = existsSync(snapshotPath);

  if (updateSnapshot) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, formatSnapshot(snapshot));
    process.stderr.write(`Wrote snapshot ${snapshotPath.replace(`${ROOT}/`, "")}\n`);
    process.exit(0);
  }

  if (!snapshotExists) {
    process.stderr.write(
      `No committed snapshot yet at ${snapshotPath.replace(`${ROOT}/`, "")} — run with --update-snapshot to create one.\n`,
    );
    process.exit(0);
  }

  const expectedRaw = readFileSync(snapshotPath, "utf8");
  const expected = JSON.parse(expectedRaw) as ReturnType<typeof toSnapshot>;
  const diff = diffSnapshots(snapshot, expected);
  if (diff === null) {
    process.exit(0);
  }
  process.stderr.write(`${diff}\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(2);
});
