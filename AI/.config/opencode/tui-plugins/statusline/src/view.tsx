/** @jsxImportSource @opentui/solid */
/**
 * OpenTUI view for the quota gauges and the stage spinner.
 * Usage cells and the spinner both retain the terminal-default background.
 */
import { RGBA, TextAttributes } from '@opentui/core'
import { Index, Show } from 'solid-js'
import { COLORS, mix, sevColor, usageCells, type FooterLayout, type FooterStat } from './footer'
import { PANEL, ROWS, SPINNER_GAP, type Frame } from './spinners'

export const DEFAULT_BG = RGBA.defaultBackground()
type Readable<T> = T | (() => T)
const read = <T,>(value: Readable<T>) => typeof value === 'function' ? (value as () => T)() : value

// A cell's colour: the panel at level 0, the stage's tone at level 1.
function shade(tone: readonly number[], level: number) {
  const [r, g, b] = mix(PANEL, tone, Math.min(1, level))
  return RGBA.fromInts(r!, g!, b!)
}

// Preserve the Raster's terminal-default background intent, including on an
// OpenCode theme whose background differs from the terminal's background.
export function rasterCells(words: Uint32Array) {
  return Array.from({ length: words.length / 3 }, (_, i) => {
    const fg = words[i * 3 + 1]!
    return {
      text: String.fromCodePoint(words[i * 3]!),
      fg: RGBA.fromInts((fg >> 16) & 255, (fg >> 8) & 255, fg & 255),
    }
  })
}

// One row of Raster cells on the terminal-default background.
export function Cells(props: { cells: ReturnType<typeof rasterCells> }) {
  return (
    <text width={props.cells.length} height={1} bg={DEFAULT_BG}>
      <Index each={props.cells}>{cell => <span style={{ fg: cell().fg, bg: DEFAULT_BG, attributes: TextAttributes.NONE }}>{cell().text}</span>}</Index>
    </text>
  )
}

function Gauge(props: { stat: FooterStat; animationTick: number }) {
  const raster = () => {
    const gauge = props.stat.gauge
    return gauge.kind === 'raster'
      ? rasterCells(usageCells(gauge.pct, gauge.timePct, gauge.columns, props.animationTick * 100))
      : []
  }
  const ring = () => {
    const gauge = props.stat.gauge
    return gauge.kind === 'ring' ? gauge : undefined
  }
  return (
    <Show when={props.stat.gauge.kind === 'raster'} fallback={
      <text bg={DEFAULT_BG} fg={ring()?.color ?? COLORS.track}>{ring()?.glyph}</text>
    }>
      <Cells cells={raster()} />
    </Show>
  )
}

function Stat(props: { label: string; stat: FooterStat; animationTick: number }) {
  return (
    <box flexDirection="row" gap={1}>
      <text bg={DEFAULT_BG} fg={COLORS.dim}>{props.label}</text>
      <Gauge stat={props.stat} animationTick={props.animationTick} />
      <text bg={DEFAULT_BG} fg={sevColor(props.stat.pct)}>{props.stat.pct}%</text>
      {props.stat.time ? <text bg={DEFAULT_BG} fg={COLORS.dim}>{props.stat.time}</text> : null}
    </box>
  )
}

export function Spinner(props: { strip: Frame; tone: readonly number[]; cells: number }) {
  return (
    // The block keeps its size whatever the state, so nothing moves when work starts; the
    // idle strip is blank. Its background stays transparent to the terminal. Explicit zero
    // gaps prevent Yoga layout from inserting a blank row.
    <box flexDirection="column" gap={0} rowGap={0} width={props.cells} height={ROWS} flexShrink={0}>
      <Index each={props.strip}>{row => (
        <text height={1}>
          <Index each={row().slice(0, props.cells)}>{cell => <span style={{ fg: shade(props.tone, cell()[1]), attributes: TextAttributes.NONE }}>{cell()[0]}</span>}</Index>
        </text>
      )}</Index>
    </box>
  )
}

// The spinner owns the far left and the quota stats stay right, so the free
// space opens between them.
export function FooterView(props: {
  frame: Readable<FooterLayout>
  animationTick: Readable<number>
  strip: Readable<Frame>
  tone: Readable<readonly number[]>
  cells: Readable<number>
  onWidthChange?: (width: number) => void
}) {
  const frame = () => read(props.frame)
  const animationTick = () => read(props.animationTick)
  return (
    <box flexDirection="row" alignItems="flex-end" justifyContent="space-between" gap={SPINNER_GAP} flexGrow={1} flexShrink={1} minWidth={0} backgroundColor={DEFAULT_BG} onSizeChange={function () { props.onWidthChange?.(this.width) }}>
      <Spinner strip={read(props.strip)} tone={read(props.tone)} cells={read(props.cells)} />
      <box flexDirection="row" gap={3} flexShrink={1} minWidth={0}>
        <Stat label="5h" stat={frame().five} animationTick={animationTick()} />
        <Stat label="wk" stat={frame().week} animationTick={animationTick()} />
      </box>
    </box>
  )
}
