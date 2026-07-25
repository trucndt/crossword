import {
  getStartNumbers,
  type CrosswordLayout,
  type Orientation,
} from './crossword'
import {
  getFileStem,
  getPrintGeometry,
  INSERT_PADDING_MM,
  pointsToMillimeters,
  type PrintRect,
  type PrintSettings,
  wrapPrintText,
} from './print'

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&apos;',
      '"': '&quot;',
    }
    return entities[character]
  })
}

function cropMarkLines(insert: PrintRect) {
  const offset = 1.8
  const length = 3.5
  const corners = [
    { x: insert.x, y: insert.y, horizontal: -1, vertical: -1 },
    {
      x: insert.x + insert.width,
      y: insert.y,
      horizontal: 1,
      vertical: -1,
    },
    {
      x: insert.x,
      y: insert.y + insert.height,
      horizontal: -1,
      vertical: 1,
    },
    {
      x: insert.x + insert.width,
      y: insert.y + insert.height,
      horizontal: 1,
      vertical: 1,
    },
  ]

  return corners
    .flatMap((corner) => [
      `<line x1="${corner.x + corner.horizontal * offset}" y1="${corner.y}" x2="${corner.x + corner.horizontal * (offset + length)}" y2="${corner.y}"/>`,
      `<line x1="${corner.x}" y1="${corner.y + corner.vertical * offset}" x2="${corner.x}" y2="${corner.y + corner.vertical * (offset + length)}"/>`,
    ])
    .join('')
}

function renderHeader(
  settings: PrintSettings,
  insert: PrintRect,
): { markup: string; bottom: number } {
  const centerX = insert.x + insert.width / 2
  const textWidth = insert.width - INSERT_PADDING_MM * 2
  const titleSizePt = 18
  const titleSizeMm = pointsToMillimeters(titleSizePt)
  let cursorY = insert.y + INSERT_PADDING_MM
  const markup: string[] = []

  if (settings.showTitle) {
    const titleLines = wrapPrintText(
      settings.title.trim() || 'Untitled Crossword',
      textWidth,
      titleSizePt,
    )
    cursorY += titleSizeMm
    for (const line of titleLines) {
      markup.push(
        `<text x="${centerX}" y="${cursorY}" text-anchor="middle" fill="${settings.accent}" font-family="Georgia, serif" font-size="${titleSizeMm}" font-weight="700">${escapeXml(line)}</text>`,
      )
      cursorY += titleSizeMm * 1.08
    }
  }

  if (settings.showNote && settings.note.trim()) {
    const noteSizePt = 9
    const noteSizeMm = pointsToMillimeters(noteSizePt)
    const noteLines = wrapPrintText(settings.note, textWidth, noteSizePt)
    cursorY += settings.showTitle ? 1 : noteSizeMm
    for (const line of noteLines) {
      markup.push(
        `<text x="${centerX}" y="${cursorY}" text-anchor="middle" fill="#4b514f" font-family="Arial, sans-serif" font-size="${noteSizeMm}">${escapeXml(line)}</text>`,
      )
      cursorY += noteSizeMm * 1.25
    }
  }

  return { markup: markup.join(''), bottom: cursorY + 3 }
}

function renderGrid(
  layout: CrosswordLayout,
  settings: PrintSettings,
  top: number,
) {
  const { insert, grid } = getPrintGeometry(layout, settings)
  const startNumbers = getStartNumbers(layout)
  const startX = insert.x + (insert.width - grid.widthMm) / 2
  const numberSizeMm = pointsToMillimeters(settings.gridNumberFontSizePt)
  const markup: string[] = []

  layout.table.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell === '-') return

      const x = startX + columnIndex * grid.cellSizeMm
      const y = top + rowIndex * grid.cellSizeMm
      markup.push(
        `<rect x="${x}" y="${y}" width="${grid.cellSizeMm}" height="${grid.cellSizeMm}" fill="#ffffff" stroke="#1d2221" stroke-width="0.25"/>`,
      )

      const number = startNumbers.get(`${rowIndex}:${columnIndex}`)
      if (number) {
        markup.push(
          `<text x="${x + grid.cellSizeMm * 0.07}" y="${y + grid.cellSizeMm * 0.05 + numberSizeMm * 0.8}" fill="#1d2221" font-family="Arial, sans-serif" font-size="${numberSizeMm}">${number}</text>`,
        )
      }
    })
  })

  return { markup: markup.join(''), bottom: top + grid.heightMm }
}

function renderClueColumn(
  layout: CrosswordLayout,
  settings: PrintSettings,
  orientation: Orientation,
  x: number,
  top: number,
  width: number,
) {
  const markup: string[] = []
  const fontSizeMm = pointsToMillimeters(settings.clueFontSizePt)
  const lineHeight = fontSizeMm * 1.28
  const headingSizeMm = pointsToMillimeters(
    Math.max(7, settings.clueFontSizePt - 1),
  )
  let cursorY = top + headingSizeMm

  markup.push(
    `<text x="${x}" y="${cursorY}" fill="${settings.accent}" font-family="Arial, sans-serif" font-size="${headingSizeMm}" font-weight="700">${orientation.toUpperCase()}</text>`,
  )
  cursorY += lineHeight + 2

  for (const entry of layout.placed.filter(
    (candidate) => candidate.orientation === orientation,
  )) {
    const lines = wrapPrintText(
      entry.clue,
      width - 6,
      settings.clueFontSizePt,
    )
    markup.push(
      `<text x="${x}" y="${cursorY}" fill="#1d2221" font-family="Arial, sans-serif" font-size="${fontSizeMm}" font-weight="700">${entry.position}</text>`,
    )
    lines.forEach((line, index) => {
      markup.push(
        `<text x="${x + 6}" y="${cursorY + index * lineHeight}" fill="#1d2221" font-family="Georgia, serif" font-size="${fontSizeMm}">${escapeXml(line)}</text>`,
      )
    })
    cursorY += Math.max(lineHeight, lines.length * lineHeight) + 1.5
  }

  return markup.join('')
}

export function createCrosswordSvg(
  layout: CrosswordLayout,
  settings: PrintSettings,
) {
  const { page, insert } = getPrintGeometry(layout, settings)
  const header = renderHeader(settings, insert)
  const grid = renderGrid(layout, settings, header.bottom)
  const columnGap = 7
  const columnWidth =
    (insert.width - INSERT_PADDING_MM * 2 - columnGap) / 2
  const cluesTop = grid.bottom + 6
  const guides = settings.trimMarks
    ? `<g fill="none" stroke="#9aa09d" stroke-width="0.18"><rect x="${insert.x}" y="${insert.y}" width="${insert.width}" height="${insert.height}" stroke-dasharray="1.4 1.4"/>${cropMarkLines(insert)}</g>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">
  <title>${escapeXml(settings.title.trim() || 'Crossword Puzzle')}</title>
  <desc>Printable crossword puzzle on a ${insert.width} by ${insert.height} millimeter card insert.</desc>
  <rect width="${page.width}" height="${page.height}" fill="#ffffff"/>
  ${guides}
  ${header.markup}
  ${grid.markup}
  ${renderClueColumn(layout, settings, 'across', insert.x + INSERT_PADDING_MM, cluesTop, columnWidth)}
  ${renderClueColumn(layout, settings, 'down', insert.x + INSERT_PADDING_MM + columnWidth + columnGap, cluesTop, columnWidth)}
</svg>`
}

export function exportCrosswordSvg(
  layout: CrosswordLayout,
  settings: PrintSettings,
) {
  const svg = createCrosswordSvg(layout, settings)
  const url = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${getFileStem(settings.title)}.svg`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}