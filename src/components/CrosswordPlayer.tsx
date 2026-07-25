import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { Check, CheckCircle2, Eraser, Pencil } from 'lucide-react'
import {
  getStartNumbers,
  type CrosswordLayout,
  type Orientation,
  type PlacedEntry,
} from '../lib/crossword'
import type { SharedPuzzle } from '../lib/share'
import '../player.css'

interface CrosswordPlayerProps {
  puzzle: SharedPuzzle
  layout: CrosswordLayout
  editUrl?: string
}

interface CellPosition {
  key: string
  row: number
  column: number
}

function cellKey(row: number, column: number) {
  return `${row}:${column}`
}

function getEntryCells(entry: PlacedEntry): CellPosition[] {
  return Array.from({ length: entry.answer.length }, (_, index) => {
    const row = entry.starty - 1 + (entry.orientation === 'down' ? index : 0)
    const column =
      entry.startx - 1 + (entry.orientation === 'across' ? index : 0)
    return { key: cellKey(row, column), row, column }
  })
}

function ClueList({
  layout,
  orientation,
  activeEntryId,
  onSelect,
}: {
  layout: CrosswordLayout
  orientation: Orientation
  activeEntryId: string | null
  onSelect: (entry: PlacedEntry) => void
}) {
  return (
    <section className="player-clue-section" aria-label={`${orientation} clues`}>
      <h2>{orientation}</h2>
      <ol>
        {layout.placed
          .filter((entry) => entry.orientation === orientation)
          .map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={entry.id === activeEntryId ? 'is-active' : ''}
                aria-pressed={entry.id === activeEntryId}
                onClick={() => onSelect(entry)}
              >
                <span>{entry.position}</span>
                <span>{entry.clue}</span>
              </button>
            </li>
          ))}
      </ol>
    </section>
  )
}

export function CrosswordPlayer({
  puzzle,
  layout,
  editUrl,
}: CrosswordPlayerProps) {
  const entriesById = useMemo(
    () => new Map(layout.placed.map((entry) => [entry.id, entry])),
    [layout],
  )
  const entryCells = useMemo(
    () =>
      new Map(
        layout.placed.map((entry) => [entry.id, getEntryCells(entry)]),
      ),
    [layout],
  )
  const cellEntries = useMemo(() => {
    const map = new Map<string, PlacedEntry[]>()
    for (const entry of layout.placed) {
      for (const cell of getEntryCells(entry)) {
        map.set(cell.key, [...(map.get(cell.key) ?? []), entry])
      }
    }
    return map
  }, [layout])
  const playableCells = useMemo(
    () =>
      layout.table.flatMap((row, rowIndex) =>
        row.flatMap((letter, columnIndex) =>
          letter === '-'
            ? []
            : [
                {
                  key: cellKey(rowIndex, columnIndex),
                  row: rowIndex,
                  column: columnIndex,
                  answer: letter,
                },
              ],
        ),
      ),
    [layout],
  )
  const startNumbers = useMemo(() => getStartNumbers(layout), [layout])
  const firstEntry = layout.placed[0] ?? null
  const firstCell = firstEntry ? getEntryCells(firstEntry)[0]?.key ?? null : null
  const [values, setValues] = useState<Record<string, string>>({})
  const [activeEntryId, setActiveEntryId] = useState<string | null>(
    firstEntry?.id ?? null,
  )
  const activeEntryIdRef = useRef<string | null>(firstEntry?.id ?? null)
  const [selectedCell, setSelectedCell] = useState<string | null>(firstCell)
  const [hasChecked, setHasChecked] = useState(false)
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const activeEntry = activeEntryId
    ? entriesById.get(activeEntryId) ?? null
    : null
  const activeCellKeys = new Set(
    activeEntryId
      ? (entryCells.get(activeEntryId) ?? []).map(({ key }) => key)
      : [],
  )
  const filledCount = playableCells.filter(({ key }) => values[key]).length
  const solvedCount = playableCells.filter(
    ({ key, answer }) => values[key] === answer,
  ).length
  const isComplete = solvedCount === playableCells.length
  const playerStyle = { '--player-accent': puzzle.accent } as CSSProperties

  const activateEntry = (entryId: string) => {
    activeEntryIdRef.current = entryId
    setActiveEntryId(entryId)
  }

  const focusCell = (key: string) => {
    setSelectedCell(key)
    inputRefs.current.get(key)?.focus()
  }

  const chooseEntryForCell = (key: string, toggle = false) => {
    const candidates = cellEntries.get(key) ?? []
    if (!candidates.length) return

    const currentIndex = candidates.findIndex(
      ({ id }) => id === activeEntryIdRef.current,
    )
    const nextEntry =
      toggle && candidates.length > 1
        ? candidates[(currentIndex + 1 + candidates.length) % candidates.length]
        : currentIndex >= 0
          ? candidates[currentIndex]
          : candidates[0]
    activateEntry(nextEntry.id)
    setSelectedCell(key)
  }

  const moveWithinEntry = (key: string, offset: number) => {
    if (!activeEntryId) return
    const cells = entryCells.get(activeEntryId) ?? []
    const index = cells.findIndex((cell) => cell.key === key)
    const target = cells[index + offset]
    if (target) focusCell(target.key)
  }

  const moveSpatially = (
    current: CellPosition,
    orientation: Orientation,
    offset: number,
  ) => {
    const row = current.row + (orientation === 'down' ? offset : 0)
    const column = current.column + (orientation === 'across' ? offset : 0)
    const targetKey = cellKey(row, column)
    if (!cellEntries.has(targetKey)) return

    const targetEntry = (cellEntries.get(targetKey) ?? []).find(
      (entry) => entry.orientation === orientation,
    )
    if (targetEntry) activateEntry(targetEntry.id)
    focusCell(targetKey)
  }

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>,
    position: CellPosition,
  ) => {
    const letter = event.target.value.replace(/[^a-z]/gi, '').slice(-1).toUpperCase()
    setValues((current) => ({ ...current, [position.key]: letter }))
    if (letter) moveWithinEntry(position.key, 1)
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    position: CellPosition,
  ) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (values[position.key]) {
        setValues((current) => ({ ...current, [position.key]: '' }))
      } else {
        if (!activeEntryId) return
        const cells = entryCells.get(activeEntryId) ?? []
        const index = cells.findIndex(({ key }) => key === position.key)
        const previous = cells[index - 1]
        if (previous) {
          setValues((current) => ({ ...current, [previous.key]: '' }))
          focusCell(previous.key)
        }
      }
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      setValues((current) => ({ ...current, [position.key]: '' }))
      return
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      chooseEntryForCell(position.key, true)
      return
    }

    const movement = {
      ArrowLeft: ['across', -1],
      ArrowRight: ['across', 1],
      ArrowUp: ['down', -1],
      ArrowDown: ['down', 1],
    } as const
    const target = movement[event.key as keyof typeof movement]
    if (target) {
      event.preventDefault()
      moveSpatially(position, target[0], target[1])
    }
  }

  const selectEntry = (entry: PlacedEntry) => {
    activateEntry(entry.id)
    const cells = entryCells.get(entry.id) ?? []
    const target = cells.find(({ key }) => !values[key]) ?? cells[0]
    if (target) focusCell(target.key)
  }

  const clearPuzzle = () => {
    if (filledCount && !window.confirm('Clear every letter in this puzzle?')) return
    setValues({})
    setHasChecked(false)
    if (firstCell) focusCell(firstCell)
  }

  const gridStyle = {
    '--grid-columns': layout.cols,
    '--grid-ratio': `${layout.cols} / ${layout.rows}`,
  } as CSSProperties

  return (
    <div className="player-shell" style={playerStyle}>
      <header className="player-header">
        <a className="player-brand" href={window.location.pathname}>
          <span className="brand-mark" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} />
            ))}
          </span>
          <span>Cardword</span>
        </a>
        {editUrl ? (
          <a className="player-edit-link" href={editUrl}>
            <Pencil size={16} aria-hidden="true" /> Edit puzzle
          </a>
        ) : null}
      </header>

      <main className="player-main">
        <header className="player-title">
          <p className="eyebrow">Interactive crossword</p>
          {puzzle.showTitle !== false ? (
            <h1>{puzzle.title || 'Untitled Crossword'}</h1>
          ) : null}
          {puzzle.showNote !== false && puzzle.note ? (
            <p>{puzzle.note}</p>
          ) : null}
        </header>

        <div className="player-status">
          <div className="player-progress" aria-live="polite">
            <span>
              {isComplete
                ? 'Puzzle complete'
                : `${filledCount} of ${playableCells.length} letters filled`}
            </span>
            <span className="progress-track" aria-hidden="true">
              <span
                style={{
                  width: `${(filledCount / playableCells.length) * 100}%`,
                }}
              />
            </span>
          </div>
          <div className="player-actions">
            <button type="button" className="player-clear" onClick={clearPuzzle}>
              <Eraser size={16} aria-hidden="true" /> Clear
            </button>
            <button
              type="button"
              className="player-check"
              onClick={() => setHasChecked(true)}
              disabled={!filledCount}
            >
              <Check size={17} aria-hidden="true" /> Check
            </button>
          </div>
        </div>

        {isComplete ? (
          <div className="completion-banner" role="status">
            <CheckCircle2 size={22} aria-hidden="true" />
            <span>
              <strong>You solved it!</strong>
              Every square is correct.
            </span>
          </div>
        ) : null}

        <div className="player-workspace">
          <section className="player-board" aria-label="Crossword board">
            {activeEntry ? (
              <div className="active-clue" aria-live="polite">
                <span>
                  {activeEntry.position} {activeEntry.orientation}
                </span>
                <p>{activeEntry.clue}</p>
              </div>
            ) : null}

            <div
              className="playable-grid"
              style={gridStyle}
              role="grid"
              aria-label="Interactive crossword puzzle"
            >
              {layout.table.flatMap((row, rowIndex) =>
                row.map((answer, columnIndex) => {
                  const key = cellKey(rowIndex, columnIndex)
                  if (answer === '-') {
                    return <span className="play-cell is-blocked" key={key} />
                  }

                  const number = startNumbers.get(key)
                  const value = values[key] ?? ''
                  const isWrong = hasChecked && Boolean(value) && value !== answer
                  const isCorrect = hasChecked && value === answer
                  const position = { key, row: rowIndex, column: columnIndex }

                  return (
                    <label
                      className={[
                        'play-cell',
                        activeCellKeys.has(key) ? 'is-word' : '',
                        selectedCell === key ? 'is-selected' : '',
                        isWrong ? 'is-wrong' : '',
                        isCorrect ? 'is-correct' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={key}
                    >
                      {number ? <span className="play-cell-number">{number}</span> : null}
                      <span className="sr-only">
                        Row {rowIndex + 1}, column {columnIndex + 1}
                      </span>
                      <input
                        ref={(element) => {
                          if (element) inputRefs.current.set(key, element)
                          else inputRefs.current.delete(key)
                        }}
                        value={value}
                        maxLength={1}
                        inputMode="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        tabIndex={selectedCell === key ? 0 : -1}
                        aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}${number ? `, clue ${number}` : ''}`}
                        onFocus={() => chooseEntryForCell(key)}
                        onClick={() => {
                          if (selectedCell === key) chooseEntryForCell(key, true)
                        }}
                        onChange={(event) => handleChange(event, position)}
                        onKeyDown={(event) => handleKeyDown(event, position)}
                      />
                    </label>
                  )
                }),
              )}
            </div>
          </section>

          <aside className="player-clues" aria-label="Crossword clues">
            <ClueList
              layout={layout}
              orientation="across"
              activeEntryId={activeEntryId}
              onSelect={selectEntry}
            />
            <ClueList
              layout={layout}
              orientation="down"
              activeEntryId={activeEntryId}
              onSelect={selectEntry}
            />
          </aside>
        </div>
      </main>
    </div>
  )
}