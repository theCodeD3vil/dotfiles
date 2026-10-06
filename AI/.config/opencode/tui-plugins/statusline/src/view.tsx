/** @jsxImportSource @opentui/solid */
/**
 * OpenTUI view for the quota gauges and the Scanner working indicator.
 * Usage cells and the scanner both retain the terminal-default background.
 * The scanner's dim track is made of separate square glyphs, never one solid rectangle.
 */
import { RGBA, TextAttributes } from '@opentui/core'
import { Index, Show } from 'solid-js'
import { COLORS, sevColor, usageCells, type FooterLayout, type FooterStat } from './footer'
import { scannerRows, scannerWidth, SCANNER, SCANNER_GAP, type ScannerMode } from './scanner'
import type { ConversationStage } from './stage'

const DEFAULT_BG = RGBA.defaultBackground()
type Readable<T> = T | (() => T)
const read = <T,>(value: Readable<T>) => typeof value === 'function' ? (value as () => T)() : value
function scannerColor(color: readonly [number, number, number]) {
  return RGBA.fromInts(color[0], color[1], color[2])
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
      <text width={22} height={1} bg={DEFAULT_BG}>
        <Index each={raster()}>{cell => <span style={{ fg: cell().fg, bg: DEFAULT_BG, attributes: TextAttributes.NONE }}>{cell().text}</span>}</Index>
      </text>
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

export function Scanner(props: { animationTick: number; working: boolean; mode: ScannerMode; stage?: ConversationStage; animate?: boolean }) {
  const rows = () => scannerRows(props.animationTick, props.working, { mode: props.mode, animate: props.animate, stage: props.stage })
  return (
    // The block keeps its mode's size whatever the state, so nothing moves when
    // work starts; inactive state is intentionally blank. Its background stays
    // transparent to the terminal, leaving only separate square cells visible.
    // Explicit zero gaps prevent Yoga layout from inserting a blank raster row.
    <box flexDirection="column" gap={0} rowGap={0} width={scannerWidth(props.mode)} height={SCANNER[props.mode].rows} flexShrink={0}>
      <Index each={rows()}>{row => (
        <text height={1}>
          <Index each={row()}>{cell => <span style={{ fg: scannerColor(cell().color), attributes: TextAttributes.NONE }}>{cell().glyph}</span>}</Index>
        </text>
      )}</Index>
    </box>
  )
}

// The scanner owns the far left and the quota stats stay right, so the free
// space opens between them.
export function FooterView(props: {
  frame: Readable<FooterLayout>
  animationTick: Readable<number>
  working: Readable<boolean>
  mode?: Readable<ScannerMode | undefined>
  stage?: Readable<ConversationStage | undefined>
  animate?: Readable<boolean | undefined>
  onWidthChange?: (width: number) => void
}) {
  const frame = () => read(props.frame)
  const animationTick = () => read(props.animationTick)
  const working = () => read(props.working)
  const mode = (): ScannerMode => read(props.mode ?? 'full') ?? 'full'
  const stage = () => read(props.stage ?? undefined)
  const animate = () => read(props.animate ?? undefined)
  return (
    <box flexDirection="row" alignItems="flex-end" justifyContent="space-between" gap={SCANNER_GAP} flexGrow={1} flexShrink={1} minWidth={0} backgroundColor={DEFAULT_BG} onSizeChange={function () { props.onWidthChange?.(this.width) }}>
      <Scanner animationTick={animationTick()} working={working()} mode={mode()} stage={stage()} animate={animate()} />
      <box flexDirection="row" gap={3} flexShrink={1} minWidth={0}>
        <Stat label="5h" stat={frame().five} animationTick={animationTick()} />
        <Stat label="wk" stat={frame().week} animationTick={animationTick()} />
      </box>
    </box>
  )
}
