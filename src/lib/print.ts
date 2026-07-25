import { getGridMetrics, type CrosswordLayout } from './crossword'

export type PrintPageSize = 'letter' | 'a4'

export interface PrintSettings {
  title: string
  note: string
  showTitle: boolean
  showNote: boolean
  pageSize: PrintPageSize
  longEdgeMm: number
  insertWidthMm: number
  insertHeightMm: number
  clueFontSizePt: number
  gridNumberFontSizePt: number
  accent: string
  includeAnswerKey: boolean
  trimMarks: boolean
}

export interface PrintRect {
  x: number
  y: number
  width: number
  height: number
}

export const PAGE_DIMENSIONS_MM = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
} satisfies Record<PrintPageSize, { width: number; height: number }>

export const INSERT_PADDING_MM = 7
export const PAGE_EDGE_MARGIN_MM = 10

export function getPrintGeometry(
  layout: CrosswordLayout,
  settings: PrintSettings,
) {
  const page = PAGE_DIMENSIONS_MM[settings.pageSize]
  const insertWidth = Math.min(
    settings.insertWidthMm,
    page.width - PAGE_EDGE_MARGIN_MM * 2,
  )
  const insertHeight = Math.min(
    settings.insertHeightMm,
    page.height - PAGE_EDGE_MARGIN_MM * 2,
  )
  const insert: PrintRect = {
    x: (page.width - insertWidth) / 2,
    y: (page.height - insertHeight) / 2,
    width: insertWidth,
    height: insertHeight,
  }
  const contentWidth = insert.width - INSERT_PADDING_MM * 2
  const grid = getGridMetrics(
    layout,
    Math.min(settings.longEdgeMm, contentWidth),
  )

  return { page, insert, contentWidth, grid }
}

export function getFileStem(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cardword-puzzle'
  )
}

export function pointsToMillimeters(points: number) {
  return (points * 25.4) / 72
}

export function wrapPrintText(
  text: string,
  widthMm: number,
  fontSizePt: number,
) {
  const averageCharacterWidth = pointsToMillimeters(fontSizePt) * 0.52
  const maxCharacters = Math.max(4, Math.floor(widthMm / averageCharacterWidth))
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= maxCharacters || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }

  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export function getPrintFit(
  layout: CrosswordLayout,
  settings: PrintSettings,
) {
  const { insert, grid } = getPrintGeometry(layout, settings)
  const textWidth = insert.width - INSERT_PADDING_MM * 2
  const titleSizePt = 18
  const titleSizeMm = pointsToMillimeters(titleSizePt)
  let headerBottom = insert.y + INSERT_PADDING_MM

  if (settings.showTitle) {
    const titleLines = wrapPrintText(
      settings.title.trim() || 'Untitled Crossword',
      textWidth,
      titleSizePt,
    )
    headerBottom += titleSizeMm + titleLines.length * titleSizeMm * 1.08
  }

  if (settings.showNote && settings.note.trim()) {
    const noteSizePt = 9
    const noteSizeMm = pointsToMillimeters(noteSizePt)
    headerBottom +=
      (settings.showTitle ? 1 : noteSizeMm) +
      wrapPrintText(settings.note, textWidth, noteSizePt).length *
        noteSizeMm *
        1.25
  }

  const cluesTop = headerBottom + 3 + grid.heightMm + 6
  const columnGap = 7
  const columnWidth =
    (insert.width - INSERT_PADDING_MM * 2 - columnGap) / 2
  const fontSizeMm = pointsToMillimeters(settings.clueFontSizePt)
  const lineHeight = fontSizeMm * 1.28
  const headingSizeMm = pointsToMillimeters(
    Math.max(7, settings.clueFontSizePt - 1),
  )
  const columnBottoms = (['across', 'down'] as const).map((orientation) => {
    let cursorY = cluesTop + headingSizeMm + lineHeight + 2

    for (const entry of layout.placed.filter(
      (candidate) => candidate.orientation === orientation,
    )) {
      const lineCount = wrapPrintText(
        entry.clue,
        columnWidth - 6,
        settings.clueFontSizePt,
      ).length
      cursorY += Math.max(lineHeight, lineCount * lineHeight) + 1.5
    }

    return cursorY
  })
  const contentBottom = Math.max(...columnBottoms)
  const availableBottom = insert.y + insert.height - INSERT_PADDING_MM

  return {
    fits: contentBottom <= availableBottom,
    overflowMm: Math.max(0, contentBottom - availableBottom),
    contentBottom,
    availableBottom,
  }
}