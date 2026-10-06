import { describe, expect, mock, spyOn, test } from 'bun:test'
import { PluginContextProvider } from '@opencode/plugin/tui'
import type { Context, Route, SlotClaim } from '@opencode/plugin/tui/context'
import { BoxRenderable, type CliRenderer } from '@opentui/core'
import { insert, testRender, useRenderer, type JSX } from '@opentui/solid'
import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin'
import { createSignal } from 'solid-js'
import { usageCells } from '../src/footer'
import { SCANNER, SCANNER_COLORS, SCANNER_DOT, SCANNER_STAGE_COLORS, scannerRows, type ScannerMode } from '../src/scanner'
import type { ConversationStage } from '../src/stage'
import type { UsageSnapshot } from '../src/usage'

Bun.plugin(createSolidTransformPlugin({ moduleName: '@opentui/solid' }))
const { default: plugin } = await import('../src/tui.tsx')

const NOW = Date.parse('2026-10-05T12:00:00.000Z')
const snapshot = (five = 41, week = 18): UsageSnapshot => ({
  status: 'ok',
  rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: new Date(NOW + 134 * 60_000).toISOString() },
    { kind: 'seven_day', percentUsed: week, resetsAt: new Date(NOW + (3 * 1440 + 5 * 60) * 60_000).toISOString() },
  ],
})

type PendingCall = {
  input: { providerID: string; force?: boolean }
  options: { signal: AbortSignal; location: unknown }
  resolve: (snapshot: UsageSnapshot) => void
  reject: (error: Error) => void
}

async function mount(options: { width?: number; composerWidth?: number; inset?: number; location?: unknown; pluginOptions?: Record<string, unknown> } = {}) {
  const footerRows = SCANNER.full.rows
  const [selectedModel, setModel] = createSignal<{ providerID: string; modelID: string } | undefined>({
    providerID: 'openai', modelID: 'claude-opus-5-5[1m]',
  })
  const [status, setStatus] = createSignal<'idle' | 'running'>('idle')
  // What the session's messages and open permission requests say, for the scanner's stage.
  const [messages, setMessages] = createSignal<unknown[]>([])
  const [permissions, setPermissions] = createSignal<unknown[]>([])
  const [models, setModels] = createSignal<unknown[]>([{ providerID: 'openai', modelID: 'claude-opus-5-5[1m]', limit: { context: 200_000 } }])
  const [route, setRoute] = createSignal<Route>({ type: 'session', sessionID: 'session-a' })
  const [sessionID, setSessionID] = createSignal<string | undefined>('session-a')
  const calls: PendingCall[] = []
  const events = new Map<string, (event: unknown) => void>()
  const unsubscribers: ReturnType<typeof mock>[] = []
  const release = mock(() => {})
  const slot = mock((value: SlotClaim) => {
    if ('replace' in value && value.replace) claim = value
    else aboveClaim = value
    return release
  })
  let claim!: SlotClaim
  let aboveClaim!: SlotClaim
  let renderer!: CliRenderer
  let host!: BoxRenderable
  let cleanup!: () => void
  let timer!: () => void
  let timerDelay: number | undefined
  let timerRegistrations = 0
  let time = NOW
  const timerToken = 987654321
  const defaultLocation = { directory: '/mock/project' }
  const clock = spyOn(Date, 'now').mockImplementation(() => time)
  const clearTimer = spyOn(globalThis, 'clearInterval')
  const clearedTimers: unknown[] = []
  const context = {
    get renderer() { return renderer },
    options: options.pluginOptions ?? {},
    location: options.location,
    client: {
      rpc: () => ({
        get(input: PendingCall['input'], rpcOptions: PendingCall['options']) {
          return new Promise<UsageSnapshot>((resolve, reject) => {
            calls.push({ input, options: rpcOptions, resolve, reject })
          })
        },
      }),
    },
    data: {
      on(type: string, callback: (event: unknown) => void) {
        events.set(type, callback)
        const unsubscribe = mock(() => { events.delete(type) })
        unsubscribers.push(unsubscribe)
        return unsubscribe
      },
      session: { status: () => status(), message: { list: () => messages() }, permission: { list: () => permissions() } },
      location: { default: () => defaultLocation, model: { list: () => models(), sync: async () => {} } },
    },
    ui: { slot, model: { current: selectedModel }, router: { current: route } },
  } as unknown as Context

  let setupTimer: ReturnType<typeof spyOn> | undefined
  let disposed = false
  try {
    const native = await testRender(() => {
      renderer = useRenderer()
      // Capture only the plugin timer, retaining the renderer's own scheduling.
      setupTimer = spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
        timerRegistrations++
        timer = callback
        timerDelay = delay
        return timerToken
      }) as typeof setInterval)
      try { cleanup = plugin.setup(context) as () => void } finally { setupTimer.mockRestore() }
      host = new BoxRenderable(renderer, {
        id: 'mock-composer', width: options.composerWidth ?? options.width ?? 120,
        height: footerRows, flexDirection: 'row', justifyContent: 'space-between', gap: 2,
        paddingLeft: options.inset ?? 2, paddingRight: options.inset ?? 2,
      })
      const footer = PluginContextProvider({
        value: context,
        get children() {
          return claim.render({
            get sessionID() { return sessionID() }, mode: 'normal', showDetails: true,
          } as never)
        },
      })
      // The host's footer row holds only our replacement: the native status and
      // file slots no longer render, so the plugin box owns the whole row.
      insert(host, footer)
      return host as unknown as JSX.Element
    }, { width: options.width ?? 120, height: footerRows })

    const settle = async () => {
      await Promise.resolve()
      await Promise.resolve()
      await native.renderOnce()
    }
    // The scanner fills the three-row footer; quota stats align with its bottom row.
    const cells = () => native.captureSpans().lines[footerRows - 1]!.spans.flatMap(span => Array.from(span.text).map(glyph => ({
      glyph, foreground: span.fg.toInts(), backgroundIntent: span.bg.intent, attributes: span.attributes,
    })))
    const line = () => native.captureCharFrame().split('\n')[footerRows - 1]!
    const top = () => native.captureCharFrame().split('\n')[0]!
    const scannerLines = () => native.captureCharFrame().split('\n').slice(0, footerRows)
    const scannerCells = () => native.captureSpans().lines.slice(0, footerRows).map(line =>
      line.spans.flatMap(span => Array.from(span.text).map(glyph => ({ glyph, foreground: span.fg.toInts() }))).slice(options.inset ?? 2, (options.inset ?? 2) + SCANNER.full.cells),
    )
    const bar = () => {
      const row = cells()
      const start = row.findIndex(cell => cell.glyph === '⢾')
      return start < 0 ? [] : row.slice(start, start + 22)
    }
    const resolve = async (index: number, value = snapshot()) => { calls[index]!.resolve(value); await settle() }
    const emit = async (type: string) => { events.get(type)?.({ type }); await settle() }
    const advance = async (ticks: number) => {
      for (let index = 0; index < ticks; index++) { time += 100; timer() }
      await settle()
    }
    await settle()
    return {
      native, context, calls, events, unsubscribers, release, slot, claim, aboveClaim, timerDelay, timerToken, timerRegistrations,
       clearedTimers, line, top, scannerLines, scannerCells, cells, bar, resolve, emit, advance, settle, setModel, setStatus, setRoute, setSessionID,
      setMessages, setPermissions, setModels, timer: () => timer, time: () => time,
      resize: async (width: number, composerWidth = width) => {
        native.resize(width, footerRows)
        host.width = composerWidth
        await settle()
        await settle()
      },
      dispose() {
        if (disposed) return
        disposed = true
        cleanup()
        native.renderer.destroy()
        clearedTimers.push(...clearTimer.mock.calls.map(([token]) => token))
        clock.mockRestore()
        clearTimer.mockRestore()
      },
    }
  } catch (error) {
    setupTimer?.mockRestore()
    cleanup?.()
    clock.mockRestore()
    clearTimer.mockRestore()
    throw error
  }
}

describe('mounted OpenCode 2.0.22 footer runtime', () => {
  test('replaces the native footer and uses one 100ms timer and the active provider', async () => {
    const explicitLocation = { directory: '/explicit/project' }
    const runtime = await mount({ location: explicitLocation })
    try {
      expect(runtime.slot).toHaveBeenCalledTimes(2)
      expect(runtime.claim).toHaveProperty('replace', 'prompt.footer')
      expect(runtime.claim).not.toHaveProperty('after')
      // The context and token row is appended to the composer's top, above the prompt.
      expect(runtime.aboveClaim).toHaveProperty('append', 'session.composer.top')
      expect(runtime.timerDelay).toBe(100)
      expect(runtime.timerRegistrations).toBe(1)
      expect(runtime.calls).toHaveLength(1)
      expect(runtime.calls[0]!.input.providerID).toBe('openai')
      expect(runtime.calls[0]!.options.location).toBe(explicitLocation)
      expect(runtime.calls[0]!.options.signal).toBeInstanceOf(AbortSignal)
      expect(runtime.events.size).toBe(7)
      await runtime.resolve(0)
      expect(runtime.line()).toContain('41% 2h14m')
      expect(runtime.line()).toContain('18% 3d05h')
      expect(runtime.line()).not.toContain('tok/s')
      expect(runtime.line()).not.toContain('shortcuts')
    } finally { runtime.dispose() }
  })

  test('idle ticks animate the raster, cache countdown/marker for 59.9s, and poll/redraw at one minute', async () => {
    const runtime = await mount()
    try {
      await runtime.resolve(0)
      expect(runtime.calls[0]!.options.location).toEqual({ directory: '/mock/project' })
      const initial = runtime.bar()
      expect(initial).toHaveLength(22)
      // Inactive scanner cells are blank.
      expect(runtime.scannerLines().filter(row => row.includes(SCANNER_DOT))).toHaveLength(0)
      runtime.setStatus('running')
      await runtime.advance(1)
      expect(runtime.bar()).not.toEqual(initial)
      expect(runtime.calls).toHaveLength(1)
      await runtime.advance(598)
      expect(runtime.line()).toContain('2h14m')
      expect(runtime.calls).toHaveLength(1)
      const expected = usageCells(41, 100 * (1 - 134 / 300), 22, 59900)
      runtime.bar().forEach((cell, index) => {
        const color = expected[index * 3 + 1]!
        expect(cell.glyph).toBe(String.fromCodePoint(expected[index * 3]!))
        expect(cell.foreground.slice(0, 3)).toEqual([(color >> 16) & 255, (color >> 8) & 255, color & 255])
      })
      await runtime.advance(1)
      expect(runtime.calls).toHaveLength(2)
      expect(runtime.calls[1]!.input.force).toBe(false)
      expect(runtime.line()).toContain('2h13m')
      expect(runtime.calls[0]!.options.signal.aborted).toBe(true)
    } finally { runtime.dispose() }
  })

  test('execution completion and failure refresh quota figures', async () => {
    const runtime = await mount()
    try {
      await runtime.resolve(0)
      await runtime.emit('session.execution.succeeded')
      expect(runtime.calls).toHaveLength(2)
      expect(runtime.calls[1]!.input.force).toBe(true)
      await runtime.resolve(1, snapshot(65, 85))
      expect(runtime.line()).toContain('65%')
      expect(runtime.line()).toContain('85%')
      await runtime.emit('session.execution.failed')
      expect(runtime.calls).toHaveLength(3)
      expect(runtime.calls[2]!.input.force).toBe(true)
      await runtime.resolve(2, { status: 'unavailable', rateLimits: [] })
      expect(runtime.line()).not.toContain('65%')
      expect(runtime.line()).not.toContain('85%')
      expect(runtime.line().match(/0%/g)).toHaveLength(2)
    } finally { runtime.dispose() }
  })

  test('provider changes clear prior quota and ignore late responses', async () => {
    const runtime = await mount()
    try {
      await runtime.resolve(0)
      await runtime.emit('session.execution.succeeded')
      runtime.setModel({ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' })
      await runtime.settle()
      expect(runtime.calls).toHaveLength(3)
      expect(runtime.calls[1]!.options.signal.aborted).toBe(true)
      expect(runtime.line()).not.toContain('41%')
      expect(runtime.line().match(/0%/g)).toHaveLength(2)
      await runtime.resolve(2, snapshot(25, 35))
      await runtime.resolve(1, snapshot(99, 99))
      expect(runtime.line()).toContain('25%')
      expect(runtime.line()).toContain('35%')
      expect(runtime.line()).not.toContain('99%')
      runtime.setModel({ providerID: 'other-provider', modelID: 'custom-model[1m]' })
      await runtime.settle()
      await runtime.resolve(3, { status: 'unavailable', rateLimits: [] })
      expect(runtime.line().match(/0%/g)).toHaveLength(2)
    } finally { runtime.dispose() }
  })

  test('account switches and credential updates clear old quota and abort previous identity calls', async () => {
    const runtime = await mount()
    try {
      await runtime.resolve(0)
      await runtime.emit('session.execution.succeeded')
      await runtime.emit('credential.switched')
      expect(runtime.calls).toHaveLength(3)
      expect(runtime.calls[1]!.options.signal.aborted).toBe(true)
      expect(runtime.line()).not.toContain('41%')
      await runtime.resolve(2, snapshot(12, 34))
      await runtime.resolve(1, snapshot(98, 98))
      expect(runtime.line()).toContain('12%')
      expect(runtime.line()).not.toContain('98%')
      await runtime.emit('credential.updated')
      expect(runtime.calls).toHaveLength(4)
      expect(runtime.line()).not.toContain('12%')
      await runtime.resolve(3, snapshot(56, 78))
      expect(runtime.line()).toContain('56%')
      expect(runtime.line()).toContain('78%')
    } finally { runtime.dispose() }
  })

  test('missing provider and rejected RPCs preserve zero gauges', async () => {
    const runtime = await mount()
    try {
      await runtime.resolve(0)
      await runtime.emit('session.execution.succeeded')
      runtime.calls[1]!.reject(new Error('mock request failed'))
      await runtime.settle()
      expect(runtime.line().match(/0%/g)).toHaveLength(2)
      runtime.setModel(undefined)
      await runtime.settle()
      expect(runtime.calls).toHaveLength(2)
      expect(runtime.line().match(/0%/g)).toHaveLength(2)
      runtime.setSessionID(undefined)
      runtime.setRoute({ type: 'home' })
      await runtime.advance(1)
      expect(runtime.line().match(/0%/g)).toHaveLength(2)
    } finally { runtime.dispose() }
  })

  test('right-aligns usage stats inside the composer and adapts to its available width', async () => {
    const runtime = await mount({ width: 140, composerWidth: 97 })
    try {
      await runtime.resolve(0)
      expect(runtime.bar()).toHaveLength(22)
      const rightmost = Array.from(runtime.line().trimEnd()).length
      expect(rightmost).toBe(95)
      await runtime.resize(140, 55)
      expect(runtime.bar()).toHaveLength(0)
      expect(runtime.line()).toContain('2h14m')
      expect(Array.from(runtime.line().trimEnd()).length).toBe(53)
      await runtime.resize(140, 34)
      expect(runtime.line()).not.toContain('2h14m')
      expect(runtime.line()).not.toContain('3d05h')
    } finally { runtime.dispose() }
  })

  test('scanner sits at the far left, follows the session status on the shared timer and adapts to width', async () => {
    const runtime = await mount({ width: 140, composerWidth: 60 })
    // The mock composer is inset two cells; the scanner starts at its left edge on all three rows.
    const shown = (width: number) => runtime.scannerLines().map(row => row.slice(2, 2 + width))
    const expected = (tick: number, working: boolean, mode: ScannerMode) =>
      scannerRows(tick, working, { mode }).map(row => row.map(cell => cell.glyph).join(''))
    let tick = 0
    const advance = async (ticks: number) => { await runtime.advance(ticks); tick += ticks }
    try {
      await runtime.resolve(0)
      expect(shown(10)).toEqual(expected(tick, false, 'full'))
      expect(shown(10)).toEqual(['          ', '          ', '          '])
      const statsAt = runtime.line().indexOf('5h')

      runtime.setStatus('running')
      const seen = new Set<string>()
      // A hundred and twenty ticks are six trips around the 20-frame Ribbon braid.
      for (let index = 0; index < 120; index++) {
        await advance(1)
        expect(shown(10), `tick=${tick}`).toEqual(expected(tick, true, 'full'))
        seen.add(JSON.stringify(runtime.scannerCells().map(row => row.map(cell => cell.foreground))))
        // Nothing moves when work starts: the stats keep their cell.
        expect(runtime.line().indexOf('5h')).toBe(statsAt)
      }
      // The 20-frame braid repeats cleanly while its two heads keep moving each tick.
      expect(seen.size).toBe(20)
      expect(runtime.timerRegistrations).toBe(1)

      // A narrow footer retains the three-row pulse while giving the gauges room.
      await runtime.resize(140, 30)
      expect(shown(1)).toEqual([SCANNER_DOT, SCANNER_DOT, SCANNER_DOT])
      runtime.setStatus('idle')
      await advance(1)
      expect(shown(1)).toEqual([' ', ' ', ' '])
    } finally { runtime.dispose() }
  })

  test("colours the scanner by the stage of the conversation, read from the session's messages", async () => {
    const runtime = await mount({ width: 140, composerWidth: 60 })
    const tone = (stage: ConversationStage) => [...SCANNER_STAGE_COLORS[stage]] as number[]
    const panel = [...SCANNER_COLORS.panel]
    const blend = (rgb: number[], level: number) => panel.map((low, channel) => Math.round(low + (rgb[channel]! - low) * level))
    // The head is the brightest dot, so some cell of the three-row track is the stage's colour at full strength.
    const strip = () => runtime.native.captureSpans().lines.slice(0, SCANNER.full.rows).flatMap(row =>
       row.spans.flatMap(span => Array.from(span.text).map(glyph => ({ glyph, foreground: span.fg.toInts().slice(0, 3) }))).slice(2, 12),
    ).filter(cell => cell.glyph !== ' ').map(cell => cell.foreground)
    const showsFull = (stage: ConversationStage) => strip().some(colour => colour.join() === blend(tone(stage), 1).join())
    const user = { type: 'user' }
    const assistant = (...content: unknown[]) => ({ type: 'assistant', time: { created: 1 }, content })
    try {
      await runtime.resolve(0)
      runtime.setStatus('running')
      // A prompt just sent: the scanner waits, in its own red.
      runtime.setMessages([user])
      await runtime.advance(1)
      expect(showsFull('waiting')).toBe(true)

      runtime.setMessages([user, assistant({ type: 'reasoning', text: '…', time: { created: 1 } })])
      await runtime.advance(1)
      expect(showsFull('thinking')).toBe(true)
      expect(showsFull('waiting')).toBe(false)

      runtime.setMessages([user, assistant({ type: 'tool', id: 't', name: 'read', state: { status: 'running' }, time: { created: 1 } })])
      await runtime.advance(1)
      expect(showsFull('tool')).toBe(true)

      runtime.setMessages([user, assistant({ type: 'text', text: 'Here is' })])
      await runtime.advance(1)
      expect(showsFull('writing')).toBe(true)

      // An open permission request needs you, whatever the model is doing.
      runtime.setPermissions([{ id: 'p1' }])
      await runtime.advance(1)
      expect(showsFull('approval')).toBe(true)
      runtime.setPermissions([])

      runtime.setMessages([user, { type: 'compaction', status: 'running' }])
      await runtime.advance(1)
      expect(showsFull('compacting')).toBe(true)

      // The tool returned and the model has not spoken again: back to waiting.
      runtime.setMessages([user, assistant({ type: 'tool', id: 't', name: 'read', state: { status: 'completed' }, time: { created: 1 } })])
      await runtime.advance(1)
      expect(showsFull('waiting')).toBe(true)

      // Inactive state is blank, whatever the messages say.
      runtime.setMessages([user, assistant({ type: 'reasoning', text: '…', time: { created: 1 } })])
      runtime.setPermissions([{ id: 'p2' }])
      runtime.setStatus('idle')
      await runtime.advance(1)
      expect(strip()).toEqual([])
    } finally { runtime.dispose() }
  })

  test('animate: false pins the working scanner to one still frame, still in the stage colour', async () => {
    const runtime = await mount({ pluginOptions: { animate: false } })
    try {
      await runtime.resolve(0)
      runtime.setStatus('running')
      runtime.setMessages([{ type: 'user' }, { type: 'assistant', time: { created: 1 }, content: [{ type: 'text', text: 'Hi' }] }])
      await runtime.advance(1)
      const still = runtime.scannerLines().map(row => row.slice(2, 12))
      // The still frame shows the two heads on the outer Ribbon rails, tick 4.
      expect(still).toEqual(scannerRows(4, true, { stage: 'writing' }).map(row => row.map(cell => cell.glyph).join('')))
      // Writing is green 7EE787, and the head cell shows it at full strength.
      const green = runtime.native.captureSpans().lines.slice(0, SCANNER.full.rows).some(row =>
         row.spans.some(span => span.text.includes(SCANNER_DOT) && span.fg.toInts().slice(0, 3).join() === '126,231,135'),
      )
      expect(green).toBe(true)
      await runtime.advance(7)
      expect(runtime.scannerLines().map(row => row.slice(2, 12))).toEqual(still)
    } finally { runtime.dispose() }
  })

  test('the row above the prompt shows each turn\'s context and the stream of the session on screen', async () => {
    const runtime = await mount()
    const model = { id: 'claude-opus-5-5[1m]', providerID: 'openai' }
    const step = (input: number) => ({ type: 'assistant', model, tokens: { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
    const view = await testRender(() => PluginContextProvider({
      value: runtime.context,
      get children() { return runtime.aboveClaim.render({ sessionID: 'session-a' } as never) },
    }) as unknown as JSX.Element, { width: 80, height: 4 })
    const bottom = async (ticks = 0) => {
      await runtime.advance(ticks)
      await view.renderOnce()
      return view.captureCharFrame().split('\n')[2]!
    }
    try {
      // Nothing has reported tokens yet.
      expect(await bottom(5)).toContain('– / –')
      // The claim reserves one empty row after its module, before the composer.
      expect(view.captureCharFrame().split('\n')[3]!.trim()).toBe('')
      // Two finished turns: the readout is the latest turn's, and the chart has two columns.
      runtime.setMessages([{ type: 'user' }, step(40_000), { type: 'user' }, step(134_400)])
      expect(await bottom(5)).toContain(' 134.4k / 200k ')
      // A turn that is running is not in the chart or the readout until it ends.
      runtime.setStatus('running')
      runtime.setMessages([{ type: 'user' }, step(40_000), { type: 'user' }, step(134_400), { type: 'user' }, step(150_000)])
      expect(await bottom(5)).toContain(' 134.4k / 200k ')
      // Pieces of the reply on screen feed the stream; another session's do not.
      const delta = (sessionID: string, text: string) => runtime.events.get('session.text.delta')!({ type: 'session.text.delta', data: { sessionID, delta: text } })
      delta('session-b', 'x'.repeat(400))
      delta('session-a', 'x'.repeat(40))
      // 40 characters in the last tick is 10 tokens a second; session-b's 400 would make it 110.
      expect(await bottom(1)).toContain('  10 tok/s')
      for (let i = 0; i < 10; i++) { delta('session-a', 'x'.repeat(40)); await runtime.advance(1) }
      expect(await bottom()).toContain(' 100 tok/s')
      // The reply ends and the turn lands.
      runtime.setStatus('idle')
      expect(await bottom(5)).toContain(' 150k / 200k ')
      // Leaving the session clears the chart for the next one.
      runtime.setRoute({ type: 'home' })
      await runtime.advance(1)
      expect(await bottom(30)).toContain('   0 tok/s')
    } finally {
      view.renderer.destroy()
      runtime.dispose()
    }
  })

  test('cleanup releases each timer, subscription, and slot once and aborts pending RPC work', async () => {
    const runtime = await mount()
    const pending = runtime.calls[0]!
    runtime.dispose()
    expect(runtime.release).toHaveBeenCalledTimes(2)
    for (const unsubscribe of runtime.unsubscribers) expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(runtime.events.size).toBe(0)
    expect(runtime.clearedTimers.filter(token => token === runtime.timerToken)).toHaveLength(1)
    expect(pending.options.signal.aborted).toBe(true)
    pending.resolve(snapshot())
    await Promise.resolve()
    await Promise.resolve()
    expect(runtime.release).toHaveBeenCalledTimes(2)
  })

})
