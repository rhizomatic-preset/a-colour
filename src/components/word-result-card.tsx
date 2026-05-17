interface WordResultCardProps {
  hex: string;
  name: string;
  onSelect: () => void;
}

export function WordResultCard({ hex, name, onSelect }: WordResultCardProps) {
  return (
    <button type="button" className="word-result-card" onClick={onSelect}>
      <span
        className="word-result-card__swatch"
        style={{ backgroundColor: hex }}
        aria-hidden="true"
      />
      <span className="word-result-card__hex">{hex}</span>
      <span className="word-result-card__name">{name}</span>
    </button>
  );
}
