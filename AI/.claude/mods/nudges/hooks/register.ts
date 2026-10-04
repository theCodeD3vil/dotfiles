import type { Register } from 'claude-code'

// Nudges.
//  - Done chime: a sound and a toast when a turn takes longer than a minute.
//  - Limit toasts: one toast when 5h or weekly usage crosses 75% and again at 90%.

const LONG_TURN_MS = 60_000
const MARKS = [75, 90]
const NAMES: Record<string, string> = { five_hour: '5h', seven_day: 'Weekly' }

function duration(ms: number) {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

function resetsIn(iso: string | undefined, now: number) {
  if (!iso) return ''
  const mins = Math.max(0, Math.floor((Date.parse(iso) - now) / 60000))
  const left = mins >= 1440 ? `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
  return ` · resets in ${left}`
}

export const register: Register = on => {
  const warned = new Set<string>()

  on('turn.complete', ($, e, next) => {
    if (!e.agentId && e.reason === 'answer' && e.durationMs > LONG_TURN_MS) {
      $.ui.toast(`Done in ${duration(e.durationMs)}`)
      void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    for (const r of e.rateLimits) {
      const name = NAMES[r.kind] ?? r.kind
      for (const mark of MARKS) {
        const key = `${r.kind}:${mark}`
        if (r.percentUsed >= mark && !warned.has(key)) {
          warned.add(key)
          $.ui.toast(`${name} usage at ${mark}%${resetsIn(r.resetsAt, now)}`)
        }
        // Back under the mark (the window reset): warn again next time.
        if (r.percentUsed < mark) warned.delete(key)
      }
    }
    return next(e)
  })
}
