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

# Downloads the Stanford GloVe 6B archive into the build-time cache.
# Idempotent: skips the download if the zip is already present.
[group('build')]
fetch-glove:
    pnpm tsx scripts/fetch-glove.ts

# Phase 1.5b — precomputes the static-expander nearest-neighbour table from
# GloVe 6B 50d. Requires `just fetch-glove` to have populated the cache.
[group('build')]
build-expander-vectors *flags:
    pnpm tsx scripts/build-expander-vectors.ts {{flags}}

# Phase 2A — precomputes colour-vectors for a candidate engine. Engine id matches
# the directory under scripts/candidates/. Run once per candidate before evaluating.
[group('build')]
build-embeddings engine library="small" *flags:
    pnpm tsx scripts/build-embeddings.ts --engine={{engine}} --library={{library}} {{flags}}

[group('eval')]
eval engine="literal" library="small" *flags:
    pnpm tsx scripts/eval.ts --engine={{engine}} --library={{library}} {{flags}}

# Re-creates ground-truth snapshots for the canonical eval matrix:
# three CC0 library variants plus the three expander layers on small.
[group('eval')]
eval-baseline:
    just eval literal xkcd --update-snapshot
    just eval literal css --update-snapshot
    just eval literal small --update-snapshot
    just eval literal small --expander=handcurated --update-snapshot
    just eval literal small --expander=static --update-snapshot
    just eval literal small --expander=static-handcurated --update-snapshot

# Phase distillation — sanity-check the build-time-distilled lookup against the
# eval set. Flags any entry whose top library hit disagrees with the
# corresponding eval case's expected family / name. Run between vocab edits.
[group('eval')]
verify-distillation:
    pnpm tsx scripts/verify-distillation.ts

# Phase B — fine-tune a small sentence-transformer on the distillation lookup.
# See guidance/projects/color-thesaurus/epics/01-word-mode/phase-b-fine-tune.md.
# All recipes invoke training/.venv/bin/python directly — no venv activation
# needed in the calling shell.

# One-time: create the venv and install Python deps under training/.
# Pinned to python3.13: torch wheels reliably follow Python n-1, and
# python3.14 (current homebrew default) sometimes lacks prebuilt wheels.
[group('train')]
train-setup:
    cd training && python3.13 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -e .

# Fine-tune the encoder. Writes to training/runs/<timestamp>/.
[group('train')]
train *flags:
    cd training && .venv/bin/python train.py {{flags}}

# Dump eval cases + colour library (with families) to training/data/ as JSON.
# Single source of truth stays on the TS side; Python reads JSON only.
[group('train')]
train-dump:
    pnpm tsx scripts/dump-for-training.ts

# Score the latest training run against the eval cases (matches `just eval` semantics).
[group('train')]
train-eval *flags: train-dump
    cd training && .venv/bin/python eval_model.py {{flags}}

# Export the latest run to int8-quantised ONNX in src/generated/word-encoder/.
[group('train')]
train-export *flags:
    cd training && .venv/bin/python export_onnx.py {{flags}}

# Encode the colour library with the exported ONNX into src/generated/colour-embeddings.bin.
[group('train')]
train-build-embeddings *flags:
    cd training && .venv/bin/python build_embeddings.py {{flags}}
