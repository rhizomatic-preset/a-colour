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
/**
 * Static-embedding expansion is the recall layer (used when handcurated is
 * silent for a token), so it gets a higher per-token budget — open-vocab queries
 * like "ender dragon" rely on it reaching neighbours like "purple" / "emerald"
 * that sit further down the cosine list.
 */
export const MAX_STATIC_EXPANSIONS_PER_TOKEN = 5;
export const MAX_PHRASES_PER_QUERY = 12;
export const HANDCURATED_EXPANSION_WEIGHT = 0.7;
/**
 * Static-embedding neighbours are noisier than hand-curated entries, so they
 * get a slightly smaller weight in the RRF blend. The handcurated weight stays
 * the reference point; this is a deliberate-but-modest discount.
 */
export const STATIC_EXPANSION_WEIGHT = 0.5;

type DictionaryExpanderOptions = {
  id: string;
  displayName: string;
  /** Per-replacement RRF weight. Original query is always weight 1. */
  weight: number;
  /** Per-token replacement cap; defaults to MAX_EXPANSIONS_PER_TOKEN. */
  perTokenCap?: number;
};

/**
 * Shared core for any expander whose source is a token→synonyms dictionary.
 * Both the handcurated and static expanders use this shape; the only differences
 * are the source dictionary, the id, and the replacement weight.
 */
function buildDictionaryExpander(
  dictionary: Record<string, string[]>,
  options: DictionaryExpanderOptions,
): QueryExpander {
  const dict = new Map<string, string[]>();
  for (const [key, values] of Object.entries(dictionary)) {
    dict.set(
      key.toLowerCase(),
      values.map((v) => v.toLowerCase()),
    );
  }

  return {
    id: options.id,
    displayName: options.displayName,
    async expand(query) {
      const tokens = tokenize(query);
      const out: Expansion[] = [{ phrase: query, weight: 1 }];
      if (tokens.length === 0) return out;

      const perTokenCap = options.perTokenCap ?? MAX_EXPANSIONS_PER_TOKEN;
      for (let i = 0; i < tokens.length; i++) {
        const original = tokens[i];
        const replacements = dict.get(original);
        if (!replacements || replacements.length === 0) continue;
        const limited = replacements.slice(0, perTokenCap);
        for (const replacement of limited) {
          if (replacement === original) continue;
          const phraseTokens = tokens.slice();
          phraseTokens[i] = replacement;
          const phrase = phraseTokens.join(" ");
          if (phrase === query) continue;
          out.push({ phrase, weight: options.weight });
        }
      }

      if (out.length > MAX_PHRASES_PER_QUERY) {
        return out.slice(0, MAX_PHRASES_PER_QUERY);
      }
      return out;
    },
  };
}

export function buildHandcuratedExpander(dictionary: Record<string, string[]>): QueryExpander {
  return buildDictionaryExpander(dictionary, {
    id: "handcurated",
    displayName: "Handcurated dictionary",
    weight: HANDCURATED_EXPANSION_WEIGHT,
  });
}

/**
 * Phase 1.5b — expander backed by a precomputed nearest-neighbour table from
 * a static word-embedding model (GloVe 6B 50d). The dictionary is built at
 * build time by `scripts/build-expander-vectors.ts`; runtime is identical to
 * the handcurated path except for a deeper per-token budget — open-vocab tokens
 * often have their useful colour-family neighbour several positions down.
 */
export function buildStaticExpander(dictionary: Record<string, string[]>): QueryExpander {
  return buildDictionaryExpander(dictionary, {
    id: "static",
    displayName: "Static embeddings (GloVe 6B 50d)",
    weight: STATIC_EXPANSION_WEIGHT,
    perTokenCap: MAX_STATIC_EXPANSIONS_PER_TOKEN,
  });
}

/**
 * Union helper for the blended `static-handcurated` configuration. For each
 * key the handcurated entry is preferred and goes first; static-only entries
 * fill in where handcurated is silent. The per-key list is MAX_EXPANSIONS_PER_TOKEN
 * cap-truncated downstream regardless.
 */
export function mergeDictionaries(
  primary: Record<string, string[]>,
  secondary: Record<string, string[]>,
): Record<string, string[]> {
  // Lowercase both dictionaries at the boundary so collisions on differently
  // cased keys (`RED` vs `red`) merge instead of producing two output entries.
  const lower = (dict: Record<string, string[]>): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const [k, v] of Object.entries(dict)) m.set(k.toLowerCase(), v);
    return m;
  };
  const p = lower(primary);
  const s = lower(secondary);

  const out: Record<string, string[]> = {};
  const keys = new Set<string>([...p.keys(), ...s.keys()]);
  for (const key of keys) {
    const primaryEntries = p.get(key) ?? [];
    const secondaryEntries = s.get(key) ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const v of [...primaryEntries, ...secondaryEntries]) {
      const lv = v.toLowerCase();
      if (seen.has(lv)) continue;
      seen.add(lv);
      merged.push(lv);
    }
    if (merged.length > 0) out[key] = merged;
  }
  return out;
}

/**
 * Convenience factory for the blended config: handcurated entries dominate
 * (higher RRF weight on their replacements), static fills the gaps. Implemented
 * by routing each token to whichever dictionary has an entry, with handcurated
 * winning ties. This keeps the per-phrase weight semantically meaningful —
 * a handcurated-sourced phrase carries handcurated weight, a static-sourced
 * phrase carries static weight.
 */
export function buildBlendedExpander(
  handcurated: Record<string, string[]>,
  staticDict: Record<string, string[]>,
): QueryExpander {
  // Lowercase both at the boundary so .has() lookups are case-insensitive.
  const hand = new Map<string, string[]>();
  for (const [k, v] of Object.entries(handcurated)) hand.set(k.toLowerCase(), v);
  const stat = new Map<string, string[]>();
  for (const [k, v] of Object.entries(staticDict)) stat.set(k.toLowerCase(), v);

  return {
    id: "static-handcurated",
    displayName: "Static + handcurated (blended)",
    async expand(query) {
      const tokens = tokenize(query);
      const out: Expansion[] = [{ phrase: query, weight: 1 }];
      if (tokens.length === 0) return out;

      for (let i = 0; i < tokens.length; i++) {
        const original = tokens[i];
        // Prefer handcurated when present. Static is the fallback. Per
        // query-expansion.md "leaning toward starting from eval failures so the
        // dictionary stays small and targeted" — handcurated is the precision
        // layer, static is the recall layer.
        const handReplacements = hand.get(original) ?? [];
        const statReplacements = stat.get(original) ?? [];

        const seen = new Set<string>([original]);

        const emit = (replacements: string[], weight: number, cap: number) => {
          let emitted = 0;
          for (const r of replacements) {
            if (emitted >= cap) break;
            const rl = r.toLowerCase();
            if (seen.has(rl)) continue;
            seen.add(rl);
            const phraseTokens = tokens.slice();
            phraseTokens[i] = rl;
            const phrase = phraseTokens.join(" ");
            if (phrase === query) continue;
            out.push({ phrase, weight });
            emitted += 1;
          }
        };

        emit(handReplacements, HANDCURATED_EXPANSION_WEIGHT, MAX_EXPANSIONS_PER_TOKEN);
        emit(statReplacements, STATIC_EXPANSION_WEIGHT, MAX_STATIC_EXPANSIONS_PER_TOKEN);
      }

      if (out.length > MAX_PHRASES_PER_QUERY) {
        return out.slice(0, MAX_PHRASES_PER_QUERY);
      }
      return out;
    },
  };
}
