import { tokenize } from "@/lib/word-search/tokenize";

export type Expansion = { phrase: string; weight: number };

export interface QueryExpander {
  readonly id: string;
  readonly displayName: string;
  expand(query: string): Promise<Expansion[]>;
}

export const NoopExpander: QueryExpander = {
  id: "noop",
  displayName: "No expansion",
  async expand(query) {
    return [{ phrase: query, weight: 1 }];
  },
};

export const MAX_EXPANSIONS_PER_TOKEN = 3;
export const MAX_PHRASES_PER_QUERY = 10;
export const HANDCURATED_EXPANSION_WEIGHT = 0.7;

export function buildHandcuratedExpander(dictionary: Record<string, string[]>): QueryExpander {
  // Normalise keys to lowercase once so lookups are case-insensitive at runtime.
  const dict = new Map<string, string[]>();
  for (const [key, values] of Object.entries(dictionary)) {
    dict.set(
      key.toLowerCase(),
      values.map((v) => v.toLowerCase()),
    );
  }

  return {
    id: "handcurated",
    displayName: "Handcurated dictionary",
    async expand(query) {
      const tokens = tokenize(query);
      const out: Expansion[] = [{ phrase: query, weight: 1 }];
      if (tokens.length === 0) return out;

      // Single-token substitution per phrase keeps the count linear (not Cartesian).
      // For each token position we expand up to MAX_EXPANSIONS_PER_TOKEN replacements.
      for (let i = 0; i < tokens.length; i++) {
        const original = tokens[i];
        const replacements = dict.get(original);
        if (!replacements || replacements.length === 0) continue;
        const limited = replacements.slice(0, MAX_EXPANSIONS_PER_TOKEN);
        for (const replacement of limited) {
          if (replacement === original) continue;
          const phraseTokens = tokens.slice();
          phraseTokens[i] = replacement;
          const phrase = phraseTokens.join(" ");
          if (phrase === query) continue;
          out.push({ phrase, weight: HANDCURATED_EXPANSION_WEIGHT });
        }
      }

      // Hard ceiling. Original is at index 0 with weight 1; remaining are at the
      // expansion weight in token-order, so a stable head-slice is the trim.
      if (out.length > MAX_PHRASES_PER_QUERY) {
        return out.slice(0, MAX_PHRASES_PER_QUERY);
      }
      return out;
    },
  };
}
