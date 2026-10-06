/** @jsxImportSource @opentui/solid */
/** Renderer-level checks for Scanner and the terminal-default quota footer. */
import { describe, expect, test } from 'bun:test'
import { RGBA, type CapturedFrame } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin'
import { createSignal } from 'solid-js'
import { footerLayout } from '../src/footer'
import { SCANNER, SCANNER_COLORS, SCANNER_DOT, SCANNER_STAGE_COLORS, SCANNER_TRACK_LEVEL, scannerMode, scannerRows, scannerWidth, type ScannerMode } from '../src/scanner'
import type { ConversationStage } from '../src/stage'

Bun.plugin(createSolidTransformPlugin({ moduleName: '@opentui/solid' }))
const { FooterView } = await import('../src/view.tsx')

const now = Date.parse('2026-10-05T12:00:00.000Z')
const base = {
  fiveLimit: { percentUsed: 41, resetsAt: new Date(now + 134 * 60_000).toISOString() },
  weekLimit: { percentUsed: 18, resetsAt: new Date(now + (3 * 1440 + 5 * 60) * 60_000).toISOString() },
  now,
  tick: 0,
}

const rows = (frame: CapturedFrame) => frame.lines.map(item => item.spans.flatMap(span => Array.from(span.text)).join(''))
// The scanner's bottom row shares its row with the stats.
const line = (frame: CapturedFrame) => rows(frame).find(row => row.includes('5h')) ?? ''

// The columns given are the stats' room, so the quota tests default to the one-cell form.
async function render(columns: number, tick = 0, options: { working?: boolean; mode?: ScannerMode; animate?: boolean; stage?: ConversationStage } = {}) {
  const candidate = await testRender(() => (
    <box width={columns} flexDirection="row">
      <FooterView
        frame={footerLayout({ ...base, columns, tick })}
        animationTick={tick}
        working={options.working ?? true}
        mode={options.mode ?? 'compact'}
        stage={options.stage}
        animate={options.animate}
      />
    </box>
  ), { width: columns, height: 3, backgroundColor: '#1e1e2e' })
  await candidate.renderOnce()
  return candidate
}

const { panel: PANEL } = SCANNER_COLORS
const STAGES = ['waiting', 'thinking', 'tool', 'writing', 'approval', 'compacting'] as const
// The stage colours as the brief states them, so a change to the table is caught.
const TONES: Record<ConversationStage, readonly number[]> = {
  waiting: [0xff, 0x5a, 0x5a], thinking: [0xb7, 0x94, 0xf6], tool: [0xf0, 0xb3, 0x5a],
  writing: [0x7e, 0xe7, 0x87], approval: [0xf4, 0x72, 0xb6], compacting: [0x79, 0xb8, 0xff],
}
const RED = TONES.waiting
const text = (tick: number, working = true, options: { mode?: ScannerMode; animate?: boolean; stage?: ConversationStage } = {}) =>
  scannerRows(tick, working, options).map(row => row.map(cell => cell.glyph).join(''))
const TICKS = Array.from({ length: 400 }, (_, tick) => tick)
const blend = (tone: readonly number[], level: number) => PANEL.map((low, channel) => Math.round(low + (tone[channel]! - low) * level))

const lit = (tick: number) => scannerRows(tick, true).flatMap((row, y) =>
  row.flatMap((cell, x) => (cell.glyph === ' ' ? [] : [{ x, y, color: cell.color }])),
)
const heads = (tick: number) => lit(tick).filter(cell => cell.color.join() === blend(RED, 1).join())

describe('Scanner frames', () => {
  test('is three rows of ten separate square cells, or a three-row compact pulse', () => {
    expect(SCANNER_DOT).toBe('▪')
    for (const tick of TICKS) {
      const frame = scannerRows(tick, true)
      expect(frame.map(row => row.length)).toEqual([10, 10, 10])
      for (const cell of frame.flat()) expect(cell.glyph).toBe('▪')
      expect(scannerRows(tick, true, { mode: 'compact' }).map(row => row.length)).toEqual([1, 1, 1])
    }
  })

  test('takes the same three-row shape in every stage and only the colour changes', () => {
    for (const stage of STAGES) {
      for (let tick = 0; tick < 110; tick++) {
        const waiting = scannerRows(tick, true)
        const frame = scannerRows(tick, true, { stage })
        expect(frame.map(row => row.map(cell => cell.glyph)), `${stage} tick=${tick}`).toEqual(waiting.map(row => row.map(cell => cell.glyph)))
        expect(heads(tick)).not.toHaveLength(0)
        const stageHead = frame.flat().find(cell => cell.color.join() === blend(TONES[stage], 1).join())
        expect(stageHead, `${stage} tick=${tick}`).toBeDefined()
      }
    }
  })

  test('colours the head by the conversation stage', () => {
    // Waiting is the scanner's own red, thinking violet, a tool call amber, writing green,
    // approval pink and compacting blue; the head dot shows the stage's colour at full strength.
    const heads = STAGES.map(stage => scannerRows(21, true, { stage }).flat().find(cell => cell.color.join() === blend(TONES[stage], 1).join())!.color.join())
    expect(heads).toEqual(STAGES.map(stage => blend(TONES[stage], 1).join()))
    expect(new Set(heads).size).toBe(6)
    for (const stage of STAGES) expect([...SCANNER_STAGE_COLORS[stage]] as number[]).toEqual([...TONES[stage]])
    // No stage given is the same as waiting.
    expect(scannerRows(21, true)).toEqual(scannerRows(21, true, { stage: 'waiting' }))
  })

  test('moves two heads on every 100 ms tick through the three-row Ribbon braid', () => {
    expect(heads(0)).toMatchObject([{ x: 0, y: 0 }, { x: 0, y: 2 }])
    expect(heads(9)).toMatchObject([{ x: 9, y: 0 }, { x: 9, y: 2 }])
    expect(heads(10)).toMatchObject([{ x: 9, y: 1 }])
    expect(heads(19)).toMatchObject([{ x: 0, y: 1 }])
    expect(heads(20)).toMatchObject([{ x: 0, y: 0 }, { x: 0, y: 2 }])
    for (const tick of TICKS) {
      expect(scannerRows(tick, true), `tick=${tick}`).not.toEqual(scannerRows(tick + 1, true))
      expect(heads(tick)).not.toHaveLength(0)
    }
    expect(new Set(Array.from({ length: 20 }, (_, tick) => JSON.stringify(scannerRows(tick, true)))).size).toBe(20)
    expect(scannerRows(0, true)).toEqual(scannerRows(20, true))
  })

  test('fades each Ribbon head through its two-point tail', () => {
    const colours = scannerRows(4, true)[0]!.map(cell => cell.color.join())
    const levels = [0.46, 0.61, 1]
    expect(colours.slice(2, 5)).toEqual(levels.map(level => blend(RED, level).join()))
    expect(scannerRows(4, true)[2]!.map(cell => cell.color.join())).toEqual(colours)
    expect(colours.slice(0, 2)).toEqual(Array(2).fill(blend(RED, SCANNER_TRACK_LEVEL).join()))
    expect(colours.slice(5)).toEqual(Array(5).fill(blend(RED, SCANNER_TRACK_LEVEL).join()))
  })

  test('is blank while inactive, with its three-row footprint preserved', () => {
    expect(text(0, false)).toEqual(['          ', '          ', '          '])
    for (const cell of scannerRows(0, false).flat()) expect([...cell.color]).toEqual([...PANEL])
    for (const tick of TICKS) expect(scannerRows(tick, false)).toEqual(scannerRows(0, false))
    for (const stage of STAGES) expect(scannerRows(0, false, { stage })).toEqual(scannerRows(0, false))
  })

  test('keeps its size whatever the state, so nothing jumps when work starts', () => {
    for (const mode of ['full', 'compact'] as const) {
      const shape = (working: boolean) => scannerRows(7, working, { mode }).map(row => row.length)
      expect(shape(true)).toEqual(shape(false))
      expect(shape(true)).toEqual(Array(SCANNER[mode].rows).fill(scannerWidth(mode)))
    }
  })

  test('steps down to a three-dot vertical pulse at narrow widths', () => {
    expect([40, 33, 32, 24].map(scannerMode)).toEqual(['full', 'full', 'compact', 'compact'])
    expect(text(0, true, { mode: 'compact' })).toEqual(['▪', '▪', '▪'])
    expect(text(0, false, { mode: 'compact' })).toEqual([' ', ' ', ' '])
    expect(scannerRows(0, true, { mode: 'compact' })[0]![0]!.color.join()).toBe(blend(RED, 1).join())
    expect(scannerRows(0, true, { mode: 'compact' })[1]![0]!.color.join()).toBe(blend(RED, 0.18).join())
    expect(scannerRows(1, true, { mode: 'compact' })[1]![0]!.color.join()).toBe(blend(RED, 1).join())
    expect(scannerRows(2, true, { mode: 'compact' })[2]![0]!.color.join()).toBe(blend(RED, 1).join())
    expect(scannerRows(3, true, { mode: 'compact' })[1]![0]!.color.join()).toBe(blend(RED, 1).join())
    for (const stage of STAGES) expect(scannerRows(0, true, { mode: 'compact', stage })[0]![0]!.color.join()).toBe(blend(TONES[stage], 1).join())
  })

  test('animate: false pins one still Ribbon frame, the one at tick 4, in the stage colour', () => {
    const still = scannerRows(0, true, { animate: false })
    for (const tick of TICKS) expect(scannerRows(tick, true, { animate: false })).toEqual(still)
    expect(still).toEqual(scannerRows(4, true))
    expect(scannerRows(99, true, { animate: false, stage: 'tool' })).toEqual(scannerRows(4, true, { stage: 'tool' }))
  })
})

describe('native usage-footer rendering', () => {
  test('anchors the scanner at the far left with a separate square-cell track and the stats at the right', async () => {
      const candidate = await render(80, 14, { mode: 'full' })
      try {
        const frame = candidate.captureSpans()
        const [top] = rows(frame)
        expect(top!.startsWith(text(14)[0]!)).toBe(true)
        // The stats keep the right edge: the 52-cell full gauge form starts at 80 − 52.
        expect(line(frame).indexOf('5h')).toBe(28)
        const spans = frame.lines.flatMap(row => row.spans).filter(span => span.text.includes(SCANNER_DOT))
      expect(spans.length).toBeGreaterThan(2)
      for (const span of spans) {
        expect(span.bg.intent).toBe(RGBA.defaultBackground().intent)
        span.fg.toInts().slice(0, 3).forEach((channel, index) => {
          expect(channel).toBeGreaterThanOrEqual(Math.min(PANEL[index]!, RED[index]!))
          expect(channel).toBeLessThanOrEqual(Math.max(PANEL[index]!, RED[index]!))
        })
      }
    } finally {
      candidate.renderer.destroy()
    }
  })

  test('draws every dot in its own colour, the head in the stage colour', async () => {
    for (const stage of STAGES) {
      const candidate = await render(80, 14, { mode: 'full', stage })
      try {
        const colours = candidate.captureSpans().lines.flatMap(row => row.spans).filter(span => span.text.includes(SCANNER_DOT)).map(span => span.fg.toInts().slice(0, 3).join())
        expect(colours.includes(blend(TONES[stage], 1).join()), stage).toBe(true)
        // The dim track, head, and two tail levels are separate colours.
        expect(new Set(colours).size).toBe(4)
      } finally {
        candidate.renderer.destroy()
      }
    }
  })

  test('renders the idle, mid-hop, compact and non-animated forms', async () => {
    for (const [options, tick, expected] of [
      [{ working: false, mode: 'full' }, 40, ['          ', '          ', '          ']],
      [{ mode: 'full' }, 30, text(30)],
      [{ mode: 'compact' }, 3, ['▪', '▪', '▪']],
      [{ working: false, mode: 'compact' }, 8, [' ', ' ', ' ']],
      [{ mode: 'full', animate: false }, 7, text(4)],
    ] as const) {
      const candidate = await render(80, tick, options)
      try {
        const shown = rows(candidate.captureSpans())
        expect(shown.slice(0, expected.length).map((row, index) => row!.slice(0, expected[index]!.length)), JSON.stringify(options)).toEqual([...expected])
        expect(line(candidate.captureSpans())).toContain('5h')
      } finally {
        candidate.renderer.destroy()
      }
    }
  })

  test('has no model icon or model name and right-aligns the full gauge form', async () => {
    const candidate = await render(80)
    try {
      const value = line(candidate.captureSpans())
      expect(value.indexOf('5h')).toBe(28)
      expect(value.trimEnd()).toContain('5h')
      expect(value).toContain('2h14m')
      expect(value).toContain('wk')
      expect(value).toContain('3d05h')
      expect(value).not.toContain('Opus')
      expect(value).not.toContain('gpt-')
      expect(value).not.toContain('✻')
    } finally {
      candidate.renderer.destroy()
    }
  })

  test('keeps right alignment through rings with and without countdowns', async () => {
    for (const [columns, start, hasTime] of [[51, 20, true], [30, 11, false]] as const) {
      const candidate = await render(columns)
      try {
        const value = line(candidate.captureSpans())
        expect(value.indexOf('5h')).toBe(start)
        expect(value).toContain('wk')
        expect(value.includes('2h14m')).toBe(hasTime)
        expect(value.includes('3d05h')).toBe(hasTime)
      } finally {
        candidate.renderer.destroy()
      }
    }
  })

  test('preserves source gauge colours and terminal-default backgrounds', async () => {
    const candidate = await render(80, 14)
    try {
      const spans = candidate.captureSpans().lines.flatMap(row => row.spans)
      const label = spans.find(span => span.text === '5h')!
      expect(label.fg.toInts().slice(0, 3)).toEqual([124, 119, 109])
      expect(label.bg.intent).toBe(RGBA.defaultBackground().intent)
      const words = spans.flatMap(span => Array.from(span.text))
      expect(words).toContain('⢾')
    } finally {
      candidate.renderer.destroy()
    }
  })

  test('updates the animated braille bar without moving either stat', async () => {
    const [tick, setTick] = createSignal(0)
    const candidate = await testRender(() => FooterView({
      frame: footerLayout({ ...base, columns: 80, tick: 0 }),
      get animationTick() { return tick() },
      working: true,
       mode: 'full',
    }), { width: 80, height: 3 })
    try {
      await candidate.renderOnce()
      const initial = candidate.captureSpans()
      setTick(7)
      await candidate.renderOnce()
      const animated = candidate.captureSpans()
      expect(line(animated).indexOf('5h')).toBe(line(initial).indexOf('5h'))
      expect(line(animated).indexOf('wk')).toBe(line(initial).indexOf('wk'))
      expect(scannerRows(0, true)).not.toEqual(scannerRows(7, true))
    } finally {
      candidate.renderer.destroy()
    }
  })
})
