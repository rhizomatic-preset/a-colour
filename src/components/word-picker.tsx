import { useEffect, useRef } from "react";
import type { EncoderLoadState } from "@/lib/word-search/transformers-embedder";

interface WordPickerProps {
  query: string;
  onQueryChange: (next: string) => void;
  encoderState: EncoderLoadState;
  hasQuery: boolean;
}

export function WordPicker({ query, onQueryChange, encoderState, hasQuery }: WordPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
        onChange={(event) => onQueryChange(event.target.value)}
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
    </div>
  );
}
