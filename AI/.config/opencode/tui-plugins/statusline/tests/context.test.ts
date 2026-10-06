import { describe, expect, test } from 'bun:test'
import {
  createTokenStream, FILL_CELLS, FILL_ROWS, FILL_TURNS, fillCells, fillColor, HEAT, heatColor, liveReading, rowFit, short,
  STREAM_CELLS, streamCells, tokensPerSecond, turnReadings, type ContextMessage,
} from '../src/context'
import { oracle } from './oracle'

// A fixed pseudo-random sequence, so a failure reproduces.
const seeded = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296

describe('row above the prompt matches Ember Ribbon, cell for cell', () => {
  test('sizes are the original ones', () => {
    expect([FILL_CELLS, FILL_ROWS, FILL_TURNS, STREAM_CELLS]).toEqual([oracle.FILL_CELLS, oracle.FILL_ROWS, oracle.FILL_TURNS, oracle.STREAM_CELLS])
  })

  test('short and the heat bands', () => {
    for (const n of [0, 7, 999, 1000, 1049, 1050, 134_400, 200_000, 999_999, 1_000_000, 2_540_000]) expect(short(n)).toBe(oracle.short(n))
    expect(HEAT.map(band => band.color)).toEqual(oracle.HEAT.map(band => band.color))
    for (let percent = 0; percent <= 120; percent++) {
      const band = oracle.HEAT.find(b => percent < b.upTo) ?? oracle.HEAT[oracle.HEAT.length - 1]!
      expect(heatColor(percent)).toBe(band.color)
    }
  })

  test('fill colour for every percent', () => {
    // fillColor is not exported by Claude's cells; its words show through a one-turn chart.
    for (let percent = -10; percent <= 130; percent++) expect(fillColor(percent)).toEqual(oracle.fillColor(percent))
  })

  test('fill chart over empty, partial, full and out-of-range histories', () => {
    const next = seeded(11)
    const histories: number[][] = [[], [0], [100], [41], [-5, 130, 50], Array.from({ length: FILL_TURNS }, (_, i) => i * 7), Array.from({ length: FILL_TURNS + 9 }, () => next() * 100)]
    for (let i = 0; i < 300; i++) histories.push(Array.from({ length: Math.floor(next() * (FILL_TURNS + 6)) }, () => Math.round(next() * 110 - 5)))
    for (const history of histories) {
      for (const [width, rows] of [[FILL_CELLS, FILL_ROWS], [4, 1], [5, 3]] as const) {
        expect(Array.from(fillCells(width, rows, history))).toEqual(Array.from(oracle.fillCells(width, rows, history)))
      }
    }
  })

  test('stream chart and tok/s over idle, ramping, bursty and long streams', () => {
    const next = seeded(23)
    const streams: number[][] = [[], [0], [0, 0, 0], [40], Array.from({ length: 26 }, (_, i) => i * 3), Array.from({ length: 26 }, () => 0)]
    for (let i = 0; i < 300; i++) streams.push(Array.from({ length: Math.floor(next() * 28) }, () => (next() < 0.3 ? 0 : Math.round(next() * 90))))
    for (const stream of streams) {
      expect(Array.from(streamCells(stream, STREAM_CELLS))).toEqual(Array.from(oracle.streamCells(stream, STREAM_CELLS)))
      expect(tokensPerSecond(stream)).toBe(oracle.tokensPerSecond(stream))
    }
  })
})

describe('token stream sampling', () => {
  test('a run starts a fresh chart, ticks push what streamed and the chart runs down to flat', () => {
    const stream = createTokenStream()
    stream.tick(false)
    expect(stream.samples()).toEqual([])
    stream.add(99)
    stream.tick(true)
    expect(stream.samples()).toEqual([0])
    stream.add(40)
    stream.tick(true)
    stream.tick(true)
    expect(stream.samples()).toEqual([0, 40, 0])
    // The reply ends: ticks keep running while any sample is above zero, then stop.
    stream.tick(false)
    stream.tick(false)
    expect(stream.samples()).toEqual([0, 40, 0, 0, 0])
    // A new run clears the old chart.
    stream.add(8)
    stream.tick(true)
    expect(stream.samples()).toEqual([0])
  })

  test('keeps the last STREAM_CELLS * 2 + 10 samples', () => {
    const stream = createTokenStream()
    for (let i = 0; i < 100; i++) { stream.add(i + 1); stream.tick(true) }
    expect(stream.samples()).toHaveLength(STREAM_CELLS * 2 + 10)
    expect(stream.samples().at(-1)).toBe(100)
  })

  test('characters before the first tick of a run are not carried into it', () => {
    const stream = createTokenStream()
    stream.add(500)
    stream.tick(true)
    expect(stream.samples()).toEqual([0])
  })
})

const usage = (input: number, output = 0, cacheRead = 0, cacheWrite = 0, reasoning = 0) => ({ input, output, reasoning, cache: { read: cacheRead, write: cacheWrite } })
const model = { id: 'claude-opus-5-5', providerID: 'anthropic' }
const assistant = (tokens?: ReturnType<typeof usage>, ref = model): ContextMessage => ({ type: 'assistant', model: ref, tokens })
const windows = (ref: { id: string; providerID: string }) => (ref.id === 'claude-opus-5-5' ? 200_000 : undefined)

describe('context readings from OpenCode messages', () => {
  test('a step is the sum OpenCode shows: input, output, reasoning and both caches', () => {
    expect(liveReading([{ type: 'user' }, assistant(usage(1000, 200, 30_000, 4000, 50))], windows)).toEqual({ tokens: 35_250, window: 200_000, percent: 18 })
  })

  test('the live reading is the latest step that reported tokens', () => {
    const messages: ContextMessage[] = [{ type: 'user' }, assistant(usage(100_000)), assistant(usage(120_000)), assistant(undefined)]
    expect(liveReading(messages, windows)?.tokens).toBe(120_000)
    expect(liveReading([{ type: 'user' }], windows)).toBeUndefined()
    // A model whose window is not known yet, or a step with no tokens, reads as nothing.
    expect(liveReading([{ type: 'assistant', tokens: usage(5) }], windows)).toBeUndefined()
    expect(liveReading([assistant(usage(5), { id: 'x', providerID: 'y' })], windows)).toBeUndefined()
    expect(liveReading([assistant(usage(0))], windows)).toBeUndefined()
  })

  test('one reading per turn: the turn\'s last step, the running turn left out until it ends', () => {
    const messages: ContextMessage[] = [
      { type: 'user' }, assistant(usage(10_000)), assistant(usage(20_000)),
      { type: 'user' }, assistant(usage(30_000)),
      { type: 'user' }, assistant(usage(50_000)), assistant(usage(60_000)),
    ]
    expect(turnReadings(messages, windows, true).map(r => r.percent)).toEqual([10, 15])
    expect(turnReadings(messages, windows, false).map(r => r.percent)).toEqual([10, 15, 30])
    expect(turnReadings([{ type: 'user' }], windows, false)).toEqual([])
  })

  test('keeps the newest FILL_TURNS turns', () => {
    const messages = Array.from({ length: 40 }, (_, i): ContextMessage[] => [{ type: 'user' }, assistant(usage((i + 1) * 1000))]).flat()
    const readings = turnReadings(messages, windows, false)
    expect(readings).toHaveLength(FILL_TURNS)
    expect(readings.at(-1)?.tokens).toBe(40_000)
  })

  test('a step still streaming keeps the turn\'s earlier reading', () => {
    const messages: ContextMessage[] = [{ type: 'user' }, assistant(usage(40_000)), { type: 'system' }, assistant(undefined)]
    expect(turnReadings(messages, windows, false).map(r => r.tokens)).toEqual([40_000])
  })
})

describe('row fit', () => {
  test('stream goes first, then the chart, and the readout stays', () => {
    const readout = '134.4k / 200k'.length
    expect(rowFit(200, readout)).toEqual({ chart: true, stream: true })
    expect(rowFit(readout + 9 + 22 - 1, readout)).toEqual({ chart: true, stream: false })
    expect(rowFit(readout + 9 - 1, readout)).toEqual({ chart: false, stream: false })
    expect(rowFit(0, readout)).toEqual({ chart: false, stream: false })
  })
})
