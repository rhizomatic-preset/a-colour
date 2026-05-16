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
