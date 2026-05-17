# training/

Phase B of the Colour Thesaurus word-mode epic — fine-tune a small sentence-transformer on the 693-entry build-time distillation lookup, then export ONNX for in-browser inference.

**Plan / acceptance criteria / architecture:** [`epics/01-word-mode/phase-b-fine-tune.md`](../../../rhizomatic-preset/guidance/projects/color-thesaurus/epics/01-word-mode/phase-b-fine-tune.md) (absolute path: `~/rhizomatic-preset/guidance/projects/color-thesaurus/epics/01-word-mode/phase-b-fine-tune.md`).

**Running log:** same folder, `phase-b-outcome.md`. Each training run gets a row in there.

## Setup (once)

```sh
just train-setup
```

Creates `training/.venv/` and installs deps from `pyproject.toml`. Requires Python 3.11+.

## Day-to-day

```sh
just train                     # fine-tune; writes to training/runs/<timestamp>/
just train-eval                # score the latest run against the eval cases
just train-export              # quantised ONNX → src/generated/word-encoder/
just train-build-embeddings    # encode colour library → src/generated/colour-embeddings.bin
```

All recipes invoke `training/.venv/bin/python` directly, so no venv activation is required in the calling shell.

## Inputs

- `../src/generated/colour-distillation.json` — the 693-entry training data (filtered by `confidence != "low"`).
- `../src/generated/colors-small.csv` — the colour library to embed at build time.
- `../src/lib/word-search/eval/queries.ts` — eval cases, read via a small JSON export step (see `eval_model.py`).

## Outputs

Land back in the TS project tree so the Vite build picks them up:

- `../src/generated/word-encoder/` — ONNX model + tokeniser config.
- `../src/generated/colour-embeddings.bin` — Float32 vectors for every colour in the small library.

## Why a separate folder, not a separate repo

For now, Phase B reads from and writes to the colour-trickser tree, and shares its eval cases. One filesystem, no copies. If the pipeline proves itself and we reuse the pattern for another project, this extracts cleanly to `~/rhizomatic-preset/distillation-finetune/`. Reasoning in the plan doc §5.
