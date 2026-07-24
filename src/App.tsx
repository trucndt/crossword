import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import {
  Check,
  Download,
  FilePlus2,
  Palette,
  Printer,
  Ruler,
  Share2,
  Shuffle,
  TriangleAlert,
  Type,
} from 'lucide-react'
import { CrosswordGrid } from './components/CrosswordGrid'
import { CrosswordPlayer } from './components/CrosswordPlayer'
import {
  generateCrossword,
  parseEntries,
  type CrosswordLayout,
  type Orientation,
} from './lib/crossword'
import {
  getPrintFit,
  getPrintGeometry,
  INSERT_PADDING_MM,
  PAGE_DIMENSIONS_MM,
  type PrintPageSize,
  type PrintSettings,
} from './lib/print'
import {
  createPlayUrl,
  decodeSharedPuzzle,
  type SharedPuzzle,
} from './lib/share'
import './studio.css'

type EditorTab = 'content' | 'print'
type PreviewMode = 'puzzle' | 'answer-key'
type MeasurementUnit = 'in' | 'cm'

interface Draft extends Omit<PrintSettings, 'title' | 'note'> {
  title: string
  note: string
  source: string
}

const STORAGE_KEY = 'cardword-draft-v3'
const MIN_LONG_EDGE_MM = 50
const MAX_LONG_EDGE_MM = 150

const CARD_INSERTS = [
  {
    id: '4x6',
    label: 'Fits a 4 x 6 in card (3.5 x 5.5 insert)',
    widthMm: 88.9,
    heightMm: 139.7,
  },
  {
    id: '5x7',
    label: 'Fits a 5 x 7 in card (4.5 x 6.5 insert)',
    widthMm: 114.3,
    heightMm: 165.1,
  },
  {
    id: 'half-letter',
    label: 'Fits a half-letter card (5 x 8 insert)',
    widthMm: 127,
    heightMm: 203.2,
  },
] as const

const DEFAULT_DRAFT: Draft = {
  title: 'A Birthday Crossword',
  note: 'Made especially for you',
  showTitle: true,
  showNote: true,
  source: `BIRTHDAY | A day worth celebrating
CANDLES | Count them before the wish
CAKE | A sweet centerpiece
PARTY | A reason to gather
PRESENT | Something wrapped with care
WISH | Make one before you blow
YEAR | Another trip around the sun
CARD | You are holding one
FRIENDS | The best people to celebrate with
SMILE | What this puzzle hopes to bring`,
  pageSize: 'letter',
  longEdgeMm: 80,
  insertWidthMm: 114.3,
  insertHeightMm: 165.1,
  clueFontSizePt: 9,
  accent: '#d6533f',
  includeAnswerKey: true,
  trimMarks: true,
}

const ACCENTS = [
  { name: 'Coral', value: '#d6533f' },
  { name: 'Evergreen', value: '#24705f' },
  { name: 'Marigold', value: '#b87516' },
  { name: 'Blue', value: '#246d8a' },
]

function loadDraft(): Draft {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_DRAFT
    return { ...DEFAULT_DRAFT, ...(JSON.parse(stored) as Partial<Draft>) }
  } catch {
    return DEFAULT_DRAFT
  }
}

function ClueColumn({
  layout,
  orientation,
}: {
  layout: CrosswordLayout
  orientation: Orientation
}) {
  const entries = layout.placed.filter(
    (entry) => entry.orientation === orientation,
  )

  return (
    <section className="clue-column" aria-label={`${orientation} clues`}>
      <h3>{orientation}</h3>
      <ol>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span>{entry.position}</span>
            <p>{entry.clue}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Studio() {
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [editorTab, setEditorTab] = useState<EditorTab>('content')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('puzzle')
  const [unit, setUnit] = useState<MeasurementUnit>('in')
  const [layoutSeed, setLayoutSeed] = useState(1)
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  )
  const deferredSource = useDeferredValue(draft.source)
  const isUpdating = deferredSource !== draft.source

  const parsed = useMemo(() => parseEntries(deferredSource), [deferredSource])
  const layout = useMemo(
    () => generateCrossword(parsed.entries, layoutSeed),
    [parsed.entries, layoutSeed],
  )
  const geometry = layout ? getPrintGeometry(layout, draft) : null
  const printFit = layout ? getPrintFit(layout, draft) : null
  const metrics = geometry?.grid ?? null
  const page = PAGE_DIMENSIONS_MM[draft.pageSize]
  const maxGridLongEdgeMm = Math.max(
    MIN_LONG_EDGE_MM,
    Math.min(MAX_LONG_EDGE_MM, draft.insertWidthMm - INSERT_PADDING_MM * 2),
  )

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  }, [draft])

  const updateDraft = (changes: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }

  const formatMeasurement = (millimeters: number) => {
    const converted = unit === 'in' ? millimeters / 25.4 : millimeters / 10
    return `${converted.toFixed(unit === 'in' ? 2 : 1)} ${unit}`
  }

  const displayedLongEdge =
    unit === 'in' ? draft.longEdgeMm / 25.4 : draft.longEdgeMm / 10

  const setDisplayedLongEdge = (value: number) => {
    if (!Number.isFinite(value)) return
    const millimeters = unit === 'in' ? value * 25.4 : value * 10
    updateDraft({
      longEdgeMm: Math.min(
        maxGridLongEdgeMm,
        Math.max(MIN_LONG_EDGE_MM, millimeters),
      ),
    })
  }

  const toDisplayUnit = (millimeters: number) =>
    unit === 'in' ? millimeters / 25.4 : millimeters / 10

  const setInsertSize = (widthMm: number, heightMm: number) => {
    setDraft((current) => ({
      ...current,
      insertWidthMm: widthMm,
      insertHeightMm: heightMm,
      longEdgeMm: Math.min(
        current.longEdgeMm,
        widthMm - INSERT_PADDING_MM * 2,
      ),
    }))
  }

  const setInsertDimension = (
    dimension: 'insertWidthMm' | 'insertHeightMm',
    value: number,
  ) => {
    if (!Number.isFinite(value)) return
    const millimeters = unit === 'in' ? value * 25.4 : value * 10
    const pageLimit =
      dimension === 'insertWidthMm' ? page.width - 20 : page.height - 20
    const minimum = dimension === 'insertWidthMm' ? 76.2 : 101.6
    const nextValue = Math.min(pageLimit, Math.max(minimum, millimeters))

    setDraft((current) => {
      const next = { ...current, [dimension]: nextValue }
      return dimension === 'insertWidthMm'
        ? {
            ...next,
            longEdgeMm: Math.min(
              next.longEdgeMm,
              nextValue - INSERT_PADDING_MM * 2,
            ),
          }
        : next
    })
  }

  const selectedInsert = CARD_INSERTS.find(
    ({ widthMm, heightMm }) =>
      Math.abs(widthMm - draft.insertWidthMm) < 0.1 &&
      Math.abs(heightMm - draft.insertHeightMm) < 0.1,
  )

  const handleFitContent = () => {
    if (!layout) return

    for (
      let clueFontSizePt = draft.clueFontSizePt;
      clueFontSizePt >= 7;
      clueFontSizePt -= 1
    ) {
      for (
        let longEdgeMm = Math.floor(
          Math.min(draft.longEdgeMm, maxGridLongEdgeMm),
        );
        longEdgeMm >= MIN_LONG_EDGE_MM;
        longEdgeMm -= 1
      ) {
        const candidate = { ...draft, clueFontSizePt, longEdgeMm }
        if (getPrintFit(layout, candidate).fits) {
          updateDraft({ clueFontSizePt, longEdgeMm })
          return
        }
      }
    }
  }

  const handleNew = () => {
    const shouldReset = window.confirm(
      'Start a new puzzle? Your current draft will be replaced.',
    )
    if (!shouldReset) return
    setDraft(DEFAULT_DRAFT)
    setLayoutSeed(1)
    setEditorTab('content')
    setPreviewMode('puzzle')
  }

  const handleExportPdf = async () => {
    if (!layout || isUpdating) return
    const { exportCrosswordPdf } = await import('./lib/pdf')
    exportCrosswordPdf(layout, draft)
  }

  const handleExportSvg = async () => {
    if (!layout || isUpdating) return
    const { exportCrosswordSvg } = await import('./lib/svg')
    exportCrosswordSvg(layout, draft)
  }

  const handleCopyPlayLink = async () => {
    if (!layout || isUpdating) return
    const puzzle: SharedPuzzle = {
      version: 1,
      title: draft.title,
      note: draft.note,
      showTitle: draft.showTitle,
      showNote: draft.showNote,
      source: draft.source,
      accent: draft.accent,
      layoutSeed,
    }
    const url = createPlayUrl(puzzle)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const input = document.createElement('textarea')
        input.value = url
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.append(input)
        input.select()
        const copied = document.execCommand('copy')
        input.remove()
        if (!copied) throw new Error('Copy failed')
      }
      setShareState('copied')
    } catch {
      setShareState('error')
    }
  }

  const previewGridWidth = metrics
    ? `${Math.min(100, (metrics.widthMm / (geometry?.contentWidth ?? draft.insertWidthMm)) * 100)}%`
    : '100%'
  const pageStyle = {
    '--page-ratio': `${page.width} / ${page.height}`,
    '--print-accent': draft.accent,
  } as CSSProperties
  const insertStyle = {
    '--insert-width': `${(draft.insertWidthMm / page.width) * 100}%`,
    '--insert-height': `${(draft.insertHeightMm / page.height) * 100}%`,
    '--insert-ratio': `${draft.insertWidthMm} / ${draft.insertHeightMm}`,
    '--insert-padding': `${(INSERT_PADDING_MM / draft.insertWidthMm) * 100}%`,
    '--clue-font-cqi':
      (draft.clueFontSizePt * 35.2778) / draft.insertWidthMm,
  } as CSSProperties

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup" aria-label="Cardword">
          <span className="brand-mark" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} />
            ))}
          </span>
          <span className="brand-copy">
            <strong>Cardword</strong>
            <small>Print studio</small>
          </span>
        </div>

        <div className="header-actions">
          <span className="save-state">
            <Check size={14} aria-hidden="true" /> Saved locally
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={handleNew}
            aria-label="Start a new puzzle"
            title="New puzzle"
          >
            <FilePlus2 size={19} aria-hidden="true" />
          </button>
          <button
            className="share-button"
            type="button"
            onClick={handleCopyPlayLink}
            disabled={!layout || layout.placed.length < 2 || isUpdating}
            title="Copy interactive puzzle link"
          >
            {shareState === 'copied' ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <Share2 size={17} aria-hidden="true" />
            )}
            <span className="share-label">
              {shareState === 'copied'
                ? 'Link copied'
                : shareState === 'error'
                  ? 'Copy failed'
                  : 'Copy play link'}
            </span>
          </button>
          <div className="export-actions" aria-label="Export puzzle">
            <button
              className="export-button"
              type="button"
              onClick={handleExportPdf}
              disabled={
                !layout ||
                layout.placed.length < 2 ||
                isUpdating ||
                !printFit?.fits
              }
            >
              <Download size={17} aria-hidden="true" />
              PDF
            </button>
            <button
              className="export-button is-secondary"
              type="button"
              onClick={handleExportSvg}
              disabled={
                !layout ||
                layout.placed.length < 2 ||
                isUpdating ||
                !printFit?.fits
              }
            >
              <Download size={17} aria-hidden="true" />
              SVG
            </button>
          </div>
        </div>
      </header>

      <main className="studio-layout">
        <aside className="editor-pane" aria-label="Crossword editor">
          <div className="editor-tabs" role="tablist" aria-label="Editor sections">
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === 'content'}
              onClick={() => setEditorTab('content')}
            >
              <Type size={16} aria-hidden="true" /> Content
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === 'print'}
              onClick={() => setEditorTab('print')}
            >
              <Printer size={16} aria-hidden="true" /> Print setup
            </button>
          </div>

          {editorTab === 'content' ? (
            <div className="editor-panel" role="tabpanel">
              <div className="panel-heading">
                <p className="eyebrow">Puzzle</p>
                <h2>Words for the occasion</h2>
              </div>

              <div
                className={`form-field header-field${draft.showTitle ? '' : ' is-hidden'}`}
              >
                <span className="field-label-row">
                  <label htmlFor="puzzle-title">Title</label>
                  <label className="field-visibility">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={draft.showTitle}
                      onChange={(event) =>
                        updateDraft({ showTitle: event.target.checked })
                      }
                      aria-label="Show title"
                    />
                    <span className="visibility-track" aria-hidden="true">
                      <span />
                    </span>
                    <span>{draft.showTitle ? 'Shown' : 'Hidden'}</span>
                  </label>
                </span>
                <input
                  id="puzzle-title"
                  type="text"
                  value={draft.title}
                  disabled={!draft.showTitle}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                  maxLength={80}
                />
              </div>

              <div
                className={`form-field header-field${draft.showNote ? '' : ' is-hidden'}`}
              >
                <span className="field-label-row">
                  <label htmlFor="puzzle-note">Note</label>
                  <label className="field-visibility">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={draft.showNote}
                      onChange={(event) =>
                        updateDraft({ showNote: event.target.checked })
                      }
                      aria-label="Show note"
                    />
                    <span className="visibility-track" aria-hidden="true">
                      <span />
                    </span>
                    <span>{draft.showNote ? 'Shown' : 'Hidden'}</span>
                  </label>
                </span>
                <input
                  id="puzzle-note"
                  type="text"
                  value={draft.note}
                  disabled={!draft.showNote}
                  onChange={(event) => updateDraft({ note: event.target.value })}
                  maxLength={120}
                />
              </div>

              <label className="form-field entries-field" htmlFor="puzzle-entries">
                <span className="field-label-row">
                  <span>Answers &amp; clues</span>
                  <span>{parsed.entries.length}/40</span>
                </span>
                <textarea
                  id="puzzle-entries"
                  value={draft.source}
                  onChange={(event) => updateDraft({ source: event.target.value })}
                  placeholder="BIRTHDAY | A day worth celebrating"
                  spellCheck="true"
                />
              </label>

              <div className="source-summary" aria-live="polite">
                <span>
                  {isUpdating
                    ? 'Updating layout...'
                    : `${layout?.placed.length ?? 0} of ${parsed.entries.length} placed`}
                </span>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => setLayoutSeed((current) => current + 1)}
                  disabled={parsed.entries.length < 2 || isUpdating}
                >
                  <Shuffle size={15} aria-hidden="true" /> Reflow
                </button>
              </div>

              {parsed.errors.length > 0 ? (
                <div className="editor-message is-error" role="status">
                  <TriangleAlert size={17} aria-hidden="true" />
                  <span>{parsed.errors.slice(0, 2).join(' ')}</span>
                </div>
              ) : null}

              {layout?.unplaced.length ? (
                <div className="editor-message is-warning" role="status">
                  <TriangleAlert size={17} aria-hidden="true" />
                  <span>
                    Could not cross: {layout.unplaced.map(({ answer }) => answer).join(', ')}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="editor-panel" role="tabpanel">
              <div className="panel-heading">
                <p className="eyebrow">PDF</p>
                <h2>Fit it to the card</h2>
              </div>

              {printFit && !printFit.fits ? (
                <div className="editor-message is-error fit-message" role="status">
                  <TriangleAlert size={17} aria-hidden="true" />
                  <span>
                    Content exceeds the insert. Enlarge it or reduce the grid or clue size.
                  </span>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={handleFitContent}
                  >
                    Fit content
                  </button>
                </div>
              ) : null}

              <fieldset className="setting-group">
                <legend>
                  <Ruler size={16} aria-hidden="true" /> Card insert
                </legend>
                <div className="segmented-control unit-control" aria-label="Measurement unit">
                  <button
                    type="button"
                    aria-pressed={unit === 'in'}
                    onClick={() => setUnit('in')}
                  >
                    Inches
                  </button>
                  <button
                    type="button"
                    aria-pressed={unit === 'cm'}
                    onClick={() => setUnit('cm')}
                  >
                    Centimeters
                  </button>
                </div>

                <label className="form-field" htmlFor="insert-preset">
                  <span>Cut-out preset</span>
                  <select
                    id="insert-preset"
                    value={selectedInsert?.id ?? 'custom'}
                    onChange={(event) => {
                      const preset = CARD_INSERTS.find(
                        ({ id }) => id === event.target.value,
                      )
                      if (preset) setInsertSize(preset.widthMm, preset.heightMm)
                    }}
                  >
                    {CARD_INSERTS.map((preset) => (
                      <option value={preset.id} key={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    <option value="custom">Custom size</option>
                  </select>
                </label>

                <div className="dimension-grid">
                  <label className="form-field">
                    <span>Width</span>
                    <span className="measurement-input dimension-input">
                      <input
                        type="number"
                        min={unit === 'in' ? 3 : 7.62}
                        max={toDisplayUnit(page.width - 20)}
                        step={unit === 'in' ? 0.05 : 0.1}
                        value={toDisplayUnit(draft.insertWidthMm).toFixed(
                          unit === 'in' ? 2 : 1,
                        )}
                        onChange={(event) =>
                          setInsertDimension(
                            'insertWidthMm',
                            Number(event.target.value),
                          )
                        }
                        aria-label="Card insert width"
                      />
                      <span>{unit}</span>
                    </span>
                  </label>
                  <label className="form-field">
                    <span>Height</span>
                    <span className="measurement-input dimension-input">
                      <input
                        type="number"
                        min={unit === 'in' ? 4 : 10.16}
                        max={toDisplayUnit(page.height - 20)}
                        step={unit === 'in' ? 0.05 : 0.1}
                        value={toDisplayUnit(draft.insertHeightMm).toFixed(
                          unit === 'in' ? 2 : 1,
                        )}
                        onChange={(event) =>
                          setInsertDimension(
                            'insertHeightMm',
                            Number(event.target.value),
                          )
                        }
                        aria-label="Card insert height"
                      />
                      <span>{unit}</span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset className="setting-group">
                <legend>
                  <Ruler size={16} aria-hidden="true" /> Grid size
                </legend>

                <div className="size-control">
                  <input
                    type="range"
                    min={MIN_LONG_EDGE_MM}
                    max={maxGridLongEdgeMm}
                    step="1"
                    value={draft.longEdgeMm}
                    onChange={(event) =>
                      updateDraft({ longEdgeMm: Number(event.target.value) })
                    }
                    aria-label="Puzzle long edge"
                    aria-valuetext={formatMeasurement(draft.longEdgeMm)}
                  />
                  <label className="measurement-input">
                    <span className="sr-only">Puzzle long edge</span>
                    <input
                      type="number"
                      min={toDisplayUnit(MIN_LONG_EDGE_MM)}
                      max={toDisplayUnit(maxGridLongEdgeMm)}
                      step={unit === 'in' ? 0.05 : 0.1}
                      value={displayedLongEdge.toFixed(unit === 'in' ? 2 : 1)}
                      onChange={(event) => setDisplayedLongEdge(Number(event.target.value))}
                    />
                    <span>{unit}</span>
                  </label>
                </div>

                <p className="measurement-readout">
                  Grid {metrics ? `${formatMeasurement(metrics.widthMm)} x ${formatMeasurement(metrics.heightMm)}` : '--'}
                </p>
              </fieldset>

              <fieldset className="setting-group">
                <legend>
                  <Type size={16} aria-hidden="true" /> Clue / hint size
                </legend>
                <div className="size-control">
                  <input
                    type="range"
                    min="7"
                    max="14"
                    step="1"
                    value={draft.clueFontSizePt}
                    onChange={(event) =>
                      updateDraft({ clueFontSizePt: Number(event.target.value) })
                    }
                    aria-label="Clue font size"
                    aria-valuetext={`${draft.clueFontSizePt} points`}
                  />
                  <label className="measurement-input">
                    <span className="sr-only">Clue font size</span>
                    <input
                      type="number"
                      min="7"
                      max="14"
                      step="1"
                      value={draft.clueFontSizePt}
                      onChange={(event) =>
                        updateDraft({
                          clueFontSizePt: Math.min(
                            14,
                            Math.max(7, Number(event.target.value)),
                          ),
                        })
                      }
                    />
                    <span>pt</span>
                  </label>
                </div>
              </fieldset>

              <label className="form-field" htmlFor="page-size">
                <span>Printer paper</span>
                <select
                  id="page-size"
                  value={draft.pageSize}
                  onChange={(event) =>
                    updateDraft({ pageSize: event.target.value as PrintPageSize })
                  }
                >
                  <option value="letter">US Letter (8.5 x 11 in)</option>
                  <option value="a4">A4 (210 x 297 mm)</option>
                </select>
              </label>

              <fieldset className="setting-group accent-setting">
                <legend>
                  <Palette size={16} aria-hidden="true" /> Accent
                </legend>
                <div className="swatch-row" role="radiogroup" aria-label="PDF accent color">
                  {ACCENTS.map((accent) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.accent === accent.value}
                      aria-label={accent.name}
                      title={accent.name}
                      className="color-swatch"
                      style={{ '--swatch-color': accent.value } as CSSProperties}
                      onClick={() => updateDraft({ accent: accent.value })}
                      key={accent.value}
                    >
                      {draft.accent === accent.value ? (
                        <Check size={16} aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="toggle-list">
                <label className="toggle-row">
                  <span>
                    <strong>Answer key</strong>
                    <small>Append a solved page</small>
                  </span>
                  <input
                    className="toggle-input"
                    type="checkbox"
                    checked={draft.includeAnswerKey}
                    onChange={(event) =>
                      updateDraft({ includeAnswerKey: event.target.checked })
                    }
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span />
                  </span>
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Cut guides</strong>
                    <small>Outline the full card insert</small>
                  </span>
                  <input
                    className="toggle-input"
                    type="checkbox"
                    checked={draft.trimMarks}
                    onChange={(event) =>
                      updateDraft({ trimMarks: event.target.checked })
                    }
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span />
                  </span>
                </label>
              </div>
            </div>
          )}
        </aside>

        <section className="preview-pane" aria-label="Puzzle preview">
          <header className="preview-toolbar">
            <div>
              <p className="eyebrow">Live preview</p>
              <p className="preview-measurement">
                {layout
                  ? `Cut-out ${formatMeasurement(draft.insertWidthMm)} x ${formatMeasurement(draft.insertHeightMm)}`
                  : 'No layout'}
              </p>
            </div>
            <div className="segmented-control preview-modes" aria-label="Preview mode">
              <button
                type="button"
                aria-pressed={previewMode === 'puzzle'}
                onClick={() => setPreviewMode('puzzle')}
              >
                Puzzle
              </button>
              <button
                type="button"
                aria-pressed={previewMode === 'answer-key'}
                onClick={() => setPreviewMode('answer-key')}
                disabled={!layout}
              >
                Answer key
              </button>
            </div>
          </header>

          <div className="preview-stage">
            {layout ? (
              <article className="paper-preview" style={pageStyle}>
                <div
                  className={`cutout-preview${printFit?.fits ? '' : ' is-overflowing'}`}
                  style={insertStyle}
                >
                  {draft.showTitle ||
                  (draft.showNote && draft.note.trim()) ||
                  previewMode === 'answer-key' ? (
                    <header className="paper-header">
                      {draft.showTitle ? (
                        <h1>{draft.title.trim() || 'Untitled Crossword'}</h1>
                      ) : null}
                      {draft.showNote && draft.note.trim() ? (
                        <p>{draft.note}</p>
                      ) : null}
                      {previewMode === 'answer-key' ? <span>Answer key</span> : null}
                    </header>
                  ) : null}

                  <CrosswordGrid
                    layout={layout}
                    showAnswers={previewMode === 'answer-key'}
                    style={{ width: previewGridWidth }}
                  />

                  <div className="paper-clues">
                    <ClueColumn layout={layout} orientation="across" />
                    <ClueColumn layout={layout} orientation="down" />
                  </div>
                </div>
              </article>
            ) : (
              <div className="empty-preview" role="status">
                <span className="empty-grid" aria-hidden="true" />
                <h2>No layout yet</h2>
                <p>At least two crossing answers are needed.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function SharedLinkError() {
  return (
    <main className="shared-link-error">
      <div>
        <h1>This puzzle link is not valid</h1>
        <p>
          The link may be incomplete or damaged. Ask its creator for a new play link.
        </p>
        <a href={window.location.pathname}>Open the puzzle maker</a>
      </div>
    </main>
  )
}

function App() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (!hash.startsWith('#play=')) return <Studio />

  const puzzle = decodeSharedPuzzle(hash)
  if (!puzzle) return <SharedLinkError />

  const parsed = parseEntries(puzzle.source)
  const layout = generateCrossword(parsed.entries, puzzle.layoutSeed)
  if (!layout || layout.placed.length < 2) return <SharedLinkError />

  return <CrosswordPlayer puzzle={puzzle} layout={layout} />
}

export default App
