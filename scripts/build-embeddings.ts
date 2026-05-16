#!/usr/bin/env tsx
/**
 * Phase 2A — precompute colour-vectors per candidate engine.
 *
 * For each candidate `<engine-id>` and library variant, produces:
 *   src/generated/embeddings-<engine-id>-<library>.bin   — Float32 row-major
 *   src/generated/embeddings-<engine-id>-<library>.json  — { dim, count } meta
 *
 * Inputs: src/generated/colors-<library>.csv (from `just build-libraries`)
 *         scripts/data/.cache/<engine-specific-asset>    (per-engine config)
 *
 * No runtime/UI consumes these — the eval script reads them via the candidate
 * embedder's `loadColorVectors` method.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import ColorDescription from "color-description";

import { type ColorReference, parseColorCsv } from "../src/lib/color-matcher.ts";
import { tokenize } from "../src/lib/word-search/tokenize.ts";
import {
  averageVector,
  colorDocTokens,
  GLOVE_CONFIGS,
  type GloveConfig,
  loadVocabSubset,
  writeEmbeddings,
} from "./candidates/glove/embedder.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

type LibraryId = "xkcd" | "css" | "small";
const LIBRARIES: LibraryId[] = ["xkcd", "css", "small"];

function describeTokens(hex: string): string[] {
  const cd = new ColorDescription(hex);
  const phrases = cd.descriptiveWords ?? [];
  const out = new Set<string>();
  for (const phrase of phrases) {
    for (const tok of tokenize(phrase)) out.add(tok);
  }
  return Array.from(out);
}

async function buildGloveEmbeddings(
  config: GloveConfig,
  library: ColorReference[],
  libraryId: LibraryId,
): Promise<void> {
  // Collect all tokens we'll need: every colour's enriched doc-tokens.
  const needed = new Set<string>();
  const perColorTokens: string[][] = [];
  for (const c of library) {
    const tokens = colorDocTokens(c, describeTokens(c.hex));
    perColorTokens.push(tokens);
    for (const t of tokens) needed.add(t);
  }

  process.stderr.write(
    `${config.id}/${libraryId}: streaming GloVe subset for ${needed.size} unique doc tokens…\n`,
  );
  const vocab = await loadVocabSubset(config, needed);
  process.stderr.write(`  matched ${vocab.size}/${needed.size} tokens in GloVe.\n`);

  const vectors: Float32Array[] = perColorTokens.map((tokens) =>
    averageVector(tokens, vocab, config.dim),
  );
  const { binPath, metaPath } = writeEmbeddings(config, libraryId, library, vectors);
  process.stderr.write(
    `  wrote ${binPath.replace(`${ROOT}/`, "")} (${library.length}×${config.dim}) + ${metaPath.replace(
      `${ROOT}/`,
      "",
    )}\n`,
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      engine: { type: "string" },
      library: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const engineId = values.engine;
  const libArg = values.library;
  if (!engineId) {
    process.stderr.write(
      `Usage: tsx scripts/build-embeddings.ts --engine=<id> [--library=xkcd|css|small]\n`,
    );
    process.stderr.write(`Known engines: ${Object.keys(GLOVE_CONFIGS).join(", ")}\n`);
    process.exit(2);
  }

  const config = GLOVE_CONFIGS[engineId];
  if (!config) {
    process.stderr.write(`Unknown engine "${engineId}".\n`);
    process.exit(2);
  }

  const targets: LibraryId[] = libArg ? [libArg as LibraryId] : LIBRARIES;
  for (const id of targets) {
    const csvPath = resolve(ROOT, `src/generated/colors-${id}.csv`);
    if (!existsSync(csvPath)) {
      process.stderr.write(
        `Skipping ${id}: missing ${csvPath.replace(`${ROOT}/`, "")} (run \`just build-libraries\`).\n`,
      );
      continue;
    }
    const colors = parseColorCsv(readFileSync(csvPath, "utf8"));
    await buildGloveEmbeddings(config, colors, id);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(2);
});
