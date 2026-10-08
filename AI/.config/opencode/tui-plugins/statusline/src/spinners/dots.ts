import { COLS, ROWS, type Cell, type Frame, type SpinnerFactory } from './types'

const BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const
// A dot is lit above this brightness.
const LIT = 0.16

// A braille cell is 2 x 4 dots, so the 16 x 2 strip is a 32 x 8 field of dots.
export const W = COLS * 2
export const H = ROWS * 4

export function field() {
  const px = new Float32Array(W * H)
  const set = (x: number, y: number, v: number) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && x < W && y >= 0 && y < H && v > px[y * W + x]!) px[y * W + x] = v
  }
  return { px, set, clear: () => px.fill(0) }
}
export type Field = ReturnType<typeof field>

// Dots to braille cells: a dot is lit above LIT, and a cell takes its brightness from its
// strongest dot. With `grid`, unlit cells keep a faint full block, like an LED matrix.
function toCells(f: Field, grid: boolean): Frame {
  return Array.from({ length: ROWS }, (_, cy) => Array.from({ length: COLS }, (_, cx): Cell => {
    let bits = 0
    let peak = 0
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const v = f.px[(cy * 4 + dy) * W + cx * 2 + dx]!
        if (v >= LIT) { bits |= BITS[dy]![dx]!; peak = Math.max(peak, v) }
      }
    }
    if (bits) return [String.fromCodePoint(0x2800 + bits), Math.min(1, 0.34 + 0.8 * peak)]
    return grid ? ['⣿', 0.07] : [' ', 0]
  }))
}

// build(f) sets up one spinner's own state and returns draw(t, dt), which draws into the cleared field.
export const dots = (build: (f: Field) => (t: number, dt: number) => void, { grid = false } = {}): SpinnerFactory => () => {
  const f = field()
  const draw = build(f)
  return (t, dt) => {
    f.clear()
    draw(t, dt)
    return toCells(f, grid)
  }
}
