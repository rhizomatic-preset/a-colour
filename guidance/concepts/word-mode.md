# Word mode — discovery & plan

A fourth input mode for Colour Thesaurus: the user types (or dictates via the OS keyboard mic) a few words describing a colour, and the app returns named colour candidates. Tap a candidate, the rest of the app behaves exactly as if that hex had been picked any other way.

Examples of inputs we want to handle gracefully:

- `red`
- `sunset`
- `ocean beach`
- `minecraft creeper pants`

The further down that list, the less likely a literal token-match against colour-name strings will work, and the more we lean on learned word associations. This document is the discovery and the staged plan for getting from "literal-only" to "knows that creeper pants are green" without blowing the offline-first budget.

The user-facing tab will be **Word**, icon `T` (the lucide `type` glyph), sitting fourth in the picker tab row beside Swatch / Image / Camera.

## Goal & non-goals

Goal: my colourblind son types or says rough words and the app gives him the closest named colour(s). Output flows back into the existing matches pipeline — picking a word-mode result sets `currentColor` and the standard perceptual matches list updates around it.

Non-goals (per CLAUDE.md "hyper-individualised and opinionated"):

- No internationalisation. NZ English colour vocabulary only.
- No theming / no user-configurable scoring weights for word mode (the existing Lightness/Chroma/Hue sliders are for the perceptual matcher and stay scoped to that).
- No "type-a-sentence chat" UX. Single short query, instant feedback.
- No custom voice UI. The OS keyboard's mic button is the voice path; that means the app only ever sees text.

## Prior art

Two distinct attempts the user has flagged:

**A. In this repo — commits `7b21b056` and `21ed9e2a` (May 2026).** Added then removed a "name search" mode. Worth understanding before re-attempting:

- The matcher had a `buildNameVectorIndex` / `findClosestColorNames` pair: TF-IDF over `${name} ${primaryFamily}` per colour — each "document" was 2–4 tokens. (The `CLAUDE.md` reference to those functions is now stale; they're gone.)
- The query side ran each user phrase through `Xenova/LaMini-Flan-T5-77M` to generate 5 "related search terms", then averaged TF-IDF cosine against the index.

Why scrapped: thin documents (2–4 tokens) means TF-IDF over-fits to literal name overlap. T5 variant generation was slow on first load, generic (not colour-tuned), and noisy. Net result felt random for anything beyond `red` / `blue`.

**B. Out-of-repo — the user's own embedding experiments.** Per the original brief: *"I played with pre-calculated vector embeddings, but I think they were not good."* This is a **different** experiment from (A) — (A) was generative query expansion, not precomputed embeddings. Before starting Phase 2 we should ask which model was used, on what corpus, and what specifically felt bad (low recall on colour-adjacent phrases? high recall on garbage? all results converged to a few colours?). That answer may collapse Phase 2's candidate-model shortlist significantly.

Lessons we carry forward:

1. **Don't enrich the colour index with a generative LLM at runtime.** Either enrich at build time (deterministic, cacheable) or use a real embedding model with proper semantic vectors.
2. **Pad the TF-IDF documents.** Two tokens isn't enough. We need 6–10 per colour, ideally including adjectives ("dark", "muted", "warm") and family tokens, before TF-IDF can do useful work.
3. **Make the engine pluggable.** We're going to change our minds about what model to use; build the swap-in/swap-out story before we commit to a specific one.
4. **Surface confidence honestly.** If the previous embedding attempt ranked everything near-tied around 0.6 cosine, the result list looked random even when the top pick was right. Closeness % must reflect a *spread* between candidates, not raw cosine.

## External resources & how each is used

- **xkcd colour survey (2010)** — CC0, ~954 entries. Object-rooted, crowdsourced names. Half of the new small library.
- **CSS named colors (W3C)** — public-domain spec, 147 entries. Canonical web vocabulary (`aliceblue`, `gainsboro`, `mediumvioletred`). Other half of the small library; deduped against xkcd by name. See "Dataset" below.
- **[`words/color-description`](https://github.com/words/color-description)** — given an RGB, returns a short English description like `"Greenish, very dark red"`. Used **at build time** to enrich the TF-IDF documents for every colour entry with adjectival tokens (`greenish`, `dark`, `red`). Adds the descriptor vocabulary the original attempt was missing.
- **[`meodai/color-names`](https://github.com/meodai/color-names)** — ~30 000 human-named colour entries. Becomes the *optional* large library (see "Dataset"). Data is CC-BY-SA-4.0; treated as a licence-isolated artefact (see "Risks").
- **EmbeddingGemma-300M / Model2Vec / Sentence-Transformers Static-MRL** — candidate sentence/word embedding models for the semantic-fallback engine. We don't pick one yet; the architecture treats the embedder as a swappable asset (see "Pluggable embedder" below).
- **Wikipedia "List of colors"** — the *current* shipped CSV (`guidance/references/colors.csv`, 865 entries). CC-BY-SA-3.0/4.0. Phase 1 retires this in favour of xkcd to remove the copyleft from the default code path.

## Dataset

### Current state (audit)

The shipped `guidance/references/colors.csv` (865 entries) is the **Wikipedia "List of colors"** dataset — identifiable by IDs like `air_force_blue_raf`, `usafa_blue`, `zinnwaldite_brown`. License: **CC-BY-SA-3.0/4.0** (Wikipedia content). No attribution is currently provided in the app. This is a pre-existing licensing gap, not introduced by this feature; Phase 1 should close it as a side effect of the data swap below.

### Options surveyed

| Dataset | Size | License | Vocabulary character |
|---|---|---|---|
| CSS named colors | 147 | W3C / effectively public | Standards-canonical (`coral`, `goldenrod`). |
| **xkcd color survey** | **954** | **CC0** | Crowdsourced object-rooted names (`blood red`, `eggshell`, `baby poop green`). |
| NBS/ISCC centroid | 267 | Public domain (NIST) | Formal, dated (`moderate olive brown`). |
| Wikipedia list (current) | 865 | CC-BY-SA-3.0/4.0 | Trade / heraldry / team colours. |
| meodai/color-names | ~30 000 | CC-BY-SA-4.0 | Marketing / paint-chip vocabulary, includes brand-y entries. |

### Decision

**Start with CC0 only. Build the architecture so the copyleft path can be enabled later without rework.**

The small library is built from **two CC0-compatible sources** combined at build time, giving us both kid-friendly object-rooted names and the canonical web/standards vocabulary in one list.

| | Small (default, bundled) — ships Phase 1 | Large (optional, downloaded) — deferred to Phase 3 |
|---|---|---|
| Sources | **xkcd colour survey** (CC0) + **CSS named colors** (W3C / public domain) | `meodai/color-names` `dist/colornames.csv` |
| Combined size | ~1 050 entries after dedup (954 xkcd + ~100 CSS-only) | ~30 000 |
| Schema | normalised to `id, "Name", #hex, r, g, b` at build time | normalised the same way; meodai is `name, hex, ...` natively |
| Bundled? | Yes (build-inlined via `?raw`) | Lazy fetch + IndexedDB cache (infrastructure built Phase 2, switched on Phase 3) |
| Affects modes | All four | **Word mode only** |
| License | **CC0-equivalent** — no attribution required | CC-BY-SA-4.0 — attribution + license-isolation required |
| Attribution in About panel | Optional courtesy credit (xkcd, W3C) | Required: dataset, license, link |
| Status through Phase 2 | Live | Settings UI present but disabled ("not enabled in this build") |

**Combining xkcd + CSS named colors.** Build-time merge rules:

1. **Dedup by lowercased name.** When both datasets name a colour the same (`coral`, `salmon`, `khaki`), keep the xkcd entry — its hex is rooted in the crowdsourced perceptual survey, which suits a colourblind kid better than the CSS spec's precise hex.
2. **CSS-only names get word-split display.** CSS names are run-together (`mediumvioletred`); for display we split into proper words ("Medium Violet Red"). A hand-curated `scripts/data/css-name-splits.json` covers all 147 names. Reviewable in one PR.
3. **Preserve CSS literals as TF-IDF aliases.** Even when an entry's display name is split, the *run-together* form is added to that entry's TF-IDF token list. So typing `mediumvioletred` (or `aliceblue`, `gainsboro`) still hits the right colour. This is what gives us the "non-kid web vocabulary" coverage the user asked for without growing the visible name list.
4. **Result.** ~1 050 entries, ~13% more vocabulary than xkcd alone, and the canonical CSS keywords reliably work.

The Settings panel includes the Large radio from Phase 1 onwards, **disabled**, so the future option is discoverable but doesn't ship copyleft-derived data until a deliberate decision is made.

**Why xkcd as the small list.** Same size class as the current dataset, strictly more permissive (CC0 — no attribution needed, no copyleft), and the vocabulary is more honest for a colourblind kid: `vomit yellow`, `baby poop green`, `cherry red`, `eggshell` describe by reference to things he sees, not by reference to heraldry. The few crass entries (xkcd is crowdsourced internet) get dropped with a small block-list at build time, committed alongside the build script for transparency.

**Scope.** The library toggle applies **only to word mode.** Swatch / image / camera / the perceptual matches list always read from xkcd (the small library). Rationale: the small list is curated; the 30k list contains marketing names that would make the camera-mode "closest match" feel arbitrary. Picking a result in word mode still flows through the existing perceptual matcher against the small list — so the matches that show up underneath after a word pick are always from familiar names.

**Build pipeline.** A single `scripts/build-libraries.ts` (run via the `build-libraries` just recipe, committed outputs) takes the upstream sources and emits three CC0 variants plus, in Phase 3, the copyleft large variant:

- `src/generated/colors-xkcd.csv` + `tfidf-xkcd.json` — xkcd only. Diagnostic eval target.
- `src/generated/colors-css.csv` + `tfidf-css.json` — CSS only, with run-together names retained as TF-IDF aliases. Diagnostic eval target.
- `src/generated/colors-small.csv` + `tfidf-small.json` — xkcd ∪ CSS, deduped (xkcd-preferred on collision). The variant the running app imports.
- `public/data/large/library-large.json` + `tfidf-large.json` — Phase 3 only, meodai-derived. Isolated under `public/data/large/` for license boundary clarity.

Schema normalisation: parse hex, derive `r,g,b` if not present, generate `id` as a slug of `name`. Same `ColorReference` type across all variants so the runtime is variant-agnostic.

## Architecture

### Pipeline (TF-IDF first, embeddings as fallback)

```
                 ┌──────────────────────┐
   text query → ─┤  normalise + tokens  ├─→ tokens
                 └──────────────────────┘
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
                ┌──────────────────┐                ┌──────────────────────┐
                │  TF-IDF cosine   │ ←── always ─── │  (load-on-demand)    │
                │  over active     │                │  embedding cosine    │
                │  library docs    │                │  if model present    │
                └────────┬─────────┘                └──────────┬───────────┘
                         │ top scores                          │ top scores
                         └────────────────┬────────────────────┘
                                          ▼
                          ┌───────────────────────────┐
                          │  combine_strategy()       │
                          │  (default: TF-IDF first,  │
                          │   fall through if top     │
                          │   score < threshold)      │
                          └───────────┬───────────────┘
                                      ▼
                              top-N WordSearchResult[]
```

`combine_strategy()` is one knob with two reasonable settings:

1. **Strict fallback.** If TF-IDF's best cosine ≥ threshold (e.g. 0.4), return TF-IDF results. Otherwise return embedding results. Cheap when literal hits exist; semantic only when needed.
2. **Blended.** `score = α · tfidfCosine + (1 − α) · embCosine` with α ≈ 0.4. Always merges both; smoother but always pays the embedding cost.

Start with strict fallback (matches the user's exact ask). Re-tune once we have a corpus of test queries.

### Pluggable embedder

The infrastructure for downloading, caching, and swapping a model is built **from day one**, even when the only shipping "embedder" is the null one (TF-IDF only). This is the load-bearing decision: changing engines later should be a config change plus a new asset, not an architecture rewrite.

```ts
// src/lib/word-search/embedder.ts
export interface Embedder {
  readonly id: string;              // "none", "model2vec-glove", "embedding-gemma-300m-q8"
  readonly displayName: string;     // "Literal only", "Static word embeddings", ...
  readonly assetBytes: number;      // for the download-size UI
  isReady(): boolean;
  load(onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void>;
  encodeQuery(text: string): Promise<Float32Array>;
  /** Per-colour vectors are precomputed at build time and shipped alongside the model. */
  loadColorVectors(libraryId: "small" | "large"): Promise<Float32Array[]>;
}
```

Shipping embedders, in order of intended adoption:

| Embedder | Size | Status | Notes |
|---|---|---|---|
| `none` | 0 | Phase 1 | TF-IDF only. Always present. The "literal" engine. |
| `model2vec-glove` | ~15–30 MB | Phase 2 | Static per-token embeddings, pure JS. No WASM. Per-token average for short phrases. |
| `embedding-gemma-300m-q8` | ~80–150 MB | Phase 3 (if needed) | ONNX via `@huggingface/transformers`. Best quality, biggest install hit. |

The Embedder interface deliberately separates **query encoding** (run on demand, fast) from **colour-vectors loading** (one-off, large, shipped as a precomputed binary asset per `(library, model)` pair). We do **not** encode 30 000 colour names in the browser at first run; that's a build step.

### Storage

- localStorage (`color-trickser:settings`): preference flags only (active library, active engine, last query?).
- IndexedDB (new namespace `color-trickser:wordmode`): all binary blobs.
  - `library:large` — the 30k CSV.
  - `engine:<id>` — model assets (tokeniser JSON + vectors binary, or ONNX model).
  - `vectors:<libraryId>:<engineId>` — precomputed colour vectors.
- Service worker: leaves IndexedDB alone. We don't want the SW intercepting model downloads — we want a controllable progress UI. PWA cache stays scoped to app shell + small CSV + icons.

**Sizing reminder.** 30 000 entries × 300-dim Float32 ≈ **36 MB** resident when an embedder is wired up; the on-disk file is similar before gzip. Acceptable on phones but it's the constraint that decides whether dimension reduction (e.g. PCA to 128-dim, ~15 MB) or int8 quantisation (~9 MB) is necessary. Treat the dimension/quantisation choice as a Phase 2 tuning knob, not a Phase 1 concern.

### Build-time artefact generation

`scripts/build-libraries.ts` (Phase 1A, run via `just build-libraries`) produces, per CC0 variant:

1. `src/generated/colors-<variant>.csv` — normalised colour list. Variants: `xkcd`, `css`, `small`. The `small` variant is what the app imports; the other two exist for the eval CLI.
2. `src/generated/tfidf-<variant>.json` — TF-IDF index, documents enriched by display-name tokens + run-together CSS aliases (where applicable) + `getPrimaryColorName` family token + `color-description` adjectives.

`scripts/build-embeddings.ts` (Phase 2, run via `just build-embeddings`) produces, per `(library-variant, engine)` pair:

3. `src/generated/embeddings-<engine>-<variant>.bin` — Float32 precomputed colour vectors. Phase 1 emits none.

Phase 3 extends both scripts with a `large` variant, emitted to `public/data/large/` to keep the CC-BY-SA-4.0 artefacts license-isolated.

The TF-IDF JSON is small (vectors are sparse `[tokenIdx, weight]` pairs). For the ~1 050-entry small library expect <120 KB gzipped; for the 30k meodai library expect ~1.5 MB gzipped — small enough to live next to the CSV in IndexedDB.

### Hybrid scoring details

For each colour candidate `c` and query `q`:

- `tfidfScore(c, q)` = cosine of TF-IDF vectors.
- `embScore(c, q)` = cosine of `embedder.encodeQuery(q)` vs the precomputed colour vector.

Default `combine_strategy("strict-fallback", threshold = 0.4)`:

```ts
const topTfidf = tfidfRanked.slice(0, limit);
if (!embedder.isReady() || topTfidf[0].score >= threshold) return topTfidf;
return embeddingRanked.slice(0, limit);
```

Closeness % in the result card maps the underlying cosine the same way the perceptual matcher does — clamp and round. A query that fails to match anything (cosine < 0.1) shows an empty state with a hint ("Try adding a colour word like 'green' or 'dark'.").

## UX surfaces

### The Word tab — keep it lean

Sits fourth in the picker tab row, active-state treatment same as the other tabs (`view === "picker" && mode === "word"`).

The Word panel mirrors the visual rhythm of the Swatch panel: **one input control, results below.** No configuration inside the tab. No download buttons. No engine indicators. No library badges. No "literal vs semantic" hints. All of that lives in Settings; the tab itself is just *input → swatches*.

Panel contents — that's it:

1. A single `<input type="text">` field, `inputmode="text"`, `enterkeyhint="search"`, autofocus on tab activation. NZ-English placeholder, e.g. `try "ocean" or "minecraft creeper pants"`. The OS keyboard mic (Android Gboard / iOS dictation) handles voice; we render no mic UI of our own.
2. A live result row of swatches — same visual treatment as the existing matches cards but driven by the word query, debounced ~120 ms. Tap → `setCurrentColor(result.hex)`; the standard perceptual matches list below updates as it does for any other mode.
3. A quiet empty state when no input or no matches. One short hint line, nothing more.

That's the whole panel. If a future change needs to surface engine state, library state, or download progress, it goes into Settings — never into this panel.

### Settings panel — single home for all word-mode controls

A new "Word mode" section in the existing Settings panel (after the matching weights), containing everything operational:

- **Colour library used by Word mode** — choice between `Small (bundled, ~1 050)` and `Large (~30 000, requires download)`. Switching to Large triggers an inline download + cache flow with progress bar and cancel. Size shown beforehand and during.
- **Engine** — choice between registered embedders. Phase 1 only shows `Literal only` (no download). Phase 2 adds `Static embeddings (~25 MB)`, same download flow.
- **Cached data** — read-out of what's stored (e.g. `Library (large): 1.4 MB`, `Engine (model2vec): 27 MB`) with per-row `Clear` buttons. No "clear all" — too easy to fat-finger.
- **Attribution lines** for any downloaded asset (meodai + CC-BY-SA-4.0; model attributions).

### About panel

Add a "Word mode" subsection listing data sources and engines with links. Required for the meodai CC-BY-SA-4.0 attribution to be compliant; optional courtesy credit for xkcd (CC0 needs no attribution but it's polite).

## Evaluation harness

Build the eval **before** the UI. The eval lets us see how the matcher behaves on real queries, compare engine candidates against each other, and refuse to ship anything that scores below baseline. Without it we are tuning on vibes.

### File layout

```
src/lib/word-search/eval/
  queries.ts          # committed list of EvalCase tuples (~50 starter cases)
  runner.ts           # runs queries through searchByWord against given (library, tfidf, embedder)
  report.ts           # formats results as a table for stdout / markdown

scripts/
  eval.ts             # CLI entry, invoked via `just eval <engine> <library> [--out=report.md] [--update-snapshot]`
```

### Library variants the eval can run against

The eval can target any of three CC0 library variants from Phase 1A onwards, so we can see what each source contributes on its own and where the merge wins or loses:

| `--library` | Contents | Why eval against it |
|---|---|---|
| `xkcd` | xkcd survey only (≈949 after blocklist) | Diagnostic. How well do object-rooted queries do without CSS noise? |
| `css` | CSS named colors only (147) | Diagnostic. Does the `css-literal` category really hit 100% via the alias tokens? Does `trivial` (`red`, `blue`) still work? |
| `small` | xkcd ∪ CSS (≈1 050, deduped) | The shipping variant. Numbers from this drive phase-gate decisions. |
| `large` | meodai (Phase 3 only) | What the copyleft library buys us. |

The three CC0 variants are all built by the same `scripts/build-libraries.ts`; they emit alongside each other (`colors-xkcd.csv` + `tfidf-xkcd.json`, `colors-css.csv` + `tfidf-css.json`, `colors-small.csv` + `tfidf-small.json`). Only the `small` set is imported by the running app; the other two exist exclusively for the eval CLI to load.

Recommended Phase 1A workflow: `just eval literal xkcd`, `just eval literal css`, `just eval literal small`, commit all three reports under `docs/eval/phase-1a-<variant>.md`, then compare side-by-side. If `small` regresses any category versus its constituents the merge logic is wrong.

### Eval case shape

```ts
type PrimaryColorFamily =
  | "black" | "charcoal" | "gray" | "silver" | "white"
  | "brown" | "olive"
  | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "magenta" | "pink";

type EvalCase = {
  query: string;
  expectedFamily?: PrimaryColorFamily;   // soft check: any top-K result's getPrimaryColorName matches
  expectedName?: string;                 // hard check: top-1 name matches (case-insensitive)
  category: "trivial" | "modified-family" | "literal-name" | "object-rooted" | "cultural" | "compound" | "poetic";
  notes?: string;
};
```

`expectedFamily` is the primary metric — it's robust to which specific named colour ranked first (picking "scarlet" instead of "crimson" when the answer was "red" still scores as correct). `expectedName` is reserved for the rare cases where one canonical name is the unambiguous answer.

### Starter query categories

Around 50 cases at launch, expand over time. Cases live in `queries.ts`, committed and reviewable.

- **trivial** — `red`, `blue`, `green`, `orange`, etc. Sanity floor. Anything below 100% accuracy@1 here is a bug.
- **modified-family** — `dark blue`, `pale yellow`, `bright pink`, `dusty rose`. Tests adjective enrichment of TF-IDF documents (the `color-description` tokens).
- **literal-name** — pick 5 names that exist verbatim in xkcd (`eggshell`, `salmon`, `mustard`, `teal`, `coral`); type them as-is. Should be top-1.
- **css-literal** — pick 5 CSS-only run-together names (`aliceblue`, `gainsboro`, `mediumvioletred`, `darkslateblue`, `palegoldenrod`); type them as-is. Should be top-1 via the TF-IDF alias mechanism. This category specifically guards the CSS-merge from regressing.
- **object-rooted** — `ocean`, `sunset`, `lemon`, `mud`, `forest`, `sky`, `cherry`, `grass`, `lavender`. xkcd has many object-rooted names, so TF-IDF should already do well.
- **cultural** — `minecraft creeper pants`, `taylor swift red`, `mario hat`, `tiktok pink`, `bob ross sky`. The category that exists *specifically* to expose where TF-IDF can't reach. Phase 1 expected accuracy near zero; Phase 2 success metric is "≥ 50% accuracy@3 here without regressing the other categories".
- **compound** — `ocean beach`, `forest moss`, `dusty rose`, `dark forest green`. Multi-token phrases that combine known tokens.
- **poetic / ambiguous** — `melancholy`, `joy`, `ocean at dawn`. No `expectedFamily` set; these are **inspection-only**, output but not scored. Useful for catching pathological behaviour (e.g. all poetic words mapping to the same dark colour).

### Scoring & report

For each case with `expectedFamily`: run the search, take the top 3 results, compute each result's family via the existing `getPrimaryColorName(result.hex)`, mark `pass@1` and `pass@3`.

Aggregate report (stdout, or `--out report.md`):

```
Engine: literal  Library: small (≈1050)  Threshold: n/a  Generated: 2026-05-16
─────────────────────────────────────────────────────────────────────
Category              n     acc@1     acc@3
trivial               10    100%      100%
modified-family        8     63%       88%
literal-name           5    100%      100%
css-literal            5    100%      100%
object-rooted         12     33%       58%
cultural               4      0%       25%
compound               6     50%       67%
─────────────────────────────────────────────────────────────────────
overall               50     54%       73%

Failures (acc@3):
  "minecraft creeper pants" → expected green, got: charcoal, brown, gray
  "tiktok pink"             → expected pink, got: blue, navy, royal
  …

Inspection-only (poetic):
  "melancholy" → slate, dusty purple, charcoal
  "joy"        → bright pink, sunshine, lemon
```

### Ground-truth snapshots

Accuracy numbers tell us whether a change *broke things*; they don't tell us *what shifted*. For that we commit a **ground-truth snapshot** alongside the human-facing report — a JSON file capturing every query's top-K results (name, hex, family, score). Subsequent eval runs diff against the committed snapshot; intended changes are accepted with `--update-snapshot`, surprises become PR review questions.

Two artefacts per `(library, engine)` run, both committed under `docs/eval/`:

- **`phase-Xy-<library>-<engine>.md`** — human-facing accuracy table + failure list. Eyeballed in PR review.
- **`ground-truth-<library>-<engine>.json`** — machine-comparable. Pretty-printed, grouped by category, one result per line. Diff-friendly.

Snapshot shape:

```jsonc
{
  "library": "small",
  "engine": "literal",
  "threshold": null,
  "generatedAt": "2026-05-16T03:11:09Z",
  "casesByCategory": {
    "trivial": [
      {
        "query": "red",
        "expectedFamily": "red",
        "results": [
          { "name": "Red",         "hex": "#e50000", "family": "red", "score": 0.91 },
          { "name": "Cherry Red",  "hex": "#f7022a", "family": "red", "score": 0.78 },
          { "name": "Crimson",     "hex": "#dc143c", "family": "red", "score": 0.71 }
        ],
        "pass": { "at1": true, "at3": true }
      }
    ]
  }
}
```

CLI semantics:

- `just eval literal small` — runs, prints the report, writes the markdown, **and** compares against the committed ground-truth JSON. Exits non-zero with a unified diff if results differ. This is the default behaviour — anyone running the eval immediately sees whether a tweak introduced regressions.
- `just eval literal small --update-snapshot` — overwrites the ground-truth JSON. Run this deliberately, then `git diff` shows the reviewer exactly which queries' top-K reshuffled and which scores moved.

What this catches that accuracy numbers don't:

- `"red"` flips from `[Red, Cherry Red, Crimson]` to `[Scarlet, Red, Cherry Red]`. `acc@3` is still 100%. The snapshot diff makes the reshuffle visible — maybe you intended it (the tokenizer change you made *should* boost short-word matches), maybe you didn't.
- A new query category lands and snapshots don't yet have it — failures are recorded one query at a time, so partial-coverage is a feature.
- `score` drift on a single query — a number creeping from 0.91 to 0.87 over several PRs is the kind of slow regression that's invisible in aggregate.

**Snapshot scope.** Top-3 results per query. Wider K bloats the diff without buying signal; the human report's "Failures" section already shows where the right answer fell out of the top-3.

**Versioning.** When the eval `queries.ts` itself changes (a query is added, renamed, or rephrased), the snapshot file gets an additive change. Reviewers see "new query landed, new line in snapshot" and the meaning is clear. Removing a query also makes a clear diff.

### How the eval gates each phase

- **Phase 1 baseline** is whatever score literal TF-IDF gets on the committed query set. Record it as the floor.
- **Phase 2 engine selection** is decided *by the eval*, not by feature-list comparison: each candidate static-embedding model runs through the same eval, the one with the best `acc@3` on cultural + object-rooted (without regressing trivial / literal-name) wins. If no candidate clears the bar, Phase 2 doesn't ship.
- **Phase 3** is gated on whether enabling meodai's large library actually moves the eval numbers up. If it doesn't, the licence cost isn't worth paying.

The eval is committed and `just`-runnable, so future tweaks (new query, new engine, new threshold) all get a numeric answer.

## Implementation plan (phased)

CC0 ships; CC-BY-SA is plumbed-for but disabled. Each phase is gated on the eval improving — or at least not regressing — versus the previous phase.

### Phase 0 — types, file layout, settings shape (no behaviour yet)

Lands the skeleton in one commit so subsequent work is mechanical.

| File | Purpose |
|---|---|
| `src/lib/settings.ts` | Add `wordMode: { library: "small", engine: "literal" }` to `Settings` and `DEFAULT_SETTINGS`. Existing merge logic (`...DEFAULT_SETTINGS, ...stored`) covers backward compatibility. |
| `src/lib/word-search/index.ts` | Stubs: `searchByWord(query, library, tfidf, embedder?)` returning empty array. |
| `src/lib/word-search/tokenize.ts` | Real impl — `tokenize(input: string): string[]`. Trivial; copy from old `21ed9e2a` work. |
| `src/lib/word-search/tfidf-index.ts` | Stubs for `TfidfIndex` type + `loadTfidfIndex(json)`, `queryTfidf(index, tokens)`. |
| `src/lib/word-search/embedder.ts` | `Embedder` interface + exported `NullEmbedder` constant. |
| `src/lib/word-search/eval/queries.ts` | Empty array, just the type export. |
| `src/lib/word-search/eval/runner.ts` | Real impl — runs given cases against `searchByWord`, returns structured results. Doesn't need an engine yet; literal-only works with the null embedder. |
| `src/lib/word-search/eval/report.ts` | Real impl — formats a `RunnerResult[]` to a markdown / plain string. |
| `src/lib/word-search/eval/snapshot.ts` | Real impl — formats `RunnerResult[]` to the ground-truth JSON shape; loads + diffs an existing snapshot file. |
| `scripts/eval.ts` | CLI entry-point reading args (`--engine`, `--library`, `--out`, `--update-snapshot`), wiring runner + report + snapshot diff. Accepts `--library=xkcd \| css \| small \| large`. Default behaviour: write report, compare snapshot, exit non-zero on diff. |
| `justfile` | Add grouped recipes (see "Justfile recipes" below). Recipes wrap `pnpm tsx scripts/...`; doc + CI invoke `just X`, never `pnpm` directly. |
| `package.json` (devDependencies) | Add `tsx` (script runner — required by every new just recipe). Phase 1A adds `color-description` for build-time enrichment; engines may add more in Phase 2. |

#### Justfile recipes

The existing three recipes (`install`, `check`, `run`) get retroactively grouped, and new ones are added under matching `[group(...)]` annotations:

```just
default:
    @just --list

[group('setup')]
install:
    pnpm install

[group('dev')]
run:
    pnpm dev

[group('quality')]
check:
    pnpm check

[group('build')]
build-libraries:
    pnpm tsx scripts/build-libraries.ts

[group('eval')]
eval engine="literal" library="small" *flags:
    pnpm tsx scripts/eval.ts --engine={{engine}} --library={{library}} {{flags}}

# Re-creates ground-truth snapshots for all three CC0 library variants.
[group('eval')]
eval-baseline:
    just eval literal xkcd --update-snapshot
    just eval literal css --update-snapshot
    just eval literal small --update-snapshot
```

Per the [just parameter docs](https://just.systems/man/en/recipe-parameters.html): `engine` and `library` are positional parameters with **default values** (`"literal"` and `"small"`) so `just eval` alone runs the most common case. Override either by name order: `just eval literal xkcd`, `just eval model2vec small`. `*flags` is a **variadic** parameter that captures any trailing `--update-snapshot` / `--out=...` arguments and forwards them via `{{flags}}`. Putting positional args before flags avoids the historical just-vs-recipe `--flag` ambiguity entirely.

**Eval is intentionally not in `just check`.** The quality gate (`just check` = biome + tsc + vitest) stays fast and inner-loop-friendly. The eval runs explicitly (`just eval ...`), and the ground-truth snapshot diff is what surfaces drift — visible at PR review time, not on every save. If we later want CI enforcement, add a separate workflow that runs `just eval literal small` on PRs touching `src/lib/word-search/**` or `src/generated/**`.

Future engine work in Phase 2 adds `build-embeddings` under `build`. Phase 3 copyleft work adds nothing new — `eval-baseline` extends naturally by appending `just eval literal large --update-snapshot` and `just eval <chosen-engine> large --update-snapshot`.

No new dependencies. No UI changes. No data changes. The build is green and the new files are inert.

### Phase 1A — eval rig + xkcd dataset + TF-IDF (no UI yet)

The point: get a numeric baseline before any UI exists.

1. **xkcd snapshot.** Commit `scripts/data/xkcd-rgb.txt` — the tab-separated colour-survey file from `https://xkcd.com/color/rgb.txt`. Reproducible build, no network at build time.
2. **CSS named colors snapshot.** Commit `scripts/data/css-named-colors.json` — flat `{ "aliceblue": "#f0f8ff", ... }` covering the 147 CSS spec names.
3. **CSS name splits.** Commit `scripts/data/css-name-splits.json` — hand-curated `{ "mediumvioletred": "Medium Violet Red", ... }`. Reviewable single PR.
4. **Blocklist.** Commit `scripts/data/xkcd-blocklist.txt` — one name per line, names dropped at build time. Start small (≈5 entries the user reviews).
5. **`scripts/build-libraries.ts` — three CC0 variants.** Single script, three outputs:
   - `colors-xkcd.csv` (xkcd only, blocklist applied)
   - `colors-css.csv` (CSS only, split-name display, run-together alias retained as a token)
   - `colors-small.csv` (xkcd ∪ CSS, deduped by lowercased name with xkcd preferred)
   All three normalised into `id, "Name", #hex, r, g, b` shape (slug `id`, derive `r,g,b` from hex). Idempotent; outputs committed under `src/generated/`. Only `colors-small.csv` is imported by the running app; the other two exist for the eval rig.
6. **TF-IDF index build (per variant).** For each of the three CSVs the script enriches each colour's document with: split-word tokens from the display name, the run-together CSS literal (when the entry originated from CSS), `getPrimaryColorName(hex)` (family token), and `color-description` (adjective tokens). Tokenises, computes IDF over the per-variant corpus, emits `src/generated/tfidf-<variant>.json` (xkcd / css / small) in the shape `{ vocab: string[], idf: number[], vectors: Array<Array<[tokenIdx, weight]>> }`. Compact, deterministic. Add `color-description` to `devDependencies`.
7. **Wire the import path.** Change the colours import in `App.tsx` from `guidance/references/colors.csv?raw` to `src/generated/colors-small.csv?raw`. Keep `guidance/references/colors.csv` around until acceptance, then delete it.
8. **TF-IDF runtime.** Real impl for `tfidf-index.ts` — load the JSON, expose `queryTfidf(index, queryTokens, limit) → Array<{ colorIndex, score }>`. Cosine over the precomputed vectors.
9. **searchByWord (literal path).** Combine `tokenize → queryTfidf → top-N`. Embedder argument optional; when absent or `NullEmbedder`, return TF-IDF results directly.
10. **Populate `eval/queries.ts`** with ~50 starter cases across the categories listed above (including the new `css-literal` category). Commit reviewable.
11. **Run the eval + establish ground truths across all three CC0 variants.** First pass uses `--update-snapshot` because no committed truth exists yet. Use the bundled `eval-baseline` recipe:
    - `just eval-baseline` — runs all three variants, creates snapshots.
    Each run writes the human report under `docs/eval/phase-1a-<variant>.md` and the ground-truth JSON `docs/eval/ground-truth-<variant>-literal.json`. Commit all six files. The `small` ground truth is the floor that gates Phase 2; the other two are diagnostic. From this commit on, plain `just eval literal small` (no `--update-snapshot`) will diff against the committed JSON and surface drift.
12. **Unit tests.** `word-search/tokenize.test.ts`, `word-search/tfidf-index.test.ts`. Tiny — handful of canonical queries with known expected top-1 names (one from xkcd, one CSS run-together). Runs in `just check`.

Acceptance: `just eval` works, produces a report, and trivial / literal-name / css-literal categories are ≥95% accuracy@1. Other categories are whatever they are — the report just needs to exist.

### Phase 1B — Word tab UI + Settings stub

Only starts once Phase 1A has shipped a green eval.

1. **`src/components/word-picker.tsx`** — single `<input>` + debounced (~120 ms) results swatch list. Result shape reuses the existing match-card visual. No settings UI in this panel.
2. **`App.tsx`** — add `"word"` to the mode union, render `<WordPicker />` when active, autofocus its input on tab activation. Pass `tfidf` from a one-time `useMemo` load.
3. **Picker tab row** — add a `Word` tab (lucide `Type` icon, `T`). Active state follows the existing tab pattern.
4. **Settings panel — Word mode section** (placed after the matching weights, before About):
   - Library group with two radios: `Small (bundled, ~1 050)` selected; `Large (~30 000, requires download)` **disabled** with helper text "Not enabled in this build". Read from / write to `settings.wordMode.library`.
   - Engine group with two radios: `Literal only` selected; `Static embeddings` **disabled** with helper text "Not enabled in this build". Read from / write to `settings.wordMode.engine`.
   - No cache read-out, no clear buttons yet — added in Phase 2 when something is actually cached.
5. **Picker result interaction.** Tapping a swatch calls `onColorSelect(hex)`, which `App.tsx` already wires to `setCurrentColor`. The standard perceptual matches list under the picker updates automatically.

Acceptance: open the app, hit the Word tab, type `ocean`, see swatches, tap one, the main colour updates and the perceptual matches refresh.

### Phase 2A — engine evaluation (script-only, no UI)

The point: don't pick an engine without numbers.

1. **Shortlist candidates** to evaluate against the committed eval. Suggested initial pool (final list TBD per the user's prior-experiment context):
   - `model2vec-potion-base-2M` (~7 MB)
   - `model2vec-potion-base-8M` (~15 MB)
   - A hand-rolled GloVe-50d subset of the top-10k English tokens (~5 MB)
   - As a quality ceiling reference, `all-MiniLM-L6-v2` ONNX (~25 MB; transformer, not static — used only to know the ceiling)
2. **`scripts/build-embeddings.ts`** — for each candidate, precompute Float32 colour-vectors for the small library, write `src/generated/embeddings-<engineId>-small.bin` + `.json` (dim + count metadata).
3. **Candidate embedder impls** — temporary. Lives under `scripts/candidates/<engine-id>/` (Node-only, never bundled by Vite). Each implements `Embedder` for the duration of the bake-off; only the winning candidate gets promoted into `src/lib/word-search/embedders/` in Phase 2B.
4. **`scripts/eval.ts --engine=<id>`** runs the eval per candidate. Write each report to `docs/eval/phase-2a-<id>.md`, commit them all.
5. **Decision.** Pick the engine whose `acc@3` on `cultural ∪ object-rooted` is highest *without* `trivial` or `literal-name` dropping below the Phase 1A baseline. If no candidate meets that bar, escalate to Phase 3 (bigger model) before committing UI.

Acceptance: one candidate becomes "the chosen engine". A short decision note lands in `docs/eval/phase-2a-decision.md` referencing the numbers.

### Phase 2B — wire chosen engine

1. Move the chosen impl from `_candidates/` to `src/lib/word-search/embedders/`. Drop the others.
2. **`src/lib/word-search/cache.ts`** — small wrapper over IndexedDB (`open`, `get`, `put`, `delete`, `size` per key). Add `idb-keyval` as a runtime dep, or hand-roll if dep weight matters.
3. **`src/lib/word-search/download.ts`** — `download(url, onProgress, signal) → Promise<Blob>` using `fetch` + `ReadableStream` reader for progress events. Writes to cache via `cache.ts`.
4. **Hybrid scoring** in `searchByWord` — strict-fallback as described in "Hybrid scoring details": run TF-IDF first; if top score ≥ threshold (start at 0.4) or embedder isn't ready, return TF-IDF; otherwise return embedder-ranked top-N. Threshold tunable via the eval.
5. **Settings — Engine option live.** Selecting `Static embeddings (≈ X MB)` triggers a download UX: progress bar, cancel, retry. Cached-data read-out below the radios with per-row `Clear` buttons. Storage labels show actual byte counts from `cache.ts`.
6. **Re-run the eval + snapshot** post-merge: `just eval <id> small --update-snapshot`. Commits `docs/eval/phase-2b-small-<id>.md` and a new ground-truth `docs/eval/ground-truth-small-<id>.json`. Must beat Phase 1A on `cultural`, not regress on `trivial` / `literal-name` / `css-literal`. The `literal` ground truth from Phase 1A stays committed too — both engines are eval-tracked side by side, so any future change to TF-IDF tuning still has a snapshot to diff against.

Acceptance: with the engine loaded, `minecraft creeper pants` returns something green. The eval report demonstrates the lift versus Phase 1A.

### Phase 3 — copyleft path (deferred)

Only attempted if the user wants more breadth than xkcd + the chosen engine. The architecture from Phases 0–2 already supports this; Phase 3 flips switches.

1. **License isolation.** Create `public/data/large/` with `LICENSE-CC-BY-SA-4.0.txt` and a `README` referencing the dataset URL. Build outputs (`library-large.json`, `tfidf-large.json`, `embeddings-<engineId>-large.bin`) live exclusively in this directory.
2. **`scripts/build-libraries.ts` extension** — pulls the meodai dataset, normalises into the same `ColorReference` shape, emits the JSON.
3. **Settings — Library option live.** Selecting `Large` triggers the same download UX. About-panel attribution lines appear.
4. **Re-run the eval** at `--library=large` for both `literal` and the chosen engine. Commit `docs/eval/phase-3.md`. If the large library doesn't materially improve `cultural` or `object-rooted` accuracy, document the negative result and walk back — don't ship copyleft data for no benefit.

Acceptance: library can be toggled in Settings; data + index download with progress; About lists attribution; eval shows a measurable lift or the change is rolled back.

### Phase 4 — bigger model (only if needed)

Only attempted if Phase 2B + Phase 3 are still below the bar on the eval's `cultural` category. Wire `embedding-gemma-300m-q8` or `all-MiniLM-L6-v2` via `@huggingface/transformers` (already in deps). Same `Embedder` interface, bigger asset. Same Phase 2A-style eval gate before adoption.

## Open questions / decisions deferred

- **User's prior embedding experiment.** Which model, what corpus, what failure mode? See "Prior art (B)". Ask before Phase 2.
- **Threshold value** for strict fallback. Pick empirically on a list of test queries; 0.4 is a guess.
- **Static embedding choice.** Model2Vec / Static-MRL / a hand-rolled GloVe subset are all candidates. Pick after benchmarking against our test queries — they're all in the same size class.
- **Model hosting.** Self-host on our origin (clean cache, integrity hashes, no third-party runtime dependency) vs fetch from HuggingFace CDN (zero infra, but adds runtime dependency on `huggingface.co`). Leaning self-host.
- **TF-IDF document enrichment.** Are `color-description` adjectives + primary-family enough? Or do we also synthesise tags from HSL (e.g. dark / light / warm / cool / pastel / vivid)? Try Phase 1 with `color-description` only first; add HSL-derived tags if recall is weak.
- **Vector dimension / quantisation** for the precomputed colour vectors. Default Float32 @ native dim in Phase 2; revisit if storage or RAM bites.
- **Voice fallback when keyboard mic is unavailable.** Some Android keyboards on older devices don't expose the mic. Acceptable for now (the user is fine with native mic only); revisit if needed.

## Risks

- **Same trap as last time:** thin TF-IDF documents → useless matches → user disables the mode mentally. Mitigation: enrichment via `color-description` + primary family tokens, and the visible "literal only" engine name so the user knows when it's the cheap engine speaking.
- **Pre-existing dataset license gap (mitigated by Phase 1).** The current 865-entry CSV is Wikipedia-derived (CC-BY-SA-3.0/4.0) and ships without attribution. Phase 1 closes the gap by replacing it with the xkcd + CSS merge (both CC0-equivalent), so the SA copyleft concern doesn't propagate into the default code path.
- **meodai dataset license is load-bearing if we ship Phase 1.5.** CC-BY-SA-4.0's ShareAlike clause applies to *Adapted Material* — a TF-IDF index built from the names, or precomputed embeddings of the names, are derivative works of the data. Concrete plan:
  - Isolate all large-library-derived artefacts (the CSV, its TF-IDF JSON, any future embeddings) to one directory (e.g. `public/data/large/`) and ship a `LICENSE-CC-BY-SA-4.0.txt` next to them.
  - About panel lists the dataset, the license, and the URL, as required by the BY clause.
  - The rest of the codebase keeps its existing license; SA only attaches to those isolated artefacts. Standard pattern for permissive-app + SA-data combinations.
  - If the repo ever goes public (currently private), revisit before merging Phase 1.5 — the boundary needs to be unambiguous to anyone reading the repo cold. An alternative is to skip the meodai library entirely: xkcd + the Phase 2 embedder may be enough.
- **Mobile bandwidth.** A 30 MB engine download on cellular is unfriendly. Mitigation: never auto-download — only on explicit Settings action, with the size shown.
- **PWA storage quota.** Browsers can evict IndexedDB under pressure. Show "data evicted, redownload?" gracefully; never silently fail.
- **First-run latency for the embedder.** Static embeddings are fast to load (just a fetch), but transformer engines spin up an ONNX runtime — first encode can be 1–2 s. Lazy-init the engine on first word-mode query, not on tab activation.

## Acceptance criteria (for the whole feature)

Each phase's exit gate is a committed eval report + ground-truth snapshot, not vibes.

**Phase 1A (data + eval rig).**
- `just eval-baseline` runs cleanly; six artefacts committed under `docs/eval/`.
- `trivial`, `literal-name`, and `css-literal` categories ≥ 95% accuracy@1 on the `small` variant.
- `small` variant does not regress any category versus its `xkcd` and `css` constituents.

**Phase 1B (UI).**
- On a phone, opening the Word tab, typing `red`, tapping a result: the perceptual matches list updates within ~1 s end-to-end.
- The Word panel contains only an input and result swatches; all configuration is in Settings.
- Settings shows Word-mode controls with Large and Static-embeddings options visibly disabled.

**Phase 2A (engine eval).**
- A `docs/eval/phase-2a-decision.md` exists, references the per-candidate eval reports, and names the chosen engine.
- The chosen engine's `acc@3` on `cultural ∪ object-rooted` beats Phase 1A's `literal` baseline.

**Phase 2B (engine wired).**
- `just eval <chosen> small` passes against the committed Phase 2B snapshot.
- `minecraft creeper pants` returns at least one green-family result in top 3.
- Engine download UX works: progress bar, cancel, retry, cached-data read-out, per-row clear.

**Phase 3 (optional copyleft).**
- Toggle in Settings triggers download; data survives reload; clearing returns to small.
- Eval on the large library demonstrates measurable lift over `small`, or Phase 3 is rolled back.
- About panel attribution renders correctly.
