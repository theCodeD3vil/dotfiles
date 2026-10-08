// Ember Ribbon's row above the prompt: the context window's fill history, the used / window
// readout and the token stream. Keep the arithmetic identical to
// AI/.claude/mods/ember-ribbon/hooks/register.tsx; only the source of the numbers differs.
import { COLORS, DEFAULT_COLOR, hex, mix, pack } from './footer'

// Catppuccin Mocha
const GREEN = '#A6E3A1'
const YELLOW = '#F9E2AF'
const RED = '#F38BA8'

// Claude orange at 25-50%: the used tokens coloured by how full the window is.
export const HEAT: ReadonlyArray<{ upTo: number; color: string }> = [
  { upTo: 25, color: GREEN },
  { upTo: 50, color: COLORS.claude },
  { upTo: 75, color: YELLOW },
  { upTo: 90, color: '#F5C2E7' },
  { upTo: Infinity, color: RED },
]

export const heatColor = (percent: number) => (HEAT.find(band => percent < band.upTo) ?? HEAT[HEAT.length - 1]!).color

// The context chart: one dot column per turn, two to a cell, the newest turn at the right.
// FILL_ROWS cells tall, four dot rows to each, so a column has 4 * FILL_ROWS heights.
export const FILL_CELLS = 8
export const FILL_ROWS = 2
export const FILL_TURNS = FILL_CELLS * 2
// Token stream: 1 braille row at the far right of the row.
export const STREAM_CELLS = 8

const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const
const TRACK = pack(hex(COLORS.track))
const STREAM_COLOR = pack(hex('#CBA6F7')) // Catppuccin Mocha mauve
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

// percents: one per turn, oldest first. Turns fill from the right; the cells before the first turn
// are dim floor dots, and a cell is coloured by the higher of its two turns. Returns the Raster's
// [codepoint, foreground, default-background] words, row by row.
export function fillCells(width: number, rows: number, percents: number[]) {
  const shown = percents.slice(-width * 2)
  const first = width * 2 - shown.length
  const dots = rows * 4
  const words = new Uint32Array(width * rows * 3)
  for (let x = 0; x < width; x++) {
    const turns = [0, 1].map(c => shown[x * 2 + c - first])
    // How many dots tall each of this cell's two turns is; -1 for a column with no turn yet.
    const levels = turns.map(p => p === undefined ? -1 : Math.max(1, Math.round((Math.min(100, Math.max(0, p)) / 100) * dots)))
    const top = Math.max(...turns.map(p => p ?? -1))
    const color = top < 0 ? TRACK : pack(fillColor(top))
    for (let cr = 0; cr < rows; cr++) {
      let bits = 0
      for (let r = 0; r < 4; r++) {
        // The dot's height above the floor; lit when within the column's level (a bare column keeps its floor dots).
        const height = dots - 1 - (cr * 4 + r)
        for (let c = 0; c < 2; c++) if (height < levels[c]! || (levels[c] === -1 && height === 0)) bits |= BRAILLE_BITS[r]![c]!
      }
      words.set([0x2800 + bits, color, DEFAULT_COLOR], (cr * width + x) * 3)
    }
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

export function streamCells(stream: readonly number[], width: number) {
  const points = streamPoints(stream, width)
  const top = Math.max(1, ...points)
  const words = new Uint32Array(width * 3)
  for (let x = 0; x < width; x++) {
    let bits = 0
    for (let c = 0; c < 2; c++) {
      const level = Math.round((points[x * 2 + c]! / top) * 4)
      for (let r = 4 - level; r < 4; r++) bits |= BRAILLE_BITS[r]![c]!
    }
    words.set([bits ? 0x2800 + bits : 0x2800 + BRAILLE_BITS[3]![0]! + BRAILLE_BITS[3]![1]!, bits ? STREAM_COLOR : TRACK, DEFAULT_COLOR], x * 3)
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
