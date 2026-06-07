export function AboutPanel() {
  return (
    <div className="info-panel">
      <h2 className="info-title">About</h2>
      <p className="info-lead">
        Pick a colour, or type a word to get the closest named matches from a reference set of ~980
        colours, ranked by how a human eye perceives the difference (Oklab).
      </p>
      <dl className="info-modes">
        <dt>Swatch</dt>
        <dd>
          Open a colour wheel and choose visually.
          <span className="desktop-only"> Or paste a hex code.</span>
        </dd>
        <dt>Image</dt>
        <dd>Paste or upload a picture, then tap a pixel to sample its colour.</dd>
        <dt>Camera</dt>
        <dd>Point at something and tap the live view to sample.</dd>
        <dt>Word</dt>
        <dd>Type a word or phrase to search by meaning and get the closest colour matches.</dd>
      </dl>
      <p className="info-note">
        Colour is perceptive. The name that fits a swatch for you may not fit it for someone else,
        and the app can be wrong too — take the matches as a starting point, not a verdict.
      </p>
      <p className="info-footer">Tune sampling and matching from the gear icon.</p>
      <p className="info-attribution">
        Colour names from the{" "}
        <a href="https://xkcd.com/color/rgb/" target="_blank" rel="noreferrer">
          xkcd colour survey
        </a>{" "}
        (public domain) and the{" "}
        <a href="https://www.w3.org/TR/css-color-4/#named-colors" target="_blank" rel="noreferrer">
          CSS Color spec
        </a>
        .
      </p>
    </div>
  );
}
