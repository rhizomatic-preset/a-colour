import type { DistanceWeights } from "@/lib/color-matcher";
import {
  DEFAULT_SETTINGS,
  type MatchCount,
  type SampleKernel,
  type Settings,
} from "@/lib/settings";

interface SettingsPanelProps {
  settings: Settings;
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

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const isDirty = JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);

  return (
    <div className="settings-panel">
      <h2 className="settings-title">Settings</h2>

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
          Average an N×N pixel block when sampling. Only affects the next sample; larger smooths
          noise but blurs edges.
        </p>
      </div>

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
