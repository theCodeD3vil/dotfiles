/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from 'bun:test'
import { RGBA, type CapturedFrame } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin'
import { FILL_CELLS, FILL_ROWS, STREAM_CELLS, fillCells, heatColor, reading, streamCells } from '../src/context'

Bun.plugin(createSolidTransformPlugin({ moduleName: '@opentui/solid' }))
const { ContextRow, ROW_PAD } = await import('../src/above.tsx')

const history = [8, 12, 15, 22, 30, 34, 41, 47, 52, 58, 63, 71, 76, 82]
const ramp = [0, 0, 6, 14, 30, 52, 70, 64, 48, 30, 18, 9, 4, 0, 0, 12, 40]

async function draw(columns: number, frame: Partial<Parameters<typeof ContextRow>[0]['frame']> = {}) {
  const view = await testRender(() => (
    <box width={columns} flexDirection="row">
      <ContextRow frame={{ history, now: reading(134_400, 200_000), stream: ramp, columns, ...frame }} />
    </box>
  ), { width: columns, height: FILL_ROWS + ROW_PAD })
  await view.renderOnce()
  return view
}

const rgb = (value: RGBA) => value.toInts().slice(0, 3)
const cells = (frame: CapturedFrame, row: number) => frame.lines[row]!.spans.flatMap(span => Array.from(span.text).map(glyph => ({ glyph, fg: rgb(span.fg), bg: span.bg.intent })))
const unpack = (word: number) => [(word >> 16) & 255, (word >> 8) & 255, word & 255]

describe('context row above the prompt', () => {
  test('draws chart, readout and stream, right-aligned, like Ember Ribbon', async () => {
    const view = await draw(80)
    try {
      const text = view.captureCharFrame().split('\n')
      // Chart over two rows at the left of the group; readout and the stream on the bottom row.
      const bottom = text[ROW_PAD + FILL_ROWS - 1]!
      expect(bottom).toMatch(/[⠀-⣿]{8} 134\.4k \/ 200k {3}[⠀-⣿]{8} [ \d]{1,4} tok\/s$/)
      // Flush with the right edge.
      expect(bottom.length).toBe(80)
      expect(text[ROW_PAD]!.trim()).toMatch(/^[⠀-⣿]{8}$/)
    } finally { view.renderer.destroy() }
  })

  test('cells are the ones Ember Ribbon\'s functions produce, on the terminal-default background', async () => {
    const view = await draw(80)
    try {
      const frame = view.captureSpans()
      const chart = fillCells(FILL_CELLS, FILL_ROWS, history)
      for (let row = 0; row < FILL_ROWS; row++) {
        const drawn = cells(frame, ROW_PAD + row).filter(cell => /[⠀-⣿]/.test(cell.glyph)).slice(0, FILL_CELLS)
        expect(drawn).toHaveLength(FILL_CELLS)
        drawn.forEach((cell, x) => {
          expect(cell.glyph.codePointAt(0)).toBe(chart[(row * FILL_CELLS + x) * 3])
          expect(cell.fg).toEqual(unpack(chart[(row * FILL_CELLS + x) * 3 + 1]!))
          expect(cell.bg).toBe(RGBA.defaultBackground().intent)
        })
      }
      const stream = streamCells(ramp, STREAM_CELLS)
      const bottom = cells(frame, ROW_PAD + FILL_ROWS - 1).filter(cell => /[⠀-⣿]/.test(cell.glyph)).slice(-STREAM_CELLS)
      bottom.forEach((cell, x) => {
        expect(cell.glyph.codePointAt(0)).toBe(stream[x * 3])
        expect(cell.fg).toEqual(unpack(stream[x * 3 + 1]!))
      })
    } finally { view.renderer.destroy() }
  })

  test('the used count takes the heat colour, the window stays dim', async () => {
    for (const [tokens, window] of [[20_000, 200_000], [80_000, 200_000], [134_400, 200_000], [170_000, 200_000], [196_000, 200_000]] as const) {
      const view = await draw(80, { now: reading(tokens, window) })
      try {
        const row = cells(view.captureSpans(), ROW_PAD + FILL_ROWS - 1)
        const used = row.find(cell => cell.glyph === '2' || cell.glyph === '1' || cell.glyph === '8' || cell.glyph === '9')!
        const hex = heatColor(reading(tokens, window).percent)
        expect(used.fg).toEqual([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)))
      } finally { view.renderer.destroy() }
    }
  })

  test('before any model reports tokens the readout is a dash pair and the chart rests on its floor', async () => {
    const view = await draw(80, { history: [], now: undefined, stream: [] })
    try {
      const text = view.captureCharFrame().split('\n')
      const bottom = text[ROW_PAD + FILL_ROWS - 1]!
      expect(bottom).toContain('⣀'.repeat(FILL_CELLS) + ' – / –')
      expect(bottom).toContain('   0 tok/s')
      expect(text[ROW_PAD]!.trim()).toBe('⠀'.repeat(FILL_CELLS))
    } finally { view.renderer.destroy() }
  })

  test('tok/s is padded to four digits with figure spaces so the row holds still', async () => {
    const view = await draw(80, { stream: Array(10).fill(40) })
    try {
      // Ten ticks of 40 characters is about 100 tokens a second.
      expect(view.captureCharFrame()).toContain(' 100 tok/s')
    } finally { view.renderer.destroy() }
  })

  test('narrow rows give up the stream, then the chart, and keep the readout', async () => {
    const half = await draw(36)
    const bare = await draw(20)
    try {
      const wide = half.captureCharFrame()
      expect(wide).toContain('134.4k / 200k')
      expect(wide).not.toContain('tok/s')
      expect(wide).toMatch(/[⠀-⣿]{8}/)
      const small = bare.captureCharFrame()
      expect(small).toContain('134.4k / 200k')
      expect(small).not.toMatch(/[⠀-⣿]/)
    } finally { half.renderer.destroy(); bare.renderer.destroy() }
  })
})
