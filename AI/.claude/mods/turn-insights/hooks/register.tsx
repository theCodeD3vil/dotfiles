import type { Register, RenderChildren, RenderElement } from 'claude-code'

// Every Raster in a drawn tree, in order: the pictures other plugins put beside the line.
function rasters(node: RenderChildren): RenderElement[] {
  if (Array.isArray(node)) return node.flatMap(rasters)
  if (!node || typeof node !== 'object') return []
  const el = node as RenderElement & { children?: RenderChildren }
  return el.type === 'Raster' ? [el] : rasters(el.children)
}

// Turn insights: "✻ Baked for 12s · 6 tools · 1.2k out · $0.08 ⣀⣤⣶⣿⣦⣀" closes each turn, the
// braille being the shape of the turn's token stream.

type Receipt = { ms: number; at: number; text: string; shape: number[] }

// The turn's token stream, frozen into the receipt: characters the main loop streamed per quarter
// second, resampled to a 12-cell braille chart (two dot columns a cell, each filled to its rate).
const SHAPE_CELLS = 12
const BIN_MS = 250
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
const DEFAULT_COLOR = 0x01000000 // a Raster cell's "terminal default" colour
const MAUVE = 0x9c7fc7 // Catppuccin Mocha mauve, dimmed to sit with the receipt's dim text

function resample(bins: number[], points: number) {
  if (bins.length === 0) return Array(points).fill(0)
  return Array.from({ length: points }, (_, i) => {
    const from = Math.floor((i * bins.length) / points)
    const to = Math.max(from + 1, Math.floor(((i + 1) * bins.length) / points))
    const slice = bins.slice(from, to).map(v => v ?? 0)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

function shapeCells(shape: number[]) {
  const top = Math.max(1, ...shape)
  const words = new Uint32Array(SHAPE_CELLS * 3)
  for (let x = 0; x < SHAPE_CELLS; x++) {
    let bits = 0
    for (let c = 0; c < 2; c++) {
      const level = Math.max(shape[x * 2 + c]! > 0 ? 1 : 0, Math.round((shape[x * 2 + c]! / top) * 4))
      for (let r = 4 - level; r < 4; r++) bits |= BRAILLE_BITS[r]![c]!
    }
    words.set([0x2800 + bits, MAUVE, DEFAULT_COLOR], x * 3)
  }
  return (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()
}

// "12s", "1m 52s", "1h 4m": the same shape Claude Code uses for the line
function duration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

// "11:57 AM" in local time
function clockTime(at: number) {
  try {
    return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    const d = new Date(at)
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }
}

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export const register: Register = on => {
  let tools = 0
  let costAtStart = 0
  let startedAt = 0
  let bins: number[] = []
  const receipts: Receipt[] = []

  on('turn.start', ($, e, next) => {
    startedAt = Date.now()
    bins = []
    return next(e)
  })

  // Count what the main loop's reply streams, by quarter second, passing every piece on untouched.
  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (!e.agentId) {
        const n = chunk.kind === 'text' || chunk.kind === 'thinking' ? chunk.text.length : chunk.kind === 'input' ? chunk.json.length : 0
        if (n) {
          const i = Math.max(0, Math.floor((Date.now() - startedAt) / BIN_MS))
          bins[i] = (bins[i] ?? 0) + n
        }
      }
      yield chunk
    }
  })

  on('prompt.submit', async ($, e, next) => {
    tools = 0
    costAtStart = (await $.session.usage()).cost?.usd ?? 0
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    tools++
    return next(e)
  })

  // Keep the turn's figures; the "Baked for" line is matched to them by its duration.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const cost = ((await $.session.usage()).cost?.usd ?? 0) - costAtStart
      const out = e.usage?.output_tokens ?? 0
      receipts.push({ ms: e.durationMs, at: await $.clock.now(), text: `${tools} tool${tools === 1 ? '' : 's'} · ${tokens(out)} out · $${cost.toFixed(2)}`, shape: resample(bins, SHAPE_CELLS * 2) })
      if (receipts.length > 50) receipts.shift()
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    // Always run the hooks beneath: clawd tracks which line closes the turn from this call.
    const below = await next(e)
    const receipt = receipts.find(r => Math.abs(r.ms - e.props.durationMs) < 1500)
    if (!receipt) return below
    // Drawn as one line of our own: wrapping Claude Code's line made it take the full row and wrap the receipt.
    // What plugins beneath drew beside the line (clawd's stage, a Raster) stays beside the receipt.
    const t = $.ui.resolve(e)
    const { Box, Text } = t
    const stages = rasters(below)
    const hasShape = 'Raster' in t && receipt.shape.some(v => v > 0)
    return (
      <Box flexDirection="row" alignItems="center">
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            ✻ {e.props.word} for {duration(e.props.durationMs)} · done {clockTime(receipt.at)} · {receipt.text}
          </Text>
        </Box>
        {stages.map((stage, i) => (
          <Box key={`stage-${i}`} marginLeft={2} flexShrink={0}>
            {stage}
          </Box>
        ))}
      </Box>
    )
  })
}
