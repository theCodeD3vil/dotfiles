import type { EngineInterface, Register, RenderChildren, SessionMessage, SessionRateLimit } from 'claude-code'

import type { ContextReading } from '../types'

// Ember Pills: Claude Code's footer, replaced, plus one row above the prompt with the prompt
// enhance button and the context's heat.
//   above:     134.4k / 200k
//   below:  ✻ Opus 5.5   5h ⣿⣿⣿⣷⣿⣷⣿⣿│      41% 2h14m   wk 󰪟 18% 3d05h
// The 5h bar fills with usage; the ▐ marker shows how much of the window has passed.
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

function sevColor(pct: number) {
  if (pct >= 85) return '#E2766A'
  if (pct >= 65) return '#E2B064'
  return '#A3BA82'
}

// The 5h bar as a Raster of braille, after plan-progress's trackCells (MIT): the used part solid
// dots in a fully saturated usage hue, dim at rest with a pulse of light running forward to the head
// over and over (repainted every 100 ms by the timer), the rest solid ⣿ in dim
// grey, a ▐ where the window's time has got to, and dotted tips (⢾ ⡷) that, once the fill reaches
// them, sweep a band of hues around the usage colour. Every cell sits on the terminal's own background.
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mix = (a: number[], b: number[], m: number) => a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * m))
const pack = (c: number[]) => ((c[0] ?? 0) << 16) | ((c[1] ?? 0) << 8) | (c[2] ?? 0)
const hash = (a: number, b: number, k: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
const BACKGROUND = [10, 10, 10] // Ghostty's background, #0A0A0A
const DEFAULT_COLOR = 0x01000000 // a Raster cell's "terminal default" colour
const PULSE_SPEED = 10 // cells a second: one cell per 100 ms repaint, so the front moves smoothly
const PULSE_TAIL = 3 // cells the pulse's tail fades over
const PULSE_GAP = 6 // cells of dark between one pulse leaving the head and the next starting

// Where the pulse's front is, in cells from the bar's start: it crosses the used part, waits out the
// gap, and starts again from the beginning.
const pulseAt = (t: number, fx: number) => ((t / 1000) * PULSE_SPEED) % (fx + PULSE_GAP)

const TIP_SWEEP = 25 // degrees either side of the usage hue the tips sweep through
const TIP_PERIOD = 1400 // ms for one sweep

// [r, g, b] 0-255 <-> [hue 0-360, saturation 0-1, lightness 0-1]
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

function usageCells(pct: number, timePct: number, width: number, t: number) {
  // The usage colour's hue at full strength: brightness varies by lightness alone, so nothing greys it.
  const [hue] = toHsl(hex(sevColor(pct)))
  const vivid = (l: number) => fromHsl(hue, 0.9, l)
  const grey = hex(TRACK)
  const fx = pct > 0 ? Math.max(1, (pct / 100) * width) : 0
  const words = new Uint32Array(width * 3)
  const set = (x: number, ch: number, fg: number[]) => words.set([ch, pack(fg), DEFAULT_COLOR], x * 3)

  for (let x = 0; x < width; x++) {
    if (x + 0.5 >= fx) {
      set(x, 0x28ff, grey)
      continue
    }
    const u = Math.min(1, (x + 0.5) / fx)
    // Every dot lit, dim at rest; a pulse of light runs from the start to the head and starts
    // over, a sharp front with a longer fading tail so it reads as moving forward.
    const behind = pulseAt(t, fx) - x
    const pulse = behind >= 0 ? Math.exp(-behind / PULSE_TAIL) : Math.exp(-(behind * behind) / 0.8)
    const glow = 0.28 + 0.12 * Math.pow(u, 0.9) + 0.6 * pulse
    set(x, 0x28ff, vivid(0.12 + 0.58 * glow))
  }

  // A thick ▐, kept off the end cells, which become the tips.
  const marker = Math.max(1, Math.min(width - 2, Math.round((width * timePct) / 100)))
  set(marker, 0x2590, hex(sevColor(timePct)))

  // Rounded ends: a half circle of dots each. A tip the fill has reached sweeps a band of hues
  // around the usage colour (the two out of phase); one it has not stays grey like the track.
  const tip = (phase: number) => fromHsl(hue + TIP_SWEEP * Math.sin((t / TIP_PERIOD + phase) * Math.PI * 2), 0.95, 0.62)
  set(0, 0x28be, pct > 0 ? tip(0) : grey)
  set(width - 1, 0x2877, fx >= width - 1 ? tip(0.5) : grey)

  return (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()
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

// Ember heat (Catppuccin Mocha colours, Claude orange at 25-50%): the used tokens coloured by how full the context window is.
const HEAT = [
  { upTo: 25, color: '#A6E3A1' },
  { upTo: 50, color: CLAUDE },
  { upTo: 75, color: '#F9E2AF' },
  { upTo: 90, color: '#F5C2E7' },
  { upTo: Infinity, color: '#F38BA8' },
]

// Held by the host, so the turns' readings survive a hot reload of this file.
const readings = { plugin: 'ember-ribbon', key: 'readings' } as const

// The context chart: one dot column per turn, two to a cell, the newest turn at the right.
// FILL_ROWS cells tall, four dot rows to each, so a column has 4 * FILL_ROWS heights.
const FILL_CELLS = 8
const FILL_ROWS = 2
const FILL_TURNS = FILL_CELLS * 2

async function readContext($: EngineInterface): Promise<ContextReading | undefined> {
  const { context } = await $.session.usage()
  if (!context?.window) return
  const tokens = context.tokens ?? 0
  const percent = context.percent ?? Math.round((tokens / context.window) * 100)
  return { tokens, window: context.window, percent }
}

// Called as a main-loop turn ends: adds that turn's reading, oldest first, keeping what the chart shows.
async function takeReading($: EngineInterface) {
  const reading = await readContext($)
  if (!reading) return
  const { value: history = [] } = await $.state.get(readings)
  await $.state.set(readings, [...history, reading].slice(-FILL_TURNS))
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

const encode = (words: Uint32Array) => (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()

// Token stream: characters the main loop's reply streams in each 100 ms tick (text, thinking and
// tool input; about four to a token), drawn as a 1-row braille chart at the far right of the row.
const STREAM_CELLS = 8
let stream: number[] = []
let streaming = 0
const tokensPerSecond = () => Math.round(stream.slice(-10).reduce((a, b) => a + b, 0) / 4)

// Each dot column is the mean of five ticks (half a second), so the line reads as a rate.
function streamPoints(width: number) {
  return Array.from({ length: width * 2 }, (_, i) => {
    const end = stream.length - (width * 2 - 1 - i)
    const window = stream.slice(Math.max(0, end - 5), Math.max(0, end))
    return window.length ? window.reduce((a, b) => a + b, 0) / window.length : 0
  })
}

// Context fill history, left of the used / window readout: a column per turn, as tall as the context
// percent at the turn's end (the dots rise from the floor), green when low, yellow mid, red high.
const FILL_GREEN = hex('#A6E3A1')
const FILL_YELLOW = hex('#F9E2AF')
const FILL_RED = hex('#F38BA8')

const fillColor = (percent: number) => {
  const t = Math.min(1, Math.max(0, percent / 100))
  return t < 0.5 ? mix(FILL_GREEN, FILL_YELLOW, t * 2) : mix(FILL_YELLOW, FILL_RED, (t - 0.5) * 2)
}

// percents: one per turn, oldest first. Turns fill from the right; the cells before the first turn
// are dim floor dots, and a cell is coloured by the higher of its two turns.
function fillCells(width: number, rows: number, percents: number[]) {
  const shown = percents.slice(-width * 2)
  const first = width * 2 - shown.length
  const track = pack(hex(TRACK))
  const dots = rows * 4
  const words = new Uint32Array(width * rows * 3)
  for (let x = 0; x < width; x++) {
    // How many dots tall each of this cell's two turns is; -1 for a column with no turn yet.
    const levels = [0, 1].map(c => {
      const p = shown[x * 2 + c - first]
      return p === undefined ? -1 : Math.max(1, Math.round((Math.min(100, Math.max(0, p)) / 100) * dots))
    })
    const top = Math.max(...[0, 1].map(c => shown[x * 2 + c - first] ?? -1))
    const color = top < 0 ? track : pack(fillColor(top))
    for (let cr = 0; cr < rows; cr++) {
      let bits = 0
      for (let r = 0; r < 4; r++) {
        // The dot's height above the floor; lit when within the column's level (a bare column keeps its floor dots).
        const height = dots - 1 - (cr * 4 + r)
        for (let c = 0; c < 2; c++) if (height < levels[c]! || (levels[c] === -1 && height === 0)) bits |= BRAILLE_BITS[r]![c]!
      }
      words.set([0x2800 + bits, color, DEFAULT_COLOR], (cr * width + x) * 3)
    }
  }
  return encode(words)
}

function streamCells(width: number) {
  const points = streamPoints(width)
  const top = Math.max(1, ...points)
  const color = pack(hex('#CBA6F7')) // Catppuccin Mocha mauve
  const words = new Uint32Array(width * 3)
  for (let x = 0; x < width; x++) {
    let bits = 0
    for (let c = 0; c < 2; c++) {
      const level = Math.round((points[x * 2 + c]! / top) * 4)
      for (let r = 4 - level; r < 4; r++) bits |= BRAILLE_BITS[r]![c]!
    }
    words.set([bits ? 0x2800 + bits : 0x2800 + BRAILLE_BITS[3]![0]! + BRAILLE_BITS[3]![1]!, bits ? color : pack(hex(TRACK)), DEFAULT_COLOR], x * 3)
  }
  return encode(words)
}

let working = false
let tick = 0
let ticking = false
// Where the 5h bar is mounted and what it shows, so the timer can repaint just its cells.
let mountedBar: { requestId: string; pct: number; timePct: number; width: number } | undefined

// One 100 ms timer, started from whichever hook runs first: session.start does not run again after
// /reload-plugins, so the render hooks offer to start it too.
function ensureTicking($: EngineInterface) {
  if (ticking) return
  ticking = true
  try {
    $.clock.every(100, () => {
      tick++
      // The graph is always drawn, so idle ticks push zeros: it runs down to a flat line after a reply.
      const live = streaming > 0 || stream.some(v => v > 0)
      if (working || live) {
        stream.push(streaming)
        streaming = 0
        if (stream.length > STREAM_CELLS * 2 + 10) stream.shift()
      }
      // Animate while working, enhancing or running down; otherwise redraw once a minute for the countdowns.
      if (working || live || busy || tick % 600 === 0) $.ui.invalidate('ui.render')
      // Count the check down, redrawing once it is gone.
      if (doneTicks > 0 && --doneTicks === 0) $.ui.invalidate('ui.render')
      // The 5h bar's dots move all the time: repaint its cells alone, without a redraw.
      if (mountedBar) {
        const { requestId, pct, timePct, width } = mountedBar
        void $.ui.blit({ requestId, key: 'usage', cells: usageCells(pct, timePct, width, tick * 100) }).catch(() => {})
      }
    })
  } catch {
    ticking = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    ensureTicking($)
    return next(e)
  })

  // A fresh chart for each turn of the main loop.
  on('turn.start', ($, e, next) => {
    stream = []
    streaming = 0
    return next(e)
  })

  // Count what the main loop's reply streams, passing every piece on untouched.
  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (!e.agentId) {
        if (chunk.kind === 'text' || chunk.kind === 'thinking') streaming += chunk.text.length
        else if (chunk.kind === 'input') streaming += chunk.json.length
      }
      yield chunk
    }
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
  // What plugins beneath draw here (plan-progress's bars) sits above the row.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    ensureTicking($)
    const below = await next(e)
    if (e.surface !== 'terminal' || e.props.hasSurvey) return below
    const { value: history = [] } = await $.state.get(readings)
    // No turn has finished yet: the readout takes the live context so it shows from the first draw.
    // The chart has no column for it, since it is not a turn's end.
    const now = history[history.length - 1] ?? (await readContext($))
    const canUndo = (await $.state.get(previous)).value != null
    working = e.props.isWorking

    const { Box, Button, Raster, Text } = $.ui.resolve(e)
    const f = now ? (HEAT.find(b => now.percent < b.upTo) ?? HEAT[HEAT.length - 1]!) : undefined

    // bodyColumns is the band's width less the engine's [-] marker, so the heat sits flush right.
    // paddingTop keeps the conversation from sitting flush on the band. The token stream is always
    // drawn at the far right, after the context count: flat while idle, moving while Claude works.
    return (
      <Box flexDirection="column" paddingTop={2}>
        {below}
        <Box width={e.props.bodyColumns} alignItems="flex-end">
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
        <Box marginRight={1}>
          <Raster key="fill" columns={FILL_CELLS} rows={FILL_ROWS} cells={fillCells(FILL_CELLS, FILL_ROWS, history.map(r => r.percent))} />
        </Box>
        {now && f ? (
          <Box>
            <Text color={f.color} bold>{short(now.tokens)}</Text>
            <Text dimColor> / {short(now.window)}</Text>
          </Box>
        ) : (
          <Text dimColor>– / –</Text>
        )}
        <Box marginLeft={3} gap={1}>
          <Raster key="stream" columns={STREAM_CELLS} rows={1} cells={streamCells(STREAM_CELLS)} />
          {/* Padded to four digits (figure spaces are digit-wide) so the row stops shifting as it counts. */}
          <Text dimColor>{String(Math.min(9999, tokensPerSecond())).padStart(4, '\u2007')} tok/s</Text>
        </Box>
        </Box>
      </Box>
    )
  })

  // Draw the footer in place of the hint line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    ensureTicking($)
    working = e.props.isWorking
    mountedBar = undefined

    const { Box, Raster, Text } = $.ui.resolve(e)
    const usage = await $.session.usage()
    const model = modelName(await $.session.model())
    const now = await $.clock.now()

    // ▬▬▬▬▬▮▬▬▬▬ filled up to usage (severity colour); ▮ marks how much of the window has passed,
    // coloured like usage: olive early in the window, amber past 65%, red past 85%
    const usageBar = (pct: number, limit: SessionRateLimit | undefined, windowMs: number, width: number) => {
      const resetsIn = limit?.resetsAt ? Date.parse(limit.resetsAt) - now : windowMs
      const timePct = 100 * (1 - resetsIn / windowMs)
      mountedBar = { requestId: e.requestId, pct, timePct, width }
      return <Raster key="usage" columns={width} rows={1} cells={usageCells(pct, timePct, width, tick * 100)} />
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
    // layout that fits: the 5h bar becomes a ring first, then time left goes. The weekly gauge is
    // always a ring.
    const statWidth = (label: string, gauge: number, pct: number, time: string) =>
      label.length + 1 + gauge + 1 + `${pct}%`.length + (time ? 1 + time.length : 0)
    const layoutWidth = (full: boolean, showTime: boolean) =>
      2 + statWidth('5h', full ? 22 : 1, five, showTime ? fiveTime : '') + 3 +
      statWidth('wk', 1, week, showTime ? weekTime : '') + 3 + 2 + model.length
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
        {stat('wk', week, ring(week), noTime ? undefined : weekTime)}
      </Box>
    )
  })
}
