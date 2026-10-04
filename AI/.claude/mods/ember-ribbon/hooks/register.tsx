import type { Register, RenderChildren, SessionRateLimit } from 'claude-code'

// Ember Pills: Claude Code's footer, replaced.
//   [✻] Opus 5.5   ctx ▰▰▰▱▱▱▱▱▱▱▱▱ 31%      5h ━━━━━━━━━▮━━━━━━━━━━━━ 41% 2h14m   wk ━━━━▮━━━━━━━━━ 18% 3d05h
// Usage bars fill with usage; the ▮ marker shows how much of the window has passed.
// The pill pulses while Claude works; the context meter glints at 75% or more.

const CLAUDE = '#D97757'
const CLAUDE_DIM = '#A85A40'
const PILL_INK = '#1A1210'
const INK = '#E9E6DC'
const DIM = '#7C776D'
const TRACK = '#3A3733'
const GLINT = '#FBDCCB'

const CAP_L = ''
const CAP_R = ''


// Narrow terminals: usage bars become "ember pie" rings (empty circle, a solid wedge filling in
// 7 steps, then a fire circle at 100%) and the ✻ pill is hidden; below TINY the context meter becomes a ring too.
const RINGS = ['\u{F0766}', '\u{F0A9E}', '\u{F0A9F}', '\u{F0AA0}', '\u{F0AA1}', '\u{F0AA2}', '\u{F0AA3}', '\u{F0AA4}', '\u{F1807}']
const NARROW = 120
const NO_TIME = 95
const TINY = 90
// Claude Code draws its permission-mode label ("⏵⏵ auto mode on") beside the footer; keep room for it.
const MODE_LABEL = 15

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

export const register: Register = on => {
  let working = false
  let high = false
  let tick = 0

  on('session.start', ($, e, next) => {
    $.clock.every(100, () => {
      tick++
      // Animate while working or while a meter glints; otherwise redraw once a minute for the countdowns.
      if (working || high || tick % 600 === 0) $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  // New usage figures arrived: redraw.
  on('session.measure', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Hide the mode labels.
  on('ui.render', { component: 'SessionMode' }, ($, e, next) => next({ ...e, props: { modes: [] } }))

  // Draw the footer in place of the hint line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    working = e.props.isWorking

    const { Box, Text } = $.ui.resolve(e)
    const usage = await $.session.usage()
    const model = modelName(await $.session.model())
    const now = await $.clock.now()

    // ▰▰▰▱▱▱ with a two-cell glint sweeping across filled cells at 75%+
    const meter = (pct: number, width: number) => {
      let filled = Math.min(width, Math.round((pct * width) / 100))
      if (pct > 0 && filled === 0) filled = 1
      const glint = pct >= 75 ? tick % (width + 6) : -9
      const cells = []
      for (let i = 0; i < width; i++) {
        const color = i >= filled ? TRACK : i === glint || i === glint - 1 ? GLINT : sevColor(pct)
        cells.push(<Text color={color}>{i < filled ? '▰' : '▱'}</Text>)
      }
      return <Box>{cells}</Box>
    }

    // ━━━━━▮━━━━ filled up to usage (severity colour); ▮ marks how much of the window has passed,
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
        else cells.push(<Text color={i < filled ? sevColor(pct) : TRACK}>━</Text>)
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

    const columns = (e.viewport?.columns ?? 200) - MODE_LABEL
    const narrow = columns < NARROW
    const tiny = columns < TINY
    const noTime = columns < NO_TIME

    const ctx = Math.round(usage.context.percent ?? 0)
    const fiveLimit = usage.rateLimits.find(r => r.kind === 'five_hour')
    const weekLimit = usage.rateLimits.find(r => r.kind === 'seven_day')
    const five = Math.round(fiveLimit?.percentUsed ?? 0)
    const week = Math.round(weekLimit?.percentUsed ?? 0)
    high = ctx >= 75

    // Pulse: ease between full and dim clay roughly once a second while working.
    const pill = working && Math.floor(tick / 4) % 2 === 1 ? CLAUDE_DIM : CLAUDE

    return (
      <Box flexDirection="row" justifyContent="space-between" width="100%" paddingLeft={4} gap={4}>
        <Box gap={3} flexShrink={0}>
          <Box gap={1}>
            {narrow ? null : (
              <Box>
                <Text color={pill}>{CAP_L}</Text>
                <Text color={PILL_INK} backgroundColor={pill} bold>✻</Text>
                <Text color={pill}>{CAP_R}</Text>
              </Box>
            )}
            <Text color={INK}>{model}</Text>
          </Box>
          {stat('ctx', ctx, tiny ? ring(ctx) : meter(ctx, 12))}
        </Box>
        <Box gap={3} flexShrink={0}>
          {stat('5h', five, narrow ? ring(five) : usageBar(five, fiveLimit, FIVE_HOURS, 22), noTime ? undefined : timeLeft(fiveLimit, now))}
          {stat('wk', week, narrow ? ring(week) : usageBar(week, weekLimit, WEEK, 14), noTime ? undefined : timeLeft(weekLimit, now))}
        </Box>
      </Box>
    )
  })
}
