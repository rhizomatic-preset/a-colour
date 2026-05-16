import type { DistanceWeights } from "@/lib/color-matcher";
import {
  DEFAULT_SETTINGS,
  type MatchCount,
  type SampleKernel,
  type Settings,
} from "@/lib/settings";
import { KernelPreview, type SampleSource } from "./kernel-preview";

interface SettingsPanelProps {
  settings: Settings;
  sampleSource: SampleSource | null;
  onChange: (settings: Settings) => void;
}

const MATCH_COUNTS: MatchCount[] = [1, 3, 5];
const SAMPLE_KERNELS: SampleKernel[] = [1, 3, 5, 7];

type WeightKey = keyof DistanceWeights;
const WEIGHT_FIELDS: ReadonlyArray<{ key: WeightKey; label: string; hint: string }> = [
  {
    key: "lightness",
    label: "Lightness emphasis",
    hint: "How much lightness difference counts. Lower this when a dark colour reads as the wrong family (e.g. yellow lego matching brown).",
  },
  {
    key: "chroma",
    label: "Chroma emphasis",
    hint: "How much saturation difference counts. Higher means muted and vivid versions of a hue stay distinct.",
  },
  {
    key: "hue",
    label: "Hue emphasis",
    hint: "How much hue (red / yellow / blue / …) difference counts. Raise this to bias matching by colour family.",
  },
];

export function SettingsPanel({ settings, sampleSource, onChange }: SettingsPanelProps) {
  const isDirty = JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);

  return (
    <div className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      <details className="setting-section" open>
        <summary>Show me</summary>
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
      </details>

      <details className="setting-section">
        <summary>Sampling</summary>
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
            Average an N×N pixel block on the next sample. Larger smooths noise but blurs edges.
          </p>
        </div>
        <KernelPreview source={sampleSource} kernel={settings.sampleKernel} />
      </details>

      <details className="setting-section">
        <summary>Bias matching</summary>
        {WEIGHT_FIELDS.map(({ key, label, hint }) => (
          <div className="setting-field" key={key}>
            <span className="setting-label">
              {label}
              <span className="setting-value">{settings.weights[key].toFixed(2)}</span>
            </span>
            <input
              type="range"
              className="setting-range"
              min={0}
              max={3}
              step={0.05}
              value={settings.weights[key]}
              onChange={(event) =>
                onChange({
                  ...settings,
                  weights: { ...settings.weights, [key]: Number.parseFloat(event.target.value) },
                })
              }
              aria-label={label}
            />
            <p className="setting-hint">{hint}</p>
          </div>
        ))}

        <div className="setting-field">
          <span className="setting-label">
            Hue bias
            <span className="setting-value">
              {settings.hueBias === null ? "Off" : `${Math.round(settings.hueBias)}°`}
            </span>
          </span>
          <div className="hue-bias-row">
            <button
              type="button"
              className={`seg-btn hue-bias-toggle ${settings.hueBias === null ? "" : "is-active"}`}
              onClick={() =>
                onChange({
                  ...settings,
                  hueBias: settings.hueBias === null ? 60 : null,
                })
              }
              aria-pressed={settings.hueBias !== null}
            >
              {settings.hueBias === null ? "Off" : "On"}
            </button>
            <input
              type="range"
              className="setting-range hue-range"
              min={0}
              max={359}
              step={1}
              value={settings.hueBias ?? 0}
              disabled={settings.hueBias === null}
              onChange={(event) =>
                onChange({ ...settings, hueBias: Number.parseFloat(event.target.value) })
              }
              aria-label="Hue bias"
            />
          </div>
          <p className="setting-hint">
            Lean matches toward a specific hue family — useful when you know the colour ("it's
            definitely yellow") but the sample is ambiguous.
          </p>
        </div>
      </details>

      <button
        type="button"
        className="settings-reset"
        onClick={() => onChange(DEFAULT_SETTINGS)}
        disabled={!isDirty}
      >
        Reset to defaults
      </button>
    </div>
  );
}
