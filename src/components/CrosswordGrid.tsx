import type { CSSProperties } from 'react'
import { getStartNumbers, type CrosswordLayout } from '../lib/crossword'

interface CrosswordGridProps {
  layout: CrosswordLayout
  showAnswers: boolean
  style?: CSSProperties
}

export function CrosswordGrid({
  layout,
  showAnswers,
  style,
}: CrosswordGridProps) {
  const startNumbers = getStartNumbers(layout)
  const gridStyle = {
    '--grid-columns': layout.cols,
    '--grid-ratio': `${layout.cols} / ${layout.rows}`,
    ...style,
  } as CSSProperties

  return (
    <div
      className="crossword-grid"
      style={gridStyle}
      role="grid"
      aria-label={showAnswers ? 'Crossword answer key' : 'Blank crossword puzzle'}
    >
      {layout.table.flatMap((row, rowIndex) =>
        row.map((cell, columnIndex) => {
          const isBlocked = cell === '-'
          const number = startNumbers.get(`${rowIndex}:${columnIndex}`)

          return (
            <div
              className={`crossword-cell${isBlocked ? ' is-blocked' : ''}`}
              role="gridcell"
              aria-label={
                isBlocked
                  ? 'Blocked cell'
                  : `${number ? `Clue ${number}, ` : ''}${
                      showAnswers ? `letter ${cell}` : 'empty cell'
                    }`
              }
              key={`${rowIndex}-${columnIndex}`}
            >
              {number ? <span className="cell-number">{number}</span> : null}
              {showAnswers && !isBlocked ? (
                <span className="cell-letter">{cell}</span>
              ) : null}
            </div>
          )
        }),
      )}
    </div>
  )
}