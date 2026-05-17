interface WordResultCardProps {
  hex: string;
  name: string;
  /** Optional alternate swatch rendering. `default` is a solid colour fill;
   * `static` renders a black-and-white turbulent noise pattern (the
   * `rainbow` / `static` easter-egg cards). */
  display?: "default" | "static";
  onSelect: () => void;
}

export function WordResultCard({ hex, name, display = "default", onSelect }: WordResultCardProps) {
  return (
    <button type="button" className="word-result-card" onClick={onSelect}>
      {display === "static" ? (
        <span
          className="word-result-card__swatch word-result-card__swatch--static"
          aria-hidden="true"
        >
          <svg viewBox="0 0 40 40" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
            <title>TV static</title>
            <filter id="word-result-card-static-noise">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="2.4"
                numOctaves="2"
                stitchTiles="stitch"
              />
              <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.1" />
            </filter>
            <rect width="40" height="40" filter="url(#word-result-card-static-noise)" />
          </svg>
        </span>
      ) : (
        <span
          className="word-result-card__swatch"
          style={{ backgroundColor: hex }}
          aria-hidden="true"
        />
      )}
      <span className="word-result-card__hex">{hex}</span>
      <span className="word-result-card__name">{name}</span>
    </button>
  );
}
