# Phase 2A — engine bake-off decision

Date: 2026-05-17
Library: small (xkcd ∪ CSS, ~1 050 entries)
Decision metric: highest `acc@3` on **cultural ∪ object-rooted ∪ open-vocab**
WITHOUT `trivial` or `literal-name` dropping below the Phase 1A baseline
(100% acc@1, 80%/100% acc@1/acc@3 respectively).

## Candidates evaluated

| Engine id        | Asset size | Built from                                                            |
|------------------|-----------:|-----------------------------------------------------------------------|
| `glove-50d`      |       ~5 MB | `glove.6B.50d.txt` — Stanford GloVe 6B Wikipedia/Gigaword 50-dim     |
| `glove-300d`     |      ~30 MB | `glove.6B.300d.txt` — same corpus, 300-dim                            |
| `minilm-l6-v2`*  |     ~25 MB | `Xenova/all-MiniLM-L6-v2` ONNX (transformer)                          |

\* `minilm-l6-v2` was **not** evaluated in this round — see "What was skipped" below.

Both shortlisted candidates use the same hybrid pipeline
(`scripts/candidates/hybrid-search.ts`):
1. Run TF-IDF first against `tfidf-small.json`.
2. If TF-IDF top-1 cosine ≥ threshold (empirically tuned to 0.15), return
   TF-IDF.
3. Otherwise rank by embedding cosine against the precomputed colour vectors.

Per-colour vectors are built by `scripts/build-embeddings.ts` and consist of
the **mean GloVe vector across each colour's enriched doc tokens** (display
name + `color-description` adjectives + primary family). Query encoding is
the mean GloVe vector across the query's tokens.

## Numbers (acc@1 / acc@3, library = small, expander = noop)

| Category         |  n | literal (1A) | glove-50d  | glove-300d | static-handcurated\* |
|------------------|---:|-------------:|-----------:|-----------:|---------------------:|
| trivial          | 10 |  100% / 100% | 100% / 100% | 100% / 100% |        100% / 100% |
| modified-family  |  8 |  100% / 100% | 100% / 100% | 100% / 100% |         88% / 100% |
| literal-name     |  5 |   80% / 100% |  80% / 100% |  80% / 100% |         80% / 100% |
| css-literal      |  5 |  100% / 100% | 100% / 100% | 100% / 100% |        100% / 100% |
| **object-rooted**| 12 |   58% /  67% |  58% /  75% |  58% /  75% |          58% /  92% |
| **cultural**     |  4 |   50% /  50% |  50% /  50% |  50% /  75% |        100% / 100% |
| compound         |  6 |   33% /  67% |  33% /  67% |  33% /  67% |          50% /  83% |
| te-reo           |  8 |    0% /   0% |   0% /  13% |   0% /   0% |          88% / 100% |
| weather          |  6 |    0% /   0% |   0% /   0% |   0% /  17% |          50% / 100% |
| **open-vocab**   | 10 |    0% /   0% |  10% /  20% |  20% /  40% |          20% /  30% |
| **overall**      | 77 |   51% /  57% |  55% /  64% |  56% /  68% |          71% /  88% |

\* `static-handcurated` is the Phase 1.5b expander-layer config (engine still
literal). Included for context — it's the alternative path the bake-off needs
to beat.

### Decision-metric column (acc@3 on cultural ∪ object-rooted ∪ open-vocab)

|                       | passes / total | acc@3 |
|-----------------------|---------------:|------:|
| literal               |          10/26 | 38.5% |
| glove-50d             |          13/26 | 50.0% |
| **glove-300d**        |          **16/26** | **61.5%** |
| static-handcurated\*  |          18/26 | 69.2% |

## Decision

**Picked engine: `glove-300d`** — it tops the bake-off acceptance metric
(`acc@3` on cultural ∪ object-rooted ∪ open-vocab) without regressing trivial
or literal-name versus the Phase 1A baseline. It is the engine that gets
promoted to `src/lib/word-search/embedders/` in Phase 2B (deferred).

The honest caveat: the Phase 1.5b **expander-layer** path
(`static-handcurated`) scores **higher still** on the same metric — 18/26 vs
16/26. The expander layer also lifts categories the engine bake-off doesn't
touch at all (te-reo 88/100, weather 50/100) because expansion stays on the
TF-IDF substrate where Te Reo Māori tokens have a hand-curated bridge to
English colour words.

Per the epic's acceptance criteria for Phase 2A — *"A `docs/eval/phase-2a-decision.md`
exists, references the per-candidate eval reports, and names the chosen engine.
The chosen engine's acc@3 on cultural ∪ object-rooted beats Phase 1A's literal
baseline"* — `glove-300d` clears that bar (cultural+object-rooted alone:
12/16 = 75% vs 10/16 = 63%, +12pp). So the gate is satisfied even though the
expander layer is the better real-world ship.

### Phase 2B implication

When Phase 2B wires the engine for real, the runtime should use
`glove-300d` **on top of** the static-handcurated expander, not instead of it.
The bake-off measured the engine in isolation because that's what
`scripts/candidates/hybrid-search.ts` does (no expansion in candidate path);
the full Phase 2B stack should re-run the eval with both layers active and
re-decide on the threshold (currently 0.15 in the bake-off; may need to drop
further once expansion is also feeding TF-IDF).

## What was skipped

- **`minilm-l6-v2`** — listed as a ceiling reference in the epic but not
  evaluated this round. Adding `@huggingface/transformers` as a dev-dep for the
  bake-off script ran into time pressure; the CLAUDE.md note that
  "@huggingface/transformers is in dependencies" is stale (it isn't, currently).
  Decision: come back to MiniLM in Phase 2B when an asset-loading + IndexedDB
  cache layer is being built anyway, and re-decide if its accuracy justifies
  the 25 MB download relative to glove-300d's 30 MB. Documented here as a
  Phase 2B follow-up so it isn't forgotten.

- **`model2vec-potion-base-2M`** — also listed in the epic. Skipped per the
  advisor recommendation: the JS ecosystem for loading model2vec safetensors
  is thin, and the candidate-pool already exercises a 64-dim-ish point on the
  curve (glove-50d). If model2vec proves materially better than GloVe in
  Phase 2B's expanded eval, it can swap in as a drop-in replacement —
  `src/lib/word-search/embedders/` is the swap surface, the rest is unchanged.

## Reports referenced

- [phase-2a-glove-50d.md](phase-2a-glove-50d.md) — full per-category report.
- [phase-2a-glove-300d.md](phase-2a-glove-300d.md) — full per-category report.
- [phase-1.5b-static-expander.md](phase-1.5b-static-expander.md) — context on
  the expander-layer alternative.

Snapshot files: `ground-truth-small-glove-50d.json` and
`ground-truth-small-glove-300d.json` under `docs/eval/`.
