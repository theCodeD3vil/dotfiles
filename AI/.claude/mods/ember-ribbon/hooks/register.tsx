import type { EngineInterface, Register } from 'claude-code'

import type { ContextReading } from '../types'
import { TICK_MS, TICKS_PER_MINUTE, elapsedMs, rainbowDecorations } from './animation'
import { FILL_TURNS, renderBand } from './band'
import {
  DONE_TICKS,
  ENHANCE_MAX_TOKENS,
  ENHANCE_MODEL,
  ENHANCE_SYSTEM_PROMPT,
  ENHANCE_TIMEOUT_MS,
  ENHANCE_TRIGGER,
  buildEnhancePrompt,
  formatConversation,
  isTooShort,
  stripCodeFence,
} from './enhance'
import { DEFAULT_COLUMNS, FIVE_HOURS, USAGE_BAR_WIDTH, footerLayout, renderFooter } from './footer'
import { modelName, timeLeft, windowElapsedPercent } from './format'
import { usageCells } from './rasters'
import { state } from './state'
import { nextStreamHistory } from './stream'

// Ember Pills: Claude Code's footer, replaced, plus one row above the prompt with the prompt
// enhance button and the context's heat.
//   above:     134.4k / 200k
//   below:  ✻ Opus 5.5   5h ⣿⣿⣿⣷⣿⣷⣿⣿│      41% 2h14m   wk 󰪟 18% 3d05h
//
// The loader follows the engine only into functions of this file, so everything that touches `$`
// lives here: the hooks, the timer and the calls to the engine. The pure parts are beside it:
//   footer.tsx, band.tsx   the two drawings         format.ts      model, time and token text
//   rasters.ts, colors.ts  braille cells and color  enhance.ts     the enhance prompt and its text
//   stream.ts              token stream numbers     animation.ts   ticks, spinner frames
//   state.ts               what the hooks and timer share

// Held by the host, so they survive a hot reload of this file. `readingsState` is each turn's context
// reading; `previousDraftState` is the draft from before an enhancement, set once one lands and cleared
// by undoing, editing the enhanced text (that accepts it) or sending it.
const readingsState = { plugin: 'ember-ribbon', key: 'readings' } as const
const previousDraftState = { plugin: 'ember-ribbon', key: 'previous' } as const
const readHistory = async (engine: EngineInterface) => (await engine.state.get(readingsState)).value ?? []

const redraw = (engine: EngineInterface) => engine.ui.invalidate('ui.render')

async function readContext(engine: EngineInterface): Promise<ContextReading | undefined> {
  const { context } = await engine.session.usage()
  if (!context?.window) return
  const tokens = context.tokens ?? 0
  const percent = context.percent ?? Math.round((tokens / context.window) * 100)
  return { tokens, window: context.window, percent }
}

// Called as a main-loop turn ends: adds that turn's reading, oldest first, keeping what the chart shows.
async function takeReading(engine: EngineInterface) {
  const reading = await readContext(engine)
  if (!reading) return
  await engine.state.set(readingsState, [...(await readHistory(engine)), reading].slice(-FILL_TURNS))
}

// While enhancing, the icon is a rainbow spinner, then a green check for DONE_TICKS; a sound plays when it is done.
async function runEnhancement(engine: EngineInterface, draft: string, before: string) {
  state.isEnhancing = true
  state.doneTicks = 0
  try {
    return await requestRewrite(engine, draft, before)
  } finally {
    state.isEnhancing = false
    state.doneTicks = DONE_TICKS
    redraw(engine)
    void engine.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
  }
}

// Repaints the draft while the box still holds it, so typing stops the animation.
// Adapted from cc-prompt-enhance-mod: a key typed between the read and the fill is lost.
async function paintRainbow(engine: EngineInterface, draft: string, isStopped: () => boolean) {
  for (let frame = 0; !isStopped(); frame++) {
    if ((await engine.prompt.read()).text === draft) await engine.prompt.fill({ text: draft, decorations: rainbowDecorations(draft, frame) })
    await engine.clock.sleep(TICK_MS)
  }
}

// `before` is what the box held when enhancing started; anything else there now was typed meanwhile.
async function requestRewrite(engine: EngineInterface, draft: string, before: string) {
  engine.ui.toast('Enhancing with Haiku…')
  let isDone = false
  const painting = paintRainbow(engine, draft, () => isDone)
  const reply = await engine.model.complete({
    model: ENHANCE_MODEL,
    system: ENHANCE_SYSTEM_PROMPT,
    prompt: buildEnhancePrompt(formatConversation(await engine.session.messages()), draft),
    maxTokens: ENHANCE_MAX_TOKENS,
    timeoutMs: ENHANCE_TIMEOUT_MS,
  }).finally(() => {
    // Stopped before the result lands, so no late frame paints over it. The fill below
    // carries no decorations, which clears the rainbow.
    isDone = true
    return painting
  })
  const text = reply.isAnswered ? stripCodeFence(reply.text) : ''
  if ((await engine.prompt.read()).text !== before) return 'Kept what you typed; enhancement dropped'
  await engine.prompt.fill({ text: text || draft })
  if (!reply.isAnswered || !text) return `Enhance failed (${reply.isAnswered ? 'empty reply' : reply.reason}); your draft is back in the box`
  await engine.state.set(previousDraftState, draft)
  return 'Enhanced with Haiku: review it and press Enter, or Ctrl+E to undo'
}

async function clearUndo(engine: EngineInterface) {
  const { value } = await engine.state.get(previousDraftState)
  if (value == null) return
  await engine.state.set(previousDraftState, null)
  redraw(engine)
}

// Ctrl+E after an enhancement: the draft from before it goes back in the box.
async function undoEnhance(engine: EngineInterface) {
  const { value: draft } = await engine.state.get(previousDraftState)
  if (draft == null) return
  await engine.prompt.fill({ text: draft })
  await clearUndo(engine)
  engine.ui.toast('Back to your draft')
}

// Ctrl+E: enhance the draft in the box, left in place until the reply lands.
async function enhanceFromBox(engine: EngineInterface) {
  if (state.isEnhancing) return
  const draft = (await engine.prompt.read()).text
  if (isTooShort(draft)) return engine.ui.toast('Too short to enhance')
  engine.ui.toast(await runEnhancement(engine, draft, draft))
}

// Adds this tick's streamed characters to the chart's history.
function recordStreamTick() {
  state.streamTicks = nextStreamHistory(state.streamTicks, state.streamedChars)
  state.streamedChars = 0
}

// The 5h bar's dots move all the time: repaint its cells alone, without a redraw.
function repaintUsageBar(engine: EngineInterface) {
  if (!state.mountedBar) return
  const { requestId, percent, timePercent, width } = state.mountedBar
  void engine.ui.blit({ requestId, key: 'usage', cells: usageCells(percent, timePercent, width, elapsedMs(state.tick)) }).catch(() => {})
}

function onTick(engine: EngineInterface) {
  state.tick++
  // The graph is always drawn, so idle ticks push zeros: it runs down to a flat line after a reply.
  const isRunningDown = state.streamedChars > 0 || state.streamTicks.some(chars => chars > 0)
  if (state.isWorking || isRunningDown) recordStreamTick()
  // Animate while working, enhancing or running down; otherwise redraw once a minute for the countdowns.
  if (state.isWorking || isRunningDown || state.isEnhancing || state.tick % TICKS_PER_MINUTE === 0) redraw(engine)
  // Count the check down, redrawing once it is gone.
  if (state.doneTicks > 0) {
    state.doneTicks--
    if (state.doneTicks === 0) redraw(engine)
  }
  repaintUsageBar(engine)
}

let isTicking = false

// One 100 ms timer, started from whichever hook runs first: session.start does not run again after
// /reload-plugins, so the render hooks offer to start it too.
function ensureTicking(engine: EngineInterface) {
  if (isTicking) return
  isTicking = true
  try {
    engine.clock.every(TICK_MS, () => onTick(engine))
  } catch {
    isTicking = false
  }
}

export const register: Register = on => {
  on('session.start', async (engine, event, next) => {
    ensureTicking(engine)
    return next(event)
  })

  // A fresh chart for each turn of the main loop.
  on('turn.start', (_, event, next) => {
    state.streamTicks = []
    state.streamedChars = 0
    return next(event)
  })

  // Count what the main loop's reply streams, passing every piece on untouched.
  on('turn.step', async function* (_, event, next) {
    for await (const chunk of next(event)) {
      if (!event.agentId) {
        if (chunk.kind === 'text' || chunk.kind === 'thinking') state.streamedChars += chunk.text.length
        else if (chunk.kind === 'input') state.streamedChars += chunk.json.length
      }
      yield chunk
    }
  })

  // One context reading per main-loop turn (not subagents).
  on('turn.complete', async (engine, event, next) => {
    const result = await next(event)
    if (!event.agentId) await takeReading(engine)
    return result
  })

  // New usage figures arrived: redraw.
  on('session.measure', (engine, event, next) => {
    redraw(engine)
    return next(event)
  })

  // Hide the mode labels.
  on('ui.render', { component: 'SessionMode' }, (_, event, next) => next({ ...event, props: { modes: [] } }))

  // Editing the enhanced text accepts it: the next Ctrl+E enhances again.
  on('prompt.edit', async (engine, event, next) => {
    const result = await next(event)
    if (result.text !== event.text) await clearUndo(engine)
    return result
  })

  // A draft ending in "::e" is enhanced instead of sent. Any send drops the undo.
  on('prompt.submit', async (engine, event, next) => {
    if (event.origin.kind !== 'composer') return next(event)
    await clearUndo(engine)
    if (!ENHANCE_TRIGGER.test(event.text)) return next(event)
    const draft = event.text.replace(ENHANCE_TRIGGER, '')
    // Back in the box, so the rainbow has something to paint.
    await engine.prompt.fill({ text: draft })
    if (isTooShort(draft)) return { drop: 'Too short to enhance' }
    return { drop: await runEnhancement(engine, draft, draft) }
  })

  // One row above the prompt: the enhance button at the left, the context heat at the right.
  on('ui.render', { component: 'AbovePrompt' }, async (engine, event, next) => {
    ensureTicking(engine)
    const below = await next(event)
    if (event.surface !== 'terminal' || event.props.hasSurvey) return below
    const history = await readHistory(engine)
    // No turn has finished yet: the readout takes the live context so it shows from the first draw.
    // The chart has no column for it, since it is not a turn's end.
    const latest = history[history.length - 1] ?? (await readContext(engine))
    const canUndo = (await engine.state.get(previousDraftState)).value != null
    state.isWorking = event.props.isWorking

    return renderBand(engine.ui.resolve(event), {
      below,
      bodyColumns: event.props.bodyColumns,
      history,
      latest,
      canUndo,
      onEnhance: () => (canUndo ? undoEnhance(engine) : enhanceFromBox(engine)),
      tick: state.tick,
      isEnhancing: state.isEnhancing,
      doneTicks: state.doneTicks,
      streamTicks: state.streamTicks,
    })
  })

  // Draw the footer in place of the hint line.
  on('ui.render', { component: 'PromptHint' }, async (engine, event, next) => {
    if (event.surface !== 'terminal') return next(event)
    ensureTicking(engine)
    state.isWorking = event.props.isWorking

    const components = engine.ui.resolve(event)
    const usage = await engine.session.usage()
    const model = modelName(await engine.session.model())
    const now = await engine.clock.now()

    const fiveLimit = usage.rateLimits.find(limit => limit.kind === 'five_hour')
    const weekLimit = usage.rateLimits.find(limit => limit.kind === 'seven_day')
    const five = { percent: Math.round(fiveLimit?.percentUsed ?? 0), time: timeLeft(fiveLimit, now) }
    const week = { percent: Math.round(weekLimit?.percentUsed ?? 0), time: timeLeft(weekLimit, now) }
    const layout = footerLayout(event.viewport?.columns ?? DEFAULT_COLUMNS, model, five, week)

    // The bar is only mounted (and repainted by the timer) while the layout is wide enough for it.
    state.mountedBar = layout.hasRing
      ? undefined
      : { requestId: event.requestId, percent: five.percent, timePercent: windowElapsedPercent(fiveLimit, FIVE_HOURS, now), width: USAGE_BAR_WIDTH }

    return renderFooter(components, { model, isWorking: state.isWorking, tick: state.tick, five, week, layout, bar: state.mountedBar })
  })
}
