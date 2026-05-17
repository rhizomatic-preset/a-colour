import {
  Camera,
  Check,
  Clipboard,
  HelpCircle,
  Image as ImageIcon,
  Palette,
  Pipette,
  Settings as SettingsIcon,
  Type,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AboutPanel } from "@/components/about-panel";
import { CameraPicker } from "@/components/camera-picker";
import type { SampleSource } from "@/components/kernel-preview";
import { SettingsPanel } from "@/components/settings-panel";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { WordFindings } from "@/components/word-findings";
import { WordPicker } from "@/components/word-picker";
import colorsCsv from "@/generated/colors-small.csv?raw";
import distillationLookup from "@/generated/colour-distillation.json";
import expansionDict from "@/generated/expansions-handcurated.json";
import staticExpansionDict from "@/generated/expansions-static.json";
import tfidfJson from "@/generated/tfidf-small.json";
import {
  type ColorReference,
  getClosestColors,
  getPrimaryColorName,
  isValidHex,
  normalizeHex,
  parseColorCsv,
} from "@/lib/color-matcher";
import { sampleAverageColor } from "@/lib/sampling";
import {
  loadLastColor,
  loadSettings,
  type Settings,
  saveLastColor,
  saveSettings,
} from "@/lib/settings";
import type { DistillationLookup } from "@/lib/word-search/distillation/lookup";
import {
  buildBlendedExpander,
  buildHandcuratedExpander,
  buildStaticExpander,
  NoopExpander,
  type QueryExpander,
} from "@/lib/word-search/expander";
import { loadTfidfIndex } from "@/lib/word-search/tfidf-index";
import { TransformersEmbedder } from "@/lib/word-search/transformers-embedder";
import { useWordSearch } from "@/lib/word-search/use-word-search";

type PickerMode = "swatch" | "image" | "camera" | "word";
type View = "picker" | "settings" | "about";

function pickRandomColor(library: ReturnType<typeof parseColorCsv>): string {
  if (library.length === 0) return "#5d8aa8";
  return library[Math.floor(Math.random() * library.length)].hex;
}

type CustomLibrary = {
  name: string;
  colors: ColorReference[];
};

function App() {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);
  const builtInColors = useMemo(() => parseColorCsv(colorsCsv), []);
  const tfidf = useMemo(() => loadTfidfIndex(tfidfJson), []);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const expander = useMemo<QueryExpander>(() => {
    const hand = expansionDict as Record<string, string[]>;
    const stat = staticExpansionDict as Record<string, string[]>;
    switch (settings.wordMode.expander) {
      case "noop":
        return NoopExpander;
      case "handcurated":
        return buildHandcuratedExpander(hand);
      case "static":
        return buildStaticExpander(stat);
      case "static-handcurated":
        return buildBlendedExpander(hand, stat);
      default:
        // Forward-compat: unknown expander id falls back to the blended default.
        return buildBlendedExpander(hand, stat);
    }
  }, [settings.wordMode.expander]);

  const [customLibrary, setCustomLibrary] = useState<CustomLibrary | null>(null);
  const colors = customLibrary?.colors ?? builtInColors;
  const libraryName = customLibrary?.name ?? "Built-in (xkcd + CSS)";
  const [selectedHex, setSelectedHex] = useState<string>(() =>
    loadLastColor(pickRandomColor(builtInColors)),
  );

  function loadCustomLibrary(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const parsed = parseColorCsv(reader.result);
      if (parsed.length === 0) {
        // Bad CSV — leave the library alone; the UI will reflect this via no change.
        return;
      }
      setCustomLibrary({ name: file.name, colors: parsed });
    };
    reader.readAsText(file);
  }

  function resetLibrary() {
    setCustomLibrary(null);
  }
  const [hexDraft, setHexDraft] = useState<string>(selectedHex);

  const [mode, setMode] = useState<PickerMode>("swatch");
  const [view, setView] = useState<View>("picker");
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [sampleSource, setSampleSource] = useState<SampleSource | null>(null);

  function captureSampleSource(
    context: CanvasRenderingContext2D,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
  ) {
    const half = 7; // 15×15 window around the sampled pixel
    const left = Math.max(0, Math.min(sourceWidth - half * 2 - 1, Math.floor(sourceX) - half));
    const top = Math.max(0, Math.min(sourceHeight - half * 2 - 1, Math.floor(sourceY) - half));
    const region = context.getImageData(left, top, half * 2 + 1, half * 2 + 1);
    setSampleSource({
      imageData: region,
      centerX: Math.floor(sourceX) - left,
      centerY: Math.floor(sourceY) - top,
    });
  }

  async function copyHex(hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      window.setTimeout(() => setCopiedHex((current) => (current === hex ? null : current)), 1200);
    } catch {
      // Clipboard unavailable (insecure context, permissions); silently skip
    }
  }

  function selectMode(next: PickerMode) {
    setMode(next);
    setView("picker");
  }
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [samplePoint, setSamplePoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [hasEyeDropper, setHasEyeDropper] = useState(false);

  useEffect(() => {
    setHasEyeDropper(typeof window !== "undefined" && "EyeDropper" in window);
  }, []);

  const openEyeDropper = useCallback(async () => {
    if (!hasEyeDropper) return;
    try {
      const eyeDropper = new (
        window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }
      ).EyeDropper();
      const result = await eyeDropper.open();
      const hex = result.sRGBHex;
      setSelectedHex(hex);
      setHexDraft(hex);
    } catch {
      // User cancelled
    }
  }, [hasEyeDropper]);

  const matches = useMemo(
    () =>
      getClosestColors(
        selectedHex,
        colors,
        settings.matchCount,
        settings.weights,
        settings.hueBias,
      ),
    [colors, selectedHex, settings.matchCount, settings.weights, settings.hueBias],
  );
  const primaryColorName = useMemo(() => getPrimaryColorName(selectedHex), [selectedHex]);

  const [wordQuery, setWordQuery] = useState("");
  const wordSearch = useWordSearch({
    query: wordQuery,
    library: colors,
    tfidf,
    expander,
    distillation: distillationLookup as DistillationLookup,
    embedder: TransformersEmbedder,
    semanticThreshold: settings.wordMode.semanticThreshold,
    topN: settings.matchCount,
  });

  useEffect(() => {
    saveLastColor(selectedHex);
  }, [selectedHex]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  function updateColor(value: string) {
    const normalized = normalizeHex(value);

    setHexDraft(normalized);

    if (isValidHex(normalized)) {
      setSelectedHex(normalized);
    }
  }

  function resetInvalidDraft() {
    if (!isValidHex(normalizeHex(hexDraft))) {
      setHexDraft(selectedHex);
    }
  }

  function setColor(hex: string) {
    const normalized = normalizeHex(hex);

    if (!isValidHex(normalized)) {
      return;
    }

    setSelectedHex(normalized);
    setHexDraft(normalized);
  }

  function loadImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }

      setImageUrl(reader.result);
      setSamplePoint(null);
      setMode("image");
    };
    reader.readAsDataURL(file);
  }

  function onPasteImage(event: React.ClipboardEvent<HTMLElement>) {
    const item = Array.from(event.clipboardData.items).find((entry) =>
      entry.type.startsWith("image/"),
    );

    if (!item) {
      return;
    }

    const file = item.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    loadImageFile(file);
  }

  const [isSampling, setIsSampling] = useState(false);

  function sampleFromImage(clientX: number, clientY: number) {
    const image = imageRef.current;
    const canvas = sampleCanvasRef.current;

    if (!image || !canvas) {
      return;
    }

    const rect = image.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);

    const sourceX = Math.floor((x / rect.width) * image.naturalWidth);
    const sourceY = Math.floor((y / rect.height) * image.naturalHeight);

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    context.drawImage(image, 0, 0);
    const hex = sampleAverageColor(context, sourceX, sourceY, settings.sampleKernel);

    captureSampleSource(context, sourceX, sourceY, image.naturalWidth, image.naturalHeight);
    setSamplePoint({ x, y });
    setColor(hex);
  }

  const handleImagePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    // Prevent default browser drag behavior
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    setIsSampling(true);
    sampleFromImage(event.clientX, event.clientY);
  };

  const handleImagePointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (isSampling) {
      sampleFromImage(event.clientX, event.clientY);
    }
  };

  const handleImagePointerUp = () => {
    setIsSampling(false);
  };

  // Update CSS variables for highlight color
  useEffect(() => {
    document.documentElement.style.setProperty("--highlight", selectedHex);
    document.documentElement.style.setProperty(
      "--highlight-dim",
      selectedHex === "#ffe66d"
        ? "#d9c452" // yellow variant
        : selectedHex === "#4ecdc4"
          ? "#3db8af" // teal variant
          : selectedHex === "#95e1d3"
            ? "#76bcb0" // mint variant
            : selectedHex === "#ff6b6b"
              ? "#d95252" // red variant
              : selectedHex,
    );
    document.documentElement.style.setProperty(
      "--highlight-pale",
      selectedHex === "#ffe66d"
        ? "#fff8db"
        : selectedHex === "#4ecdc4"
          ? "#e0f7f6"
          : selectedHex === "#95e1d3"
            ? "#ebf8f4"
            : selectedHex === "#ff6b6b"
              ? "#fcebeb"
              : selectedHex,
    );
  }, [selectedHex]);

  return (
    <main className="app-shell" onPaste={onPasteImage}>
      <section className="picker-surface" aria-labelledby="app-title">
        <div className="intro">
          <p className="eyebrow">Colour Thesaurus</p>
          <h1 id="app-title">A Colour</h1>
        </div>

        <div className="mode-row" role="group" aria-label="Picker mode">
          <button
            type="button"
            className={`mode-btn ${view === "picker" && mode === "swatch" ? "is-active" : ""}`}
            aria-pressed={view === "picker" && mode === "swatch"}
            aria-label="Swatch"
            onClick={() => selectMode("swatch")}
          >
            <Palette className="mode-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="mode-label">Swatch</span>
          </button>
          <button
            type="button"
            className={`mode-btn ${view === "picker" && mode === "image" ? "is-active" : ""}`}
            aria-pressed={view === "picker" && mode === "image"}
            aria-label="Image"
            onClick={() => selectMode("image")}
          >
            <ImageIcon className="mode-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="mode-label">Image</span>
          </button>
          <button
            type="button"
            className={`mode-btn ${view === "picker" && mode === "camera" ? "is-active" : ""}`}
            aria-pressed={view === "picker" && mode === "camera"}
            aria-label="Camera"
            onClick={() => selectMode("camera")}
          >
            <Camera className="mode-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="mode-label">Camera</span>
          </button>
          <button
            type="button"
            className={`mode-btn ${view === "picker" && mode === "word" ? "is-active" : ""}`}
            aria-pressed={view === "picker" && mode === "word"}
            aria-label="Word"
            onClick={() => selectMode("word")}
          >
            <Type className="mode-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="mode-label">Word</span>
          </button>
        </div>

        <div className="picker-grid">
          <div className="swatch-panel">
            {/* Camera always-mounted when in camera mode, hidden when in settings/about so the MediaStream survives view toggles. */}
            {mode === "camera" && (
              <div className={`camera-shell ${view === "picker" ? "" : "is-hidden"}`}>
                <CameraPicker
                  onColorSelect={setColor}
                  onSampleSource={setSampleSource}
                  sampleKernel={settings.sampleKernel}
                />
              </div>
            )}
            {
              view === "settings" ? (
                <SettingsPanel
                  settings={settings}
                  sampleSource={sampleSource}
                  onChange={setSettings}
                  libraryName={libraryName}
                  libraryCount={colors.length}
                  isCustomLibrary={customLibrary !== null}
                  onLoadLibrary={loadCustomLibrary}
                  onResetLibrary={resetLibrary}
                />
              ) : view === "about" ? (
                <AboutPanel />
              ) : mode === "swatch" ? (
                <>
                  <ColorPicker color={selectedHex} onChange={updateColor} />
                  <p className="hex-description">Click the swatch to pick a colour.</p>

                  <div className="hex-field">
                    <label className="hex-label" htmlFor="hex-input">
                      Hex
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="hex-input"
                        className="hex-input flex-1"
                        type="text"
                        value={hexDraft}
                        maxLength={7}
                        spellCheck={false}
                        aria-describedby="hex-input-hint"
                        onBlur={resetInvalidDraft}
                        onChange={(event) => updateColor(event.target.value)}
                      />
                      {hasEyeDropper && (
                        <Button
                          onClick={openEyeDropper}
                          className="h-[42px] w-[42px] p-0 bg-transparent text-[var(--silver)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors border border-[var(--ghost)] rounded-none"
                          aria-label="Eye dropper"
                        >
                          <Pipette size={18} strokeWidth={1.5} />
                        </Button>
                      )}
                    </div>
                    <p id="hex-input-hint" className="hex-description">
                      Sample or type hex directly.
                    </p>
                  </div>
                </>
              ) : mode === "word" ? (
                <WordPicker
                  query={wordQuery}
                  onQueryChange={setWordQuery}
                  encoderState={wordSearch.encoderState}
                  hasQuery={wordSearch.hasQuery}
                />
              ) : mode === "image" ? (
                <div className="image-picker">
                  <input
                    ref={imageInputRef}
                    className="native-color-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        loadImageFile(file);
                      }
                    }}
                  />
                  {imageUrl ? (
                    <div className="image-stage-container">
                      <div className="image-stage">
                        <img
                          ref={imageRef}
                          src={imageUrl}
                          alt="Image to sample colours from"
                          className="sample-image"
                          draggable={false}
                          onPointerDown={handleImagePointerDown}
                          onPointerMove={handleImagePointerMove}
                          onPointerUp={handleImagePointerUp}
                          onPointerCancel={handleImagePointerUp}
                        />
                        {samplePoint ? (
                          <span
                            className="sample-dot"
                            style={{ left: samplePoint.x, top: samplePoint.y }}
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      <Button
                        onClick={() => imageInputRef.current?.click()}
                        className="image-action-btn"
                        aria-label="Upload new image"
                      >
                        <Upload size={14} strokeWidth={1.5} />
                        <span>Open New Image</span>
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="paste-target"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      Paste an image or click to upload
                    </button>
                  )}
                  <p className="hex-description">Click the image to sample a pixel colour.</p>
                </div>
              ) : null /* camera rendered above the ladder so it survives view changes */
            }
            <canvas ref={sampleCanvasRef} className="hidden-canvas" />
          </div>

          {view === "picker" && mode === "word" ? (
            <WordFindings
              search={wordSearch}
              onSuggestionClick={setWordQuery}
              onColorSelect={setColor}
            />
          ) : (
            <ol className="matches" aria-label="Likely colour names">
              <li className="primary-family" aria-live="polite">
                Closest primary colour: <strong>{primaryColorName}</strong>
              </li>
              {matches.map((match, index) => (
                <li className="match-card" key={match.id}>
                  <button
                    type="button"
                    className="match-select"
                    onClick={() => setColor(match.hex)}
                  >
                    <span className="match-rank">{index + 1}</span>
                    <span
                      className="match-swatch"
                      style={{ backgroundColor: match.hex }}
                      aria-hidden="true"
                    />
                    <span className="match-copy">
                      <span className="match-name">{match.name}</span>
                      <span className="match-hex">{match.hex}</span>
                    </span>
                    <span className="sr-only">{match.closeness}% match</span>
                  </button>
                  <button
                    type="button"
                    className={`match-copy-btn ${copiedHex === match.hex ? "is-copied" : ""}`}
                    aria-label={`Copy ${match.hex}`}
                    onClick={() => copyHex(match.hex)}
                  >
                    {copiedHex === match.hex ? (
                      <Check size={14} strokeWidth={1.8} aria-hidden="true" />
                    ) : (
                      <Clipboard size={14} strokeWidth={1.5} aria-hidden="true" />
                    )}
                  </button>
                  <span className="match-meter" aria-hidden="true">
                    <span style={{ width: `${match.closeness}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <footer className="brand-link">
        <div className="footer-tools">
          <button
            type="button"
            className={`footer-btn ${view === "settings" ? "is-active" : ""}`}
            aria-pressed={view === "settings"}
            aria-label="Settings"
            onClick={() => setView(view === "settings" ? "picker" : "settings")}
          >
            <SettingsIcon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="footer-btn-label">Settings</span>
          </button>
          <button
            type="button"
            className={`footer-btn ${view === "about" ? "is-active" : ""}`}
            aria-pressed={view === "about"}
            aria-label="About"
            onClick={() => setView(view === "about" ? "picker" : "about")}
          >
            <HelpCircle size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="footer-btn-label">About</span>
          </button>
        </div>
        <a href="https://preset.nz" target="_blank" rel="noopener noreferrer">
          preset.nz
        </a>
      </footer>
    </main>
  );
}

export default App;
