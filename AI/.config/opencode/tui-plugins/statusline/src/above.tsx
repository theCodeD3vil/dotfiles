/** @jsxImportSource @opentui/solid */
/**
 * OpenTUI view for the row above the prompt, after Ember Ribbon's AbovePrompt:
 *   ⣿⣿⣿⣷⣿⣷⣿⣿  134.4k / 200k   ⣀⣤⣶⣿⣦⣀⣀⣀   412 tok/s   ⣀⣤⣶⣿⣀⣀ 15.3k
 * The context sparkline, the used / window readout coloured by heat, the token stream and
 * Headroom's saved tokens (life ring, a graph of each turn's, the total), with Wick, the desk pet, at the far right of the row, his feet on it, as Claude Code has him.
 * All cells use the terminal-default background so transparent themes remain transparent.
 */
import { TextAttributes } from '@opentui/core'
import { Index, Show } from 'solid-js'
import { FILL_CELLS, FILL_ROWS, STREAM_CELLS, contextSparklineCells, heatColor, rowFit, short, sparklineCells, streamCells, tokensPerSecond, type ContextReading } from './context'
import { COLORS, ORANGE } from './footer'
import { HEADROOM_CELLS, HEADROOM_COLOR, HEADROOM_COUNT_COLUMNS, HEADROOM_ICON, HEADROOM_WIDTH, savedPerTurn } from './headroom'
import { COLS } from './pet'
import { Cells, DEFAULT_BG, Pet, rasterCells } from './view'

// Blank lines between the conversation and the pet.
export const ROW_PAD = 1
// Clear columns between the context row and Wick, whose props reach his leftmost cells.
export const PET_GAP = 2

export type ContextFrame = {
  /** Context percent at the end of each turn, oldest first. */
  history: number[]
  /** The reading the readout shows; absent until a model reports its tokens. */
  now?: ContextReading
  /** Characters streamed per 100 ms tick, newest last. */
  stream: number[]
  /** Columns the row has to draw in. */
  columns: number
  /** Headroom's total for OpenCode at the end of each recent turn, then now, oldest first. */
  headroom: number[]
}

function FillChart(props: { history: number[] }) {
  const cells = () => rasterCells(contextSparklineCells(FILL_CELLS, props.history))
  return (
    <box flexDirection="column" width={FILL_CELLS} height={FILL_ROWS} flexShrink={0} backgroundColor={DEFAULT_BG}>
      <Index each={Array.from({ length: FILL_ROWS }, (_, row) => row)}>{row => <Cells cells={cells().slice(row() * FILL_CELLS, (row() + 1) * FILL_CELLS)} />}</Index>
    </box>
  )
}

export function readoutWidth(now: ContextReading | undefined) {
  return now ? `${short(now.tokens)} / ${short(now.window)}`.length : '– / –'.length
}

// Headroom's item is always drawn, so what is left for the rest, and for Wick, is counted without it.
const fitRow = (columns: number, now: ContextReading | undefined) => rowFit(columns - HEADROOM_WIDTH, readoutWidth(now))

// The token stream is always drawn: flat while idle, moving while the model works.
export function ContextRow(props: { frame: ContextFrame }) {
  const fit = () => fitRow(props.frame.columns, props.frame.now)
  return (
    <box flexDirection="row" alignItems="flex-end" justifyContent="flex-end" flexGrow={1} flexShrink={1} minWidth={0} backgroundColor={DEFAULT_BG}>
      <Show when={fit().chart}>
        <box marginRight={1} flexShrink={0}>
          <FillChart history={props.frame.history} />
        </box>
      </Show>
      <Show when={props.frame.now} fallback={<text bg={DEFAULT_BG} fg={COLORS.dim}>– / –</text>}>
        {now => (
          <box flexDirection="row" flexShrink={0}>
            <text bg={DEFAULT_BG} fg={heatColor(now().percent)} attributes={TextAttributes.BOLD}>{short(now().tokens)}</text>
            <text bg={DEFAULT_BG} fg={COLORS.dim}>{` / ${short(now().window)}`}</text>
          </box>
        )}
      </Show>
      <Show when={fit().stream}>
        <box marginLeft={3} gap={1} flexDirection="row" flexShrink={0}>
          <Cells cells={rasterCells(streamCells(props.frame.stream, STREAM_CELLS))} />
          {/* Padded to four digits (figure spaces are digit-wide) so the row stops shifting as it counts. */}
          <text bg={DEFAULT_BG} fg={COLORS.dim}>{`${String(Math.min(9999, tokensPerSecond(props.frame.stream))).padStart(4, ' ')} tok/s`}</text>
        </box>
      </Show>
      <box marginLeft={3} gap={1} flexDirection="row" flexShrink={0}>
        <text bg={DEFAULT_BG} fg={ORANGE}>{HEADROOM_ICON}</text>
        <Cells cells={rasterCells(sparklineCells(savedPerTurn(props.frame.headroom), HEADROOM_CELLS, HEADROOM_COLOR))} />
        <box width={HEADROOM_COUNT_COLUMNS} flexShrink={0}>
          <text bg={DEFAULT_BG} fg={COLORS.dim}>{short(props.frame.headroom[props.frame.headroom.length - 1] ?? 0)}</text>
        </box>
      </box>
    </box>
  )
}

// The pet stands at the right of the context row, his feet on it, PET_GAP columns away; he keeps
// his size in every state, so starting work never moves the prompt. He comes only when the whole
// row, stream included, still fits beside him: a narrower terminal gets the row alone.
export function AboveView(props: { strip: Uint32Array; frame: ContextFrame }) {
  const room = () => props.frame.columns - COLS - PET_GAP
  const beside = () => fitRow(room(), props.frame.now).stream
  return (
    <box flexDirection="row" alignItems="flex-end" gap={PET_GAP} flexGrow={1} flexShrink={1} minWidth={0} paddingTop={ROW_PAD} backgroundColor={DEFAULT_BG}>
      <ContextRow frame={beside() ? { ...props.frame, columns: room() } : props.frame} />
      <Show when={beside()}>
        <Pet strip={props.strip} />
      </Show>
    </box>
  )
}
