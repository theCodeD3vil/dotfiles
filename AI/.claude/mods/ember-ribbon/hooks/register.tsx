import type { EngineInterface, Register, RenderChildren, SessionRateLimit } from 'claude-code'

import type { ContextReading } from '../types'

// Ember Pills: Claude Code's footer, replaced, plus the context's heat in the band above the prompt.
//   above:   ✻ Hot  134.4k / 200k   last turns ▁▂▃▅▆▇  ▲ +98.3k last turn
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

// Ember heat (Catppuccin Mocha colours, Claude orange for Warm): a word by how full the context window is, the last 12 turns as a sparkline.
const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'
const HEAT = [
  { upTo: 25, word: 'Fresh', color: '#A6E3A1' },
  { upTo: 50, word: 'Warm', color: CLAUDE },
  { upTo: 75, word: 'Hot', color: '#F9E2AF' },
  { upTo: 90, word: 'Blazing', color: '#F5C2E7' },
  { upTo: Infinity, word: 'Compact soon', color: '#F38BA8' },
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

export const register: Register = on => {
  let working = false
  let tick = 0

  on('session.start', async ($, e, next) => {
    $.clock.every(100, () => {
      tick++
      // Animate while working; otherwise redraw once a minute for the countdowns.
      if (working || tick % 600 === 0) $.ui.invalidate('ui.render')
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

  // Context heat at the far right of the band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value: history = [] } = await $.state.get(readings)
    const now = history[history.length - 1]
    if (e.surface !== 'terminal' || e.props.hasSurvey || !now) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const f = HEAT.find(b => now.percent < b.upTo) ?? HEAT[HEAT.length - 1]!
    const wide = e.props.bodyColumns >= 60

    // bodyColumns is the band's width less the engine's [-] marker, so this sits flush right.
    return (
      <Box width={e.props.bodyColumns} justifyContent="flex-end">
        <Box gap={2}>
          <Text color={f.color} bold>✻ {f.word}</Text>
          <Text dimColor>{short(now.tokens)} / {short(now.window)}</Text>
          {wide ? (
            <Box gap={1}>
              <Text dimColor> last turns</Text>
              <Text color={f.color}>{sparkline(history)}</Text>
            </Box>
          ) : null}
          {wide && history.length > 1 ? <Text dimColor>{trend(history)}</Text> : null}
        </Box>
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
