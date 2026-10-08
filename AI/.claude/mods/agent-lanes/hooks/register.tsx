import type { EngineInterface, Register } from 'claude-code'

// Agent lanes: one row per running subagent above the prompt, a blank row under them.
//   explore  ⢾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡷  Grep
// Which subagents run comes from $.agent.list(), asked once a second, so background subagents show
// too. Only that list opens a lane: events carrying an agentId (side queries, hooks) never do.
// Each lane is ember-ribbon's 5h bar in the lane's colour: solid braille dots, dim at rest, a
// pulse of light running forward to the end over and over, and tips sweeping a band of hues around
// the lane colour. A subagent reports no progress, so the bar is always full; its real activity
// (characters its replies stream and a burst per tool call) makes the bar and its pulse brighter.
// When its subagent stops, a lane goes still, says done or failed, and is hidden 30 s later.

type Rgb = number[]

// endedTick: the timer tick its run finished on; a finished lane stays HIDE_AFTER_TICKS, then goes.
type Lane = { name: string; color: Rgb; tool: string; trace: number[]; pendingChars: number; endedTick?: number; failed?: boolean }

type AgentInfo = Awaited<ReturnType<EngineInterface['agent']['list']>>[number]
type TerminalUi = Extract<ReturnType<EngineInterface['ui']['resolve']>, { Raster: unknown }>

const TICK_MS = 100
const TICKS_PER_SECOND = 1000 / TICK_MS
const TRACE_TICKS = 200 // how much activity history a lane keeps
const HIDE_AFTER_TICKS = 300 // 30 s of ticks
const MAX_LANES = 4
const ACTIVE_STATES = new Set(['pending', 'running', 'waiting'])
const NAME_COLUMNS = 9
const STATUS_COLUMNS = 14 // room right of the bar for the gap and "✕ failed"
const MIN_BAR_WIDTH = 8
const MAX_BAR_WIDTH = 48
const TOOL_SPIKE_CHARS = 120 // a tool call counts like a burst of streamed text
const BUSY_CHARS_PER_SECOND = 160 // streamed characters a second that count as fully busy
const DEFAULT_COLOR = 0x01000000 // a Raster cell's "terminal default" colour
const BRAILLE_FULL = 0x28ff
const BRAILLE_TIP_LEFT = 0x28be
const BRAILLE_TIP_RIGHT = 0x2877
const DONE_COLOR = '#A6E3A1'
const FAILED_COLOR = '#F38BA8'
// The pulse and tips
const PULSE_SPEED = 10 // cells a second: one cell per tick
const PULSE_TAIL = 3
const PULSE_GAP = 6
const TIP_SWEEP = 25 // degrees either side of the lane hue
const TIP_PERIOD_MS = 1400

const hexToRgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
const packRgb = (rgb: Rgb) => ((rgb[0] ?? 0) << 16) | ((rgb[1] ?? 0) << 8) | (rgb[2] ?? 0)
const rgbToHex = (rgb: Rgb) => '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')
const encodeCells = (words: Uint32Array) => (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()

// Catppuccin Mocha, one per lane in order of arrival
const LANE_COLORS = ['#89B4FA', '#A6E3A1', '#FAB387', '#CBA6F7', '#94E2D5', '#F9E2AF'].map(hexToRgb)

// [r, g, b] 0-255 <-> [hue 0-360, saturation 0-1, lightness 0-1], as in ember-ribbon
function toHsl([red = 0, green = 0, blue = 0]: Rgb): [number, number, number] {
  const [redUnit, greenUnit, blueUnit] = [red / 255, green / 255, blue / 255]
  const max = Math.max(redUnit, greenUnit, blueUnit)
  const min = Math.min(redUnit, greenUnit, blueUnit)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, lightness]
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const sector =
    max === redUnit ? ((greenUnit - blueUnit) / delta) % 6 : max === greenUnit ? (blueUnit - redUnit) / delta + 2 : (redUnit - greenUnit) / delta + 4
  return [(sector * 60 + 360) % 360, saturation, lightness]
}
function fromHsl(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = (((hue % 360) + 360) % 360) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = lightness - chroma / 2
  const rgb: [number, number, number] =
    sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] : sector < 3 ? [0, chroma, second] : sector < 4 ? [0, second, chroma] : sector < 5 ? [second, 0, chroma] : [chroma, 0, second]
  return rgb.map(value => Math.round((value + offset) * 255))
}

const lanes = new Map<string, Lane>()
// Subagents whose run is over: never given a lane again, even while the engine still lists them.
const finishedAgentIds = new Set<string>()
let arrivals = 0
let isTicking = false
let tick = 0
let shownLaneCount = 0

// The lane of the subagent an event came from; none for the main loop or an unknown one.
const findLane = (agentId: string | undefined) => (agentId ? lanes.get(agentId) : undefined)

// A lane's label: the subagent's type, or the start of its description for a general one.
const laneLabel = (info?: AgentInfo) => {
  const label = info?.type && info.type !== 'general-purpose' ? info.type : info?.description
  return label ? label.toLowerCase().replace(/\s+/g, '-').slice(0, NAME_COLUMNS - 1) : 'agent'
}

function openLane(agentId: string, info?: AgentInfo) {
  let lane = lanes.get(agentId)
  if (!lane) {
    lane = { name: laneLabel(info), color: LANE_COLORS[arrivals++ % LANE_COLORS.length]!, tool: '', trace: [], pendingChars: 0 }
    lanes.set(agentId, lane)
  } else if (info && lane.name === 'agent') lane.name = laneLabel(info)
  return lane
}

// A lane whose run is over: it stops moving, says how it ended, and is hidden 30 s later.
function finishLane(agentId: string, failed: boolean) {
  const lane = lanes.get(agentId)
  if (!lane || lane.endedTick !== undefined) return
  lane.endedTick = tick
  lane.failed = failed
  finishedAgentIds.add(agentId)
}

// The subagents as the engine has them: active ones get a lane, ones that stopped are finished.
async function rollCall(engine: EngineInterface) {
  try {
    const agents = await engine.agent.list()
    for (const info of agents) if (ACTIVE_STATES.has(info.status) && !finishedAgentIds.has(info.id)) openLane(info.id, info)
    for (const agentId of lanes.keys()) {
      const info = agents.find(agent => agent.id === agentId)
      if (!info || !ACTIVE_STATES.has(info.status)) finishLane(agentId, info?.status === 'failed' || info?.status === 'killed')
    }
  } catch {}
}

function dropExpiredLanes() {
  for (const [agentId, lane] of lanes) {
    if (lane.endedTick !== undefined && tick - lane.endedTick >= HIDE_AFTER_TICKS) lanes.delete(agentId)
  }
}

// Closes the tick's activity into each lane's history.
function recordActivity() {
  for (const lane of lanes.values()) {
    lane.trace.push(lane.pendingChars)
    lane.pendingChars = 0
    if (lane.trace.length > TRACE_TICKS) lane.trace.shift()
  }
}

function advanceLanes(engine: EngineInterface) {
  tick++
  if (tick % TICKS_PER_SECOND === 0) void rollCall(engine)
  dropExpiredLanes()
  recordActivity()
  // Redraw while lanes show, and once more when the last one leaves.
  if (lanes.size > 0 || shownLaneCount > 0) engine.ui.invalidate('ui.render')
  shownLaneCount = lanes.size
}

// One timer, started from whichever hook runs first: session.start does not run again after
// /reload-plugins, so every hook offers to start it.
function ensureTicking(engine: EngineInterface) {
  if (isTicking) return
  isTicking = true
  engine.clock.every(TICK_MS, () => advanceLanes(engine))
}

function laneCells(lane: Lane, width: number, elapsedMs: number) {
  const isDone = lane.endedTick !== undefined
  // How busy it has been over the last second, 0 to 1; a finished lane is still and dim.
  const activity = isDone ? 0 : Math.min(1, lane.trace.slice(-TICKS_PER_SECOND).reduce((sum, chars) => sum + chars, 0) / BUSY_CHARS_PER_SECOND)
  const [hue] = toHsl(lane.color)
  const vivid = (lightness: number) => packRgb(fromHsl(hue, 0.9, lightness))
  const pulseFront = ((elapsedMs / 1000) * PULSE_SPEED) % (width + PULSE_GAP)
  const words = new Uint32Array(width * 3)
  for (let column = 1; column < width - 1; column++) {
    const behind = pulseFront - column
    const pulse = isDone ? 0 : behind >= 0 ? Math.exp(-behind / PULSE_TAIL) : Math.exp(-(behind * behind) / 0.8)
    const glow = 0.22 + 0.16 * activity + (0.35 + 0.3 * activity) * pulse
    words.set([BRAILLE_FULL, vivid(0.12 + 0.58 * glow), DEFAULT_COLOR], column * 3)
  }
  const tip = (phase: number) =>
    packRgb(isDone ? fromHsl(hue, 0.9, 0.3) : fromHsl(hue + TIP_SWEEP * Math.sin((elapsedMs / TIP_PERIOD_MS + phase) * Math.PI * 2), 0.95, 0.62))
  words.set([BRAILLE_TIP_LEFT, tip(0), DEFAULT_COLOR], 0)
  words.set([BRAILLE_TIP_RIGHT, tip(0.5), DEFAULT_COLOR], (width - 1) * 3)
  return encodeCells(words)
}

function renderLane({ Box, Raster, Text }: TerminalUi, agentId: string, lane: Lane, barWidth: number) {
  return (
    <Box key={`lane-${agentId}`} flexDirection="row">
      <Box width={NAME_COLUMNS} flexShrink={0}>
        <Text color={rgbToHex(lane.color)} wrap="truncate">{lane.name}</Text>
      </Box>
      <Raster key={`trace-${agentId}`} columns={barWidth} rows={1} cells={laneCells(lane, barWidth, tick * TICK_MS)} />
      <Box marginLeft={2}>
        {lane.endedTick === undefined ? (
          <Text dimColor wrap="truncate">{lane.tool}</Text>
        ) : (
          <Text color={lane.failed ? FAILED_COLOR : DONE_COLOR}>{lane.failed ? '✕ failed' : '✓ done'}</Text>
        )}
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', (engine, event, next) => {
    ensureTicking(engine)
    return next(event)
  })

  on('turn.start', (engine, event, next) => {
    ensureTicking(engine)
    return next(event)
  })

  // Count what each subagent's replies stream, passing every piece on untouched.
  on('turn.step', async function* (engine, event, next) {
    ensureTicking(engine)
    const lane = findLane(event.agentId)
    for await (const chunk of next(event)) {
      if (lane) {
        if (chunk.kind === 'text' || chunk.kind === 'thinking') lane.pendingChars += chunk.text.length
        else if (chunk.kind === 'input') lane.pendingChars += chunk.json.length
      }
      yield chunk
    }
  })

  // A subagent's tool call: a spike, and its name beside the trace.
  on('tool.call', async (engine, event, next) => {
    ensureTicking(engine)
    const lane = findLane(event.agentId)
    if (lane) {
      lane.tool = String(event.tool)
      lane.pendingChars += TOOL_SPIKE_CHARS
    }
    return next(event)
  })

  // A subagent's run is over: its lane shows how it ended, then leaves 30 s later.
  on('turn.complete', (engine, event, next) => {
    if (event.agentId && lanes.has(event.agentId)) {
      finishLane(event.agentId, event.reason !== 'answer')
      engine.ui.invalidate('ui.render')
    }
    return next(event)
  })

  // The lanes sit under whatever plugins beneath draw above the prompt, a blank row below them.
  on('ui.render', { component: 'AbovePrompt' }, async (engine, event, next) => {
    ensureTicking(engine)
    const below = await next(event)
    if (event.surface !== 'terminal' || event.props.hasSurvey || lanes.size === 0) return below
    const components = engine.ui.resolve(event)
    const { Box, Text } = components
    const barWidth = Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, event.props.bodyColumns - NAME_COLUMNS - STATUS_COLUMNS))
    const visibleLanes = [...lanes.entries()].slice(-MAX_LANES)
    return (
      <Box flexDirection="column">
        {below}
        {/* marginBottom leaves a blank row between the lanes and the context row under them. */}
        <Box flexDirection="column" marginBottom={1}>
          {visibleLanes.map(([agentId, lane]) => renderLane(components, agentId, lane, barWidth))}
          {lanes.size > MAX_LANES ? <Text dimColor>+{lanes.size - MAX_LANES} more</Text> : null}
        </Box>
      </Box>
    )
  })
}
