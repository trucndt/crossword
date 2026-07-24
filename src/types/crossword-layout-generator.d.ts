declare module 'crossword-layout-generator' {
  export interface LayoutInput {
    answer: string
    clue: string
    id: string
  }

  export interface LayoutResult extends LayoutInput {
    startx?: number
    starty?: number
    orientation: 'across' | 'down' | 'none'
    position?: number
  }

  export interface GeneratedLayout {
    rows: number
    cols: number
    table: string[][]
    table_string: string
    result: LayoutResult[]
  }

  const crosswordLayoutGenerator: {
    generateLayout(entries: LayoutInput[]): GeneratedLayout
  }

  export default crosswordLayoutGenerator
}