// Ember Ribbon's quota gauges. Keep its glyphs and raster arithmetic identical
// to AI/.claude/mods/ember-ribbon/hooks/register.tsx.
export const COLORS = {
  claude: '#D97757',
  ink: '#E9E6DC',
  dim: '#7C776D',
  track: '#3A3733',
} as const

export const RINGS = ['\u{F0766}', '\u{F0A9E}', '\u{F0A9F}', '\u{F0AA0}', '\u{F0AA1}', '\u{F0AA2}', '\u{F0AA3}', '\u{F0AA4}', '\u{F1807}']
const FIVE_HOURS = 5 * 3600_000
const DEFAULT_COLOR = 0x01000000
const PULSE_SPEED = 10
const PULSE_TAIL = 3
const PULSE_GAP = 6
const TIP_SWEEP = 25
const TIP_PERIOD = 1400

export type RateLimit = { percentUsed?: number; resetsAt?: string }

export function sevColor(pct: number) {
  if (pct >= 85) return '#E2766A'
  if (pct >= 65) return '#E2B064'
  return '#A3BA82'
}

export const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
export const pack = (c: number[]) => ((c[0] ?? 0) << 16) | ((c[1] ?? 0) << 8) | (c[2] ?? 0)
const pulseAt = (t: number, fx: number) => ((t / 1000) * PULSE_SPEED) % (fx + PULSE_GAP)

function toHsl([r = 0, g = 0, b = 0]: number[]): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

function fromHsl(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1)), m = l - c / 2
  const rgb: [number, number, number] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  return rgb.map(v => Math.round((v + m) * 255))
}

// Return the original raster's exact [codepoint, foreground, default-background]
// words; the OpenTUI view draws them directly instead of base64-encoding them.
export function usageCells(pct: number, timePct: number, width: number, t: number) {
  const [hue] = toHsl(hex(sevColor(pct)))
  const vivid = (l: number) => fromHsl(hue, 0.9, l)
  const grey = hex(COLORS.track)
  const fx = pct > 0 ? Math.max(1, (pct / 100) * width) : 0
  const words = new Uint32Array(width * 3)
  const set = (x: number, ch: number, fg: number[]) => words.set([ch, pack(fg), DEFAULT_COLOR], x * 3)

  for (let x = 0; x < width; x++) {
    if (x + 0.5 >= fx) {
      set(x, 0x28ff, grey)
      continue
    }
    const u = Math.min(1, (x + 0.5) / fx)
    const behind = pulseAt(t, fx) - x
    const pulse = behind >= 0 ? Math.exp(-behind / PULSE_TAIL) : Math.exp(-(behind * behind) / 0.8)
    const glow = 0.28 + 0.12 * Math.pow(u, 0.9) + 0.6 * pulse
    set(x, 0x28ff, vivid(0.12 + 0.58 * glow))
  }

  const marker = Math.max(1, Math.min(width - 2, Math.round((width * timePct) / 100)))
  set(marker, 0x2590, hex(sevColor(timePct)))
  const tip = (phase: number) => fromHsl(hue + TIP_SWEEP * Math.sin((t / TIP_PERIOD + phase) * Math.PI * 2), 0.95, 0.62)
  set(0, 0x28be, pct > 0 ? tip(0) : grey)
  set(width - 1, 0x2877, fx >= width - 1 ? tip(0.5) : grey)
  return words
}

export function timeLeft(limit: RateLimit | undefined, now: number) {
  if (!limit?.resetsAt) return ''
  const mins = Math.max(0, Math.floor((Date.parse(limit.resetsAt) - now) / 60000))
  const pad = (n: number) => String(n).padStart(2, '0')
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${pad(Math.floor((mins % 1440) / 60))}h`
  return `${Math.floor(mins / 60)}h${pad(mins % 60)}m`
}

export type Ring = { kind: 'ring'; glyph: string | undefined; color: string }
export type Raster = { kind: 'raster'; columns: number; pct: number; timePct: number; words: Uint32Array }
export type FooterStat = { pct: number; time?: string; gauge: Ring | Raster }
export type FooterLayout = {
  room: number
  narrow: boolean
  noTime: boolean
  five: FooterStat
  week: FooterStat
}

export function footerLayout(input: {
  fiveLimit?: RateLimit
  weekLimit?: RateLimit
  now: number
  columns?: number
  tick: number
}): FooterLayout {
  const { fiveLimit, weekLimit, now, tick } = input
  const five = Math.round(fiveLimit?.percentUsed ?? 0)
  const week = Math.round(weekLimit?.percentUsed ?? 0)
  const fiveTime = timeLeft(fiveLimit, now)
  const weekTime = timeLeft(weekLimit, now)
  const statWidth = (label: string, gauge: number, pct: number, time: string) =>
    label.length + 1 + gauge + 1 + `${pct}%`.length + (time ? 1 + time.length : 0)
  const layoutWidth = (full: boolean, showTime: boolean) =>
    statWidth('5h', full ? 22 : 1, five, showTime ? fiveTime : '') + 3 +
    statWidth('wk', 1, week, showTime ? weekTime : '')
  const room = Math.max(0, input.columns ?? 200)
  const narrow = layoutWidth(true, true) > room
  const noTime = narrow && layoutWidth(false, true) > room
  const ring = (pct: number): Ring => {
    const step = pct >= 100 ? 8 : Math.min(7, Math.ceil((pct * 7) / 100))
    return { kind: 'ring', glyph: RINGS[step], color: step === 0 ? COLORS.track : sevColor(pct) }
  }
  const resetsIn = fiveLimit?.resetsAt ? Date.parse(fiveLimit.resetsAt) - now : FIVE_HOURS
  const timePct = 100 * (1 - resetsIn / FIVE_HOURS)

  return {
    room, narrow, noTime,
    five: {
      pct: five,
      time: noTime ? undefined : fiveTime,
      gauge: narrow ? ring(five) : { kind: 'raster', columns: 22, pct: five, timePct, words: usageCells(five, timePct, 22, tick * 100) },
    },
    week: { pct: week, time: noTime ? undefined : weekTime, gauge: ring(week) },
  }
}
