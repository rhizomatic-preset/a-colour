default:
    @just --list

# install dependencies
install:
    pnpm install

# canonical quality gate: biome (lint + format check) + typecheck
check:
    pnpm check

# start the dev server
run:
    pnpm dev
