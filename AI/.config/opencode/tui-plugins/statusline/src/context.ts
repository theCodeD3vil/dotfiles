// Ember Ribbon's row above the prompt: the context window's sparkline, the used / window
// readout and the token stream. Keep the arithmetic identical to
// AI/.claude/mods/ember-ribbon/hooks/ (band.tsx, rasters.ts, stream.ts); only the source of the numbers differs.
import { COLORS, DEFAULT_COLOR, GREEN, PINK, RED, TEAL, YELLOW, hex, mix, pack } from './footer'

// Claude orange at 25-50%: the used tokens coloured by how full the window is.
export const HEAT: ReadonlyArray<{ upTo: number; color: string }> = [
  { upTo: 25, color: GREEN },
  { upTo: 50, color: COLORS.claude },
  { upTo: 75, color: YELLOW },
  { upTo: 90, color: PINK },
  { upTo: Infinity, color: RED },
]

export const heatColor = (percent: number) => (HEAT.find(band => percent < band.upTo) ?? HEAT[HEAT.length - 1]!).color

// The context chart: one ▁▂▃▄▅▆▇█ glyph per turn, newest at the right.
export const FILL_CELLS = 8
export const FILL_ROWS = 1
export const FILL_TURNS = FILL_CELLS
// Token stream: one braille row at the far right of the row.
export const STREAM_CELLS = 8

const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const
const SPARKLINE_BASE = 0x2581 // ▁
const TRACK = pack(hex(COLORS.track))
const STREAM_COLOR = pack(hex(TEAL))
const FILL_GREEN = hex(GREEN)
const FILL_YELLOW = hex(YELLOW)
const FILL_RED = hex(RED)

export function short(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`
  return String(n)
}

export type ContextReading = { tokens: number; window: number; percent: number }

export const reading = (tokens: number, window: number): ContextReading => ({
  tokens, window, percent: Math.round((tokens / window) * 100),
})

// Green when low, yellow mid, red high.
export const fillColor = (percent: number) => {
  const t = Math.min(1, Math.max(0, percent / 100))
  return t < 0.5 ? mix(FILL_GREEN, FILL_YELLOW, t * 2) : mix(FILL_YELLOW, FILL_RED, (t - 0.5) * 2)
}

const sparklineGlyph = (value: number, peak: number) => SPARKLINE_BASE + Math.round((Math.max(0, Math.min(peak, value)) / peak) * 7)

// One terminal row: each turn has one ▁▂▃▄▅▆▇█ glyph. A turn keeps the existing continuous
// green → yellow → red context colour; cells before the first turn stay on the dim track.
export function contextSparklineCells(width: number, percents: number[]) {
  const shown = percents.slice(-width)
  const firstTurn = width - shown.length
  const words = new Uint32Array(width * 3)
  for (let column = 0; column < width; column++) {
    const percent = shown[column - firstTurn]
    const color = percent === undefined ? TRACK : pack(fillColor(percent))
    words.set([sparklineGlyph(percent ?? 0, 100), color, DEFAULT_COLOR], column * 3)
  }
  return words
}

// One terminal row, scaled to the recent peak. Zeros and missing history retain the dim ▁ baseline.
export function sparklineCells(points: number[], width: number, color: number) {
  const shown = points.slice(-width)
  const firstPoint = width - shown.length
  const peak = Math.max(1, ...shown)
  const words = new Uint32Array(width * 3)
  for (let column = 0; column < width; column++) {
    const point = shown[column - firstPoint]
    words.set([sparklineGlyph(point ?? 0, peak), point && point > 0 ? color : TRACK, DEFAULT_COLOR], column * 3)
  }
  return words
}

// Characters the reply streams in each 100 ms tick (text, thinking and tool input; about four to a
// token), newest last. Each dot column of the chart is the mean of five ticks (half a second),
// so the line reads as a rate.
export function tokensPerSecond(stream: readonly number[]) {
  return Math.round(stream.slice(-10).reduce((a, b) => a + b, 0) / 4)
}

export function streamPoints(stream: readonly number[], width: number) {
  return Array.from({ length: width * 2 }, (_, i) => {
    const end = stream.length - (width * 2 - 1 - i)
    const window = stream.slice(Math.max(0, end - 5), Math.max(0, end))
    return window.length ? window.reduce((a, b) => a + b, 0) / window.length : 0
  })
}

export const streamCells = (stream: readonly number[], width: number) => pointCells(streamPoints(stream, width), width, STREAM_COLOR)

// One row of braille, two dot columns to a cell: `points` (two per cell, oldest first) scaled to the largest.
export function pointCells(points: readonly number[], width: number, color: number) {
  const top = Math.max(1, ...points)
  const words = new Uint32Array(width * 3)
  for (let x = 0; x < width; x++) {
    let bits = 0
    for (let c = 0; c < 2; c++) {
      const level = Math.round((points[x * 2 + c]! / top) * 4)
      for (let r = 4 - level; r < 4; r++) bits |= BRAILLE_BITS[r]![c]!
    }
    words.set([bits ? 0x2800 + bits : 0x2800 + BRAILLE_BITS[3]![0]! + BRAILLE_BITS[3]![1]!, bits ? color : TRACK, DEFAULT_COLOR], x * 3)
  }
  return words
}

// Claude's turn.start clears the chart; its 100 ms clock pushes one sample a tick while the reply
// works or the chart is still running down, so an idle chart settles to a flat line.
export function createTokenStream(capacity = STREAM_CELLS * 2 + 10) {
  let samples: number[] = []
  let pending = 0
  let wasWorking = false
  return {
    samples: () => samples,
    // Count a streamed piece of the reply.
    add(characters: number) { pending += characters },
    // One 100 ms tick. A fresh run (idle to working) starts a fresh chart.
    tick(working: boolean) {
      if (working && !wasWorking) { samples = []; pending = 0 }
      wasWorking = working
      if (working || pending > 0 || samples.some(v => v > 0)) {
        samples.push(pending)
        pending = 0
        if (samples.length > capacity) samples.shift()
      }
    },
    reset() { samples = []; pending = 0; wasWorking = false },
  }
}

// What the row's pieces need from a session's messages. OpenCode's assistant message carries the
// token totals of its step; a user message starts a new turn.
export type ContextMessage = {
  type: string
  model?: { id: string; providerID: string }
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
}

export type ContextWindows = (model: { id: string; providerID: string }) => number | undefined

// The context in use after a step: everything sent plus what came back, OpenCode's own sum.
const stepTokens = (t: NonNullable<ContextMessage['tokens']>) => t.input + t.output + t.reasoning + t.cache.read + t.cache.write

function stepReading(message: ContextMessage | undefined, windows: ContextWindows) {
  if (message?.type !== 'assistant' || !message.tokens || !message.model) return
  const window = windows(message.model)
  const tokens = stepTokens(message.tokens)
  if (!window || tokens <= 0) return
  return reading(tokens, window)
}

// The live context: the latest step that reported its tokens.
export function liveReading(messages: readonly ContextMessage[], windows: ContextWindows) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const found = stepReading(messages[i], windows)
    if (found) return found
  }
}

// One reading per turn, oldest first, as Claude takes one as each main-loop turn ends: the last
// step of the turns before the latest one, and of the latest too once the session is idle.
export function turnReadings(messages: readonly ContextMessage[], windows: ContextWindows, working: boolean, turns = FILL_TURNS) {
  const readings: ContextReading[] = []
  let last: ContextReading | undefined
  const close = () => { if (last) readings.push(last); last = undefined }
  for (const message of messages) {
    if (message.type === 'user') close()
    else last = stepReading(message, windows) ?? last
  }
  if (!working) close()
  return readings.slice(-turns)
}

// Widths of the row's pieces, counted from the boxes in above.tsx: the chart and its 1 column of
// margin, the readout, then the stream's 3 columns of margin, 8 cells, a gap and "0000 tok/s".
const CHART_WIDTH = FILL_CELLS + 1
const STREAM_WIDTH = 3 + STREAM_CELLS + 1 + 4 + ' tok/s'.length

// Claude's row has no narrow layout; the terminals OpenCode runs in can be small, so the stream goes
// first and then the chart, leaving the readout, which is the figure that matters.
export function rowFit(columns: number, readoutWidth: number) {
  const stream = columns >= readoutWidth + CHART_WIDTH + STREAM_WIDTH
  const chart = stream || columns >= readoutWidth + CHART_WIDTH
  return { chart, stream }
}

export type TokenStream = ReturnType<typeof createTokenStream>
