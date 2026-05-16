#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ColorDescription from "color-description";

import { getPrimaryColorName, normalizeHex } from "../src/lib/color-matcher.ts";
import { tokenize } from "../src/lib/word-search/tokenize.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const DATA = resolve(__dirname, "data");
const OUT = resolve(ROOT, "src/generated");

type Source = "xkcd" | "css";

type Entry = {
  id: string;
  name: string;
  hex: string;
  r: number;
  g: number;
  b: number;
  source: Source;
  /** Run-together CSS literal token to attach to TF-IDF doc. Always present for CSS entries; carried over to xkcd entries that absorb a CSS alias in the `small` variant. */
  cssAliases: string[];
};

function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex);
  return {
    r: Number.parseInt(h.slice(1, 3), 16),
    g: Number.parseInt(h.slice(3, 5), 16),
    b: Number.parseInt(h.slice(5, 7), 16),
  };
}

function loadBlocklist(): Set<string> {
  const raw = readUtf8(resolve(DATA, "xkcd-blocklist.txt"));
  const set = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    set.add(trimmed.toLowerCase());
  }
  return set;
}

function loadXkcd(blocklist: Set<string>): Entry[] {
  const raw = readUtf8(resolve(DATA, "xkcd-rgb.txt"));
  const entries: Entry[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "").replace(/\t+$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const lowerName = parts[0].trim();
    const hex = parts[1].trim();
    if (!lowerName || !hex) continue;
    if (blocklist.has(lowerName.toLowerCase())) continue;
    const normHex = normalizeHex(hex);
    const { r, g, b } = hexToRgb(normHex);
    entries.push({
      id: slugify(lowerName),
      name: titleCase(lowerName),
      hex: normHex,
      r,
      g,
      b,
      source: "xkcd",
      cssAliases: [],
    });
  }
  return entries;
}

function loadCss(): Entry[] {
  const colors = JSON.parse(readUtf8(resolve(DATA, "css-named-colors.json"))) as Record<
    string,
    string
  >;
  const splits = JSON.parse(readUtf8(resolve(DATA, "css-name-splits.json"))) as Record<
    string,
    string
  >;
  const entries: Entry[] = [];
  for (const key of Object.keys(colors).sort()) {
    const hex = colors[key];
    const display = splits[key];
    if (!display) {
      throw new Error(`Missing split-name for CSS key "${key}" in css-name-splits.json`);
    }
    const normHex = normalizeHex(hex);
    const { r, g, b } = hexToRgb(normHex);
    entries.push({
      id: `${slugify(display)}_css`,
      name: display,
      hex: normHex,
      r,
      g,
      b,
      source: "css",
      cssAliases: [key],
    });
  }
  return entries;
}

type MergeResult = {
  entries: Entry[];
  droppedCssCount: number;
};

/** Merge xkcd ∪ CSS. On display-name collision, xkcd wins; CSS key becomes alias on the surviving xkcd entry. */
function mergeXkcdAndCss(xkcd: Entry[], css: Entry[]): MergeResult {
  const byLowerName = new Map<string, Entry>();
  for (const entry of xkcd) {
    // Clone so mutation here doesn't bleed into the xkcd-only variant.
    byLowerName.set(entry.name.toLowerCase(), {
      ...entry,
      cssAliases: [...entry.cssAliases],
    });
  }
  let dropped = 0;
  for (const entry of css) {
    const key = entry.name.toLowerCase();
    const existing = byLowerName.get(key);
    if (existing) {
      dropped += 1;
      for (const alias of entry.cssAliases) {
        if (!existing.cssAliases.includes(alias)) existing.cssAliases.push(alias);
      }
    } else {
      byLowerName.set(key, { ...entry, cssAliases: [...entry.cssAliases] });
    }
  }
  const entries = Array.from(byLowerName.values()).sort((a, b) => a.id.localeCompare(b.id));
  return { entries, droppedCssCount: dropped };
}

function csvEscapeName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function emitCsv(path: string, entries: Entry[]): void {
  const lines = ["id,name,hex,r,g,b"];
  for (const e of entries) {
    lines.push(`${e.id},${csvEscapeName(e.name)},${e.hex},${e.r},${e.g},${e.b}`);
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function describeTokens(hex: string): string[] {
  // color-description constructor expects any culori-compatible colour string.
  const cd = new ColorDescription(hex);
  const phrases = cd.descriptiveWords ?? [];
  const tokens = new Set<string>();
  for (const phrase of phrases) {
    for (const tok of tokenize(phrase)) tokens.add(tok);
  }
  return Array.from(tokens);
}

type TfidfIndex = {
  vocab: string[];
  idf: number[];
  vectors: Array<Array<[number, number]>>;
};

function buildTfidfIndex(entries: Entry[]): TfidfIndex {
  // Per-document token lists, preserving repetition (so TF reflects raw counts).
  const docs: string[][] = entries.map((e) => {
    const tokens = new Set<string>();
    const list: string[] = [];
    const push = (tok: string) => {
      const t = tok.trim().toLowerCase();
      if (!t) return;
      list.push(t);
      tokens.add(t);
    };
    for (const t of tokenize(e.name)) push(t);
    push(getPrimaryColorName(e.hex));
    for (const t of describeTokens(e.hex)) push(t);
    for (const alias of e.cssAliases) push(alias);
    return list;
  });

  // Document frequencies — count each token at most once per document.
  const df = new Map<string, number>();
  for (const doc of docs) {
    const unique = new Set(doc);
    for (const tok of unique) df.set(tok, (df.get(tok) ?? 0) + 1);
  }

  const vocab = Array.from(df.keys()).sort();
  const vocabIndex = new Map<string, number>();
  for (let i = 0; i < vocab.length; i++) vocabIndex.set(vocab[i], i);

  const N = docs.length;
  const idf = vocab.map((tok) => Math.log((N + 1) / ((df.get(tok) ?? 0) + 1)) + 1);

  const vectors: Array<Array<[number, number]>> = docs.map((doc) => {
    const counts = new Map<number, number>();
    for (const tok of doc) {
      const idx = vocabIndex.get(tok);
      if (idx === undefined) continue;
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    const pairs: Array<[number, number]> = Array.from(counts.entries()).map(([i, c]) => [i, c]);
    pairs.sort((a, b) => a[0] - b[0]);
    return pairs;
  });

  return { vocab, idf, vectors };
}

function emitTfidf(path: string, index: TfidfIndex): void {
  writeFileSync(path, `${JSON.stringify(index)}\n`);
}

function ensureOutDir(): void {
  mkdirSync(OUT, { recursive: true });
}

function rel(path: string): string {
  return path.replace(`${ROOT}/`, "");
}

function main(): void {
  ensureOutDir();

  const blocklist = loadBlocklist();
  const xkcd = loadXkcd(blocklist);
  xkcd.sort((a, b) => a.id.localeCompare(b.id));

  const css = loadCss();
  css.sort((a, b) => a.id.localeCompare(b.id));

  const merge = mergeXkcdAndCss(xkcd, css);

  const variants = [
    { id: "xkcd" as const, entries: xkcd },
    { id: "css" as const, entries: css },
    { id: "small" as const, entries: merge.entries },
  ];

  const summary: Array<{ id: string; rows: number; vocab: number }> = [];
  for (const { id, entries } of variants) {
    const csvPath = resolve(OUT, `colors-${id}.csv`);
    const tfidfPath = resolve(OUT, `tfidf-${id}.json`);
    emitCsv(csvPath, entries);
    const index = buildTfidfIndex(entries);
    emitTfidf(tfidfPath, index);
    summary.push({ id, rows: entries.length, vocab: index.vocab.length });
    process.stderr.write(`Wrote ${rel(csvPath)} and ${rel(tfidfPath)}\n`);
  }

  process.stderr.write("\nSummary:\n");
  for (const s of summary) {
    process.stderr.write(`  ${s.id.padEnd(6)} ${s.rows} entries / ${s.vocab} vocab tokens\n`);
  }
  process.stderr.write(
    `  small: dropped ${merge.droppedCssCount} CSS entries that collided with xkcd; merged their run-together literal as an alias\n`,
  );
}

main();
