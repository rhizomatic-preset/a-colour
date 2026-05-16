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
