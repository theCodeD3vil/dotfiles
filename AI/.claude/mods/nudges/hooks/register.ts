import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

// Nudges.
//  - Done chime: a sound and a toast when a turn takes longer than a minute.
//  - Limit toasts: one toast when 5h or weekly usage crosses 75% and again at 90%.

const LONG_TURN_MS = 60_000
const WARNING_PERCENTS = [75, 90]
const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'Weekly' }
const MINUTES_PER_DAY = 1440

// "kind:percent" of each mark already toasted in the current window.
const warned = new Set<string>()

const padTwo = (value: number) => String(value).padStart(2, '0')

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${padTwo(seconds % 60)}s` : `${seconds}s`
}

function formatResetsIn(resetsAt: string | undefined, now: number) {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.floor((Date.parse(resetsAt) - now) / 60000))
  const timeLeft =
    minutes >= MINUTES_PER_DAY
      ? `${Math.floor(minutes / MINUTES_PER_DAY)}d${Math.floor((minutes % MINUTES_PER_DAY) / 60)}h`
      : `${Math.floor(minutes / 60)}h${padTwo(minutes % 60)}m`
  return ` · resets in ${timeLeft}`
}

// One toast per mark crossed; falling back under a mark (the window reset) re-arms it.
function warnOnCrossings(engine: EngineInterface, limit: SessionRateLimit, now: number) {
  const label = LIMIT_LABELS[limit.kind] ?? limit.kind
  for (const percent of WARNING_PERCENTS) {
    const warningKey = `${limit.kind}:${percent}`
    if (limit.percentUsed < percent) {
      warned.delete(warningKey)
    } else if (!warned.has(warningKey)) {
      warned.add(warningKey)
      engine.ui.toast(`${label} usage at ${percent}%${formatResetsIn(limit.resetsAt, now)}`)
    }
  }
}

export const register: Register = on => {
  on('turn.complete', (engine, event, next) => {
    if (!event.agentId && event.reason === 'answer' && event.durationMs > LONG_TURN_MS) {
      engine.ui.toast(`Done in ${formatDuration(event.durationMs)}`)
      void engine.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
    }
    return next(event)
  })

  on('session.measure', async (engine, event, next) => {
    const now = await engine.clock.now()
    for (const limit of event.rateLimits) warnOnCrossings(engine, limit, now)
    return next(event)
  })
}
