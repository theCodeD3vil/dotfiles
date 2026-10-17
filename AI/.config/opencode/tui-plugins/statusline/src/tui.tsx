/** @jsxImportSource @opentui/solid */
/**
 * OpenCode TUI statusline plugin: replaces the native prompt footer with the quota gauges at
 * the right, and puts Wick, the desk pet, at the right of the context and token row above the
 * prompt, acting out each stage of the conversation.
 */
import { Plugin, usePlugin } from '@opencode/plugin/tui'
import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from 'solid-js'
import { AboveView, type ContextFrame } from './above'
import { createTokenStream, liveReading, turnReadings, type ContextWindows, type TokenStream } from './context'
import { footerLayout } from './footer'
import { HEADROOM_POLL_TICKS, createHeadroomSaved, type HeadroomSaved } from './headroom'
import { usageRpc } from './rpc'
import { lastTurnEnd, petClock, petStrip } from './pet'
import { FPS } from './spinners'
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

// While the pet is not animated (the `animate: false` option) it shows this moment of its act.
const STILL_SECONDS = 1.5
// The 100 ms tick the rest of the plugin runs on, in timer frames.
const FRAMES_PER_TICK = FPS / 10

// What Wick acts out: the stage while the session runs, and idle otherwise, except for a turn
// that ends on its answer, which it celebrates once.
function usePet(props: { sessionID: Accessor<string | undefined>; tick: Accessor<number>; frames: Accessor<number>; animate: boolean }) {
  const context = usePlugin()
  const working = createMemo(() => {
    // Sampling through the shared timer keeps the pet in step with the rest of the plugin
    // without creating a second interval or event lifecycle.
    props.tick()
    return isRunning(context.data, props.sessionID())
  })

  // What the running session is doing decides what the pet acts out; it is read on the
  // same tick, and the stage name only changes when the conversation moves on.
  const stage = createMemo(() => {
    props.tick()
    const sessionID = props.sessionID()
    if (!sessionID || !working()) return 'waiting'
    return conversationStage({
      messages: context.data.session.message.list(sessionID),
      permissions: context.data.session.permission.list(sessionID)?.length ?? 0,
    })
  })

  const pet = petClock(FPS)
  let petSession: string | undefined
  let celebrated: string | undefined
  const turnEnd = (sessionID: string | undefined) =>
    sessionID ? lastTurnEnd(untrack(() => context.data.session.message.list(sessionID))) : undefined
  return createMemo(() => {
    const frame = props.animate ? props.frames() : props.tick() * FRAMES_PER_TICK
    const sessionID = props.sessionID()
    // Another session's turns, ended before it came on screen, are not this one's to celebrate.
    if (sessionID !== petSession) {
      petSession = sessionID
      celebrated = turnEnd(sessionID)?.id
      pet.set('idle', frame)
    }
    if (working()) pet.set(stage(), frame)
    else {
      // The turn's end marker can land a moment after the session stops running.
      const end = turnEnd(sessionID)
      if (end && end.id !== celebrated) {
        celebrated = end.id
        pet.set(end.outcome === 'succeeded' ? 'done' : 'idle', frame)
      } else if (pet.state !== 'done') pet.set('idle', frame)
    }
    const now = pet.at(frame)
    return petStrip(props.animate ? now : { ...now, t: STILL_SECONDS, clock: STILL_SECONDS })
  })
}

function Footer(props: {
  tick: Accessor<number>
  redraw: Accessor<number>
  refresh: Accessor<{ force: boolean }>
  account: Accessor<number>
}) {
  const context = usePlugin()
  const [columns, syncColumns] = useColumns()
  const [usage, setUsage] = createSignal<UsageSnapshot>({ rateLimits: [], status: 'unavailable' })
  const rpc = context.client.rpc(usageRpc)
  let identity = ''

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

  const frame = createMemo(() => {
    props.redraw()
    return footerLayout({
      fiveLimit: usage().rateLimits.find(limit => limit.kind === 'five_hour'),
      weekLimit: usage().rateLimits.find(limit => limit.kind === 'seven_day'),
      now: Date.now(),
      columns: columns(),
      tick: untrack(props.tick),
    })
  })

  return (
    <box flexGrow={1} flexDirection="row" minWidth={0} onSizeChange={function () { syncColumns(this.width) }}>
      <FooterView frame={frame} animationTick={props.tick} onWidthChange={syncColumns} />
    </box>
  )
}

// Above the prompt: context sparkline, used / window, token stream, Headroom's savings, then the
// pet. The stream and the savings are plugin state (they fill from events and the proxy, and survive
// the row remounting); the readings are read from the session's messages twice a second.
function AboveRow(props: { sessionID: Accessor<string>; tick: Accessor<number>; frames: Accessor<number>; animate: boolean; stream: TokenStream; headroom: HeadroomSaved }) {
  const context = usePlugin()
  const [columns, syncColumns] = useColumns()
  const strip = usePet(props)
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
    return { history: history.map(reading => reading.percent), now: history[history.length - 1] ?? live, stream: props.stream.samples(), columns: columns(), headroom: props.headroom.totals() }
  })

  return (
    <box flexGrow={1} flexDirection="row" minWidth={0} paddingBottom={PROMPT_PAD} onSizeChange={function () { syncColumns(this.width) }}>
      <AboveView strip={strip()} frame={frame()} />
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
    const headroom = createHeadroomSaved()
    void headroom.refresh()
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
      if (count % HEADROOM_POLL_TICKS === 0) void headroom.refresh()
      if (count % 600 === 0) {
        setRedraw(value => value + 1)
        setRefresh({ force: false })
      }
    }, 1000 / FPS)
    const subscriptions = [
      ...(['session.execution.succeeded', 'session.execution.failed'] as const).map(type =>
        context.data.on(type, () => {
          setRefresh({ force: true })
          void headroom.endTurn()
        })),
      ...(['credential.switched', 'credential.updated'] as const).map(type =>
        context.data.on(type, () => setAccount(value => value + 1))),
      // Characters the reply streams (text, thinking and tool input), as Claude counts them.
      ...(['session.text.delta', 'session.reasoning.delta', 'session.tool.input.delta'] as const).map(type =>
        context.data.on(type, event => { if (event.data.sessionID === shown()) stream.add(event.data.delta.length) })),
    ]
    // Plugin option `animate: false` pins the pet to a still frame.
    const animate = context.options?.animate !== false
    const release = context.ui.slot({
      // Replacing prompt.footer removes OpenCode's native working status and
      // location label, leaving only this footer.
      replace: 'prompt.footer',
      render: () => <Footer tick={tick} redraw={redraw} refresh={refresh} account={account} />,
    })
    // Appended to the composer's top, so the pet and the row sit directly above the prompt.
    const releaseAbove = context.ui.slot({
      append: 'session.composer.top',
      render: input => <AboveRow sessionID={() => input.sessionID} tick={tick} frames={frames} animate={animate} stream={stream} headroom={headroom} />,
    })
    return () => {
      clearInterval(timer)
      subscriptions.forEach(unsubscribe => unsubscribe())
      releaseAbove()
      release()
    }
  },
})
