/** @jsxImportSource @opentui/solid */
// OpenCode V2 footer statusline, modelled on ~/.claude/statusline-command.sh:
// a font-drawn context meter, then session cost.
// Colors are Catppuccin Mocha (same palette as the tmux theme); the meter uses
// the vibe-island glyphs U+EE00-EE05, so it needs that font like the Claude one.
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { createMemo, For, Show } from "solid-js"

const TEXT = "#cdd6f4"
const TRACK = "#45475a"
const MUTED = "#a6adc8"

const ICON_CONTEXT = "\u{F09D1}"
const EMPTY = { L: "", M: "", R: "" }
const FULL = { L: "", M: "", R: "" }

const BAR_WIDTH = 14

// Same severity ramp as the Claude script: green <50, yellow <75, orange <85, red.
function severity(pct: number): string {
  if (pct >= 85) return "#c26f86"
  if (pct >= 75) return "#c88f6c"
  if (pct >= 50) return "#c7b58c"
  return "#85b681"
}

function cells(pct: number) {
  let filled = Math.floor((pct * BAR_WIDTH) / 100)
  if (pct > 0 && filled === 0) filled = 1
  filled = Math.min(filled, BAR_WIDTH)
  const fg = severity(pct)
  return Array.from({ length: BAR_WIDTH }, (_, i) => {
    const shape = i === 0 ? "L" : i === BAR_WIDTH - 1 ? "R" : "M"
    return i < filled
      ? { glyph: FULL[shape], fg }
      : { glyph: EMPTY[shape], fg: TRACK }
  })
}

function Statusline(props: { sessionID: () => string | undefined }) {
  const ctx = usePlugin()

  const session = () => {
    const id = props.sessionID()
    return id ? ctx.data.session.get(id) : undefined
  }

  const modelInfo = createMemo(() => {
    const ref = session()?.model
    if (!ref) return undefined
    return ctx.data.location.model
      .list()
      ?.find((m) => m.id === ref.id && m.providerID === ref.providerID)
  })

  // Context occupancy is the newest assistant reply's prompt side, not the
  // session's cumulative token total.
  const percent = createMemo(() => {
    const id = props.sessionID()
    const limit = modelInfo()?.limit.context
    if (!id || !limit) return undefined
    const messages = ctx.data.session.message.list(id)
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message.type !== "assistant" || !message.tokens) continue
      const t = message.tokens
      const used = t.input + t.cache.read + t.cache.write + t.output
      return Math.min(100, Math.round((used / limit) * 100))
    }
    return undefined
  })

  const cost = () => {
    const value = session()?.cost
    return value && value > 0 ? `$${value.toFixed(2)}` : undefined
  }

  return (
    <box flexDirection="row" flexShrink={0}>
      <Show when={percent() !== undefined}>
        <text fg={TEXT}>{`${ICON_CONTEXT} `}</text>
        <For each={cells(percent()!)}>{(cell) => <text fg={cell.fg}>{cell.glyph}</text>}</For>
      </Show>
      <Show when={cost()}>
        <text fg={MUTED}>{`  ${cost()}`}</text>
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "statusline.tui",
  setup(context) {
    void context.data.location.model.sync()
    return context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => <Statusline sessionID={() => input.sessionID} />,
    })
  },
})
