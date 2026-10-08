import type { Register, RenderChildren, RenderElement } from 'claude-code'

// Every Raster in a drawn tree, in order: the pictures other plugins put beside the line.
function rasters(node: RenderChildren): RenderElement[] {
  if (Array.isArray(node)) return node.flatMap(rasters)
  if (!node || typeof node !== 'object') return []
  const el = node as RenderElement & { children?: RenderChildren }
  return el.type === 'Raster' ? [el] : rasters(el.children)
}

// Turn insights: "✻ Baked for 12s · done 11:57 AM · 6 tools · 1.2k out · $0.08" closes each turn.

type Receipt = { ms: number; at: number; text: string }

// "12s", "1m 52s", "1h 4m": the same shape Claude Code uses for the line
function duration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

// "11:57 AM" in local time
const clockTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export const register: Register = on => {
  let tools = 0
  let costAtStart = 0
  const receipts: Receipt[] = []

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
      receipts.push({ ms: e.durationMs, at: await $.clock.now(), text: `${tools} tool${tools === 1 ? '' : 's'} · ${tokens(out)} out · $${cost.toFixed(2)}` })
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
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" alignItems="center">
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            ✻ {e.props.word} for {duration(e.props.durationMs)} · done {clockTime(receipt.at)} · {receipt.text}
          </Text>
        </Box>
        {rasters(below).map((stage, i) => (
          <Box key={`stage-${i}`} marginLeft={2} flexShrink={0}>
            {stage}
          </Box>
        ))}
      </Box>
    )
  })
}
