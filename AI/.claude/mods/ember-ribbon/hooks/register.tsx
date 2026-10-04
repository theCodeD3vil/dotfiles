import type { EngineInterface, Register, RenderChildren, SessionMessage, SessionRateLimit } from 'claude-code'

import type { ContextReading } from '../types'

// Ember Pills: Claude Code's footer, replaced, plus one row above the prompt with the prompt
// enhance button and the context's heat.
//   above:     134.4k / 200k   last turns ▁▂▃▅▆▇  ▲ +98.3k last turn
//   below:  ✻ Opus 5.5   5h ▬▬▬▬▬▬▬▬▬▮▬▬▬▬▬▬▬▬▬▬▬▬ 41% 2h14m   wk ▬▬▬▬▮▬▬▬▬▬▬▬▬▬ 18% 3d05h
// Usage bars fill with usage; the ▮ marker shows how much of the window has passed.
// The ✻ spins while Claude works.

const CLAUDE = '#D97757'
const INK = '#E9E6DC'
const DIM = '#7C776D'
const TRACK = '#3A3733'

// Claude's own spinner frames, played forward and back while it works
const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']


// "Ember pie" rings for narrow terminals: empty circle, a solid wedge filling in 7 steps, a fire circle at 100%.
const RINGS = ['\u{F0766}', '\u{F0A9E}', '\u{F0A9F}', '\u{F0AA0}', '\u{F0AA1}', '\u{F0AA2}', '\u{F0AA3}', '\u{F0AA4}', '\u{F1807}']
// Claude Code draws its permission-mode label beside the footer; keep room for the longest one,
// "⏵⏵ bypass permissions on ·" (26 columns with the engine's trailing " ·"; auto mode is 17).
const MODE_LABEL = 26
// The prompt row is narrower than the terminal: about 2 columns of inset on each side.
const ROW_INSET = 4

const FIVE_HOURS = 5 * 3600_000
const WEEK = 7 * 24 * 3600_000

function sevColor(pct: number) {
  if (pct >= 85) return '#E2766A'
  if (pct >= 65) return '#E2B064'
  return '#A3BA82'
}

// "claude-opus-5-5[1m]" -> "Opus 5.5"; anything else is shown as given
function modelName(id: string) {
  const m = id.replace(/\[.*\]$/, '').match(/^claude-([a-z]+)-(\d+)-(\d+)/)
  if (!m) return id
  const [, name = '', major, minor] = m
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${major}.${minor}`
}

function timeLeft(limit: SessionRateLimit | undefined, now: number) {
  if (!limit?.resetsAt) return ''
  const mins = Math.max(0, Math.floor((Date.parse(limit.resetsAt) - now) / 60000))
  const pad = (n: number) => String(n).padStart(2, '0')
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${pad(Math.floor((mins % 1440) / 60))}h`
  return `${Math.floor(mins / 60)}h${pad(mins % 60)}m`
}

// Ember heat (Catppuccin Mocha colours, Claude orange at 25-50%): the used tokens coloured by how full the context window is, the last 12 turns as a sparkline.
const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'
const HEAT = [
  { upTo: 25, color: '#A6E3A1' },
  { upTo: 50, color: CLAUDE },
  { upTo: 75, color: '#F9E2AF' },
  { upTo: 90, color: '#F5C2E7' },
  { upTo: Infinity, color: '#F38BA8' },
]

// Held by the host, so the history survives a hot reload of this file.
const readings = { plugin: 'ember-ribbon', key: 'readings' } as const

async function takeReading($: EngineInterface) {
  const { context } = await $.session.usage()
  if (!context?.window) return
  const tokens = context.tokens ?? 0
  const percent = context.percent ?? Math.round((tokens / context.window) * 100)
  const { value: history = [] } = await $.state.get(readings)
  await $.state.set(readings, [...history, { tokens, window: context.window, percent }].slice(-HISTORY))
}

function sparkline(history: ContextReading[]) {
  const top = Math.max(...history.map(r => r.tokens), 1)
  return history.map(r => BARS[Math.floor((r.tokens / top) * (BARS.length - 1))]).join('')
}

function trend(history: ContextReading[]) {
  const delta = (history[history.length - 1]?.tokens ?? 0) - (history[history.length - 2]?.tokens ?? 0)
  if (delta === 0) return 'steady'
  return delta > 0 ? `▲ +${short(delta)} last turn` : `▼ ${short(-delta)} last turn`
}

function short(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`
  return String(n)
}

// Prompt enhance: press Ctrl+E (or the button), or end a draft with "::e" and press Enter. Haiku
// rewrites the draft using the recent conversation, and the result lands in the box to review.
// Adapted from cc-prompt-enhance-mod by Yigit Budak (MIT).
const TRIGGER = /\s*::e\s*$/
const MODEL = 'haiku'
const RECENT_MESSAGES = 10
const MESSAGE_CHARS = 2000
const CONTEXT_CHARS = 12000
// The sparkle (U+F51B) and nf-md-check, from Symbols Nerd Font: a Mono face such as
// CaskaydiaCove Nerd Font Mono squeezes icons into 1 cell. Ghostty draws one 2 cells wide only
// when a blank cell follows it, which the Button's one-space label provides.
// While enhancing, the icon plays Claude's own spinner frames (SPIN).
const ICON = '\u{F51B}'
const DONE_ICON = '\u{F012C}'
// Shown while the enhanced text is current (Ctrl+E then reverts); also from Symbols Nerd Font.
const ENHANCED_ICON = '\u{F0453}'
const BLUE = '#89B4FA' // Catppuccin Mocha
const GREEN = '#A6E3A1'
const DONE_TICKS = 30 // the check stays 3s (the clock ticks every 100ms)

const SYSTEM = `You rewrite a developer's draft prompt for Claude Code into the prompt they would have written with more time and the whole session in view. You get the recent conversation, then the draft.

- Keep the author's intent, scope and language.
- Resolve vague references ("this", "that file", "the error") to the exact path, symbol, command or error message the conversation points to, in backticks.
- When the conversation shows how to tell the work is done (a test, a command), name it in one sentence.
- Carry over constraints the conversation already settled, such as files to leave alone or a rejected approach.
- Write a multi-part request as a short numbered list in order; keep a single ask to one or two sentences.
- Fix typos. Add nothing the draft or conversation does not support; leave open choices open.
- No filler: no role lines, "think step by step" or emphasis words. A draft that is already specific comes back with only typo fixes.

Output only the enhanced prompt, in the author's voice: no preamble, no quotes, no code fence.`

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) + '…' : text)

// "[user] run the tests\n(tools: Bash python -m pytest)"
function describe(m: SessionMessage) {
  const tools = m.toolUses.map(u => {
    const target = u.input.file_path ?? u.input.command ?? u.input.path
    return typeof target === 'string' ? `${u.tool} ${clip(target, 200)}` : u.tool
  })
  return `[${m.role}] ${clip(m.text, MESSAGE_CHARS)}${tools.length ? `\n(tools: ${tools.join('; ')})` : ''}`
}

async function conversation($: EngineInterface) {
  const rows = (await $.session.messages()).filter(m => m.text.trim() !== '').slice(-RECENT_MESSAGES)
  const text = rows.map(describe).join('\n\n')
  return text.length > CONTEXT_CHARS ? '…' + text.slice(-CONTEXT_CHARS) : text
}

// The icon is blue sparkles while ready, a RAINBOW spinner while Haiku works, then a green check
// for DONE_TICKS; a sound plays when it is done.
let busy = false
let doneTicks = 0
const RAINBOW = ['#F38BA8', '#FAB387', '#F9E2AF', '#A6E3A1', '#89DCEB', '#89B4FA', '#CBA6F7']

async function enhance($: EngineInterface, draft: string, before: string) {
  busy = true
  doneTicks = 0
  try {
    return await rewrite($, draft, before)
  } finally {
    busy = false
    doneTicks = DONE_TICKS
    $.ui.invalidate('ui.render')
    void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
  }
}

// One RAINBOW colour per character, shifted one step each frame.
const rainbow = (text: string, frame: number) =>
  Array.from({ length: text.length }, (_, i) => ({
    start: i,
    end: i + 1,
    color: RAINBOW[(i - (frame % RAINBOW.length) + RAINBOW.length) % RAINBOW.length],
  }))

// `before` is what the box held when enhancing started; anything else there now was typed meanwhile.
async function rewrite($: EngineInterface, draft: string, before: string) {
  $.ui.toast('Enhancing with Haiku…')
  // Repaints the draft while the box still holds it, so typing stops the animation.
  // Adapted from cc-prompt-enhance-mod: a key typed between the read and the fill is lost.
  let isDone = false
  const painting = (async () => {
    for (let frame = 0; !isDone; frame++) {
      if ((await $.prompt.read()).text === draft) await $.prompt.fill({ text: draft, decorations: rainbow(draft, frame) })
      await $.clock.sleep(100)
    }
  })()
  const r = await $.model.complete({
    model: MODEL,
    system: SYSTEM,
    prompt: `<conversation>\n${(await conversation($)) || '(none yet)'}\n</conversation>\n\n<draft>\n${draft}\n</draft>`,
    maxTokens: 4096,
    timeoutMs: 60000,
  }).finally(() => {
    // Stopped before the result lands, so no late frame paints over it. The fill below
    // carries no decorations, which clears the rainbow.
    isDone = true
    return painting
  })
  const text = r.isAnswered ? r.text.trim().replace(/^```[^\n]*\n([\s\S]*?)\n```$/, '$1').trim() : ''
  if ((await $.prompt.read()).text !== before) return 'Kept what you typed; enhancement dropped'
  await $.prompt.fill({ text: text || draft })
  if (!r.isAnswered || !text) return `Enhance failed (${r.isAnswered ? 'empty reply' : r.reason}); your draft is back in the box`
  await $.state.set(previous, draft)
  return 'Enhanced with Haiku: review it and press Enter, or Ctrl+E to undo'
}

// Held by the host, so undo survives a hot reload. Set once an enhancement lands; cleared by
// undoing, editing the enhanced text (that accepts it) or sending it.
const previous = { plugin: 'ember-ribbon', key: 'previous' } as const

async function forget($: EngineInterface) {
  const { value } = await $.state.get(previous)
  if (value == null) return
  await $.state.set(previous, null)
  $.ui.invalidate('ui.render')
}

// Ctrl+E after an enhancement: the draft from before it goes back in the box.
async function revert($: EngineInterface) {
  const { value: draft } = await $.state.get(previous)
  if (draft == null) return
  await $.prompt.fill({ text: draft })
  await forget($)
  $.ui.toast('Back to your draft')
}

const tooShort = (draft: string) => draft.trim().split(/\s+/).length < 2

// Ctrl+E: enhance the draft in the box, left in place until the reply lands.
async function enhanceBox($: EngineInterface) {
  if (busy) return
  const draft = (await $.prompt.read()).text
  if (tooShort(draft)) return $.ui.toast('Too short to enhance')
  $.ui.toast(await enhance($, draft, draft))
}

export const register: Register = on => {
  let working = false
  let tick = 0

  on('session.start', async ($, e, next) => {
    $.clock.every(100, () => {
      tick++
      // Animate while working or enhancing; otherwise redraw once a minute for the countdowns.
      if (working || busy || tick % 600 === 0) $.ui.invalidate('ui.render')
      // Count the check down, redrawing once it is gone.
      if (doneTicks > 0 && --doneTicks === 0) $.ui.invalidate('ui.render')
    })
    const result = await next(e)
    await takeReading($)
    return result
  })

  // One context reading per main-loop turn (not subagents).
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await takeReading($)
    return result
  })

  // New usage figures arrived: redraw.
  on('session.measure', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Hide the mode labels.
  on('ui.render', { component: 'SessionMode' }, ($, e, next) => next({ ...e, props: { modes: [] } }))

  // Editing the enhanced text accepts it: the next Ctrl+E enhances again.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (r.text !== e.text) await forget($)
    return r
  })

  // A draft ending in "::e" is enhanced instead of sent. Any send drops the undo.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    await forget($)
    if (!TRIGGER.test(e.text)) return next(e)
    const draft = e.text.replace(TRIGGER, '')
    // Back in the box, so the rainbow has something to paint.
    await $.prompt.fill({ text: draft })
    if (tooShort(draft)) return { drop: 'Too short to enhance' }
    return { drop: await enhance($, draft, draft) }
  })

  // One row above the prompt: the enhance button at the left, the context heat at the right.
  // The button also carries Ctrl+E (bound to app:cycleDiffBase in ~/.claude/keybindings.json):
  // the engine sends that chord only to a mounted Button naming the action.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const { value: history = [] } = await $.state.get(readings)
    const now = history[history.length - 1]
    const canUndo = (await $.state.get(previous)).value != null

    const { Box, Button, Text } = $.ui.resolve(e)
    const f = now ? (HEAT.find(b => now.percent < b.upTo) ?? HEAT[HEAT.length - 1]!) : undefined
    const wide = e.props.bodyColumns >= 60

    // bodyColumns is the band's width less the engine's [-] marker, so the heat sits flush right.
    // paddingTop keeps the conversation from sitting flush on the bar.
    return (
      <Box width={e.props.bodyColumns} paddingTop={2}>
        <Box flexGrow={1}>
          {/* A Button's label takes no colour, so the glyph is Text and the Button is the blank cell after it. */}
          {busy ? (
            <Text color={RAINBOW[Math.floor(tick / 2) % RAINBOW.length]} bold>{SPIN[tick % SPIN.length]}</Text>
          ) : doneTicks > 0 ? (
            <Text color={GREEN} bold>{DONE_ICON}</Text>
          ) : (
            <Text color={BLUE}>{canUndo ? ENHANCED_ICON : ICON}</Text>
          )}
          <Button key="enhance" label=" " plain action="app:cycleDiffBase" onPress={() => (canUndo ? revert($) : enhanceBox($))} />
        </Box>
        {now && f ? (
          <Box gap={2}>
            <Box>
              <Text color={f.color} bold>{short(now.tokens)}</Text>
              <Text dimColor> / {short(now.window)}</Text>
            </Box>
            {wide ? (
              <Box gap={1}>
                <Text dimColor> last turns</Text>
                <Text color={f.color}>{sparkline(history)}</Text>
              </Box>
            ) : null}
            {wide && history.length > 1 ? <Text dimColor>{trend(history)}</Text> : null}
          </Box>
        ) : null}
      </Box>
    )
  })

  // Draw the footer in place of the hint line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    working = e.props.isWorking

    const { Box, Text } = $.ui.resolve(e)
    const usage = await $.session.usage()
    const model = modelName(await $.session.model())
    const now = await $.clock.now()

    // ▬▬▬▬▬▮▬▬▬▬ filled up to usage (severity colour); ▮ marks how much of the window has passed,
    // coloured like usage: olive early in the window, amber past 65%, red past 85%
    const usageBar = (pct: number, limit: SessionRateLimit | undefined, windowMs: number, width: number) => {
      let filled = Math.min(width, Math.round((pct * width) / 100))
      if (pct > 0 && filled === 0) filled = 1
      const resetsIn = limit?.resetsAt ? Date.parse(limit.resetsAt) - now : windowMs
      const timePct = 100 * (1 - resetsIn / windowMs)
      const marker = Math.min(width - 1, Math.round((width * timePct) / 100))
      const cells = []
      for (let i = 0; i < width; i++) {
        if (i === marker) cells.push(<Text color={sevColor(timePct)}>▮</Text>)
        else cells.push(<Text color={i < filled ? sevColor(pct) : TRACK}>▬</Text>)
      }
      return <Box>{cells}</Box>
    }

    const ring = (pct: number) => {
      const step = pct >= 100 ? 8 : Math.min(7, Math.ceil((pct * 7) / 100))
      return <Text color={step === 0 ? TRACK : sevColor(pct)}>{RINGS[step]}</Text>
    }

    const stat = (label: string, pct: number, gauge: RenderChildren, time?: string) => (
      <Box gap={1}>
        <Text color={DIM}>{label}</Text>
        {gauge}
        <Text color={sevColor(pct)}>{pct}%</Text>
        {time ? <Text color={DIM}>{time}</Text> : null}
      </Box>
    )

    const fiveLimit = usage.rateLimits.find(r => r.kind === 'five_hour')
    const weekLimit = usage.rateLimits.find(r => r.kind === 'seven_day')
    const five = Math.round(fiveLimit?.percentUsed ?? 0)
    const week = Math.round(weekLimit?.percentUsed ?? 0)
    const fiveTime = timeLeft(fiveLimit, now)
    const weekTime = timeLeft(weekLimit, now)

    // The footer gets exactly the row's width minus the longest mode label, so every label stays on
    // one line; everything is right-aligned in it. Widths are counted from the Boxes below: gap 3
    // between items, gap 1 inside one, plus 2 columns kept clear after the label. Pick the fullest
    // layout that fits: usage bars become rings first, then time left goes.
    const statWidth = (label: string, gauge: number, pct: number, time: string) =>
      label.length + 1 + gauge + 1 + `${pct}%`.length + (time ? 1 + time.length : 0)
    const layoutWidth = (full: boolean, showTime: boolean) =>
      2 + statWidth('5h', full ? 22 : 1, five, showTime ? fiveTime : '') + 3 +
      statWidth('wk', full ? 14 : 1, week, showTime ? weekTime : '') + 3 + 2 + model.length
    const room = Math.max(0, (e.viewport?.columns ?? 200) - MODE_LABEL - ROW_INSET)
    const narrow = layoutWidth(true, true) > room
    const noTime = narrow && layoutWidth(false, true) > room

    return (
      <Box width={room} justifyContent="flex-end" gap={3}>
        <Box gap={1}>
          <Text color={CLAUDE} bold>{working ? SPIN[tick % SPIN.length] : '✻'}</Text>
          <Text color={INK}>{model}</Text>
        </Box>
        {stat('5h', five, narrow ? ring(five) : usageBar(five, fiveLimit, FIVE_HOURS, 22), noTime ? undefined : fiveTime)}
        {stat('wk', week, narrow ? ring(week) : usageBar(week, weekLimit, WEEK, 14), noTime ? undefined : weekTime)}
      </Box>
    )
  })
}
