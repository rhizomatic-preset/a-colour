import { useEffect, useMemo, useRef, useState } from "react";
import type { ColorReference } from "@/lib/color-matcher";
import type { MatchCount } from "@/lib/settings";
import { buildFamilyIndex, type DistillationLookup } from "@/lib/word-search/distillation/lookup";
import { type EasterEggCard, getEasterEgg } from "@/lib/word-search/easter-eggs";
import type { Embedder } from "@/lib/word-search/embedder";
import type { QueryExpander } from "@/lib/word-search/expander";
import { searchByWord, type WordSearchResult } from "@/lib/word-search/index";
import type { TfidfIndex } from "@/lib/word-search/tfidf-index";
import {
  type EncoderLoadState,
  subscribeEncoderLoad,
} from "@/lib/word-search/transformers-embedder";

const DEBOUNCE_MS = 120;

export interface UseWordSearchParams {
  query: string;
  library: ColorReference[];
  tfidf: TfidfIndex;
  expander: QueryExpander;
  distillation?: DistillationLookup;
  embedder?: Embedder;
  semanticThreshold: number;
  topN: MatchCount;
}

export interface UseWordSearchResult {
  results: WordSearchResult[];
  easterEggCards: EasterEggCard[] | null;
  encoderState: EncoderLoadState;
  trimmed: string;
  hasQuery: boolean;
  hasResults: boolean;
  hasEasterEgg: boolean;
}

/**
 * Owns the word-mode search lifecycle: debounce, easter-egg short-circuit,
 * encoder subscription, and request-id race protection. Returns a flat,
 * derived state object so the input and findings panels can render in
 * different grid columns without sharing component state.
 */
export function useWordSearch({
  query,
  library,
  tfidf,
  expander,
  distillation,
  embedder,
  semanticThreshold,
  topN,
}: UseWordSearchParams): UseWordSearchResult {
  const [results, setResults] = useState<WordSearchResult[]>([]);
  const [easterEggCards, setEasterEggCards] = useState<EasterEggCard[] | null>(null);
  const [encoderState, setEncoderState] = useState<EncoderLoadState>({ status: "idle" });
  const requestIdRef = useRef(0);

  const familyIndex = useMemo(() => buildFamilyIndex(library), [library]);

  // Subscribe to the shared encoder load state. App-level idle preload may
  // have already started (or finished) the load; either way we mirror the
  // current state into local state for the progress UI. Also kick off the
  // load on mount as a belt-and-braces fallback if the idle preload didn't
  // fire (very old browser, or user reached Word mode in < 1 frame).
  useEffect(() => {
    if (!embedder) return undefined;
    const unsubscribe = subscribeEncoderLoad(setEncoderState);
    if (!embedder.isReady()) {
      embedder.load().catch(() => {
        // Surfaced via subscribeEncoderLoad's error state; nothing to do here.
      });
    }
    return unsubscribe;
  }, [embedder]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setEasterEggCards(null);
      return;
    }
    const egg = getEasterEgg(query);
    if (egg) {
      setEasterEggCards(egg);
      setResults([]);
      return;
    }
    setEasterEggCards(null);
    const timer = window.setTimeout(async () => {
      const id = ++requestIdRef.current;
      const out = await searchByWord(query, library, tfidf, embedder, {
        expander,
        topN,
        distillation,
        familyIndex,
        semanticThreshold,
      });
      if (id !== requestIdRef.current) return;
      setResults(out);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    query,
    library,
    tfidf,
    embedder,
    expander,
    distillation,
    familyIndex,
    semanticThreshold,
    topN,
  ]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const hasResults = results.length > 0;
  const hasEasterEgg = easterEggCards !== null && easterEggCards.length > 0;

  return {
    results,
    easterEggCards,
    encoderState,
    trimmed,
    hasQuery,
    hasResults,
    hasEasterEgg,
  };
}
