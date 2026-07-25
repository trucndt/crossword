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
const GIST_HASH_PREFIX = '#gist='
const EDIT_GIST_HASH_PREFIX = '#edit='
const GIST_FILENAME = 'cardword-puzzle.json'
const GITHUB_API_VERSION = '2022-11-28'
const MAX_SOURCE_LENGTH = 12_000

interface GitHubGistFile {
  content?: unknown
  truncated?: unknown
}

interface GitHubGistResponse {
  id?: unknown
  html_url?: unknown
  message?: unknown
  files?: unknown
}

export interface PublishedGist {
  id: string
  url: string
}

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

function isGistId(value: string) {
  return /^[0-9a-f]{5,64}$/i.test(value)
}

function getGitHubErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const response = value as GitHubGistResponse
  return typeof response.message === 'string' ? response.message : null
}

export function serializeSharedPuzzle(puzzle: SharedPuzzle) {
  return JSON.stringify(puzzle, null, 2)
}

export function parseSharedPuzzle(value: string): SharedPuzzle | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return isSharedPuzzle(parsed) ? parsed : null
  } catch {
    return null
  }
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
    return parseSharedPuzzle(decompressed)
  } catch {
    return null
  }
}

export function getGistId(hash: string) {
  if (!hash.startsWith(GIST_HASH_PREFIX)) return null
  const gistId = hash.slice(GIST_HASH_PREFIX.length)
  return isGistId(gistId) ? gistId : null
}

export function getEditableGistId(hash: string) {
  if (!hash.startsWith(EDIT_GIST_HASH_PREFIX)) return null
  const gistId = hash.slice(EDIT_GIST_HASH_PREFIX.length)
  return isGistId(gistId) ? gistId : null
}

export async function loadPuzzleFromGist(
  gistId: string,
  signal?: AbortSignal,
) {
  if (!isGistId(gistId)) throw new Error('Invalid GitHub Gist ID')

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    signal,
  })
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(getGitHubErrorMessage(data) ?? 'GitHub could not load the puzzle')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('GitHub returned an invalid puzzle file')
  }

  const files = (data as GitHubGistResponse).files
  if (!files || typeof files !== 'object') {
    throw new Error('The GitHub Gist does not contain a puzzle file')
  }

  const preferredFile = (files as Record<string, GitHubGistFile>)[GIST_FILENAME]
  const fallbackFile = Object.values(files as Record<string, GitHubGistFile>)[0]
  const file = preferredFile ?? fallbackFile

  if (
    !file ||
    file.truncated === true ||
    typeof file.content !== 'string'
  ) {
    throw new Error('The GitHub puzzle file is incomplete')
  }

  const puzzle = parseSharedPuzzle(file.content)
  if (!puzzle) throw new Error('The GitHub file is not a valid Cardword puzzle')
  return puzzle
}

export async function publishPuzzleToGist(
  puzzle: SharedPuzzle,
  token: string,
): Promise<PublishedGist> {
  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    body: JSON.stringify({
      description: `Cardword crossword: ${puzzle.title.trim() || 'Untitled Crossword'}`,
      public: false,
      files: {
        [GIST_FILENAME]: { content: serializeSharedPuzzle(puzzle) },
      },
    }),
  })
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(getGitHubErrorMessage(data) ?? 'GitHub could not save the puzzle')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('GitHub returned an invalid response')
  }

  const gist = data as GitHubGistResponse
  if (
    typeof gist.id !== 'string' ||
    !isGistId(gist.id) ||
    typeof gist.html_url !== 'string'
  ) {
    throw new Error('GitHub did not return a valid Gist link')
  }

  return { id: gist.id, url: gist.html_url }
}

export async function updatePuzzleGist(
  puzzle: SharedPuzzle,
  gistId: string,
  token: string,
): Promise<PublishedGist> {
  if (!isGistId(gistId)) throw new Error('Invalid GitHub Gist ID')

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    body: JSON.stringify({
      description: `Cardword crossword: ${puzzle.title.trim() || 'Untitled Crossword'}`,
      files: {
        [GIST_FILENAME]: { content: serializeSharedPuzzle(puzzle) },
      },
    }),
  })
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      response.status === 404
        ? 'This token does not have permission to update that Gist'
        : getGitHubErrorMessage(data)
    throw new Error(message ?? 'GitHub could not update the puzzle')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('GitHub returned an invalid response')
  }

  const gist = data as GitHubGistResponse
  if (
    gist.id !== gistId ||
    typeof gist.html_url !== 'string'
  ) {
    throw new Error('GitHub did not return the updated Gist')
  }

  return { id: gistId, url: gist.html_url }
}

export function createPlayUrl(puzzle: SharedPuzzle) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = `play=${encodeSharedPuzzle(puzzle)}`
  return url.toString()
}

export function createGistPlayUrl(gistId: string) {
  if (!isGistId(gistId)) throw new Error('Invalid GitHub Gist ID')
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = `gist=${gistId}`
  return url.toString()
}

export function createGistEditUrl(gistId: string) {
  if (!isGistId(gistId)) throw new Error('Invalid GitHub Gist ID')
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = `edit=${gistId}`
  return url.toString()
}