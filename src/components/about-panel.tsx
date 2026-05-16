export function AboutPanel() {
  return (
    <div className="info-panel">
      <h2 className="info-title">About</h2>
      <p className="info-lead">
        Pick a colour, see the closest named matches from a reference set of ~865 colours, ranked by
        how a human eye perceives the difference (Oklab).
      </p>
      <dl className="info-modes">
        <dt>Swatch</dt>
        <dd>Open a colour wheel and choose visually, or paste a hex code.</dd>
        <dt>Image</dt>
        <dd>Paste or upload a picture, then tap a pixel to sample its colour.</dd>
        <dt>Camera</dt>
        <dd>Point at something and tap the live view to sample.</dd>
      </dl>
      <p className="info-note">
        Colour is perceptive. The name that fits a swatch for you may not fit it for someone else,
        and the app can be wrong too — take the matches as a starting point, not a verdict.
      </p>
      <p className="info-footer">Tune sampling and matching from the gear icon.</p>
    </div>
  );
}
