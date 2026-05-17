# color-trickser

An offline-first PWA that names colours. Built for my colourblind son — point a phone (or paste an image, or open the colour picker) at something and find out what colour it is. A small group of friends with colour vision differences (~5 known users) also uses it and likes it, and Colour Thesaurus doubles as a public showcase for the **preset.nz studio**.

The user-facing name is **Colour Thesaurus** (UI title, `<title>`, README heading). The package / directory name is `color-trickser` (intentional play on "trickster") — use that when referring to the project as a codebase.

## Audience and product stance

Three audiences, in priority order:

1. **The primary customer — my colourblind son.** Workflow: point a phone (or paste a screenshot, or open the colour picker) at something, read the colour name. Big tap targets, high-contrast hex readouts, fast first paint, works offline.
2. **A small group of friends with colour vision differences (~5 known users).** Their needs overlap his almost entirely — same workflow, same defaults — so catering to him caters to them. Welcome, not catered to separately.
3. **The preset.nz studio.** Colour Thesaurus is a public showcase for what a small, opinionated, well-engineered offline-first PWA can do. The code, the matching pipeline, the eval rig, the build-time LLM distillation — these are work product on display. They're allowed to be good; treat them as such.

That ordering shapes the product calls:

- Don't internationalise. NZ English in user-facing strings, full stop.
- Don't add settings, preferences, themes, or toggles that weren't asked for.
- Don't generalise accessibility beyond what the named users benefit from. Full WCAG / screen-reader compatibility isn't a goal unless it becomes one.
- Don't preserve old behaviour out of caution. The known user base is small enough that shipping an improvement straight away is fine.
- Don't add abstraction for a hypothetical second use-case. If it shows up, refactor then.

When in doubt: "does this make the app better for the people who actually use it?" If the honest answer is "well, it'd be nice for some hypothetical other user", drop it.

## Use NZ English in user-facing strings

Spelling is **colour**, not **color**, anywhere a human reads it (UI text, aria-labels, hints, descriptions). Identifiers, types, function names, CSS variable names, and the CSV columns stay as **color** — that's the platform/standard spelling and we don't fight it. See commit `d6a0a15c` for the rename pass.

## What the app does

Four input modes — three for picking a colour, one for typing a word — and one output (closest names + primary colour family).

- **Swatch** — `react-colorful` HEX wheel in a `@base-ui/react` popover, plus a hex text field and the EyeDropper API when the browser supports it (Chromium desktop).
- **Image** — paste from clipboard or upload a file; click/drag on the image to sample a pixel via an offscreen `<canvas>`.
- **Camera** — `getUserMedia` with `facingMode: "environment"`, rendered into a canvas every frame so we can sample. Pinch / wheel zoom (hardware zoom via `applyConstraints` if the track supports it, digital crop fallback otherwise). Tap-and-drag to sample.
- **Word** — type a word, get colours. Four-layer pipeline (distillation lookup → handcurated expander → static expander → TF-IDF). No ML or API at runtime. Eval headline is 88/100 acc@1, 100% acc@3 on the small library. See `src/lib/word-mode.ts` and `guidance/projects/color-thesaurus/design/distillation.md`.

Output: top 3 closest named colours from `guidance/references/colors.csv` (~865 entries, columns `id,"Name",#hex,r,g,b`), plus a "primary colour family" label (red/orange/.../brown/olive/black/gray/etc.) derived from HSL bands.

## Colour matching

> Plain-language explainer of the algorithm and how to bias it lives at `guidance/concepts/color-matching.md`. When the matching behaviour or its tuning changes, update that doc too — it's the user-facing reference and should stay accurate.

In `src/lib/color-matcher.ts`. The matching is **perceptual**, not RGB-Euclidean — important to keep that way, because RGB distance ranks colours in ways colourblind users would find arbitrary.

- Convert sRGB → linear → **Oklab**.
- Distance is a weighted hypotenuse of ΔL (×1.6), Δchroma (×1.2), and Δhue × chroma (×0.7). Hue is down-weighted on low-chroma colours so neutral greys don't get matched to vivid hues that happen to share a hue angle.
- Extra **neutral penalty**: when the input is near-neutral (chroma < 0.04) we penalise high-chroma candidates so "off-white" doesn't return "lemon yellow".
- `closeness` percentage is `1 - distance / 0.45`, clamped — purely cosmetic, tweak if the bars start to look pessimistic.

The reverse-lookup ("type a word, get a colour") is the Word mode described above. The matcher's `buildNameVectorIndex` / `findClosestColorNames` (TF-IDF over colour names) is one layer in that pipeline.

## Persistence

Two distinct localStorage keys live in `src/lib/settings.ts`:

- `color-trickser:settings` — user preferences (`matchCount`, `sampleKernel`, `weights`). Merged over `DEFAULT_SETTINGS` on load so adding a new field doesn't break older stored payloads; the `weights` sub-object is itself merged so partial old payloads stay valid.
- `color-trickser:lastColor` — the most-recently picked hex. On first ever load, the initial colour is a random pick from the library (`pickRandomColor` in `App.tsx`). Subsequent loads restore the saved hex.

Both helpers swallow `localStorage` errors (private mode, full quota) and silently fall back to defaults — no error UI.

## Views, modes, and sampling

The app has two orthogonal axes of state in `App.tsx`:

- `mode: "swatch" | "image" | "camera"` — which input source is showing in the picker.
- `view: "picker" | "settings" | "about"` — which surface is shown. `settings` and `about` swap the swatch-panel for the corresponding component while keeping the matches list visible (so settings tweaks are observable live). Tabs read `view === "picker" && mode === X` for their active state.

Sampling lives in `src/lib/sampling.ts` (`sampleAverageColor`) and is shared by image mode (`sampleFromImage` in `App.tsx`) and the live camera (`sampleColor` in `camera-picker.tsx`). The kernel size comes from `settings.sampleKernel`. Boundary clipping uses a truncated read at the canvas edge rather than padding — corner samples still produce a usable average.

## Tech stack notes

- **React 19** + **Vite 8** + **TypeScript 6** + **Tailwind v4** (via `@tailwindcss/vite`, not a config file — utilities come from `@import "tailwindcss"` in `src/index.css`).
- **UI primitives**: `@base-ui/react` (Popover, Button) — *not* Radix, even though `components.json` exists from a shadcn scaffold. The shadcn config is mostly historical; if adding components, prefer base-ui or hand-rolled over `npx shadcn add`.
- **Icons**: `lucide-react`.
- **Package manager**: pnpm (pinned via `packageManager` in `package.json`). `pnpm-lock.yaml` is committed.
- **Lint + format**: [Biome](https://biomejs.dev) (`biome.json`). Replaces the old ESLint + (no) Prettier setup. Run via `pnpm check` / `pnpm format` (or via the Justfile, below).
- **Task runner**: [just](https://github.com/casey/just) (`justfile`). The three canonical recipes are `just install`, `just check`, `just run` — see below.
- **Tests**: [Vitest](https://vitest.dev) (shares Vite's resolver — no parallel config). Tests live next to the code: `src/lib/color-matcher.test.ts`. The perceptual matching is the load-bearing thing worth testing, and that's what's covered. Don't reach for `@testing-library/react` / DOM / jsdom unless you have a real reason — UI tests are not worth their cost on a project this opinionated. Tests run inside `pnpm check`, so `just check` stays the single quality gate.
- `@huggingface/transformers` is in `dependencies` but unused; it was for an experiment, leave it for now.

### Path aliases & conventions

- `@/` → `src/` (see `vite.config.ts` and `tsconfig.app.json`).
- UI under `src/components/ui/`, app components under `src/components/`, pure logic under `src/lib/`.
- The design follows the **preset.nz studio-site** (`/Users/georg/rhizomatic-preset/studio-site`). Same colour tokens (`--paper`, `--ink`, `--silver`, `--ghost`, `--teal*`, `--off`), same fonts: **Bebas Neue** for headings, **Libre Baskerville** for body, **IBM Plex Mono** for technical labels (10px / 0.14em uppercase weight 300). Halftone + grain overlay on `body::before` / `body::after` — don't strip when editing global CSS. When in doubt about a typography or spacing decision, check `studio-site/src/styles/global.css` first.
- A CSS custom property `--highlight` tracks the currently picked colour and propagates to focus rings, match-card borders, etc. Updated in an effect in `App.tsx`.

## Code style: SOLID and CUPID

The codebase is small and functional (no classes worth speaking of), so apply these as taste, not dogma. They exist to keep the code small, replaceable, and honest about what each piece does.

**SOLID** (in the spirit, not the OOP letter):

- **S — Single responsibility.** One module = one job. `color-matcher.ts` does matching, full stop; it must not fetch, render, or own UI state. `camera-picker.tsx` runs the camera; it does not know about colour names.
- **O — Open / closed.** The Oklab matching is *tuned* (default ΔL ×1.6, Δchroma ×1.2, hue×chroma ×0.7, plus the neutral penalty). Those constants are now user-configurable as `DistanceWeights` (Lightness / Chroma / Hue), so when shifting matching behaviour, prefer adding new dimensions to that structure or new functions next to it — don't reshape the working pipeline.
- **L — Liskov.** Types describe what callers can rely on. If a function says it returns `ColorMatch`, every code path returns a full `ColorMatch` — no `Partial<...>` that callers have to defensively unpack.
- **I — Interface segregation.** Components take only the props they actually use. `CameraPicker` takes `onColorSelect`, not the whole app's state.
- **D — Dependency inversion.** Hand dependencies in via parameters / props. The matcher receives the colour list; it doesn't import the CSV. That's `App.tsx`'s job.

**CUPID** (usually a better fit for this style):

- **Composable** — small functions that combine. `hexToRgb` → `rgbToOklab` → `weightedOklabDistance` is the shape we like. Resist combining them into one mega-function "for clarity".
- **Unix philosophy** — each module does one thing well. The matcher doesn't import React; the camera component doesn't import the CSV.
- **Predictable** — same inputs, same outputs. The matcher is a pure function over `(hex, colorList)`; keep it that way. No hidden globals, no `Date.now()` sneaking in.
- **Idiomatic** — modern React 19 / TS 6. Function components and hooks, ESM, no `forwardRef` gymnastics unless React forces them on us.
- **Domain-based** — naming comes from the colour domain: `ColorReference`, `ColorMatch`, `closeness`, `primaryColorName`. Don't dilute them into `Item`, `Result`, `Score`.

## Commands

Day-to-day, use the Justfile:

```
just install    # pnpm install
just check      # biome + tsc -b + vitest run — the quality gate
just run        # pnpm dev — start the vite dev server
```

Underlying pnpm scripts (use directly when you need something the Justfile doesn't expose):

```
pnpm install
pnpm dev
pnpm build         # tsc -b && vite build
pnpm preview       # serve the production build
pnpm test          # vitest run
pnpm check         # biome check . && tsc -b && vitest run
pnpm format        # biome format --write .
```

## What's missing (wanted)

PWA is wired (`VitePWA` in `vite.config.ts` with `autoUpdate`, manifest + Workbox precache), the landscape-phone layout shipped, and the camera-permission fallback + colour-picker popover offset are both fixed. Word mode shipped through Phase distillation and is the current headline feature. What's still open:

1. **Phase B — sentence-transformer fine-tune.** The 693-entry distillation lookup is also labelled training data. Fine-tune `all-MiniLM-L6-v2` on `(noun, family-name)` + `(noun, hex-as-text)` positives, export ONNX, bundle in the PWA. Acceptance: match the lookup's 88/100 *and* generalise to long-tail nouns the lookup doesn't cover. Plan in `~/rhizomatic-preset/guidance/projects/color-thesaurus/design/distillation.md` §8. Gated on explicit go-ahead — confirm scope before starting.
2. **Hardcoded 340px sizes in portrait.** `.paste-target` and `.sample-image` cap at 340px (`src/index.css` ~lines 738, 761). Fine on desktop, big chunk of a phone-portrait viewport. Landscape overrides exist; portrait still bites.
3. **Hue classifier still uses HSL bands.** `getPrimaryColorName` in `src/lib/color-matcher.ts` is a blunt HSL-hue cutoff (one tweak landed: red is `h<10 || h>=350`). The matcher itself is Oklab; the classifier disagreeing at boundaries is the structural fix.

When working on any of these, treat the existing perceptual matching and the NZ spelling as load-bearing and don't regress them.
