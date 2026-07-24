import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'

export interface SharedPuzzle {
  version: 1
  title: string
  note: string
  showTitle?: boolean
  showNote?: boolean
  source: string
  accent: string
  layoutSeed: number
}

const PLAY_HASH_PREFIX = '#play='
const MAX_SOURCE_LENGTH = 12_000

function isSharedPuzzle(value: unknown): value is SharedPuzzle {
  if (!value || typeof value !== 'object') return false
  const puzzle = value as Partial<SharedPuzzle>

  return (
    puzzle.version === 1 &&
    typeof puzzle.title === 'string' &&
    puzzle.title.length <= 80 &&
    typeof puzzle.note === 'string' &&
    puzzle.note.length <= 120 &&
    (puzzle.showTitle === undefined || typeof puzzle.showTitle === 'boolean') &&
    (puzzle.showNote === undefined || typeof puzzle.showNote === 'boolean') &&
    typeof puzzle.source === 'string' &&
    puzzle.source.length <= MAX_SOURCE_LENGTH &&
    typeof puzzle.accent === 'string' &&
    /^#[0-9a-f]{6}$/i.test(puzzle.accent) &&
    Number.isInteger(puzzle.layoutSeed) &&
    Number(puzzle.layoutSeed) > 0
  )
}

export function encodeSharedPuzzle(puzzle: SharedPuzzle) {
  return compressToEncodedURIComponent(JSON.stringify(puzzle))
}

export function decodeSharedPuzzle(hash: string): SharedPuzzle | null {
  if (!hash.startsWith(PLAY_HASH_PREFIX)) return null

  try {
    const encoded = hash.slice(PLAY_HASH_PREFIX.length)
    const decompressed = decompressFromEncodedURIComponent(encoded)
    if (!decompressed) return null
    const parsed: unknown = JSON.parse(decompressed)
    return isSharedPuzzle(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function createPlayUrl(puzzle: SharedPuzzle) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = `play=${encodeSharedPuzzle(puzzle)}`
  return url.toString()
}