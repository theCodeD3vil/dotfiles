/**
 * Wick, the desk pet, at the right of the context row above the prompt. It is drawn by the Claude
 * Code mod's own module, unchanged, at Claude Code's size and facing, so both hosts show the same pet.
 */
import { petCells, type Facing, type PetFrame } from '../../../../../.claude/mods/desk-pet/hooks/wick'

/** The strip's size in cells, the same as the Claude Code mod's COLUMNS × ROWS. */
export const COLS = 12
export const ROWS = 4
/** Placed at the right, the pet faces left, into the line, as the Claude Code mod's does. */
export const FACING: Facing = -1

export { DONE_SECONDS, petClock, type PetFrame, type PetState } from '../../../../../.claude/mods/desk-pet/hooks/wick'

/** One frame of the strip as Raster words: [codePoint, fg, bg] for each of its COLS × ROWS cells. */
export const petStrip = (frame: PetFrame) => petCells(COLS, ROWS, frame, FACING)

/** The marker OpenCode records when a turn ends, and how it ended. */
export type TurnEnd = { type: 'idle'; id: string; outcome: 'succeeded' | 'failed' | 'interrupted' }

/** The session's latest turn end, if it has had one. */
export function lastTurnEnd(messages: ReadonlyArray<{ type: string }>) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.type === 'idle') return messages[i] as TurnEnd
  return undefined
}
