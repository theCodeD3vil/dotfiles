import { MAUVE, TRACK_PACKED, clamp, fillColor, fromHsl, hexToRgb, packRgb, severityColor, toHsl } from './colors'

// Braille Rasters. A Raster is a flat Uint32Array of [character, foreground, background] per cell,
// sent as base64. Every cell sits on the terminal's own background.

const DEFAULT_COLOR = 0x01000000 // a Raster cell's "terminal default" colour

// Braille dot bits by [dot row from the top][left or right dot column].
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
const BRAILLE_BLANK = 0x2800
const BRAILLE_FULL = 0x28ff
const BRAILLE_FLOOR = BRAILLE_BITS[3]![0]! + BRAILLE_BITS[3]![1]!
const BRAILLE_TIP_LEFT = 0x28be
const BRAILLE_TIP_RIGHT = 0x2877
const MARKER_CHAR = 0x2590 // ▐

const PULSE_SPEED = 10 // cells a second: one cell per 100 ms repaint, so the front moves smoothly
const PULSE_TAIL = 3 // cells the pulse's tail fades over
const PULSE_GAP = 6 // cells of dark between one pulse leaving the head and the next starting
const TIP_SWEEP = 25 // degrees either side of the usage hue the tips sweep through
const TIP_PERIOD_MS = 1400 // ms for one sweep

const encodeCells = (words: Uint32Array) => (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()
const setCell = (words: Uint32Array, index: number, char: number, color: number) => words.set([char, color, DEFAULT_COLOR], index * 3)

// Where the pulse's front is, in cells from the bar's start: it crosses the used part, waits out the
// gap, and starts again from the beginning.
const pulseFront = (elapsedMs: number, fillEnd: number) => ((elapsedMs / 1000) * PULSE_SPEED) % (fillEnd + PULSE_GAP)

// Brightness 0-1 of a filled cell: dim at rest, with a pulse of light that runs from the start to
// the head and starts over, a sharp front with a longer fading tail so it reads as moving forward.
function cellGlow(column: number, progress: number, front: number) {
  const behind = front - column
  const pulse = behind >= 0 ? Math.exp(-behind / PULSE_TAIL) : Math.exp(-(behind * behind) / 0.8)
  return 0.28 + 0.12 * Math.pow(progress, 0.9) + 0.6 * pulse
}

// A tip the fill has reached sweeps a band of hues around the usage colour (the two out of phase).
const tipColor = (hue: number, elapsedMs: number, phase: number) =>
  fromHsl(hue + TIP_SWEEP * Math.sin((elapsedMs / TIP_PERIOD_MS + phase) * Math.PI * 2), 0.95, 0.62)

// The 5h bar, after plan-progress's trackCells (MIT): the used part solid dots in a fully saturated
// usage hue, dim at rest with a pulse of light running forward to the head over and over (repainted
// every 100 ms by the timer), the rest solid ⣿ in dim grey, a ▐ where the window's time has got to,
// and dotted tips (⢾ ⡷) that, once the fill reaches them, sweep a band of hues around the usage colour.
export function usageCells(percent: number, timePercent: number, width: number, elapsedMs: number) {
  // The usage colour's hue at full strength: brightness varies by lightness alone, so nothing greys it.
  const [hue] = toHsl(hexToRgb(severityColor(percent)))
  const fillEnd = percent > 0 ? Math.max(1, (percent / 100) * width) : 0
  const front = pulseFront(elapsedMs, fillEnd)
  const words = new Uint32Array(width * 3)

  for (let column = 0; column < width; column++) {
    if (column + 0.5 >= fillEnd) {
      setCell(words, column, BRAILLE_FULL, TRACK_PACKED)
      continue
    }
    const progress = Math.min(1, (column + 0.5) / fillEnd)
    const glow = cellGlow(column, progress, front)
    setCell(words, column, BRAILLE_FULL, packRgb(fromHsl(hue, 0.9, 0.12 + 0.58 * glow)))
  }

  // A thick ▐, kept off the end cells, which become the tips.
  const marker = Math.max(1, Math.min(width - 2, Math.round((width * timePercent) / 100)))
  setCell(words, marker, MARKER_CHAR, packRgb(hexToRgb(severityColor(timePercent))))

  // Rounded ends: a half circle of dots each. A tip the fill has not reached stays grey like the track.
  setCell(words, 0, BRAILLE_TIP_LEFT, percent > 0 ? packRgb(tipColor(hue, elapsedMs, 0)) : TRACK_PACKED)
  setCell(words, width - 1, BRAILLE_TIP_RIGHT, fillEnd >= width - 1 ? packRgb(tipColor(hue, elapsedMs, 0.5)) : TRACK_PACKED)

  return encodeCells(words)
}

// The dots lit in one half (left or right dot column) of a cell row, for a bar `level` dots tall
// rising from the floor of a raster `rows` cells tall.
function columnBits(half: number, level: number, cellRow: number, rows: number) {
  let bits = 0
  for (let dotRow = 0; dotRow < 4; dotRow++) {
    const height = rows * 4 - 1 - (cellRow * 4 + dotRow)
    if (height < level) bits |= BRAILLE_BITS[dotRow]![half]!
  }
  return bits
}

// The context chart: one dot column per turn, two to a cell, the newest turn at the right, as tall as
// the context percent at the turn's end (the dots rise from the floor).
// percents: one per turn, oldest first. Turns fill from the right; the cells before the first turn
// are dim floor dots, and a cell is coloured by the higher of its two turns.
export function fillCells(width: number, rows: number, percents: number[]) {
  const shown = percents.slice(-width * 2)
  const firstTurn = width * 2 - shown.length
  const dotRows = rows * 4
  const words = new Uint32Array(width * rows * 3)
  for (let column = 0; column < width; column++) {
    // The percents of this cell's two turns; undefined for a dot column with no turn yet.
    const turnPercents = [0, 1].map(half => shown[column * 2 + half - firstTurn])
    // How many dots tall each of the two turns is; -1 for a column with no turn yet.
    const levels = turnPercents.map(percent => (percent === undefined ? -1 : Math.max(1, Math.round((clamp(percent, 0, 100) / 100) * dotRows))))
    const top = Math.max(...turnPercents.map(percent => percent ?? -1))
    const color = top < 0 ? TRACK_PACKED : packRgb(fillColor(top))
    for (let cellRow = 0; cellRow < rows; cellRow++) {
      // A bare column keeps its floor dot, which is a level of 1.
      const bits = levels.reduce((lit, level, half) => lit | columnBits(half, Math.max(1, level), cellRow, rows), 0)
      setCell(words, cellRow * width + column, BRAILLE_BLANK + bits, color)
    }
  }
  return encodeCells(words)
}

// One row of braille, two dot columns to a cell: `points` (two per cell, oldest first) scaled to the largest.
export function streamCells(points: number[], width: number) {
  const peak = Math.max(1, ...points)
  const color = packRgb(hexToRgb(MAUVE))
  const words = new Uint32Array(width * 3)
  for (let column = 0; column < width; column++) {
    const bits = [0, 1].reduce((lit, half) => lit | columnBits(half, Math.round((points[column * 2 + half]! / peak) * 4), 0, 1), 0)
    setCell(words, column, BRAILLE_BLANK + (bits || BRAILLE_FLOOR), bits ? color : TRACK_PACKED)
  }
  return encodeCells(words)
}
