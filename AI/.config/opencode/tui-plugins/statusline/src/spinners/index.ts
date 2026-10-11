import { BLUE, GREEN, ORANGE, PINK, RED, YELLOW, hex } from '../footer'
import type { ConversationStage } from '../stage'
import { bouncingBalls } from './bouncing-balls'
import { dataStream } from './data-stream'
import { flame } from './flame'
import { life } from './life'
import { raindrops } from './raindrops'
import { COLS, ROWS, type Frame, type SpinnerFactory } from './types'
import { warp } from './warp'

export { COLS, ROWS, type Frame }

// The spinners are written for this many frames a second. OpenTUI paints at 30 by default.
export const FPS = 30

// The terminal panel the stage colour blends from: Vira Deepforest's background, #111816.
export const PANEL = [17, 24, 22]

// What the footer draws for each stage of the conversation, in Vira Deepforest's hues (the same
// as Wick's flame): blue while waiting, orange while thinking, pink for a tool, lime while
// writing, yellow for an approval, red while compacting.
export const STAGE_SPINNERS: Record<ConversationStage, { make: SpinnerFactory; tone: number[] }> = {
  waiting: { make: bouncingBalls, tone: hex(BLUE) },
  thinking: { make: life, tone: hex(ORANGE) },
  tool: { make: raindrops, tone: hex(PINK) },
  writing: { make: dataStream, tone: hex(GREEN) },
  approval: { make: warp, tone: hex(YELLOW) },
  compacting: { make: flame, tone: hex(RED) },
}

// Idle: the strip keeps its size but shows nothing, so nothing is mistaken for a working spinner.
export const BLANK: Frame = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => [' ', 0] as const))

export const SPINNER_GAP = 2
// Ring stats need 21 cells at 100%, so the strip gives up cells from its right edge first.
const STATS_MIN = 21
export const spinnerCells = (columns: number) => Math.min(COLS, Math.max(1, columns - SPINNER_GAP - STATS_MIN))
