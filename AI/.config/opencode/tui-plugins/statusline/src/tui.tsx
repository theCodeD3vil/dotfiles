/** @jsxImportSource @opentui/solid */
/**
 * OpenCode TUI statusline plugin: replaces the native prompt footer with the working
 * spinner at the far left, a different one and colour for each stage of the conversation,
 * and the quota gauges at the right.
 */
import { Plugin, usePlugin } from '@opencode/plugin/tui'
import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from 'solid-js'
import { ContextRow, type ContextFrame } from './above'
import { createTokenStream, liveReading, turnReadings, type ContextWindows, type TokenStream } from './context'
import { footerLayout } from './footer'
import { usageRpc } from './rpc'
import { BLANK, FPS, SPINNER_GAP, STAGE_SPINNERS, spinnerCells } from './spinners'
import { conversationStage } from './stage'
import { FooterView } from './view'
import type { UsageSnapshot } from './usage'

// `session.composer.top` is immediately before the composer in OpenCode.
const PROMPT_PAD = 1

type PluginData = ReturnType<typeof usePlugin>['data']
const isRunning = (data: PluginData, sessionID: string | undefined) =>
  !!sessionID && data.session.status(sessionID) === 'running'

// The width this plugin has to draw in, plus the callback a box's onSizeChange feeds it. The plugin
// lives inside the composer, which can be narrower than the renderer, and a replaced footer can
// report zero once while the host composes its siblings: the renderer's width stands in until a
// real size arrives.
function useColumns() {
  const [columns, setColumns] = createSignal(usePlugin().renderer.width)
  return [columns, (width: number) => { if (width > 0) setColumns(width) }] as const
}

// While the spinner is not animated (the `animate: false` option) it shows this moment of its run.
const STILL_SECONDS = 1.5
// The 100 ms tick the rest of the plugin runs on, in spinner frames.
const FRAMES_PER_TICK = FPS / 10

function Footer(props: {
  sessionID: Accessor<string | undefined>
  tick: Accessor<number>
  frames: Accessor<number>
  redraw: Accessor<number>
  refresh: Accessor<{ force: boolean }>
  account: Accessor<number>
  animate: boolean
}) {
  const context = usePlugin()
  const [columns, syncColumns] = useColumns()
  const [usage, setUsage] = createSignal<UsageSnapshot>({ rateLimits: [], status: 'unavailable' })
  const rpc = context.client.rpc(usageRpc)
  let identity = ''

  const working = createMemo(() => {
    // Sampling through the shared timer keeps the spinner in step with the quota
    // animation without creating a second interval or event lifecycle.
    props.tick()
    return isRunning(context.data, props.sessionID())
  })

  // What the running session is doing decides which spinner shows and in what colour; it is
  // read on the same tick, and the stage name only changes when the conversation moves on.
  const stage = createMemo(() => {
    props.tick()
    const sessionID = props.sessionID()
    if (!sessionID || !working()) return 'waiting'
    return conversationStage({
      messages: context.data.session.message.list(sessionID),
      permissions: context.data.session.permission.list(sessionID)?.length ?? 0,
    })
  })

  // A response for an old provider/account must never populate the new footer.
  createEffect(() => {
    const providerID = context.ui.model.current()?.providerID
    const nextIdentity = `${providerID ?? ''}:${props.account()}`
    const refresh = props.refresh()
    if (identity !== nextIdentity) {
      identity = nextIdentity
      setUsage({ rateLimits: [], status: 'unavailable' })
    }
    if (!providerID) return
    const abort = new AbortController()
    onCleanup(() => abort.abort())
    void rpc.get({ providerID, force: refresh.force }, {
      location: context.location ?? context.data.location.default(),
      signal: abort.signal,
    }).then(result => {
      if (!abort.signal.aborted) setUsage(result)
    }).catch(() => {
      if (!abort.signal.aborted) setUsage({ rateLimits: [], status: 'error' })
    })
  })

  const cells = createMemo(() => spinnerCells(columns()))

  // A new instance each time the stage changes, so a spinner with state (Life) starts afresh.
  const spinner = createMemo(() => STAGE_SPINNERS[stage()].make())
  const strip = createMemo(() => {
    if (!working()) return BLANK
    if (!props.animate) return spinner()(STILL_SECONDS, 1 / FPS)
    return spinner()(props.frames() / FPS, 1 / FPS)
  })

  const frame = createMemo(() => {
    props.redraw()
    return footerLayout({
      fiveLimit: usage().rateLimits.find(limit => limit.kind === 'five_hour'),
      weekLimit: usage().rateLimits.find(limit => limit.kind === 'seven_day'),
      now: Date.now(),
      columns: columns() - cells() - SPINNER_GAP,
      tick: untrack(props.tick),
    })
  })

  return (
    <box flexGrow={1} flexDirection="row" minWidth={0} onSizeChange={function () { syncColumns(this.width) }}>
      <FooterView frame={frame} animationTick={props.tick} strip={strip} tone={() => STAGE_SPINNERS[stage()].tone} cells={cells} onWidthChange={syncColumns} />
    </box>
  )
}

// The row above the prompt: context fill history, used / window, token stream. The stream is
// plugin state (it fills from events and survives the row remounting); the readings are read
// from the session's messages twice a second.
function AboveRow(props: { sessionID: Accessor<string>; tick: Accessor<number>; stream: TokenStream }) {
  const context = usePlugin()
  const [columns, syncColumns] = useColumns()
  // This row lives in `session.composer.top`; its bottom padding is therefore
  // the blank line between the context module and OpenCode's composer.
  const windows = (): ContextWindows => {
    const limits = new Map(context.data.location.model.list(context.location)?.map(model => [`${model.providerID}/${model.modelID}`, model.limit.context]))
    return model => limits.get(`${model.providerID}/${model.id}`)
  }
  // The models arrive with the first sync; asking again is harmless.
  void context.data.location.model.sync(context.location).catch(() => {})

  const half = createMemo(() => Math.floor(props.tick() / 5))
  const readings = createMemo(() => {
    half()
    const sessionID = props.sessionID()
    const messages = context.data.session.message.list(sessionID)
    const window = windows()
    return {
      history: turnReadings(messages, window, isRunning(context.data, sessionID)),
      live: liveReading(messages, window),
    }
  })
  const frame = createMemo((): ContextFrame => {
    props.tick()
    const { history, live } = readings()
    return { history: history.map(reading => reading.percent), now: history[history.length - 1] ?? live, stream: props.stream.samples(), columns: columns() }
  })

  return (
    <box flexGrow={1} flexDirection="row" minWidth={0} paddingBottom={PROMPT_PAD} onSizeChange={function () { syncColumns(this.width) }}>
      <ContextRow frame={frame()} />
    </box>
  )
}

export default Plugin.define({
  id: 'statusline.tui',
  setup(context) {
    // One timer at the spinners' frame rate. Every FRAMES_PER_TICK-th frame is also a 100 ms tick,
    // which is what the gauges, the token stream and the polling run on.
    const [frames, setFrames] = createSignal(0)
    const [tick, setTick] = createSignal(0)
    const [redraw, setRedraw] = createSignal(0)
    // A fresh object each time, so setting it always re-runs the footer's usage fetch.
    const [refresh, setRefresh] = createSignal({ force: false })
    const [account, setAccount] = createSignal(0)
    const stream = createTokenStream()
    // The session on screen: only its reply feeds the stream, and a different one starts a fresh chart.
    const shown = () => {
      const route = context.ui.router.current()
      return route.type === 'session' ? route.sessionID : undefined
    }
    let streamed: string | undefined
    const timer = setInterval(() => {
      const frame = untrack(frames) + 1
      setFrames(frame)
      if (frame % FRAMES_PER_TICK) return
      const count = frame / FRAMES_PER_TICK
      const sessionID = shown()
      if (sessionID !== streamed) { streamed = sessionID; stream.reset() }
      stream.tick(isRunning(context.data, sessionID))
      setTick(count)
      if (count % 600 === 0) {
        setRedraw(value => value + 1)
        setRefresh({ force: false })
      }
    }, 1000 / FPS)
    const subscriptions = [
      ...(['session.execution.succeeded', 'session.execution.failed'] as const).map(type =>
        context.data.on(type, () => setRefresh({ force: true }))),
      ...(['credential.switched', 'credential.updated'] as const).map(type =>
        context.data.on(type, () => setAccount(value => value + 1))),
      // Characters the reply streams (text, thinking and tool input), as Claude counts them.
      ...(['session.text.delta', 'session.reasoning.delta', 'session.tool.input.delta'] as const).map(type =>
        context.data.on(type, event => { if (event.data.sessionID === shown()) stream.add(event.data.delta.length) })),
    ]
    // Plugin option `animate: false` pins the spinner to a still frame.
    const animate = context.options?.animate !== false
    const release = context.ui.slot({
      // Replacing prompt.footer removes OpenCode's native working status and
      // location label, leaving only this footer.
      replace: 'prompt.footer',
      render: input => <Footer sessionID={() => input.sessionID} tick={tick} frames={frames} redraw={redraw} refresh={refresh} account={account} animate={animate} />,
    })
    // Appended to the composer's top, so the row sits directly above the prompt.
    const releaseAbove = context.ui.slot({
      append: 'session.composer.top',
      render: input => <AboveRow sessionID={() => input.sessionID} tick={tick} stream={stream} />,
    })
    return () => {
      clearInterval(timer)
      subscriptions.forEach(unsubscribe => unsubscribe())
      releaseAbove()
      release()
    }
  },
})
