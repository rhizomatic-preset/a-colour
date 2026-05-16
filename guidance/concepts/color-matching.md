# How the colour matcher works

This document explains what Colour Thesaurus does between "user picks a hex" and "user sees a list of named matches", and how the Settings page lets you bias that lookup. Code reference: `src/lib/color-matcher.ts`.

## The algorithm

1. **Hex → Oklab.** The input hex is converted from sRGB (via a linearisation step) into the **Oklab** perceptual colour space. Oklab is designed so that equal numeric distances correspond — roughly — to equal *visual* differences for a human eye. RGB Euclidean distance doesn't have this property, which is why we don't use it.

2. **Weighted distance to each named colour.** For every entry in `guidance/references/colors.csv` (~865 names), the matcher computes:

       distance = √( (ΔL × wL)² + (Δchroma × wC)² + (Δhue × shared-chroma × wH)² )

   where:
   - **ΔL** is the lightness difference,
   - **Δchroma** is the saturation difference,
   - **Δhue** is the angular hue difference (normalised to ±π),
   - **shared-chroma** is the larger of the two chromas (so neutral colours don't get penalised for hue disagreement),
   - **wL / wC / wH** are user-configurable weights (defaults `1.6 / 1.2 / 0.7`).

3. **Neutral penalty.** If the input is near-grey (chroma < 0.04), any candidate with notable chroma (> 0.06) gets an extra penalty proportional to its chroma. This stops "off-white" from getting matched to "lemon yellow".

4. **Sort and take top N.** Candidates are sorted by distance ascending, then sliced to the `matchCount` configured in Settings (1 / 3 / 5).

The `closeness` percentage shown next to each match is `1 − distance / 0.45`, clamped to `[0, 100]`. The `0.45` divisor is the empirical "this barely matches anymore" point — beyond it, closeness reads as zero.

## When matches feel wrong

There are two distinct failure modes; they need different fixes.

### Layer 1 — the sampled hex is wrong

A yellow Lego brick photographed in indoor light may sample to a hex like `#b89030`, which is genuinely a dark brown-yellow numerically. The matcher can't fix this — it's only as good as the pixel it was handed. The fix at this layer is on the camera/image side (white-balance correction, larger sample kernels to smooth noise, sampling a brighter part of the object).

### Layer 2 — the weights bias toward lightness

With the defaults (`wL = 1.6`), lightness difference dominates the distance. A dark yellow's *lightness* is closer to a dark brown's lightness than to a bright lemon's lightness, so a dark-yellow input picks dark-brown matches even though hue-wise it's clearly yellow.

This is what the **Hue / Chroma / Lightness emphasis sliders** in Settings exist to fix. They scale `wL / wC / wH` directly.

## Biasing the lookup

The Settings panel exposes three sliders, each `0 → 3` with `0.05` steps, defaulting to the tuned values:

- **Lightness emphasis** (`wL`, default 1.6) — how much a lightness difference counts. Drag it down when a dark colour reads as the wrong colour family.
- **Chroma emphasis** (`wC`, default 1.2) — how much a saturation difference counts. Drag it up to keep muted and vivid versions of a hue distinct.
- **Hue emphasis** (`wH`, default 0.7) — how much hue (red / yellow / green / …) difference counts. Drag it up to bias matching by colour family.

The matches list to the right of the Settings panel updates live as you drag, so the effect is immediately visible. A small **Reset to defaults** button at the bottom of the panel restores the tuned values when you want to start over (disabled when nothing has changed).

### Worked example — the yellow Lego

Input: `#806800` (a dark mustard yellow).

- **Defaults (1.6 / 1.2 / 0.7):** closest named match is a brown.
- **Lightness 0, Hue 2:** closest named match is a yellow.

This is what the test `getClosestColors` in `src/lib/color-matcher.test.ts` asserts, so the relationship is locked in by the suite.

## What about `maxDistance`?

Earlier versions of the Settings panel had a "Distance threshold" slider that filtered out matches above a maximum perceptual distance. It was removed because in practice the top matches were almost always already well inside any sensible threshold, so dragging the slider did nothing visible. The current Lightness / Chroma / Hue sliders replace it — they *reshape* the lookup rather than *filter* it, which is what the original "tune the matching" intuition actually wanted.
