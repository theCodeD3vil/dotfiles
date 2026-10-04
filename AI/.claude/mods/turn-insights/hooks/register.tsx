import type { Register } from 'claude-code'

// Turn insights.
//  - Spinner: "✶ Sautéing… · Edit register.tsx" names the tool at work.
//  - Receipt: "✻ Baked for 12s · 6 tools · 1.2k out · $0.08" closes each turn.

type Receipt = { ms: number; at: number; text: string }

// "Edit register.tsx", "Bash git status", "Grep stow --simulate"
function label(e: Record<string, unknown>) {
  const path = e.file_path ?? e.notebook_path
  if (typeof path === 'string') return `${e.tool} ${path.split('/').pop()}`
  if (typeof e.command === 'string') return `${e.tool} ${e.command.replace(/^rtk /, '').split(/\s+/).slice(0, 2).join(' ')}`
  if (typeof e.pattern === 'string') return `${e.tool} ${e.pattern.slice(0, 24)}`
  return String(e.tool)
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
  let current = ''
  let tools = 0
  let costAtStart = 0
  const receipts: Receipt[] = []

  on('prompt.submit', async ($, e, next) => {
    tools = 0
    costAtStart = (await $.session.usage()).cost?.usd ?? 0
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    tools++
    current = label(e as unknown as Record<string, unknown>)
    $.ui.invalidate('ui.render')
    const done = await next(e)
    current = ''
    $.ui.invalidate('ui.render')
    return done
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

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    current ? next({ ...e, props: { ...e.props, suffix: `… · ${current}` } }) : next(e),
  )

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const receipt = receipts.find(r => Math.abs(r.ms - e.props.durationMs) < 1500)
    if (!receipt) return next(e)
    // Drawn as one line of our own: wrapping Claude Code's line made it take the full row and wrap the receipt.
    const { Text } = $.ui.resolve(e)
    return (
      <Text dimColor wrap="truncate-end">
        ✻ {e.props.word} for {duration(e.props.durationMs)} · done {clockTime(receipt.at)} · {receipt.text}
      </Text>
    )
  })
}
