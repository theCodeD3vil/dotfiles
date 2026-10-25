import type { RenderChildren } from 'claude-code'

import type { ContextReading } from '../types'
import { RAINBOW, SPIN } from './animation'
import { BLUE, GREEN, ORANGE, heatColor } from './colors'
import type { TerminalUi } from './components'
import { formatTokens } from './format'
import { HEADROOM_CELLS, HEADROOM_COUNT_COLUMNS, HEADROOM_ICON, savedPerTurn } from './headroom'
import { contextSparklineCells, sparklineCells, streamCells } from './rasters'
import { STREAM_CELLS, streamPoints, tokensPerSecond } from './stream'

// One row above the prompt, with the context and the token stream:
//   ✦                                    ⣿⣿⣷⣿ 134.4k / 200k   ⣀⣤⣶⣿   42 tok/s   ⣀⣤⣶⣿ 26.9k
// The enhance button at the left, the context's sparkline and heat, the token stream, and
// Headroom's saved tokens (its icon, a graph of each turn's, the session's total) at the right.

// The context chart: one ▁▂▃▄▅▆▇█ glyph per turn, newest at the right.
export const FILL_CELLS = 8
export const FILL_ROWS = 1
export const FILL_TURNS = FILL_CELLS

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
  // Headroom's session total: now, and at the end of each turn then now, oldest first.
  headroomSaved: number
  headroomTotals: number[]
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
          <Raster key="fill" columns={FILL_CELLS} rows={FILL_ROWS} cells={contextSparklineCells(FILL_CELLS, view.history.map(reading => reading.percent))} />
        </Box>
        {renderContextReadout(components, view.latest)}
        <Box marginLeft={3} gap={1}>
          <Raster key="stream" columns={STREAM_CELLS} rows={1} cells={streamCells(streamPoints(view.streamTicks, STREAM_CELLS), STREAM_CELLS)} />
          {/* Padded to four digits (figure spaces are digit-wide) so the row stops shifting as it counts. */}
          <Text dimColor>{rate.padStart(4, ' ')} tok/s</Text>
        </Box>
        {/* Always drawn, between the token stream and Wick: the count keeps its width so the row never shifts. */}
        <Box marginLeft={3} gap={1}>
          <Text color={ORANGE}>{HEADROOM_ICON}</Text>
          <Raster key="headroom" columns={HEADROOM_CELLS} rows={1} cells={sparklineCells(savedPerTurn(view.headroomTotals), HEADROOM_CELLS, ORANGE)} />
          <Box width={HEADROOM_COUNT_COLUMNS}>
            <Text dimColor>{formatTokens(view.headroomSaved)}</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
