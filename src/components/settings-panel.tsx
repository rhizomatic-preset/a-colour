import type { MatchCount, SampleKernel, Settings } from "@/lib/settings";

interface SettingsPanelProps {
  settings: Settings;
  selectedHex: string;
  onChange: (settings: Settings) => void;
}

const MATCH_COUNTS: MatchCount[] = [1, 3, 5];
const SAMPLE_KERNELS: SampleKernel[] = [1, 3, 5, 7];

export function SettingsPanel({ settings, selectedHex, onChange }: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      <div className="setting-preview">
        <span
          className="setting-preview-swatch"
          style={{ backgroundColor: selectedHex }}
          aria-hidden="true"
        />
        <div className="setting-preview-meta">
          <span className="setting-preview-label">Tuning for</span>
          <span className="setting-preview-hex">{selectedHex.toUpperCase()}</span>
        </div>
      </div>

      <div className="setting-field">
        <span className="setting-label">Matches shown</span>
        <div className="seg-row" role="radiogroup" aria-label="Matches shown">
          {MATCH_COUNTS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.matchCount === value}
              className={`seg-btn ${settings.matchCount === value ? "is-active" : ""}`}
              onClick={() => onChange({ ...settings, matchCount: value })}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="setting-hint">How many closest names to list.</p>
      </div>

      <div className="setting-field">
        <span className="setting-label">Sample kernel</span>
        <div className="seg-row" role="radiogroup" aria-label="Sample kernel">
          {SAMPLE_KERNELS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.sampleKernel === value}
              className={`seg-btn ${settings.sampleKernel === value ? "is-active" : ""}`}
              onClick={() => onChange({ ...settings, sampleKernel: value })}
            >
              {value}×{value}
            </button>
          ))}
        </div>
        <p className="setting-hint">
          Average an N×N pixel block on image and camera samples. Larger smooths noise but blurs
          edges.
        </p>
      </div>

      <div className="setting-field">
        <span className="setting-label">
          Distance threshold
          <span className="setting-value">{settings.maxDistance.toFixed(2)}</span>
        </span>
        <input
          type="range"
          className="setting-range"
          min={0.05}
          max={0.6}
          step={0.01}
          value={settings.maxDistance}
          onChange={(event) =>
            onChange({ ...settings, maxDistance: Number.parseFloat(event.target.value) })
          }
          aria-label="Maximum match distance"
        />
        <p className="setting-hint">
          Hide matches further than this perceptual distance. Lower is stricter.
        </p>
      </div>
    </div>
  );
}
