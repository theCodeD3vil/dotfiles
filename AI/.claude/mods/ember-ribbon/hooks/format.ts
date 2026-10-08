import type { SessionRateLimit } from 'claude-code'

const MS_PER_MINUTE = 60_000
const MINUTES_PER_DAY = 1440

const padTwo = (value: number) => String(value).padStart(2, '0')

// "claude-opus-5-5[1m]" -> "Opus 5.5"; anything else is shown as given
export function modelName(id: string) {
  const parts = id.replace(/\[.*\]$/, '').match(/^claude-([a-z]+)-(\d+)-(\d+)/)
  if (!parts) return id
  const [, family = '', major, minor] = parts
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}

// "2h14m", or "3d05h" from a day out; empty without a reset time
export function timeLeft(limit: SessionRateLimit | undefined, now: number) {
  if (!limit?.resetsAt) return ''
  const minutes = Math.max(0, Math.floor((Date.parse(limit.resetsAt) - now) / MS_PER_MINUTE))
  if (minutes >= MINUTES_PER_DAY) return `${Math.floor(minutes / MINUTES_PER_DAY)}d${padTwo(Math.floor((minutes % MINUTES_PER_DAY) / 60))}h`
  return `${Math.floor(minutes / 60)}h${padTwo(minutes % 60)}m`
}

// How much of a rate-limit window has passed, 0-100; a limit without a reset time counts as just begun.
export function windowElapsedPercent(limit: SessionRateLimit | undefined, windowMs: number, now: number) {
  const resetsIn = limit?.resetsAt ? Date.parse(limit.resetsAt) - now : windowMs
  return 100 * (1 - resetsIn / windowMs)
}

// 134400 -> "134.4k", 2540000 -> "2.5M"
export function formatTokens(count: number) {
  if (count >= 1_000_000) return `${+(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${+(count / 1_000).toFixed(1)}k`
  return String(count)
}
