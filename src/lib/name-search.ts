import { pipeline } from "@huggingface/transformers";
import {
  buildNameVectorIndex,
  findClosestColorNames,
  type ColorMatch,
  type ColorReference,
} from "@/lib/color-matcher";

type SearchResult = {
  matches: ColorMatch[];
  variants: string[];
};

const generatorModelId = "Xenova/LaMini-Flan-T5-77M";

let generatorPromise: Promise<unknown> | null = null;
let indexCache: {
  colors: ColorReference[];
  index: ReturnType<typeof buildNameVectorIndex>;
} | null = null;

export async function searchColorNames(
  query: string,
  colors: ColorReference[],
): Promise<SearchResult> {
  const index = getIndex(colors);
  const variants = await generateQueryVariants(query);
  const matches = findClosestColorNames([query, ...variants], index.index, 3);

  return { matches, variants };
}

function getIndex(colors: ColorReference[]) {
  if (indexCache && indexCache.colors === colors) {
    return indexCache;
  }

  indexCache = {
    colors,
    index: buildNameVectorIndex(colors),
  };

  return indexCache;
}

async function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = pipeline("text-generation", generatorModelId);
  }

  return generatorPromise;
}

async function generateQueryVariants(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const generator = (await getGenerator()) as (
      text: string,
      options?: Record<string, unknown>,
    ) => Promise<Array<{ generated_text?: string }>>;

    const prompt = [
      "Return 5 short related search terms for a color-naming search.",
      "Use comma-separated words or short phrases only.",
      `Input: ${trimmed}`,
      "Terms:",
    ].join("\n");

    const output = await generator(prompt, {
      max_new_tokens: 32,
      do_sample: false,
      temperature: 0.2,
      return_full_text: false,
    });

    const text = output[0]?.generated_text ?? "";
    return parseVariants(text, prompt);
  } catch {
    return [];
  }
}

function parseVariants(text: string, prompt: string) {
  console.log(text);
  console.log(prompt);
  const cleaned = text.startsWith(prompt) ? text.slice(prompt.length) : text;
  const parts = cleaned
    .split(/[\n,;•]/)
    .map((part) => part.trim())
    .map((part) => part.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).slice(0, 5);
}
