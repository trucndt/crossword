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

function shuffleEntries(entries: CrosswordEntry[], seed: number) {
  const shuffled = [...entries]
  let state = seed || 1

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const target = state % (index + 1)
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }

  return shuffled
}

function runGenerator(entries: CrosswordEntry[]) {
  const originalLog = console.log
  console.log = () => undefined

  try {
    return crosswordLayoutGenerator.generateLayout(
      entries.map(({ id, answer, clue }) => ({ id, answer, clue })),
    )
  } finally {
    console.log = originalLog
  }
}

function scoreLayout(layout: ReturnType<typeof runGenerator>) {
  const placedCount = layout.result.filter(
    ({ orientation }) => orientation !== 'none',
  ).length
  const area = layout.rows * layout.cols
  const shapePenalty = Math.abs(layout.rows - layout.cols)

  return placedCount * 100_000 - area * 10 - shapePenalty
}

export function generateCrossword(
  entries: CrosswordEntry[],
  seed = 1,
): CrosswordLayout | null {
  if (entries.length < 2) return null

  const attempts = [
    [...entries].sort((first, second) => second.answer.length - first.answer.length),
    entries,
    ...Array.from({ length: 6 }, (_, index) =>
      shuffleEntries(entries, seed * 17 + index * 101),
    ),
  ]

  const generated = attempts
    .map(runGenerator)
    .sort((first, second) => scoreLayout(second) - scoreLayout(first))[0]

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

  const numberedStarts = [...placedResults]
    .sort((first, second) => first.starty - second.starty || first.startx - second.startx)
    .reduce<Map<string, number>>((numbers, entry) => {
      const key = `${entry.starty}:${entry.startx}`
      if (!numbers.has(key)) numbers.set(key, numbers.size + 1)
      return numbers
    }, new Map())

  const placed = placedResults
    .map((result) => {
      const source = entryById.get(result.id)
      if (!source) return null

      return {
        ...source,
        startx: result.startx,
        starty: result.starty,
        orientation: result.orientation,
        position: numberedStarts.get(`${result.starty}:${result.startx}`) ?? 0,
      }
    })
    .filter((entry): entry is PlacedEntry => entry !== null)
    .sort((first, second) => first.position - second.position)

  const placedIds = new Set(placed.map(({ id }) => id))

  return {
    rows: generated.rows,
    cols: generated.cols,
    table: generated.table.map((row) => row.map((cell) => cell.toUpperCase())),
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