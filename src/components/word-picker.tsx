import { useEffect, useRef } from "react";
import type { EncoderLoadState } from "@/lib/word-search/transformers-embedder";

interface WordPickerProps {
  query: string;
  onQueryChange: (next: string) => void;
  encoderState: EncoderLoadState;
  encoderEnabled: boolean;
  hasQuery: boolean;
  onOpenSettings: () => void;
}

export function WordPicker({
  query,
  onQueryChange,
  encoderState,
  encoderEnabled,
  hasQuery,
  onOpenSettings,
}: WordPickerProps) {
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
          {encoderEnabled && encoderState.status === "loading" && (
            <div className="word-encoder-loading">
              <progress className="word-encoder-progress" />
              <p className="word-encoder-progress-text">Loading semantic model…</p>
            </div>
          )}
          {encoderEnabled && encoderState.status === "error" && (
            <p className="word-hint word-encoder-error">
              Semantic model unavailable — falling back to literal matching.
            </p>
          )}
          {!encoderEnabled && (
            <p className="word-hint word-encoder-off">
              Smart matching off (~24 MB download).{" "}
              <button type="button" className="word-encoder-link" onClick={onOpenSettings}>
                Enable in Settings
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
