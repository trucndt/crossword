import crosswordLayoutGenerator from 'crossword-layout-generator'

export type Orientation = 'across' | 'down'

export interface CrosswordEntry {
  id: string
  answer: string
  clue: string
  sourceLine: number
}

export interface PlacedEntry extends CrosswordEntry {
  startx: number
  starty: number
  orientation: Orientation
  position: number
}

export interface CrosswordLayout {
  rows: number
  cols: number
  table: string[][]
  placed: PlacedEntry[]
  unplaced: CrosswordEntry[]
}

export interface ParsedEntries {
  entries: CrosswordEntry[]
  errors: string[]
}

const MAX_ENTRIES = 40

function normalizeAnswer(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
}

function findSeparator(line: string) {
  const separators = ['|', '\t', ':', ' - ']
    .map((separator) => ({ separator, index: line.indexOf(separator) }))
    .filter(({ index }) => index > 0)
    .sort((first, second) => first.index - second.index)

  return separators[0]
}

export function parseEntries(source: string): ParsedEntries {
  const entries: CrosswordEntry[] = []
  const errors: string[] = []
  const answers = new Set<string>()
  const lines = source.split(/\r?\n/)

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim()
    if (!line) continue

    if (entries.length >= MAX_ENTRIES) {
      errors.push(`Only the first ${MAX_ENTRIES} valid entries are used.`)
      break
    }

    const separator = findSeparator(line)
    if (!separator) {
      errors.push(`Line ${index + 1} needs an answer and clue.`)
      continue
    }

    const answer = normalizeAnswer(line.slice(0, separator.index))
    const clue = line.slice(separator.index + separator.separator.length).trim()

    if (answer.length < 2) {
      errors.push(`Line ${index + 1} needs an answer with at least 2 letters.`)
      continue
    }
    if (!clue) {
      errors.push(`Line ${index + 1} needs a clue.`)
      continue
    }
    if (answers.has(answer)) {
      errors.push(`Line ${index + 1} repeats ${answer}.`)
      continue
    }

    answers.add(answer)
    entries.push({
      id: `entry-${index + 1}`,
      answer,
      clue,
      sourceLine: index + 1,
    })
  }

  return { entries, errors }
}

function runGenerator(
  entries: CrosswordEntry[],
  priorityEntry?: CrosswordEntry,
) {
  const originalLog = console.log
  const priorityLength =
    Math.max(...entries.map(({ answer }) => answer.length)) + 1
  console.log = () => undefined

  try {
    return crosswordLayoutGenerator.generateLayout(
      entries.map(({ id, answer, clue }) => ({
        id,
        answer:
          id === priorityEntry?.id
            ? answer.padEnd(priorityLength, '0')
            : answer,
        clue,
      })),
    )
  } finally {
    console.log = originalLog
  }
}

function countPlacedEntries(layout: ReturnType<typeof runGenerator>) {
  return layout.result.filter(
    ({ orientation }) => orientation !== 'none',
  ).length
}

export function generateCrossword(
  entries: CrosswordEntry[],
  seed = 1,
): CrosswordLayout | null {
  if (entries.length < 2) return null

  const attempts = entries
    .slice(0, 8)
    .map((priorityEntry) => runGenerator(entries, priorityEntry))
  const fallback = runGenerator(entries)
  const bestPlacedCount = Math.max(
    countPlacedEntries(fallback),
    ...attempts.map(countPlacedEntries),
  )
  const bestAttempts = attempts.filter(
    (attempt) => countPlacedEntries(attempt) === bestPlacedCount,
  )
  const generated =
    bestAttempts.length > 0
      ? bestAttempts[(seed - 1) % bestAttempts.length]
      : fallback

  if (!generated || generated.rows === 0 || generated.cols === 0) return null

  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const placedResults = generated.result.filter(
    (entry): entry is typeof entry & {
      startx: number
      starty: number
      orientation: Orientation
    } =>
      entry.orientation !== 'none' &&
      typeof entry.startx === 'number' &&
      typeof entry.starty === 'number',
  )

  const rawPlaced: Omit<PlacedEntry, 'position'>[] = placedResults.flatMap(
    (result) => {
      const source = entryById.get(result.id)
      if (!source) return []

      return [
        {
          ...source,
          startx: result.startx,
          starty: result.starty,
          orientation: result.orientation,
        },
      ]
    },
  )

  if (rawPlaced.length === 0) return null

  let top = Number.POSITIVE_INFINITY
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const entry of rawPlaced) {
    const startColumn = entry.startx - 1
    const startRow = entry.starty - 1
    const endColumn =
      startColumn + (entry.orientation === 'across' ? entry.answer.length - 1 : 0)
    const endRow =
      startRow + (entry.orientation === 'down' ? entry.answer.length - 1 : 0)

    top = Math.min(top, startRow)
    left = Math.min(left, startColumn)
    right = Math.max(right, endColumn)
    bottom = Math.max(bottom, endRow)
  }

  const rows = bottom - top + 1
  const cols = right - left + 1
  const table = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => '-'),
  )
  const rebasedPlaced = rawPlaced.map((entry) => ({
    ...entry,
    startx: entry.startx - left,
    starty: entry.starty - top,
  }))

  const numberedStarts = [...rebasedPlaced]
    .sort((first, second) => first.starty - second.starty || first.startx - second.startx)
    .reduce<Map<string, number>>((numbers, entry) => {
      const key = `${entry.starty}:${entry.startx}`
      if (!numbers.has(key)) numbers.set(key, numbers.size + 1)
      return numbers
    }, new Map())

  const placed = rebasedPlaced
    .map((entry) => ({
      ...entry,
      position: numberedStarts.get(`${entry.starty}:${entry.startx}`) ?? 0,
    }))
    .sort((first, second) => first.position - second.position)

  for (const entry of placed) {
    for (const [index, letter] of [...entry.answer].entries()) {
      const row = entry.starty - 1 + (entry.orientation === 'down' ? index : 0)
      const column =
        entry.startx - 1 + (entry.orientation === 'across' ? index : 0)
      table[row][column] = letter
    }
  }

  const placedIds = new Set(placed.map(({ id }) => id))

  return {
    rows,
    cols,
    table,
    placed,
    unplaced: entries.filter(({ id }) => !placedIds.has(id)),
  }
}

export function getGridMetrics(
  layout: Pick<CrosswordLayout, 'rows' | 'cols'>,
  longEdgeMm: number,
) {
  const cellSizeMm = longEdgeMm / Math.max(layout.rows, layout.cols)
  return {
    cellSizeMm,
    widthMm: layout.cols * cellSizeMm,
    heightMm: layout.rows * cellSizeMm,
  }
}

export function getStartNumbers(layout: CrosswordLayout) {
  return new Map(
    layout.placed.map((entry) => [
      `${entry.starty - 1}:${entry.startx - 1}`,
      entry.position,
    ]),
  )
}