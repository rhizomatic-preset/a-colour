import { useEffect, useMemo, useRef, useState } from 'react'
import colorsCsv from '../guidance/references/colors.csv?raw'
import { Button } from '@/components/ui/button'
import {
  getClosestColors,
  getPrimaryColorName,
  isValidHex,
  normalizeHex,
  parseColorCsv,
} from '@/lib/color-matcher'

const initialColor = '#5d8aa8'
type PickerMode = 'swatch' | 'image'

function App() {
  const colorInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useMemo(() => parseColorCsv(colorsCsv), [])
  const [selectedHex, setSelectedHex] = useState(initialColor)
  const [hexDraft, setHexDraft] = useState(initialColor)



  const [mode, setMode] = useState<PickerMode>('swatch')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [samplePoint, setSamplePoint] = useState<{ x: number; y: number } | null>(
    null,
  )

  const matches = useMemo(
    () => getClosestColors(selectedHex, colors, 3),
    [colors, selectedHex],
  )
  const primaryColorName = useMemo(
    () => getPrimaryColorName(selectedHex),
    [selectedHex],
  )

  function updateColor(value: string) {
    const normalized = normalizeHex(value)

    setHexDraft(normalized)

    if (isValidHex(normalized)) {
      setSelectedHex(normalized)
    }
  }

  function resetInvalidDraft() {
    if (!isValidHex(normalizeHex(hexDraft))) {
      setHexDraft(selectedHex)
    }
  }

  function setColor(hex: string) {
    const normalized = normalizeHex(hex)

    if (!isValidHex(normalized)) {
      return
    }

    setSelectedHex(normalized)
    setHexDraft(normalized)
  }

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return
      }

      setImageUrl(reader.result)
      setSamplePoint(null)
      setMode('image')
    }
    reader.readAsDataURL(file)
  }

  function onPasteImage(event: React.ClipboardEvent<HTMLElement>) {
    const item = Array.from(event.clipboardData.items).find((entry) =>
      entry.type.startsWith('image/'),
    )

    if (!item) {
      return
    }

    const file = item.getAsFile()
    if (!file) {
      return
    }

    event.preventDefault()
    loadImageFile(file)
  }

  function sampleFromImage(event: React.MouseEvent<HTMLImageElement>) {
    const image = imageRef.current
    const canvas = sampleCanvasRef.current

    if (!image || !canvas) {
      return
    }

    const rect = image.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)

    const sourceX = Math.floor((x / rect.width) * image.naturalWidth)
    const sourceY = Math.floor((y / rect.height) * image.naturalHeight)

    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return
    }

    context.drawImage(image, 0, 0)
    const pixel = context.getImageData(sourceX, sourceY, 1, 1).data
    const hex = `#${[pixel[0], pixel[1], pixel[2]]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')}`

    setSamplePoint({ x, y })
    setColor(hex)
  }

  // Update CSS variables for highlight color
  useEffect(() => {
    document.documentElement.style.setProperty('--highlight', selectedHex)
    document.documentElement.style.setProperty('--highlight-dim', 
      selectedHex === '#ffe66d' ? '#d9c452' : // yellow variant
      selectedHex === '#4ecdc4' ? '#3db8af' :  // teal variant
      selectedHex === '#95e1d3' ? '#76bcb0' :   // mint variant
      selectedHex === '#ff6b6b' ? '#d95252' :  // red variant
      selectedHex
    )
    document.documentElement.style.setProperty('--highlight-pale', 
      selectedHex === '#ffe66d' ? '#fff8db' :
      selectedHex === '#4ecdc4' ? '#e0f7f6' :
      selectedHex === '#95e1d3' ? '#ebf8f4' :
      selectedHex === '#ff6b6b' ? '#fcebeb' :
      selectedHex
    )
  }, [selectedHex])

  return (
    <main className="app-shell" onPaste={onPasteImage}>
      <section className="picker-surface" aria-labelledby="app-title">
        <div className="intro">
          <p className="eyebrow">Color Trickser</p>
          <h1 id="app-title">Pick a color</h1>
        </div>

        <div className="mode-row" role="tablist" aria-label="Picker mode">
          <button
            type="button"
            className={`mode-btn ${mode === 'swatch' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={mode === 'swatch'}
            onClick={() => setMode('swatch')}
          >
            Swatch
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'image' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={mode === 'image'}
            onClick={() => setMode('image')}
          >
            Image
          </button>
        </div>

        <div className="picker-grid">
          <div key={`${mode}-panel`} className="swatch-panel">
            {mode === 'swatch' ? (
              <>
                <input
                  ref={colorInputRef}
                  className="native-color-input"
                  type="color"
                  value={selectedHex}
                  aria-label="Pick color"
                  onChange={(event) => updateColor(event.target.value)}
                />
                <Button
                  type="button"
                  className="main-swatch"
                  style={{ backgroundColor: selectedHex }}
                  aria-label={`Pick a color. Current color is ${selectedHex}.`}
                  onClick={() => colorInputRef.current?.click()}
                />
                <p className="hex-description">
                  Click the swatch to pick a color from your system picker.
                </p>
              </>
            ) : (
              <div className="image-picker">
                <input
                  ref={imageInputRef}
                  className="native-color-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      loadImageFile(file)
                    }
                  }}
                />
                {imageUrl ? (
                  <div className="image-stage">
                    <img
                      ref={imageRef}
                      src={imageUrl}
                      alt="Pasted source"
                      className="sample-image"
                      onClick={sampleFromImage}
                    />
                    {samplePoint ? (
                      <span
                        className="sample-dot"
                        style={{ left: samplePoint.x, top: samplePoint.y }}
                        aria-hidden="true"
                      />
                    ) : null}
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
                <p className="hex-description">
                  Click the image to sample a pixel color.
                </p>
              </div>
            )}
            <canvas ref={sampleCanvasRef} className="hidden-canvas" />

            <div className="hex-field">
              <label className="hex-label" htmlFor="hex-input">
                Hex
              </label>
              <input
                id="hex-input"
                className="hex-input"
                type="text"
                value={hexDraft}
                maxLength={7}
                spellCheck={false}
                onBlur={resetInvalidDraft}
                onChange={(event) => updateColor(event.target.value)}
              />
              <p className="hex-description">
                Paste image (Cmd/Ctrl+V), sample, or type hex directly.
              </p>
            </div>
          </div>

          <ol className="matches" aria-label="Likely color names">
            <li className="primary-family" aria-live="polite">
              Closest primary color: <strong>{primaryColorName}</strong>
            </li>
            {matches.map((match, index) => (
              <li className="match-card" key={match.id}>
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
                <span
                  className="match-meter"
                  aria-label={`${match.closeness}% visual closeness`}
                >
                  <span style={{ width: `${match.closeness}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="brand-link">
        <a href="https://preset.nz" target="_blank" rel="noopener noreferrer">
          preset.nz
        </a>
      </footer>
    </main>
  )
}

export default App
