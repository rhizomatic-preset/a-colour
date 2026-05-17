import { WordResultCard } from "@/components/word-result-card";
import type { UseWordSearchResult } from "@/lib/word-search/use-word-search";

const SUGGESTIONS = ["ocean", "rainy", "pink", "whero"];

interface WordFindingsProps {
  search: UseWordSearchResult;
  onSuggestionClick: (suggestion: string) => void;
  onColorSelect: (hex: string) => void;
}

/**
 * Right-column counterpart to WordPicker. Renders the three outcome shapes:
 * easter-egg cards (rainbow tile row), empty-state suggestions when nothing
 * matched, or the standard word-result cards.
 */
export function WordFindings({ search, onSuggestionClick, onColorSelect }: WordFindingsProps) {
  const { results, easterEggCards, trimmed, hasQuery, hasResults, hasEasterEgg } = search;

  if (!hasQuery) {
    return null;
  }

  if (hasEasterEgg) {
    return (
      <section className="word-findings" aria-label="Colour matches">
        <div className="word-results word-results--easter">
          {easterEggCards?.map((card) => (
            <WordResultCard
              key={`${card.display}-${card.hex}-${card.name}`}
              hex={card.hex}
              name={card.name}
              display={card.display}
              onSelect={() => onColorSelect(card.hex)}
            />
          ))}
        </div>
      </section>
    );
  }

  if (!hasResults) {
    return (
      <section className="word-findings" aria-label="No matches">
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
                onClick={() => onSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="word-findings" aria-label="Colour matches">
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
    </section>
  );
}
