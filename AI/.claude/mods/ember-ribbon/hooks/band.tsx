import type { RenderChildren } from 'claude-code'

import type { ContextReading } from '../types'
import { RAINBOW, SPIN } from './animation'
import { BLUE, GREEN, heatColor } from './colors'
import type { TerminalUi } from './components'
import { formatTokens } from './format'
import { fillCells, streamCells } from './rasters'
import { STREAM_CELLS, streamPoints, tokensPerSecond } from './stream'

// One row above the prompt, with the context and the token stream:
//    134.4k / 200k
// The enhance button at the left, the context's fill history and heat, the token stream at the right.

// The context chart: one dot column per turn, two to a cell, the newest turn at the right.
// FILL_ROWS cells tall, four dot rows to each, so a column has 4 * FILL_ROWS heights.
export const FILL_CELLS = 8
export const FILL_ROWS = 2
export const FILL_TURNS = FILL_CELLS * 2

// The sparkle (U+F51B) and nf-md-check, from Symbols Nerd Font: a Mono face such as
// CaskaydiaCove Nerd Font Mono squeezes icons into 1 cell. Ghostty draws one 2 cells wide only
// when a blank cell follows it, which the Button's one-space label provides.
// While enhancing, the icon plays Claude's own spinner frames (SPIN).
const SPARKLE_ICON = '\u{F51B}'
const DONE_ICON = '\u{F012C}'
// Shown while the enhanced text is current (Ctrl+E then reverts); also from Symbols Nerd Font.
const ENHANCED_ICON = '\u{F0453}'
const MAX_RATE_SHOWN = 9999

export type BandView = {
  // What plugins beneath draw here (plan-progress's bars); it sits above the row.
  below: RenderChildren
  bodyColumns: number
  history: ContextReading[]
  latest: ContextReading | undefined
  canUndo: boolean
  onEnhance: () => unknown
  tick: number
  isEnhancing: boolean
  doneTicks: number
  streamTicks: number[]
}

// The icon is blue sparkles while ready, a RAINBOW spinner while Haiku works, then a green check
// for DONE_TICKS. A Button's label takes no colour, so the glyph is Text and the Button is the blank cell after it.
function renderEnhanceGlyph({ Text }: TerminalUi, { tick, isEnhancing, doneTicks, canUndo }: BandView) {
  if (isEnhancing) return <Text color={RAINBOW[Math.floor(tick / 2) % RAINBOW.length]} bold>{SPIN[tick % SPIN.length]}</Text>
  if (doneTicks > 0) return <Text color={GREEN} bold>{DONE_ICON}</Text>
  return <Text color={BLUE}>{canUndo ? ENHANCED_ICON : SPARKLE_ICON}</Text>
}

function renderContextReadout({ Box, Text }: TerminalUi, reading: ContextReading | undefined) {
  if (!reading) return <Text dimColor>– / –</Text>
  return (
    <Box>
      <Text color={heatColor(reading.percent)} bold>{formatTokens(reading.tokens)}</Text>
      <Text dimColor> / {formatTokens(reading.window)}</Text>
    </Box>
  )
}

// The button also carries Ctrl+E (bound to app:cycleDiffBase in ~/.claude/keybindings.json):
// the engine sends that chord only to a mounted Button naming the action.
// bodyColumns is the band's width less the engine's [-] marker, so the heat sits flush right.
// paddingTop keeps the conversation from sitting flush on the band. The token stream is always
// drawn at the far right, after the context count: flat while idle, moving while Claude works.
export function renderBand(components: TerminalUi, view: BandView) {
  const { Box, Button, Raster, Text } = components
  const rate = String(Math.min(MAX_RATE_SHOWN, tokensPerSecond(view.streamTicks)))
  return (
    <Box flexDirection="column" paddingTop={2}>
      {view.below}
      <Box width={view.bodyColumns} alignItems="flex-end">
        <Box flexGrow={1}>
          {renderEnhanceGlyph(components, view)}
          <Button key="enhance" label=" " plain action="app:cycleDiffBase" onPress={view.onEnhance} />
        </Box>
        <Box marginRight={1}>
          <Raster key="fill" columns={FILL_CELLS} rows={FILL_ROWS} cells={fillCells(FILL_CELLS, FILL_ROWS, view.history.map(reading => reading.percent))} />
        </Box>
        {renderContextReadout(components, view.latest)}
        <Box marginLeft={3} gap={1}>
          <Raster key="stream" columns={STREAM_CELLS} rows={1} cells={streamCells(streamPoints(view.streamTicks, STREAM_CELLS), STREAM_CELLS)} />
          {/* Padded to four digits (figure spaces are digit-wide) so the row stops shifting as it counts. */}
          <Text dimColor>{rate.padStart(4, ' ')} tok/s</Text>
        </Box>
      </Box>
    </Box>
  )
}
