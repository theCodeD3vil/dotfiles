/** @jsxImportSource @opentui/solid */
/**
 * OpenTUI view for the row above the prompt, after Ember Ribbon's AbovePrompt:
 *   ⣿⣿⣿⣷⣿⣷⣿⣿  134.4k / 200k   ⣀⣤⣶⣿⣦⣀⣀⣀   412 tok/s
 * Context fill history, the used / window readout coloured by heat, and the token stream.
 * All cells use the terminal-default background so transparent themes remain transparent.
 */
import { RGBA, TextAttributes } from '@opentui/core'
import { Index, Show } from 'solid-js'
import { FILL_CELLS, FILL_ROWS, STREAM_CELLS, fillCells, heatColor, rowFit, short, streamCells, tokensPerSecond, type ContextReading } from './context'
import { COLORS } from './footer'
import { rasterCells } from './view'

const DEFAULT_BG = RGBA.defaultBackground()

// Blank lines between the conversation and the row.
export const ROW_PAD = 1

export type ContextFrame = {
  /** Context percent at the end of each turn, oldest first. */
  history: number[]
  /** The reading the readout shows; absent until a model reports its tokens. */
  now?: ContextReading
  /** Characters streamed per 100 ms tick, newest last. */
  stream: number[]
  /** Columns the row has to draw in. */
  columns: number
}

function Cells(props: { cells: ReturnType<typeof rasterCells> }) {
  return (
    <text width={props.cells.length} height={1} bg={DEFAULT_BG}>
      <Index each={props.cells}>{cell => <span style={{ fg: cell().fg, bg: DEFAULT_BG, attributes: TextAttributes.NONE }}>{cell().text}</span>}</Index>
    </text>
  )
}

function FillChart(props: { history: number[] }) {
  const cells = () => rasterCells(fillCells(FILL_CELLS, FILL_ROWS, props.history))
  return (
    <box flexDirection="column" width={FILL_CELLS} height={FILL_ROWS} flexShrink={0} backgroundColor={DEFAULT_BG}>
      <Index each={Array.from({ length: FILL_ROWS }, (_, row) => row)}>{row => <Cells cells={cells().slice(row() * FILL_CELLS, (row() + 1) * FILL_CELLS)} />}</Index>
    </box>
  )
}

export function readoutWidth(now: ContextReading | undefined) {
  return now ? `${short(now.tokens)} / ${short(now.window)}`.length : '– / –'.length
}

// The token stream is always drawn: flat while idle, moving while the model works.
export function ContextRow(props: { frame: ContextFrame }) {
  const fit = () => rowFit(props.frame.columns, readoutWidth(props.frame.now))
  return (
    <box flexDirection="row" alignItems="flex-end" justifyContent="flex-end" flexGrow={1} flexShrink={1} minWidth={0} paddingTop={ROW_PAD} backgroundColor={DEFAULT_BG}>
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
    </box>
  )
}
