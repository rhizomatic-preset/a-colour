#!/usr/bin/env tsx
/**
 * Phase 1.5b — fetch the Stanford GloVe 6B archive into the build cache.
 *
 * Idempotent: noop when the zip is already present. Extracts glove.6B.50d.txt
 * alongside the zip so `build-expander-vectors.ts` can stream it directly.
 *
 * The cache directory `scripts/data/.cache/` is gitignored; the artefacts here
 * are not part of the committed repo. The runtime never sees these — it ships
 * only the precomputed nearest-neighbour JSON.
 */
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE = resolve(__dirname, "data/.cache");
const ZIP_PATH = resolve(CACHE, "glove.6B.zip");
const TXT_PATH = resolve(CACHE, "glove.6B.50d.txt");
const GLOVE_URL = "https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip";

async function download(url: string, dest: string): Promise<void> {
  process.stderr.write(`Downloading ${url} → ${dest}\n`);
  const tmp = `${dest}.partial`;
  const res = await fetch(url);
  if (!res.ok || res.body === null) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const out = createWriteStream(tmp);
  let received = 0;
  let lastTick = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out.write(value);
    received += value.length;
    const now = Date.now();
    if (now - lastTick > 1000) {
      const pct = total > 0 ? ` ${((received / total) * 100).toFixed(1)}%` : "";
      process.stderr.write(`  ${(received / 1024 / 1024).toFixed(0)} MB${pct}\r`);
      lastTick = now;
    }
  }
  out.end();
  await new Promise<void>((res) => out.on("close", () => res()));
  // Atomic rename: only land the final path once the download finished.
  const { renameSync } = await import("node:fs");
  renameSync(tmp, dest);
  process.stderr.write(`\nDownloaded ${(received / 1024 / 1024).toFixed(0)} MB.\n`);
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });

  if (!existsSync(ZIP_PATH)) {
    await download(GLOVE_URL, ZIP_PATH);
  } else {
    const sz = statSync(ZIP_PATH).size;
    process.stderr.write(
      `Cache hit: ${ZIP_PATH} (${(sz / 1024 / 1024).toFixed(0)} MB) — skipping download.\n`,
    );
  }

  if (!existsSync(TXT_PATH)) {
    process.stderr.write(`Extracting glove.6B.50d.txt from ${ZIP_PATH}…\n`);
    try {
      execFileSync("unzip", ["-o", ZIP_PATH, "glove.6B.50d.txt"], { cwd: CACHE });
    } catch (err) {
      // If unzip fails, ditch any partial extract so a retry is clean.
      if (existsSync(TXT_PATH)) unlinkSync(TXT_PATH);
      throw err;
    }
    process.stderr.write(`Wrote ${TXT_PATH}.\n`);
  } else {
    process.stderr.write(`Cache hit: ${TXT_PATH} — skipping extraction.\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(2);
});
