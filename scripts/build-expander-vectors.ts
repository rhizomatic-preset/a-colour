#!/usr/bin/env tsx
/**
 * Phase 1.5b — build a precomputed nearest-neighbour table for query expansion
 * from a static word-embedding model (GloVe 6B 50d).
 *
 * The runtime never loads the full embedding model — it loads
 * `src/generated/expansions-static.json`, a `Record<string, string[]>` mapping
 * each in-scope query token to its top-K nearest neighbours drawn from the
 * colour-name TF-IDF vocabulary. Identical shape to the handcurated dictionary
 * so the same expander factory consumes it.
 *
 * Inputs (cached under `scripts/data/.cache/`, gitignored):
 *   - glove.6B.zip      — the full GloVe 6B archive (~862 MB) from Stanford NLP
 *                         (mirrored on HF at huggingface.co/stanfordnlp/glove).
 *   - glove.6B.50d.txt  — the 50-dim text file, extracted from the zip.
 *
 * Output:
 *   - src/generated/expansions-static.json — flat token → string[] map.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { EVAL_QUERIES } from "../src/lib/word-search/eval/queries.ts";
import { loadTfidfIndex } from "../src/lib/word-search/tfidf-index.ts";
import { tokenize } from "../src/lib/word-search/tokenize.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const CACHE = resolve(__dirname, "data/.cache");
const OUT = resolve(ROOT, "src/generated");

const GLOVE_TXT = resolve(CACHE, "glove.6B.50d.txt");
const GLOVE_URL = "https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip";

/** Tokens we want neighbours *for* — the per-query lookup keys. */
function collectQueryVocab(): Set<string> {
  const queryTokens = new Set<string>();
  for (const c of EVAL_QUERIES) {
    for (const t of tokenize(c.query)) queryTokens.add(t);
  }
  return queryTokens;
}

/** Token pool the neighbours are drawn from — must overlap with the TF-IDF vocab to land hits. */
function collectNeighbourPool(): Set<string> {
  const pool = new Set<string>();
  const tfidfPath = resolve(OUT, "tfidf-small.json");
  if (!existsSync(tfidfPath)) {
    throw new Error(`Missing ${tfidfPath} — run \`just build-libraries\` first.`);
  }
  const tfidf = loadTfidfIndex(JSON.parse(readUtf8(tfidfPath)));
  for (const v of tfidf.vocab) pool.add(v);

  // Family-name tokens already in the TF-IDF vocab (red, green, ...) are kept;
  // their inclusion is what makes "caterpillar → green" possible.
  return pool;
}

function readUtf8(path: string): string {
  // Short config-ish files only; the 171 MB GloVe file is streamed line-by-line below.
  return readFileSync(path, "utf8");
}

type GloveVector = { token: string; v: Float32Array };

async function streamGloveSubset(
  needed: Set<string>,
  poolHint: Set<string>,
): Promise<{ neededVecs: Map<string, Float32Array>; poolVecs: Map<string, Float32Array> }> {
  if (!existsSync(GLOVE_TXT)) {
    throw new Error(
      `Missing ${GLOVE_TXT.replace(`${ROOT}/`, "")}.
` + `Run \`just fetch-glove\` first (downloads ${GLOVE_URL} into scripts/data/.cache/).`,
    );
  }
  const size = statSync(GLOVE_TXT).size;
  process.stderr.write(`Streaming GloVe 6B 50d (${(size / 1024 / 1024).toFixed(0)} MB)…\n`);

  const neededVecs = new Map<string, Float32Array>();
  const poolVecs = new Map<string, Float32Array>();
  const fileStream = createReadStream(GLOVE_TXT, { encoding: "utf8" });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount += 1;
    if (!line) continue;
    const firstSpace = line.indexOf(" ");
    if (firstSpace < 0) continue;
    const token = line.slice(0, firstSpace);
    const wantNeeded = needed.has(token);
    const wantPool = poolHint.has(token);
    if (!wantNeeded && !wantPool) continue;
    const parts = line.slice(firstSpace + 1).split(" ");
    const v = new Float32Array(parts.length);
    for (let i = 0; i < parts.length; i++) v[i] = Number.parseFloat(parts[i]);
    if (wantNeeded) neededVecs.set(token, v);
    if (wantPool) poolVecs.set(token, v);
  }
  process.stderr.write(
    `Parsed ${lineCount} GloVe lines; matched ${neededVecs.size} query tokens, ${poolVecs.size} pool tokens.\n`,
  );
  return { neededVecs, poolVecs };
}

function l2normalise(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (n === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function nearestK(
  queryVec: Float32Array,
  pool: GloveVector[],
  k: number,
  minScore: number,
  selfToken: string,
): string[] {
  const scored: Array<{ token: string; score: number }> = [];
  for (const p of pool) {
    if (p.token === selfToken) continue;
    const s = dot(queryVec, p.v);
    if (s < minScore) continue;
    scored.push({ token: p.token, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((e) => e.token);
}

type BuildOptions = {
  k: number;
  minScore: number;
};

function buildExpansions(
  needed: Map<string, Float32Array>,
  pool: Map<string, Float32Array>,
  opts: BuildOptions,
): Record<string, string[]> {
  // L2-normalise once so cosine = dot product.
  const normPool: GloveVector[] = [];
  for (const [token, v] of pool) normPool.push({ token, v: l2normalise(v) });

  const out: Record<string, string[]> = {};
  for (const [token, rawVec] of needed) {
    const q = l2normalise(rawVec);
    const neighbours = nearestK(q, normPool, opts.k, opts.minScore, token);
    if (neighbours.length === 0) continue;
    out[token] = neighbours;
  }
  return out;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      k: { type: "string", default: "5" },
      "min-score": { type: "string", default: "0.30" },
    },
    strict: true,
    allowPositionals: false,
  });

  const k = Number.parseInt(values.k ?? "5", 10);
  const minScore = Number.parseFloat(values["min-score"] ?? "0.30");
  if (!Number.isFinite(k) || k <= 0) throw new Error(`Invalid --k=${values.k}`);
  if (!Number.isFinite(minScore)) throw new Error(`Invalid --min-score=${values["min-score"]}`);

  const queryVocab = collectQueryVocab();
  const neighbourPool = collectNeighbourPool();
  process.stderr.write(
    `Targets: ${queryVocab.size} query tokens; pool: ${neighbourPool.size} TF-IDF tokens.\n`,
  );

  // The neighbour pool is the union — query tokens we look up + colour-name vocab
  // we draw neighbours from. They overlap (e.g. "red" is both a query token and a
  // TF-IDF token); the streamer stores into both maps when so.
  streamGloveSubset(queryVocab, neighbourPool)
    .then(({ neededVecs, poolVecs }) => {
      const expansions = buildExpansions(neededVecs, poolVecs, { k, minScore });
      mkdirSync(OUT, { recursive: true });
      const outPath = resolve(OUT, "expansions-static.json");
      // Sorted keys for diff stability.
      const sorted: Record<string, string[]> = {};
      for (const key of Object.keys(expansions).sort()) sorted[key] = expansions[key];
      writeFileSync(outPath, `${JSON.stringify(sorted, null, 2)}\n`);
      process.stderr.write(
        `Wrote ${outPath.replace(`${ROOT}/`, "")} (${Object.keys(sorted).length} keys, k=${k}, min-score=${minScore}).\n`,
      );

      // Quick sanity print: the eight motivating open-vocab tokens.
      const sanity = [
        "rainbow",
        "trout",
        "ender",
        "dragon",
        "caterpillar",
        "salamander",
        "octopus",
        "charizard",
        "kirby",
        "deku",
        "pumpkin",
        "spice",
      ];
      process.stderr.write("\nSanity check (open-vocab tokens → neighbours):\n");
      for (const t of sanity) {
        const ns = sorted[t];
        process.stderr.write(`  ${t.padEnd(13)} → ${ns ? ns.join(", ") : "(no entry)"}\n`);
      }
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      process.exit(2);
    });
}

main();
