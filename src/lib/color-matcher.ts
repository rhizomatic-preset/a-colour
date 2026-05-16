export type ColorReference = {
  id: string;
  name: string;
  hex: string;
  r: number;
  g: number;
  b: number;
};

export type ColorMatch = ColorReference & {
  distance: number;
  closeness: number;
};

export type DistanceWeights = {
  lightness: number;
  chroma: number;
  hue: number;
};

export const DEFAULT_WEIGHTS: DistanceWeights = {
  lightness: 1.6,
  chroma: 1.2,
  hue: 0.7,
};

type Oklab = {
  l: number;
  a: number;
  b: number;
};

export function parseColorCsv(csv: string): ColorReference[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .map(parseCsvLine)
    .filter((row): row is string[] => row.length >= 6)
    .map(([id, name, hex, r, g, b]) => ({
      id,
      name,
      hex: normalizeHex(hex),
      r: Number(r),
      g: Number(g),
      b: Number(b),
    }))
    .filter(
      (color) =>
        color.id.length > 0 &&
        color.name.length > 0 &&
        isValidHex(color.hex) &&
        [color.r, color.g, color.b].every((channel) => Number.isInteger(channel)),
    );
}

export function getClosestColors(
  inputHex: string,
  colors: ColorReference[],
  limit = 3,
  weights: DistanceWeights = DEFAULT_WEIGHTS,
  hueBiasDegrees: number | null = null,
): ColorMatch[] {
  const input = hexToRgb(normalizeHex(inputHex));
  const inputLab = rgbToOklab(input.r, input.g, input.b);
  const inputChroma = oklabChroma(inputLab);
  const isInputNeutral = inputChroma < 0.04;
  const targetHueRad = hueBiasDegrees !== null ? hueDegreesToOklabAngle(hueBiasDegrees) : null;

  return colors
    .map((color) => {
      const lab = rgbToOklab(color.r, color.g, color.b);
      const colorChroma = oklabChroma(lab);
      const baseDistance = weightedOklabDistance(inputLab, lab, weights);
      const neutralPenalty = isInputNeutral && colorChroma > 0.06 ? (colorChroma - 0.06) * 0.9 : 0;
      // Hue-bias lobe: penalise chromatic candidates that are far from the target hue.
      // Neutral candidates (low chroma) are unaffected — they're "uncoloured".
      let lobePenalty = 0;
      if (targetHueRad !== null && colorChroma > 0.03) {
        const candidateHueRad = Math.atan2(lab.b, lab.a);
        const deltaHue = Math.abs(normalizeHueDelta(candidateHueRad - targetHueRad));
        lobePenalty = (deltaHue / Math.PI) * 0.5;
      }
      const distance = baseDistance + neutralPenalty + lobePenalty;

      return {
        ...color,
        distance,
        closeness: Math.max(0, Math.round((1 - distance / 0.45) * 100)),
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * Map an HSL-style hue in degrees (0=red, 60=yellow, 120=green, 240=blue) to the
 * matching angle in Oklab space, so the user-facing rainbow slider lines up with
 * how the matcher actually compares hues.
 */
function hueDegreesToOklabAngle(hueDegrees: number): number {
  const h = (((hueDegrees % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) {
    r = 1;
    g = x;
  } else if (h < 2) {
    r = x;
    g = 1;
  } else if (h < 3) {
    g = 1;
    b = x;
  } else if (h < 4) {
    g = x;
    b = 1;
  } else if (h < 5) {
    r = x;
    b = 1;
  } else {
    r = 1;
    b = x;
  }
  const lab = rgbToOklab(r * 255, g * 255, b * 255);
  return Math.atan2(lab.b, lab.a);
}

export function getPrimaryColorName(inputHex: string) {
  const { r, g, b } = hexToRgb(normalizeHex(inputHex));
  const { h, s, l } = rgbToHsl(r, g, b);

  if (s < 0.12) {
    if (l < 0.15) return "black";
    if (l < 0.35) return "charcoal";
    if (l < 0.7) return "gray";
    if (l < 0.9) return "silver";
    return "white";
  }

  if (h >= 22 && h < 55 && l < 0.48) return "brown";
  if (h >= 55 && h < 95 && l < 0.5) return "olive";

  if (h < 10 || h >= 350) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 150) return "green";
  if (h < 190) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  if (h < 330) return "magenta";
  return "pink";
}

export function normalizeHex(hex: string) {
  const clean = hex.trim().replace(/^#/, "").toLowerCase();

  if (/^[0-9a-f]{3}$/.test(clean)) {
    return `#${clean
      .split("")
      .map((character) => character + character)
      .join("")}`;
  }

  return `#${clean}`;
}

export function isValidHex(hex: string) {
  return /^#[0-9a-f]{6}$/i.test(hex);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      cell += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += character;
  }

  cells.push(cell);

  return cells.map((value) => value.trim());
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex);

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToOklab(r: number, g: number, b: number): Oklab {
  const red = srgbToLinear(r / 255);
  const green = srgbToLinear(g / 255);
  const blue = srgbToLinear(b / 255);

  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function srgbToLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function oklabChroma(color: Oklab) {
  return Math.hypot(color.a, color.b);
}

function weightedOklabDistance(first: Oklab, second: Oklab, weights: DistanceWeights) {
  const deltaL = first.l - second.l;
  const firstChroma = oklabChroma(first);
  const secondChroma = oklabChroma(second);
  const deltaChroma = firstChroma - secondChroma;
  const firstHue = Math.atan2(first.b, first.a);
  const secondHue = Math.atan2(second.b, second.a);
  const deltaHue = normalizeHueDelta(firstHue - secondHue);
  const hueWeight = Math.max(firstChroma, secondChroma);

  return Math.hypot(
    deltaL * weights.lightness,
    deltaChroma * weights.chroma,
    deltaHue * hueWeight * weights.hue,
  );
}

function normalizeHueDelta(delta: number) {
  let normalized = delta;

  while (normalized > Math.PI) {
    normalized -= 2 * Math.PI;
  }
  while (normalized < -Math.PI) {
    normalized += 2 * Math.PI;
  }

  return normalized;
}

function rgbToHsl(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const chroma = max - min;

  if (chroma === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = lightness > 0.5 ? chroma / (2 - max - min) : chroma / (max + min);

  let hue: number;
  if (max === red) {
    hue = (green - blue) / chroma + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / chroma + 2;
  } else {
    hue = (red - green) / chroma + 4;
  }

  return { h: hue * 60, s: saturation, l: lightness };
}
