import { useEffect, useMemo, useRef, useState } from 'react'
import colorsCsv from '../guidance/references/colors.csv?raw'
import './App.css'
import { Button } from '@/components/ui/button'
import {
  type ColorMatch,
  getClosestColors,
  getPrimaryColorName,
  isValidHex,
  normalizeHex,
  parseColorCsv,
} from '@/lib/color-matcher'

const initialColor = '#5d8aa8'
type PickerMode = 'swatch' | 'image' | 'name'

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
  const [nameQuery, setNameQuery] = useState('')
  const [nameMatches, setNameMatches] = useState<ColorMatch[]>([])
  const [nameVariants, setNameVariants] = useState<string[]>([])
  const [nameStatus, setNameStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  )
  const [samplePoint, setSamplePoint] = useState<{ x: number; y: number } | null>(
    null,
  )

  const hexMatches = useMemo(
    () => getClosestColors(selectedHex, colors, 3),
    [colors, selectedHex],
  )
  const nameQueryTrimmed = nameQuery.trim()
  const matches = mode === 'name' ? (nameQueryTrimmed ? nameMatches : []) : hexMatches
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

  function onNameQueryChange(value: string) {
    setNameQuery(value)
    setNameStatus(value.trim() ? 'loading' : 'idle')
  }

  useEffect(() => {
    if (mode !== 'name') {
      return
    }

    const query = nameQueryTrimmed
    if (!query) {
      return
    }

    let active = true
    void (async () => {
      const { searchColorNames } = await import('@/lib/name-search')
      return searchColorNames(query, colors)
    })()
      .then(({ matches: rankedMatches, variants }) => {
        if (!active) {
          return
        }

        setNameMatches(rankedMatches)
        setNameVariants(variants)
        setNameStatus('ready')

        if (rankedMatches[0]) {
          setColor(rankedMatches[0].hex)
        }
      })
      .catch(() => {
        if (!active) {
          return
        }

        setNameMatches([])
        setNameVariants([])
        setNameStatus('error')
      })

    return () => {
      active = false
    }
  }, [colors, mode, nameQueryTrimmed])

  return (
    <main className="app-shell" onPaste={onPasteImage}>
      <section className="picker-surface" aria-labelledby="app-title">
        <div className="intro">
          <p className="eyebrow">Color Trickser</p>
          <h1 id="app-title">Name this color</h1>
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
          <button
            type="button"
            className={`mode-btn ${mode === 'name' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={mode === 'name'}
            onClick={() => setMode('name')}
          >
            Name
          </button>
        </div>

        <div className="picker-grid">
          <div className="swatch-panel">
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
                >
                  <span>{selectedHex}</span>
                </Button>
              </>
            ) : mode === 'image' ? (
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
            ) : (
              <div className="name-picker">
                <label className="hex-label" htmlFor="name-query">
                  Color meaning
                </label>
                <input
                  id="name-query"
                  className="name-input"
                  type="text"
                  value={nameQuery}
                  placeholder="sunset"
                  onChange={(event) => onNameQueryChange(event.target.value)}
                />
                <p className="hex-description">
                  Type a concept or color word to find the closest names.
                </p>
                <p className="hex-description" aria-live="polite">
                  {nameQueryTrimmed
                    ? nameStatus === 'loading'
                      ? 'Searching with the model...'
                      : nameStatus === 'error'
                        ? 'Model search failed. Using the direct name index only.'
                        : nameVariants.length > 0
                          ? `Model variants: ${nameVariants.join(', ')}`
                          : 'The model will suggest related search terms.'
                    : 'Type a concept or color word to find the closest names.'}
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
                {mode === 'swatch'
                  ? 'Click the swatch or type a six digit hex color.'
                  : 'Paste image (Cmd/Ctrl+V), sample, or type hex directly.'}
              </p>
            </div>
          </div>

          <ol className="matches" aria-label="Likely color names">
            <li className="primary-family" aria-live="polite">
              Closest primary color: <strong>{primaryColorName}</strong>
            </li>
            {mode === 'name' && nameQueryTrimmed.length === 0 ? (
              <li className="primary-family">Type a color idea to see top matches.</li>
            ) : null}
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
    </main>
  )
}

export default App
