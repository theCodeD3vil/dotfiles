import type { EngineInterface, Register } from 'claude-code'

// Agent lanes: one row per running subagent above the prompt, a blank row under them.
//   explore  ⢾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡷  Grep
// Which subagents run comes from $.agent.list(), asked once a second, so background subagents show
// too. Only that list opens a lane: events carrying an agentId (side queries, hooks) never do. Each lane is ember-ribbon's 5h bar in the lane's colour: solid braille dots, dim at rest, a
// pulse of light running forward to the end over and over, and tips sweeping a band of hues around
// the lane colour. A subagent reports no progress, so the bar is always full; its real activity
// (characters its replies stream and a burst per tool call) makes the bar and its pulse brighter.
// When its subagent stops, a lane goes still, says done or failed, and is hidden 30 s later.

// endedTick: the timer tick its run finished on; a finished lane stays HIDE_AFTER_TICKS, then goes.
type Lane = { name: string; color: number[]; tool: string; trace: number[]; pending: number; endedTick?: number; failed?: boolean }

const MAX_LANES = 4
const HIDE_AFTER_TICKS = 300 // 30 s of 100 ms ticks
const ACTIVE_STATES = new Set(['pending', 'running', 'waiting'])
const NAME_COLUMNS = 9
const TOOL_SPIKE = 120 // a tool call counts like a burst of streamed text
const ACTIVE = 160 // characters a second that count as fully busy
const DEFAULT_COLOR = 0x01000000 // a Raster cell's "terminal default" colour
// The pulse and tips, as ember-ribbon's 5h bar has them
const PULSE_SPEED = 10 // cells a second: one cell per 100 ms tick
const PULSE_TAIL = 3
const PULSE_GAP = 6
const TIP_SWEEP = 25 // degrees either side of the lane hue
const TIP_PERIOD = 1400
// Catppuccin Mocha, one per lane in order of arrival
const COLORS = ['#89B4FA', '#A6E3A1', '#FAB387', '#CBA6F7', '#94E2D5', '#F9E2AF'].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))

const pack = (c: number[]) => ((c[0] ?? 0) << 16) | ((c[1] ?? 0) << 8) | (c[2] ?? 0)
const hexOf = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')

// [r, g, b] 0-255 <-> [hue 0-360, saturation 0-1, lightness 0-1], as in ember-ribbon
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

const lanes = new Map<string, Lane>()
// Subagents whose run is over: never given a lane again, even while the engine still lists them.
const ended = new Set<string>()
let arrivals = 0
let ticking = false
let tick = 0

type AgentInfo = Awaited<ReturnType<EngineInterface['agent']['list']>>[number]

// A lane's label: the subagent's type, or the start of its description for a general one.
const nameOf = (info?: AgentInfo) => {
  const label = info?.type && info.type !== 'general-purpose' ? info.type : info?.description
  return label ? label.toLowerCase().replace(/\s+/g, '-').slice(0, NAME_COLUMNS - 1) : 'agent'
}

function laneFor(agentId: string, info?: AgentInfo) {
  let lane = lanes.get(agentId)
  if (!lane) {
    lane = { name: nameOf(info), color: COLORS[arrivals++ % COLORS.length]!, tool: '', trace: [], pending: 0 }
    lanes.set(agentId, lane)
  } else if (info && lane.name === 'agent') lane.name = nameOf(info)
  return lane
}

// A lane whose run is over: it stops moving, says how it ended, and is hidden 30 s later.
function finish(lane: Lane, failed: boolean) {
  if (lane.endedTick !== undefined) return
  lane.endedTick = tick
  for (const [id, l] of lanes) if (l === lane) ended.add(id)
  lane.failed = failed
}

// The subagents as the engine has them: active ones get a lane, ones that stopped are finished.
async function rollCall($: EngineInterface) {
  try {
    const agents = await $.agent.list()
    for (const info of agents) if (ACTIVE_STATES.has(info.status) && !ended.has(info.id)) laneFor(info.id, info)
    for (const [id, lane] of lanes) {
      const info = agents.find(a => a.id === id)
      if (!info || !ACTIVE_STATES.has(info.status)) finish(lane, info?.status === 'failed' || info?.status === 'killed')
    }
  } catch {}
}

// One timer, started from whichever hook runs first: session.start does not run again after
// /reload-plugins, so every hook offers to start it.
function ensureTicking($: EngineInterface) {
  if (ticking) return
  ticking = true
  let shown = 0
  $.clock.every(100, () => {
    tick++
    if (tick % 10 === 0) void rollCall($)
    for (const [id, lane] of lanes) if (lane.endedTick !== undefined && tick - lane.endedTick >= HIDE_AFTER_TICKS) lanes.delete(id)
    for (const lane of lanes.values()) {
      lane.trace.push(lane.pending)
      lane.pending = 0
      if (lane.trace.length > 200) lane.trace.shift()
    }
    // Redraw while lanes show, and once more when the last one leaves.
    if (lanes.size > 0 || shown > 0) $.ui.invalidate('ui.render')
    shown = lanes.size
  })
}

function laneCells(lane: Lane, width: number, t: number) {
  const done = lane.endedTick !== undefined
  // How busy it has been over the last second, 0 to 1; a finished lane is still and dim.
  const act = done ? 0 : Math.min(1, lane.trace.slice(-10).reduce((a, b) => a + b, 0) / ACTIVE)
  const [hue] = toHsl(lane.color)
  const vivid = (l: number) => pack(fromHsl(hue, 0.9, l))
  const front = ((t / 1000) * PULSE_SPEED) % (width + PULSE_GAP)
  const words = new Uint32Array(width * 3)
  for (let x = 1; x < width - 1; x++) {
    const behind = front - x
    const pulse = done ? 0 : behind >= 0 ? Math.exp(-behind / PULSE_TAIL) : Math.exp(-(behind * behind) / 0.8)
    const glow = 0.22 + 0.16 * act + (0.35 + 0.3 * act) * pulse
    words.set([0x28ff, vivid(0.12 + 0.58 * glow), DEFAULT_COLOR], x * 3)
  }
  const tip = (phase: number) => pack(done ? fromHsl(hue, 0.9, 0.3) : fromHsl(hue + TIP_SWEEP * Math.sin((t / TIP_PERIOD + phase) * Math.PI * 2), 0.95, 0.62))
  words.set([0x28be, tip(0), DEFAULT_COLOR], 0)
  words.set([0x2877, tip(0.5), DEFAULT_COLOR], (width - 1) * 3)
  return (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()
}

export const register: Register = on => {
  on('session.start', ($, e, next) => {
    ensureTicking($)
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    ensureTicking($)
    return next(e)
  })

  // Count what each subagent's replies stream, passing every piece on untouched.
  on('turn.step', async function* ($, e, next) {
    ensureTicking($)
    const lane = e.agentId ? lanes.get(e.agentId) : undefined
    for await (const chunk of next(e)) {
      if (lane) {
        if (chunk.kind === 'text' || chunk.kind === 'thinking') lane.pending += chunk.text.length
        else if (chunk.kind === 'input') lane.pending += chunk.json.length
      }
      yield chunk
    }
  })

  // A subagent's tool call: a spike, and its name beside the trace.
  on('tool.call', async ($, e, next) => {
    ensureTicking($)
    const lane = e.agentId ? lanes.get(e.agentId) : undefined
    if (lane) {
      lane.tool = String(e.tool)
      lane.pending += TOOL_SPIKE
    }
    return next(e)
  })

  // A subagent's run is over: its lane shows how it ended, then leaves 30 s later.
  on('turn.complete', ($, e, next) => {
    const lane = e.agentId ? lanes.get(e.agentId) : undefined
    if (lane) {
      finish(lane, e.reason !== 'answer')
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // The lanes sit under whatever plugins beneath draw above the prompt, a blank row below them.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    ensureTicking($)
    const below = await next(e)
    if (e.surface !== 'terminal' || e.props.hasSurvey || lanes.size === 0) return below
    const { Box, Raster, Text } = $.ui.resolve(e)
    const width = Math.max(8, Math.min(48, e.props.bodyColumns - NAME_COLUMNS - 14))
    const shown = [...lanes.entries()].slice(-MAX_LANES)
    return (
      <Box flexDirection="column">
        {below}
        {/* marginBottom leaves a blank row between the lanes and the context row under them. */}
        <Box flexDirection="column" marginBottom={1}>
          {shown.map(([id, lane]) => (
            <Box key={`lane-${id}`} flexDirection="row">
              <Box width={NAME_COLUMNS} flexShrink={0}>
                <Text color={hexOf(lane.color)} wrap="truncate">{lane.name}</Text>
              </Box>
              <Raster key={`trace-${id}`} columns={width} rows={1} cells={laneCells(lane, width, tick * 100)} />
              <Box marginLeft={2}>
                {lane.endedTick === undefined ? (
                  <Text dimColor wrap="truncate">{lane.tool}</Text>
                ) : (
                  <Text color={lane.failed ? '#F38BA8' : '#A6E3A1'}>{lane.failed ? '✕ failed' : '✓ done'}</Text>
                )}
              </Box>
            </Box>
          ))}
          {lanes.size > MAX_LANES ? <Text dimColor>+{lanes.size - MAX_LANES} more</Text> : null}
        </Box>
      </Box>
    )
  })
}
