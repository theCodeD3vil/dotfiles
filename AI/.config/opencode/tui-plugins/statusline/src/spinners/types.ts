// One terminal cell: a glyph and a brightness from 0 to 1 that blends the panel colour
// toward the stage colour.
export type Cell = readonly [glyph: string, level: number]
export type Frame = Cell[][]

// A running spinner: the strip `t` seconds after it started, `dt` seconds after its previous frame.
export type Spinner = (t: number, dt: number) => Frame
export type SpinnerFactory = () => Spinner

export const COLS = 16
export const ROWS = 2
