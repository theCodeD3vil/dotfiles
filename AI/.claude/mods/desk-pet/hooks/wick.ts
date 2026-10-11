// Wick, the desk pet: a round candle-drop slime in full-colour octant pixel art. Claude Code
// draws it above the Ember ribbon and OpenCode above the prompt, both at the right, from this file.
//
// Ported pixel for pixel from playground/js/characters/wick.js, where the design is made; the
// statusline's tests (tests/pet.test.ts) draw every state in both and compare every pixel.
//
// Its body is a fixed orange with a dark outline and its whole face is two eyes. The flame on its
// head and its props take the stage's colour. A grid 14 or more pixels tall gets the full pet, a
// 14 × 9 mochi; anything shorter gets the mini, an 8 × 3 body. (The playground's small pet, for
// grids 10 to 13 tall, is not ported: neither host draws one.) Both hosts give it 12 × 4 cells
// of octants, 24 × 16 pixels.

export type PetState = 'idle' | 'waiting' | 'thinking' | 'tool' | 'writing' | 'approval' | 'compacting' | 'done'

/** `t`: seconds since the state began; `clock`: seconds the pet has been running (it blinks on it). */
export type PetFrame = { state: PetState; t: number; clock: number }
/** Which way the pet looks: 1 to the right, -1 to the left (the playground's right placement). */
export type Facing = 1 | -1

type Color = string // '#rrggbb'
type Palette = Readonly<Record<string, Color | undefined>>

/** w × h pixels, each a colour or null for the terminal's own background. */
export type Pixels = { w: number; h: number; px: (Color | null)[] }

const INK: Palette = {
  o: '#4A1E12', // outline
  b: '#E8845A', // body
  l: '#F6A47A', // lit edge
  h: '#FFE6D2', // shine
  s: '#BF5B3A', // shade
  e: '#2A100A', // eyes
  w: '#FFFFFF', // eye glints
}
// Vira Deepforest, everything but the body above: its yellow for the candle, its text colour for the paper.
// Idle has no stage colour of its own, so its flame burns like a candle's.
const CANDLE = '#FFCB6B'
const PAPER = '#CAE5D5'
// The stage colours, Deepforest's hues (purple is pink), as OpenCode's statusline gives its spinners.
const TONES: Record<Exclude<PetState, 'idle'>, Color> = {
  waiting: '#6FA0DE',
  thinking: '#CC8868',
  tool: '#CB7FA3',
  writing: '#C3E88D',
  approval: '#FFCB6B',
  compacting: '#f07178',
  done: '#74C9DE',
}
const SLEEP_AFTER = 14
const BLINK_EVERY = 3.7
const BLINK_FOR = 0.15
/** How long the pet celebrates a finished turn before it goes idle: until its last sparkle fades. */
export const DONE_SECONDS = 3.2

// ---- the rigs -------------------------------------------------------------------------------
// Body row widths from the top, outline included; `eyes` is the row the eyes start on. Every
// width is even, so the body stays centred on the line between two pixels.

type ShapeName = 'rest' | 'air' | 'squash' | 'flat' | 'stretch'
type Shape = { widths: number[]; eyes: number }
type EyeKind = 'open' | 'blink' | 'wide' | 'focus' | 'happy' | 'squint'
// Keys: e eye, w glint. `left`/`right` override `rows` when the eyes differ; `out` widens a pair
// outwards for three-pixel eyes; `dy` moves them from the eye row.
type Eyes = { rows?: string[]; left?: string[]; right?: string[]; out?: number; dy?: number }
type FlameSize = 'big' | 'normal' | 'small' | 'ember'
type Rig = {
  outline: boolean
  eyeWidth: number
  eyeGap: number
  centre: number
  shapes: Partial<Record<ShapeName, Shape>> & { rest: Shape }
  eyes: Record<EyeKind, Eyes>
  flames: Record<FlameSize, string[][]>
}

const FULL: Rig = {
  outline: true,
  eyeWidth: 2,
  eyeGap: 4,
  centre: 9,
  shapes: {
    rest: { widths: [6, 10, 12, 14, 14, 14, 14, 14, 14, 12], eyes: 4 },
    squash: { widths: [8, 12, 14, 16, 16, 16, 16, 14], eyes: 3 },
    flat: { widths: [10, 14, 16, 18, 18, 16], eyes: 2 },
    stretch: { widths: [4, 8, 10, 12, 12, 12, 12, 12, 12, 12, 10], eyes: 5 },
  },
  eyes: {
    open: { rows: ['we', 'ee', 'ee'] },
    blink: { rows: ['..', '..', 'ee'], dy: 0 },
    wide: { rows: ['we', 'ee', 'ee', 'ee'], dy: -1 },
    focus: { rows: ['we', 'ee'], dy: 1 },
    happy: { rows: ['.e.', 'e.e'], out: 1, dy: 1 },
    squint: { left: ['e.', '.e', 'e.'], right: ['.e', 'e.', '.e'] },
  },
  // Flames sit centred on the head. Keys: d deep, t tone, b bright, w core.
  flames: {
    big: [
      ['.t..', '.tt.', '.tbt', 'tbbt', 'tbwt', '.tt.'],
      ['..t.', '.tt.', 'tbt.', 'tbbt', 'twbt', '.tt.'],
      ['.t..', '..t.', '.tbt', 'tbbt', 'tbwt', '.tt.'],
    ],
    normal: [
      ['.t..', '.tt.', 'tbbt', 'tbwt', '.tt.'],
      ['..t.', '.tt.', 'tbbt', 'twbt', '.tt.'],
      ['.t..', '..t.', 'tbtt', 'tbwt', '.tt.'],
    ],
    small: [
      ['.t..', '.tb.', '.wt.'],
      ['..t.', '.bt.', '.tw.'],
    ],
    ember: [['.d..', '.dd.'], ['..d.', '.dd.']],
  },
}

const MINI: Rig = {
  outline: false,
  eyeWidth: 1,
  eyeGap: 2,
  centre: 5,
  // Four pixels is the whole strip, so the flame burns in the crown of the head and a hop
  // swaps in the shorter `air` body.
  shapes: {
    rest: { widths: [6, 8, 8, 8], eyes: 1 },
    air: { widths: [6, 8, 8], eyes: 1 },
    squash: { widths: [8, 10, 10], eyes: 1 },
    flat: { widths: [8, 10, 10], eyes: 1 },
    stretch: { widths: [4, 6, 6, 6], eyes: 1 },
  },
  eyes: {
    open: { rows: ['e', 'e'] },
    blink: { rows: ['.', 'e'] },
    wide: { rows: ['e', 'e'] },
    focus: { rows: ['.', 'e'] },
    happy: { rows: ['e', '.'] },
    squint: { rows: ['.', 'e'] },
  },
  flames: {
    big: [['tb'], ['bt']],
    normal: [['tb'], ['bt']],
    small: [['tt'], ['tt']],
    ember: [['dd'], ['dd']],
  },
}

const SPRITES = {
  cloud: ['..ff.ff.', '.ffffffff', 'ffffffffff', 'ffffffffff', '.ffffffff.', '...ff....'],
  sparkle: ['.b.', 'bwb', '.b.'],
  bang: ['bt', 'bt', 'bt', 'bt', 'tt', '..', 'tt'],
  z: ['ttt', '..t', '.t.', 'ttt'],
  gear: [
    ['..t..', '.ttt.', 'ttdtt', '.ttt.', '..t..'],
    ['.t.t.', 'ttttt', '.tdt.', 'ttttt', '.t.t.'],
  ],
  gearMini: [['.t.', 'tdt', '.t.'], ['t.t', '.d.', 't.t']],
  page: ['PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP'],
  squeezeLeft: ['t.', '.t', 't.'],
  squeezeRight: ['.t', 't.', '.t'],
}

// ---- drawing helpers --------------------------------------------------------------------------

const hexToRgb = (hex: Color) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
function mix(from: Color, to: Color, amount: number): Color {
  const [a, b] = [hexToRgb(from), hexToRgb(to)]
  return `#${a.map((value, index) => clampByte(value + (b[index]! - value) * amount).toString(16).padStart(2, '0')).join('')}`
}

const blinking = (clock: number) => clock % BLINK_EVERY < BLINK_FOR
const cycle = (t: number, period: number, count: number) => Math.floor(t / period) % count

const tones = (tone: Color) => ({
  t: tone,
  d: mix(tone, '#000000', 0.45),
  f: mix(tone, '#FFFFFF', 0.35),
  b: mix(tone, '#FFFFFF', 0.5),
  w: mix(tone, '#FFFFFF', 0.85),
  W: '#FFFFFF',
  P: PAPER,
})
type Tones = ReturnType<typeof tones>

type View = {
  set: (x: number, y: number, color: Color | undefined) => void
  stamp: (rows: readonly string[], x: number, y: number, palette: Palette, options?: { glyph?: boolean }) => void
}

// The grid in the pet's own coordinates, where it always faces right. Facing left mirrors
// everything but glyph sprites (Z, !), which keep their reading direction.
function viewOf({ w, h, px }: Pixels, facing: Facing): View {
  const mirrored = facing < 0
  const view: View = {
    set(x, y, color) {
      if (!color) return
      const [col, row] = [mirrored ? w - 1 - Math.round(x) : Math.round(x), Math.round(y)]
      if (col >= 0 && row >= 0 && col < w && row < h) px[row * w + col] = color
    },
    stamp(rows, x, y, palette, { glyph = false } = {}) {
      rows.forEach((row, dy) => {
        const width = row.length
        ;[...row].forEach((key, dx) => {
          if (key !== '.') view.set(x + (glyph && mirrored ? width - 1 - dx : dx), y + dy, palette[key])
        })
      })
    },
  }
  return view
}

type Look = { eyes?: EyeKind; gaze?: [number, number] }
type Flame = { size?: FlameSize; speed?: number; dx?: number }
type Body = { top: number; bottom: number; mid: number; eyes: number; width: number }
type Pose = { shape?: ShapeName; lift?: number; dx?: number; look?: Look; flame?: Flame; front?: (body: Body) => void }
type Act = {
  t: number
  clock: number
  big: boolean
  ground: number
  gw: number
  room: number
  view: View
  colors: Tones
}

// The outline, lit edge, shade and shine all come from the silhouette, so every shape is shaded
// the same way: light from the top left.
function paintBody(view: View, rig: Rig, pose: Pose, ground: number): Body {
  const shape = (pose.lift ? rig.shapes.air : undefined) ?? (pose.shape && rig.shapes[pose.shape]) ?? rig.shapes.rest
  const { widths } = shape
  const bottom = ground - Math.round(pose.lift ?? 0)
  const top = bottom - widths.length + 1
  const mid = rig.centre + Math.round(pose.dx ?? 0)
  const span = (y: number): [number, number] | null => {
    const w = widths[y - top]
    return w ? [mid - w / 2, mid + w / 2 - 1] : null
  }
  const inside = (x: number, y: number) => {
    const row = span(y)
    return !!row && x >= row[0] && x <= row[1]
  }
  const rim = (x: number, y: number) => inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))

  for (let y = top; y <= bottom; y++) {
    const [a, z] = span(y)!
    for (let x = a; x <= z; x++) {
      let key = 'b'
      if (rig.outline) {
        if (rim(x, y)) key = 'o'
        else if (rim(x, y + 1) || (rim(x + 1, y) && y > top + 2)) key = 's'
        else if (rim(x, y - 1) || rim(x - 1, y)) key = 'l'
      } else if (y === bottom && widths.length > 1 && (x === a || x === z)) key = 's'
      view.set(x, y, INK[key])
    }
  }
  if (rig.outline && widths.length >= 7) {
    const [a] = span(top + 1)!
    view.set(a + 2, top + 1, INK.h)
    view.set(a + 3, top + 1, INK.h)
    view.set(span(top + 2)![0] + 1, top + 2, INK.h)
  } else if (!rig.outline && widths.length >= 3) {
    view.set(span(top + 1)![0], top + 1, INK.l)
  }
  return { top, bottom, mid, eyes: top + shape.eyes, width: Math.max(...widths) }
}

function paintEyes(view: View, rig: Rig, body: Body, look: Look, clock: number) {
  let kind = look.eyes ?? 'open'
  if ((kind === 'open' || kind === 'wide') && blinking(clock)) kind = 'blink'
  const eyes = rig.eyes[kind]
  const [gx, gy] = look.gaze ?? [0, 0]
  const y = Math.min(body.eyes + gy + (eyes.dy ?? 0), rig.outline ? Infinity : body.bottom - 1)
  const out = eyes.out ?? 0
  const left = body.mid - rig.eyeGap / 2 - rig.eyeWidth + gx - out
  const right = body.mid + rig.eyeGap / 2 + gx
  // Without an outline, an eye on the bottom row would read as a gap between two legs, so short
  // bodies trim the eyes, keeping one pixel of each so the pet never goes blank.
  const fit = (rows: string[]) => {
    const room = Math.max(0, body.bottom - y)
    if (rig.outline || rows.length <= room) return rows
    const kept = rows.slice(0, room)
    return kept.some(row => row.includes('e')) ? kept : [rows.find(row => row.includes('e'))!].slice(0, room)
  }
  view.stamp(fit(eyes.left ?? eyes.rows ?? []), left, y, INK)
  view.stamp(fit(eyes.right ?? eyes.rows ?? []), right, y, INK)
}

function paintFlame(view: View, rig: Rig, body: Body, flame: Flame | undefined, colors: Tones, clock: number) {
  if (!flame) return
  const frames = rig.flames[flame.size ?? 'normal']
  const rows = frames[cycle(clock, flame.speed ?? 0.18, frames.length)]!
  const w = rows[0]!.length
  const sink = rig.outline ? 1 : rows.length
  view.stamp(rows, body.mid - w / 2 + (flame.dx ?? 0), body.top - rows.length + sink, colors)
}

// A hop at phase p, 0-1: crouch, spring up stretched, hang, fall, land.
function hop(p: number, height: number): { shape: ShapeName; lift: number } {
  if (height <= 0) return { shape: p < 0.5 ? 'squash' : 'rest', lift: 0 }
  if (p < 0.14) return { shape: 'squash', lift: 0 }
  if (p < 0.26) return { shape: 'stretch', lift: 0 }
  if (p < 0.8) {
    const u = (p - 0.26) / 0.54
    return { shape: 'rest', lift: Math.max(1, Math.round(height * 4 * u * (1 - u))) }
  }
  if (p < 0.9) return { shape: 'rest', lift: 0 }
  return { shape: 'squash', lift: 0 }
}

// ---- what each state does ---------------------------------------------------------------------

function sleepPose(c: Act): Pose {
  const since = c.t - SLEEP_AFTER
  return {
    shape: since % 3 < 1.5 ? 'rest' : 'squash',
    look: { eyes: 'blink' },
    flame: { size: 'ember', speed: 0.6 },
    front(body) {
      const palette = { t: mix(CANDLE, PAPER, 0.5) }
      for (let i = 0; i < 3; i++) {
        if (since < i * 0.9) continue
        const age = ((since - i * 0.9) / 2.7) % 1
        if (c.big) {
          const x = Math.round(body.mid + 6 + age * 6)
          const y = Math.round(body.top - 1 - age * 6)
          if (age < 0.25) c.view.set(x + 1, y + 2, palette.t)
          else c.view.stamp(SPRITES.z, x, y, palette, { glyph: true })
        } else {
          c.view.set(Math.round(c.gw - 6 + age * 5), Math.round(2 - age * 2.4), palette.t)
        }
      }
    },
  }
}

const ACTS: Record<PetState, (c: Act) => Pose> = {
  idle(c) {
    const { t, room } = c
    if (t >= SLEEP_AFTER) return sleepPose(c)
    const loop = t % 9
    const look: Look = {}
    const pose: Pose = { shape: loop % 2.4 < 0.3 ? 'squash' : 'rest', look, flame: { size: 'normal' } }
    if (loop > 2.4 && loop < 3.1) look.gaze = [-1, 0]
    if (loop >= 3.1 && loop < 3.8) look.gaze = [1, 0]
    if (loop >= 4.6 && loop < 5.4) {
      Object.assign(pose, hop((loop - 4.6) / 0.8, Math.min(3, room)))
      if (pose.lift) look.eyes = 'happy'
      pose.flame = { size: pose.lift ? 'small' : 'normal' }
    }
    if (loop >= 6.6 && loop < 7.6) look.eyes = 'happy'
    return pose
  },

  // Bounces on the spot and watches three dots fill in.
  waiting(c) {
    const { t, view, big, colors } = c
    const p = (t / 0.7) % 1
    return {
      shape: p < 0.18 ? 'squash' : 'rest',
      look: { gaze: [1, 0] },
      flame: { size: 'normal', speed: 0.14 },
      front(body) {
        const lit = cycle(t, 0.35, 4)
        for (let i = 0; i < 3; i++) {
          const color = i < lit ? colors.t : colors.d
          if (big) view.stamp(['tt', 'tt'], body.mid + 8 + i * 3, c.ground - 1, { t: color })
          else view.set(c.gw - 5 + i * 2, c.ground, color)
        }
      },
    }
  },

  // Looks up at a thought cloud that pulses with dots.
  thinking(c) {
    const { t, view, big, colors } = c
    const sway = cycle(t, 0.8, 2) ? 1 : 0
    return {
      shape: 'rest',
      dx: 0,
      look: { gaze: [sway, -1] },
      flame: { size: 'big', speed: 0.16 },
      front(body) {
        if (big) {
          view.set(body.mid + 6, body.top + 1, colors.f)
          view.stamp(['ff', 'ff'], body.mid + 7, body.top - 2, colors)
          const x = c.gw - 10
          view.stamp(SPRITES.cloud, x, 0, colors)
          const dot = cycle(t, 0.3, 4)
          for (let i = 0; i < 3; i++) view.set(x + 3 + i * 2, 2, i < dot ? colors.d : colors.f)
        } else {
          const step = cycle(t, 0.3, 4)
          const spots = [[c.gw - 7, 3], [c.gw - 5, 2], [c.gw - 3, 1], [c.gw - 1, 0]] as const
          spots.forEach(([x, y], i) => i <= step && view.set(x, y, i === step ? colors.b : colors.t))
        }
      },
    }
  },

  // Hops in rhythm while a gear spins beside it, with a spark on each landing.
  tool(c) {
    const { t, view, big, colors, room } = c
    const p = (t / 0.5) % 1
    const step = hop(p, Math.min(big ? 2 : 1, room))
    const landing = p > 0.88 || p < 0.1
    return {
      ...step,
      look: { eyes: 'focus', gaze: [1, 0] },
      flame: { size: 'normal', speed: 0.1 },
      front(body) {
        const turn = cycle(t, 0.12, 2)
        if (big) {
          const x = body.mid + 9
          view.stamp(SPRITES.gear[turn]!, x, c.ground - 6, colors)
          if (landing) {
            view.stamp(SPRITES.sparkle, x - 2, c.ground - 2, colors)
            view.set(x + 5, c.ground, colors.b)
          }
        } else {
          view.stamp(SPRITES.gearMini[turn]!, c.gw - 5, 1, colors)
          if (landing) view.set(c.gw - 1, 0, colors.w)
        }
      },
    }
  },

  // Watches a page fill with lines in the stage colour, nodding along.
  writing(c) {
    const { t, view, big, colors } = c
    const nod = cycle(t, 0.4, 2)
    return {
      shape: nod ? 'rest' : 'squash',
      look: { eyes: 'focus', gaze: [1, 1] },
      flame: { size: 'normal', speed: 0.15 },
      front() {
        if (big) {
          const x = c.gw - 8
          const y = c.ground - 8
          view.stamp(SPRITES.page, x, y, colors)
          const written = Math.floor(t * 8)
          const lines = [5, 4, 5, 3]
          let left = written % 22
          lines.forEach((length, i) => {
            const ink = Math.min(length, Math.max(0, left))
            left -= length
            for (let k = 0; k < ink; k++) view.set(x + 1 + k, y + 1 + i * 2, colors.d)
          })
        } else {
          const written = Math.floor(t * 10) % 12
          for (let k = 0; k < Math.min(6, written); k++) view.set(c.gw - 6 + k, 1, colors.t)
          for (let k = 0; k < Math.max(0, written - 6); k++) view.set(c.gw - 6 + k, 3, colors.t)
        }
      },
    }
  },

  // Stands up tall with wide eyes under a flashing "!", and shuffles now and then.
  approval(c) {
    const { t, view, big, colors } = c
    const loop = t % 1.6
    const shake = loop < 0.4 ? (cycle(loop, 0.08, 2) ? 1 : -1) : 0
    return {
      shape: 'stretch',
      dx: shake,
      look: { eyes: 'wide' },
      flame: { size: 'big', speed: 0.1 },
      front(body) {
        const on = cycle(t, 0.4, 2) === 0
        const palette = on ? colors : { t: colors.d, b: colors.t }
        if (big) view.stamp(SPRITES.bang, body.mid + 7, Math.max(0, body.top - 1), palette, { glyph: true })
        else {
          view.set(c.gw - 4, 0, palette.t)
          view.set(c.gw - 4, 1, palette.t)
          view.set(c.gw - 4, 3, palette.t)
        }
      },
    }
  },

  // Squeezed from both sides, flatter and flatter, then springs back.
  compacting(c) {
    const { t, view, big, colors } = c
    const p = (t / 1.4) % 1
    const shape = p < 0.25 ? 'rest' : p < 0.5 ? 'squash' : p < 0.85 ? 'flat' : 'stretch'
    return {
      shape,
      look: { eyes: 'squint' },
      flame: { size: 'small', speed: 0.12 },
      front(body) {
        const push = Math.round(Math.min(1, p / 0.85) * 2)
        const w = body.width
        if (big) {
          const y = c.ground - 4
          view.stamp(SPRITES.squeezeLeft, body.mid - w / 2 - 3 + push, y, colors)
          view.stamp(SPRITES.squeezeRight, body.mid + w / 2 + 1 - push, y, colors)
        } else {
          view.set(body.mid + w / 2 + 1, c.ground - 1, colors.t)
          view.set(body.mid + w / 2 + 2 - (push ? 1 : 0), c.ground, colors.t)
        }
      },
    }
  },

  // A happy jump with sparkles, then a pleased bob.
  done(c) {
    const { t, view, big, colors, room, gw } = c
    const jumping = t < 0.9
    const step = jumping ? hop(t / 0.9, Math.min(big ? 3 : 1, room)) : { shape: cycle(t, 0.5, 2) ? ('rest' as const) : ('squash' as const), lift: 0 }
    return {
      ...step,
      look: { eyes: 'happy' },
      flame: { size: step.lift ? 'small' : 'big', speed: 0.15 },
      front(body) {
        const spots = big
          ? [[body.mid + 8, 2, 0.15], [body.mid + 11, 7, 0.3], [body.mid - 7, 3, 0.45], [gw - 2, 1, 0.6], [body.mid + 9, 11, 0.75]]
          : [[gw - 7, 0, 0.1], [gw - 5, 2, 0.25], [gw - 3, 0, 0.4], [gw - 1, 2, 0.55]]
        for (const [x, y, at] of spots as [number, number, number][]) {
          const age = t - at
          if (age < 0 || age > 2.4) continue
          const twinkle = cycle(age, 0.15, 2)
          if (big && twinkle && age < 1.8) view.stamp(SPRITES.sparkle, x - 1, y - 1, colors)
          else view.set(x, y, twinkle ? colors.W : colors.b)
        }
      },
    }
  },
}

/** One frame of the pet on a w × h pixel grid, facing right unless `facing` is -1. */
export function drawWick(w: number, h: number, frame: PetFrame, facing: Facing = 1): Pixels {
  const pixels: Pixels = { w, h, px: new Array<Color | null>(w * h).fill(null) }
  const big = h >= 14
  const rig = big ? FULL : MINI
  const restHeight = big ? FULL.shapes.rest.widths.length + FULL.flames.normal[0]!.length - 1 : MINI.shapes.air!.widths.length
  const c: Act = {
    t: frame.t,
    clock: frame.clock,
    big,
    ground: h - 1,
    gw: w,
    room: Math.max(0, h - restHeight),
    view: viewOf(pixels, facing),
    colors: tones(frame.state === 'idle' ? CANDLE : TONES[frame.state]),
  }
  const pose = ACTS[frame.state](c)
  const body = paintBody(c.view, rig, pose, c.ground)
  paintEyes(c.view, rig, body, pose.look ?? {}, frame.clock)
  paintFlame(c.view, rig, body, pose.flame, c.colors, frame.clock)
  pose.front?.(body)
  return pixels
}

// ---- terminal cells ---------------------------------------------------------------------------

/** A Raster cell's "terminal default" colour. */
export const DEFAULT_COLOR = 0x01000000
const pack = (color: Color) => parseInt(color.slice(1), 16)

// Unicode 16's octants, U+1CD00 to U+1CDE5, run through every 2 × 4 pattern in order, but for
// the 26 that older blocks already draw. Bit i is pixel i in reading order.
const OCTANT_OLDER: Readonly<Record<number, number>> = {
  0: 0x20, 255: 0x2588, 15: 0x2580, 240: 0x2584, 85: 0x258c, 170: 0x2590,
  5: 0x2598, 10: 0x259d, 80: 0x2596, 160: 0x2597, 165: 0x259a, 90: 0x259e, 95: 0x259b, 175: 0x259c, 245: 0x2599, 250: 0x259f,
  3: 0x1fb82, 192: 0x2582, 63: 0x1fb85, 252: 0x2586,
  1: 0x1cea8, 2: 0x1ceab, 64: 0x1cea3, 128: 0x1cea0, 20: 0x1fbe6, 40: 0x1fbe7,
}
const OCTANTS = (() => {
  let next = 0x1cd00
  return Array.from({ length: 256 }, (_, mask) => OCTANT_OLDER[mask] ?? next++)
})()

// The pet uses a few dozen colours, and a frame measures each cell's against each other many times.
const rgbs = new Map<Color, number[]>()
const rgbOf = (color: Color) => rgbs.get(color) ?? rgbs.set(color, hexToRgb(color)).get(color)!
const distance = (a: Color, b: Color) => {
  const [x, y] = [rgbOf(a), rgbOf(b)]
  return (x[0]! - y[0]!) ** 2 + (x[1]! - y[1]!) ** 2 + (x[2]! - y[2]!) ** 2
}

// One cell's two colours: the pair that keeps it closest to its eight pixels, so a lone outline
// or eye pixel is not simply outvoted. A clear pixel must keep the terminal's background, so a
// cell with any draws the rest in the one colour nearest them all. Bit i of `mask` is set for
// each pixel drawn in `fg`.
function closestTwo(pixels: (Color | null)[]): { mask: number; fg: Color | null; bg: Color | null } {
  const counts = new Map<Color, number>()
  for (const color of pixels) if (color) counts.set(color, (counts.get(color) ?? 0) + 1)
  const colors = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!)
  if (!colors.length) return { mask: 0, fg: null, bg: null }
  const drawn = pixels.filter((color): color is Color => !!color)
  const cost = (palette: Color[], of: Color[]) => of.reduce((total, color) => total + Math.min(...palette.map(choice => distance(color, choice))), 0)
  if (drawn.length < pixels.length) {
    const fg = colors.reduce((best, color) => (cost([color], drawn) < cost([best], drawn) ? color : best))
    return { mask: pixels.reduce((mask: number, color, i) => (color ? mask | (1 << i) : mask), 0), fg, bg: null }
  }
  if (colors.length === 1) return { mask: (1 << pixels.length) - 1, fg: colors[0]!, bg: null }
  let pair = [colors[0]!, colors[1]!]
  for (let a = 0; a < colors.length; a++) {
    for (let b = a + 1; b < colors.length; b++) if (cost([colors[a]!, colors[b]!], drawn) < cost(pair, drawn)) pair = [colors[a]!, colors[b]!]
  }
  const [base, other] = pair as [Color, Color]
  const mask = drawn.reduce((bits, color, i) => (distance(color, other) < distance(color, base) ? bits | (1 << i) : bits), 0)
  return { mask, fg: other, bg: base }
}

/**
 * Two × four pixels a cell, as Raster words: [codePoint, fg, bg] for each cell, row by row. A
 * cell shows two colours at most; clear pixels keep the terminal's background.
 */
export function octants({ w, h, px }: Pixels): Uint32Array {
  const [columns, rows] = [Math.ceil(w / 2), Math.ceil(h / 4)]
  const words = new Uint32Array(columns * rows * 3)
  const at = (x: number, y: number) => (x < w && y < h ? (px[y * w + x] ?? null) : null)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const pixels: (Color | null)[] = []
      for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) pixels.push(at(col * 2 + x, row * 4 + y))
      const { mask, fg, bg } = closestTwo(pixels)
      words.set([OCTANTS[mask]!, fg ? pack(fg) : DEFAULT_COLOR, bg ? pack(bg) : DEFAULT_COLOR], (row * columns + col) * 3)
    }
  }
  return words
}

/** The pet as `columns` × `rows` octant cells. */
export const petCells = (columns: number, rows: number, frame: PetFrame, facing: Facing = 1) =>
  octants(drawWick(columns * 2, rows * 4, frame, facing))

/**
 * Which state the pet is in and since which frame, for a host counting frames at `fps`. Setting
 * the state it is already in changes nothing, so its act carries on; `done` lasts DONE_SECONDS,
 * then the pet goes idle.
 */
export function petClock(fps: number) {
  let state: PetState = 'idle'
  let since = 0
  return {
    get state() {
      return state
    },
    set(next: PetState, frame: number) {
      if (next === state) return
      state = next
      since = frame
    },
    at(frame: number): PetFrame {
      if (state === 'done' && (frame - since) / fps >= DONE_SECONDS) {
        state = 'idle'
        since = frame
      }
      return { state, t: Math.max(0, frame - since) / fps, clock: frame / fps }
    },
  }
}
