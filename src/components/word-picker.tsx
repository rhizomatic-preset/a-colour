import { useEffect, useMemo, useRef, useState } from "react";
import { WordResultCard } from "@/components/word-result-card";
import type { ColorReference } from "@/lib/color-matcher";
import type { MatchCount } from "@/lib/settings";
import { buildFamilyIndex, type DistillationLookup } from "@/lib/word-search/distillation/lookup";
import type { Embedder } from "@/lib/word-search/embedder";
import type { QueryExpander } from "@/lib/word-search/expander";
import { searchByWord, type WordSearchResult } from "@/lib/word-search/index";
import type { TfidfIndex } from "@/lib/word-search/tfidf-index";
import {
  type EncoderLoadState,
  subscribeEncoderLoad,
} from "@/lib/word-search/transformers-embedder";

interface WordPickerProps {
  library: ColorReference[];
  tfidf: TfidfIndex;
  expander: QueryExpander;
  /** Build-time-distilled common-noun lookup. Optional — when omitted, the
   * runtime falls through to the TF-IDF + expander stack as before. */
  distillation?: DistillationLookup;
  /** Phase B fine-tuned sentence-transformer. Lazy-loaded on first query.
   * Slots between distillation and the TF-IDF + expander chain. */
  embedder?: Embedder;
  topN: MatchCount;
  onColorSelect: (hex: string) => void;
}

const DEBOUNCE_MS = 120;

const SUGGESTIONS = ["ocean", "rainy", "pink", "whero"];

export function WordPicker({
  library,
  tfidf,
  expander,
  distillation,
  embedder,
  topN,
  onColorSelect,
}: WordPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WordSearchResult[]>([]);
  const [encoderState, setEncoderState] = useState<EncoderLoadState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  // The family index partitions the library by getPrimaryColorName once per
  // library swap — cheap (~1 KB, ~1 ms) but worth caching so each keystroke
  // doesn't rebuild it.
  const familyIndex = useMemo(() => buildFamilyIndex(library), [library]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      return;
    }
    const timer = window.setTimeout(async () => {
      const id = ++requestIdRef.current;
      const out = await searchByWord(query, library, tfidf, embedder, {
        expander,
        topN,
        distillation,
        familyIndex,
      });
      // Drop the result if a newer query has started since we kicked off.
      if (id !== requestIdRef.current) return;
      setResults(out);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, library, tfidf, embedder, expander, distillation, familyIndex, topN]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const hasResults = results.length > 0;

  return (
    <div className="word-picker">
      <input
        ref={inputRef}
        id="word-mode-query"
        name="word-mode-query"
        className="word-input"
        type="text"
        inputMode="text"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={'try "ocean", "rainy", or "whero"'}
        aria-label="Search by colour word"
      />
      {!hasQuery && (
        <>
          <p className="word-hint">Type a colour word or phrase.</p>
          {encoderState.status === "loading" && (
            <div className="word-encoder-loading">
              <progress className="word-encoder-progress" />
              <p className="word-encoder-progress-text">Loading semantic model…</p>
            </div>
          )}
          {encoderState.status === "error" && (
            <p className="word-hint word-encoder-error">
              Semantic model unavailable — falling back to literal matching.
            </p>
          )}
        </>
      )}
      {hasQuery && !hasResults && (
        <div className="word-empty">
          <p className="word-hint">
            Haven't learnt <strong>"{trimmed}"</strong> yet. Try one of these:
          </p>
          <div className="word-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="word-suggestion"
                onClick={() => setQuery(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      {hasResults && (
        <div className="word-results">
          {results.map((result) => (
            <WordResultCard
              key={result.id}
              hex={result.hex}
              name={result.name}
              onSelect={() => onColorSelect(result.hex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
