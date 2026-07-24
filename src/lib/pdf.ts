import { jsPDF } from 'jspdf'
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
  type PrintPageSize,
  type PrintRect,
  type PrintSettings,
} from './print'

export type PdfPageSize = PrintPageSize
export type PdfSettings = PrintSettings

function colorChannels(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  return [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  ) as [number, number, number]
}

function drawHeader(
  document: jsPDF,
  settings: PdfSettings,
  insert: PrintRect,
  answerKey: boolean,
) {
  const accent = colorChannels(settings.accent)
  const centerX = insert.x + insert.width / 2
  const textWidth = insert.width - INSERT_PADDING_MM * 2
  let cursorY = insert.y + INSERT_PADDING_MM

  if (settings.showTitle) {
    cursorY += 5
    document.setFont('times', 'bold')
    document.setFontSize(18)
    document.setTextColor(...accent)
    const titleLines = document.splitTextToSize(
      settings.title.trim() || 'Untitled Crossword',
      textWidth,
    ) as string[]
    document.text(titleLines, centerX, cursorY, { align: 'center' })
    cursorY += titleLines.length * 6.5
  }

  if (settings.showNote && settings.note.trim()) {
    if (!settings.showTitle) cursorY += 3
    document.setFont('helvetica', 'normal')
    document.setFontSize(9)
    document.setTextColor(75, 81, 79)
    const noteLines = document.splitTextToSize(
      settings.note.trim(),
      textWidth,
    ) as string[]
    document.text(noteLines, centerX, cursorY, { align: 'center' })
    cursorY += noteLines.length * 4
  }

  if (answerKey) {
    if (!settings.showTitle && !(settings.showNote && settings.note.trim())) {
      cursorY += 2
    }
    document.setFont('helvetica', 'bold')
    document.setFontSize(7.5)
    document.setTextColor(...accent)
    document.text('ANSWER KEY', centerX, cursorY + 1, { align: 'center' })
    cursorY += 5
  }

  return cursorY + 4
}

function drawCutGuides(document: jsPDF, insert: PrintRect) {
  document.setDrawColor(154, 160, 157)
  document.setLineWidth(0.18)
  document.setLineDashPattern([1.4, 1.4], 0)
  document.rect(insert.x, insert.y, insert.width, insert.height)
  document.setLineDashPattern([], 0)
  drawTrimMarks(document, insert.x, insert.y, insert.width, insert.height)
}

function drawTrimMarks(
  document: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const offset = 1.8
  const length = 3.5
  document.setDrawColor(119, 125, 122)
  document.setLineWidth(0.2)

  const corners = [
    { x, y, horizontal: -1, vertical: -1 },
    { x: x + width, y, horizontal: 1, vertical: -1 },
    { x, y: y + height, horizontal: -1, vertical: 1 },
    { x: x + width, y: y + height, horizontal: 1, vertical: 1 },
  ]

  for (const corner of corners) {
    document.line(
      corner.x + corner.horizontal * offset,
      corner.y,
      corner.x + corner.horizontal * (offset + length),
      corner.y,
    )
    document.line(
      corner.x,
      corner.y + corner.vertical * offset,
      corner.x,
      corner.y + corner.vertical * (offset + length),
    )
  }
}

function drawGrid(
  document: jsPDF,
  layout: CrosswordLayout,
  settings: PdfSettings,
  cursorY: number,
  showAnswers: boolean,
) {
  const { grid: metrics, insert } = getPrintGeometry(layout, settings)
  const startNumbers = getStartNumbers(layout)
  const startX = insert.x + (insert.width - metrics.widthMm) / 2
  const numberSize = Math.max(1.5, Math.min(2.5, metrics.cellSizeMm * 0.2))
  const letterSize = Math.max(4, Math.min(11, metrics.cellSizeMm * 1.35))

  document.setDrawColor(29, 34, 33)
  document.setLineWidth(Math.max(0.16, Math.min(0.3, metrics.cellSizeMm * 0.03)))

  layout.table.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const cellX = startX + columnIndex * metrics.cellSizeMm
      const cellY = cursorY + rowIndex * metrics.cellSizeMm
      const isBlocked = cell === '-'

      if (isBlocked) return

      document.setFillColor(255, 255, 255)
      document.rect(
        cellX,
        cellY,
        metrics.cellSizeMm,
        metrics.cellSizeMm,
        'FD',
      )

      const number = startNumbers.get(`${rowIndex}:${columnIndex}`)
      if (number) {
        document.setFont('helvetica', 'normal')
        document.setFontSize(numberSize * 2.835)
        document.setTextColor(29, 34, 33)
        document.text(
          String(number),
          cellX + Math.max(0.45, metrics.cellSizeMm * 0.07),
          cellY + Math.max(1.5, metrics.cellSizeMm * 0.2),
        )
      }

      if (showAnswers) {
        document.setFont('helvetica', 'bold')
        document.setFontSize(letterSize)
        document.setTextColor(29, 34, 33)
        document.text(
          cell,
          cellX + metrics.cellSizeMm / 2,
          cellY + metrics.cellSizeMm * 0.68,
          { align: 'center' },
        )
      }
    })
  })

  return cursorY + metrics.heightMm
}

interface ClueBlock {
  kind: 'heading' | 'clue'
  label: string
  lines: string[]
  height: number
}

function buildClueBlocks(
  document: jsPDF,
  layout: CrosswordLayout,
  columnWidth: number,
  orientation: Orientation,
  clueFontSizePt: number,
) {
  const blocks: ClueBlock[] = []
  const lineHeight = pointsToMillimeters(clueFontSizePt) * 1.28

  blocks.push({
    kind: 'heading',
    label: orientation.toUpperCase(),
    lines: [],
    height: Math.max(6, lineHeight + 2),
  })

  for (const entry of layout.placed.filter(
    (candidate) => candidate.orientation === orientation,
  )) {
    document.setFont('helvetica', 'normal')
    document.setFontSize(clueFontSizePt)
    const lines = document.splitTextToSize(entry.clue, columnWidth - 8) as string[]
    blocks.push({
      kind: 'clue',
      label: String(entry.position),
      lines,
      height: Math.max(lineHeight + 1.5, lines.length * lineHeight + 1.5),
    })
  }

  return blocks
}

function drawClues(
  document: jsPDF,
  layout: CrosswordLayout,
  settings: PdfSettings,
  initialY: number,
) {
  const { insert } = getPrintGeometry(layout, settings)
  const columnGap = 7
  const columnWidth =
    (insert.width - INSERT_PADDING_MM * 2 - columnGap) / 2
  const accent = colorChannels(settings.accent)
  const textBaseline = pointsToMillimeters(settings.clueFontSizePt)

  for (const [column, orientation] of (
    ['across', 'down'] as Orientation[]
  ).entries()) {
    const columnX =
      insert.x + INSERT_PADDING_MM + column * (columnWidth + columnGap)
    let cursorY = initialY
    const blocks = buildClueBlocks(
      document,
      layout,
      columnWidth,
      orientation,
      settings.clueFontSizePt,
    )

    for (const block of blocks) {
      if (block.kind === 'heading') {
        document.setFont('helvetica', 'bold')
        document.setFontSize(Math.max(7, settings.clueFontSizePt - 1))
        document.setTextColor(...accent)
        document.text(block.label, columnX, cursorY + textBaseline)
      } else {
        document.setFont('helvetica', 'bold')
        document.setFontSize(settings.clueFontSizePt)
        document.setTextColor(29, 34, 33)
        document.text(block.label, columnX, cursorY + textBaseline)
        document.setFont('helvetica', 'normal')
        block.lines.forEach((line, lineIndex) => {
          document.text(
            line,
            columnX + 6,
            cursorY + textBaseline +
              lineIndex * pointsToMillimeters(settings.clueFontSizePt) * 1.28,
          )
        })
      }

      cursorY += block.height
    }
  }
}

export function exportCrosswordPdf(
  layout: CrosswordLayout,
  settings: PdfSettings,
) {
  const document = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: settings.pageSize,
    compress: true,
    putOnlyUsedFonts: true,
  })

  document.setProperties({
    title: settings.title || 'Crossword Puzzle',
    subject: 'Printable crossword puzzle',
    creator: 'Cardword',
  })

  const { insert } = getPrintGeometry(layout, settings)
  if (settings.trimMarks) drawCutGuides(document, insert)
  const puzzleStartY = drawHeader(document, settings, insert, false)
  const puzzleBottom = drawGrid(document, layout, settings, puzzleStartY, false)
  drawClues(document, layout, settings, puzzleBottom + 6)

  if (settings.includeAnswerKey) {
    document.addPage()
    const answerStartY = drawHeader(document, settings, insert, true)
    drawGrid(document, layout, settings, answerStartY, true)
  }

  document.save(`${getFileStem(settings.title)}.pdf`)
}