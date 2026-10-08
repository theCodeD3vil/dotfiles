import type { EngineInterface, Register, RenderChildren, RenderElement } from 'claude-code'

// Turn insights: "✻ Baked for 12s · done 11:57 AM · 6 tools · 1.2k out · $0.08" closes each turn.

type Receipt = { durationMs: number; finishedAt: number; summary: string }

const MAX_RECEIPTS = 50
// The "Baked for" line shows a rounded duration, so it matches a receipt within this much.
const MATCH_TOLERANCE_MS = 1500

// Every Raster in a drawn tree, in order: the pictures other plugins put beside the line.
function findRasters(node: RenderChildren): RenderElement[] {
  if (Array.isArray(node)) return node.flatMap(findRasters)
  if (!node || typeof node !== 'object') return []
  const element = node as RenderElement & { children?: RenderChildren }
  return element.type === 'Raster' ? [element] : findRasters(element.children)
}

// "12s", "1m 52s", "1h 4m": the same shape Claude Code uses for the line
function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

// "11:57 AM" in local time
const formatClock = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const formatTokens = (count: number) => (count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count))

const summarize = (toolCount: number, outputTokens: number, costUsd: number) =>
  `${toolCount} tool${toolCount === 1 ? '' : 's'} · ${formatTokens(outputTokens)} out · $${costUsd.toFixed(2)}`

const readCostUsd = async (engine: EngineInterface) => (await engine.session.usage()).cost?.usd ?? 0

export const register: Register = on => {
  let toolCount = 0
  let costAtStart = 0
  const receipts: Receipt[] = []

  on('prompt.submit', async (engine, event, next) => {
    toolCount = 0
    costAtStart = await readCostUsd(engine)
    return next(event)
  })

  on('tool.call', (_, event, next) => {
    toolCount++
    return next(event)
  })

  // Keep the turn's figures; the "Baked for" line is matched to them by its duration.
  on('turn.complete', async (engine, event, next) => {
    if (!event.agentId) {
      const costUsd = (await readCostUsd(engine)) - costAtStart
      const outputTokens = event.usage?.output_tokens ?? 0
      receipts.push({ durationMs: event.durationMs, finishedAt: await engine.clock.now(), summary: summarize(toolCount, outputTokens, costUsd) })
      if (receipts.length > MAX_RECEIPTS) receipts.shift()
      engine.ui.invalidate('ui.render')
    }
    return next(event)
  })

  on('ui.render', { component: 'TurnDuration' }, async (engine, event, next) => {
    // Always run the hooks beneath: clawd tracks which line closes the turn from this call.
    const below = await next(event)
    const receipt = receipts.find(candidate => Math.abs(candidate.durationMs - event.props.durationMs) < MATCH_TOLERANCE_MS)
    if (!receipt) return below
    // Drawn as one line of our own: wrapping Claude Code's line made it take the full row and wrap the receipt.
    // What plugins beneath drew beside the line (clawd's stage, a Raster) stays beside the receipt.
    const { Box, Text } = engine.ui.resolve(event)
    return (
      <Box flexDirection="row" alignItems="center">
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            ✻ {event.props.word} for {formatDuration(event.props.durationMs)} · done {formatClock(receipt.finishedAt)} · {receipt.summary}
          </Text>
        </Box>
        {findRasters(below).map((stage, index) => (
          <Box key={`stage-${index}`} marginLeft={2} flexShrink={0}>
            {stage}
          </Box>
        ))}
      </Box>
    )
  })
}
