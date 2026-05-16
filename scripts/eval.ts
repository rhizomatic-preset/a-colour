#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parseColorCsv } from "../src/lib/color-matcher.ts";
import { EVAL_QUERIES } from "../src/lib/word-search/eval/queries.ts";
import { formatReport } from "../src/lib/word-search/eval/report.ts";
import { runEval } from "../src/lib/word-search/eval/runner.ts";
import { diffSnapshots, formatSnapshot, toSnapshot } from "../src/lib/word-search/eval/snapshot.ts";
import {
  buildBlendedExpander,
  buildHandcuratedExpander,
  buildStaticExpander,
  NoopExpander,
  type QueryExpander,
} from "../src/lib/word-search/expander.ts";
import { loadTfidfIndex, type TfidfIndex } from "../src/lib/word-search/tfidf-index.ts";

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
    },
    strict: true,
    allowPositionals: false,
  });

  const engine = values.engine ?? "literal";
  const library = values.library ?? "small";
  const expanderId = values.expander ?? "noop";
  const outPath = values.out;
  const updateSnapshot = values["update-snapshot"] === true;

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

  // NOTE: Phase 0 ships with NullEmbedder only. Engine selection lands in Phase 2.
  if (engine !== "literal") {
    process.stderr.write(
      `Engine "${engine}" is not registered yet (Phase 0 ships literal only).\n`,
    );
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

  const run = await runEval({
    cases: EVAL_QUERIES,
    library: colors,
    tfidf,
    expander,
    libraryId: library,
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
  const snapshotName =
    expanderId === "noop"
      ? `ground-truth-${library}-${engine}.json`
      : `ground-truth-${library}-${engine}-${expanderId}.json`;
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
