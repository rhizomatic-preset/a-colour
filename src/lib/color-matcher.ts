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

type NameVectorIndex = {
  colors: ColorReference[];
  vectors: Array<Map<string, number>>;
  norms: number[];
  idf: Map<string, number>;
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
  maxDistance = Number.POSITIVE_INFINITY,
): ColorMatch[] {
  const input = hexToRgb(normalizeHex(inputHex));
  const inputLab = rgbToOklab(input.r, input.g, input.b);
  const inputChroma = oklabChroma(inputLab);
  const isInputNeutral = inputChroma < 0.04;

  return colors
    .map((color) => {
      const lab = rgbToOklab(color.r, color.g, color.b);
      const colorChroma = oklabChroma(lab);
      const baseDistance = weightedOklabDistance(inputLab, lab);
      const neutralPenalty = isInputNeutral && colorChroma > 0.06 ? (colorChroma - 0.06) * 0.9 : 0;
      const distance = baseDistance + neutralPenalty;

      return {
        ...color,
        distance,
        closeness: Math.max(0, Math.round((1 - distance / 0.45) * 100)),
      };
    })
    .filter((match) => match.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
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

  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 150) return "green";
  if (h < 190) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  if (h < 330) return "magenta";
  return "pink";
}

export function buildNameVectorIndex(colors: ColorReference[]): NameVectorIndex {
  const documents = colors.map((color) =>
    tokenizeText(`${color.name} ${getPrimaryColorName(color.hex)}`),
  );
  const docCount = documents.length;
  const documentFrequency = new Map<string, number>();

  for (const tokens of documents) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [token, frequency] of documentFrequency) {
    idf.set(token, Math.log((docCount + 1) / (frequency + 1)) + 1);
  }

  const vectors = documents.map((tokens) => toTfidfVector(tokens, idf));
  const norms = vectors.map((vector) => vectorNorm(vector));

  return {
    colors,
    vectors,
    norms,
    idf,
  };
}

export function findClosestColorNames(
  queryVariants: string[],
  index: NameVectorIndex,
  limit = 3,
): ColorMatch[] {
  const variants = queryVariants.map((variant) => variant.trim()).filter(Boolean);
  if (variants.length === 0) {
    return [];
  }

  const queryVectors = variants.map((queryTerm) =>
    toTfidfVector(tokenizeText(queryTerm), index.idf),
  );
  const queryNorms = queryVectors.map((vector) => vectorNorm(vector));

  return index.colors
    .map((color, indexPosition) => {
      const vector = index.vectors[indexPosition];
      const vectorNorm = index.norms[indexPosition];
      const similarity = Math.max(
        ...queryVectors.map((queryVector, queryIndex) =>
          cosineSimilarity(queryVector, vector, queryNorms[queryIndex], vectorNorm),
        ),
      );

      return {
        ...color,
        distance: 1 - similarity,
        closeness: Math.max(0, Math.round(similarity * 100)),
      };
    })
    .sort((first, second) => second.closeness - first.closeness)
    .slice(0, limit);
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

function weightedOklabDistance(first: Oklab, second: Oklab) {
  const deltaL = first.l - second.l;
  const firstChroma = oklabChroma(first);
  const secondChroma = oklabChroma(second);
  const deltaChroma = firstChroma - secondChroma;
  const firstHue = Math.atan2(first.b, first.a);
  const secondHue = Math.atan2(second.b, second.a);
  const deltaHue = normalizeHueDelta(firstHue - secondHue);
  const hueWeight = Math.max(firstChroma, secondChroma);

  return Math.hypot(deltaL * 1.6, deltaChroma * 1.2, deltaHue * hueWeight * 0.7);
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

function tokenizeText(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  return normalized.split(/\s+/);
}

function toTfidfVector(tokens: string[], idf: Map<string, number>) {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  const vector = new Map<string, number>();
  for (const [token, frequency] of tf) {
    const tokenIdf = idf.get(token) ?? 0.7;
    vector.set(token, frequency * tokenIdf);
  }

  return vector;
}

function vectorNorm(vector: Map<string, number>) {
  let sum = 0;
  for (const value of vector.values()) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(
  first: Map<string, number>,
  second: Map<string, number>,
  firstNorm: number,
  secondNorm: number,
) {
  if (firstNorm === 0 || secondNorm === 0) {
    return 0;
  }

  let dot = 0;
  for (const [token, weight] of first) {
    dot += weight * (second.get(token) ?? 0);
  }

  return dot / (firstNorm * secondNorm);
}
