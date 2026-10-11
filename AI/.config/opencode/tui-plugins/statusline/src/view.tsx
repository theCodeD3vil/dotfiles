/** @jsxImportSource @opentui/solid */
/**
 * OpenTUI view for the quota gauges and the pet.
 * Usage cells and the pet both retain the terminal-default background.
 */
import { RGBA, TextAttributes } from '@opentui/core'
import { Index, Show } from 'solid-js'
import { COLORS, DEFAULT_COLOR, sevColor, usageCells, type FooterLayout, type FooterStat } from './footer'
import { COLS, ROWS } from './pet'

export const DEFAULT_BG = RGBA.defaultBackground()
type Readable<T> = T | (() => T)
const read = <T,>(value: Readable<T>) => typeof value === 'function' ? (value as () => T)() : value

const rgba = (word: number) => RGBA.fromInts((word >> 16) & 255, (word >> 8) & 255, word & 255)

// Preserve the Raster's terminal-default background intent, including on an
// OpenCode theme whose background differs from the terminal's background.
export function rasterCells(words: Uint32Array) {
  return Array.from({ length: words.length / 3 }, (_, i) => {
    const bg = words[i * 3 + 2]!
    return {
      text: String.fromCodePoint(words[i * 3]!),
      fg: rgba(words[i * 3 + 1]!),
      bg: bg === DEFAULT_COLOR ? DEFAULT_BG : rgba(bg),
    }
  })
}

// One row of Raster cells, each on its own background (the terminal's by default).
export function Cells(props: { cells: ReturnType<typeof rasterCells> }) {
  return (
    <text width={props.cells.length} height={1} bg={DEFAULT_BG}>
      <Index each={props.cells}>{cell => <span style={{ fg: cell().fg, bg: cell().bg, attributes: TextAttributes.NONE }}>{cell().text}</span>}</Index>
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

const STRIP_ROWS = Array.from({ length: ROWS }, (_, row) => row)

// The pet's strip, COLS × ROWS Raster words.
export function Pet(props: { strip: Uint32Array }) {
  const cells = () => rasterCells(props.strip)
  return (
    // The block keeps its size whatever the state, so nothing moves when work starts. Explicit
    // zero gaps prevent Yoga layout from inserting a blank row.
    <box flexDirection="column" gap={0} rowGap={0} width={COLS} height={ROWS} flexShrink={0}>
      <Index each={STRIP_ROWS}>{row => <Cells cells={cells().slice(row() * COLS, (row() + 1) * COLS)} />}</Index>
    </box>
  )
}

// The quota stats keep the footer's right edge.
export function FooterView(props: {
  frame: Readable<FooterLayout>
  animationTick: Readable<number>
  onWidthChange?: (width: number) => void
}) {
  const frame = () => read(props.frame)
  const animationTick = () => read(props.animationTick)
  return (
    <box flexDirection="row" justifyContent="flex-end" flexGrow={1} flexShrink={1} minWidth={0} backgroundColor={DEFAULT_BG} onSizeChange={function () { props.onWidthChange?.(this.width) }}>
      <box flexDirection="row" gap={3} flexShrink={1} minWidth={0}>
        <Stat label="5h" stat={frame().five} animationTick={animationTick()} />
        <Stat label="wk" stat={frame().week} animationTick={animationTick()} />
      </box>
    </box>
  )
}
