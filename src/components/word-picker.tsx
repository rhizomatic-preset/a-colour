import { useEffect, useRef, useState } from "react";
import { WordResultCard } from "@/components/word-result-card";
import type { ColorReference } from "@/lib/color-matcher";
import type { MatchCount } from "@/lib/settings";
import type { QueryExpander } from "@/lib/word-search/expander";
import { searchByWord, type WordSearchResult } from "@/lib/word-search/index";
import type { TfidfIndex } from "@/lib/word-search/tfidf-index";

interface WordPickerProps {
  library: ColorReference[];
  tfidf: TfidfIndex;
  expander: QueryExpander;
  topN: MatchCount;
  onColorSelect: (hex: string) => void;
}

const DEBOUNCE_MS = 120;

const SUGGESTIONS = ["ocean", "rainy", "pink", "whero"];

export function WordPicker({ library, tfidf, expander, topN, onColorSelect }: WordPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WordSearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const id = ++requestIdRef.current;
      const out = await searchByWord(query, library, tfidf, undefined, { expander, topN });
      // Drop the result if a newer query has started since we kicked off.
      if (id !== requestIdRef.current) return;
      setResults(out);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, library, tfidf, expander, topN]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const hasResults = results.length > 0;

  return (
    <div className="word-picker">
      <input
        ref={inputRef}
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
      {!hasQuery && <p className="word-hint">Type a colour word or phrase.</p>}
      {hasQuery && !hasResults && (
        <div className="word-empty">
          <p className="word-hint">
            Haven't learnt <strong>"{trimmed}"</strong> yet. Try one of these:
          </p>
          <div className="word-suggestions" role="list">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="word-suggestion"
                onClick={() => setQuery(suggestion)}
                role="listitem"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      {hasResults && (
        <div className="word-results" role="list">
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
