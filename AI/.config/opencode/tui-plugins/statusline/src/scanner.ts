/**
 * Scanner's deterministic terminal frames for the OpenCode footer.
 * Two bright heads braid across a compact three-row raster, each with a small
 * fading tail. Their colour follows the conversation's stage. Each point is a
 * compact square glyph in its own terminal cell. Unlit cells remain as faint,
 * separate raster cells on the terminal background rather than becoming one
 * filled box.
 */

import type { ConversationStage } from './stage'

export type ScannerRgb = readonly [number, number, number]

export type ScannerCell = {
  glyph: string
  color: ScannerRgb
}

/** full: a 10-by-3 ribbon raster; compact: a one-by-three vertical pulse. */
export type ScannerMode = 'full' | 'compact'

export type ScannerOptions = {
  mode?: ScannerMode
  /** false pins one still frame: the non-animated fallback. */
  animate?: boolean
  /** What the conversation is doing; it picks the colour. */
  stage?: ConversationStage
}

export const SCANNER = {
  full: { cells: 10, rows: 3 },
  compact: { cells: 1, rows: 3 },
} as const satisfies Record<ScannerMode, { cells: number; rows: number }>

export const SCANNER_GAP = 2
// Ring stats need 21 cells at 100%; the full strip must leave them that room.
const STATS_MIN = 21

export const SCANNER_COLORS = {
  // Each tone is blended toward the panel by a dot's level, as the preview page does.
  panel: [10, 13, 18],
} as const satisfies Record<string, ScannerRgb>

/** The colour of each stage. Red is the scanner's own colour, so it marks a plain wait. */
export const SCANNER_STAGE_COLORS = {
  waiting: [255, 90, 90],
  thinking: [183, 148, 246],
  tool: [240, 179, 90],
  writing: [126, 231, 135],
  approval: [244, 114, 182],
  compacting: [121, 184, 255],
} as const satisfies Record<ConversationStage, ScannerRgb>

export const scannerWidth = (mode: ScannerMode) => SCANNER[mode].cells

export function scannerMode(columns: number): ScannerMode {
  return columns >= SCANNER.full.cells + SCANNER_GAP + STATS_MIN ? 'full' : 'compact'
}

// The small square is the one-cell terminal counterpart of the reference's
// separated raster squares. It is intentionally drawn on the terminal-default
// background: a background colour here would turn the spinner's envelope into
// a large box.
export const SCANNER_DOT = '▪'
export const SCANNER_TRACK_LEVEL = 0.08

// The full scanner uses the selected Ribbon motion: two heads halfway apart on
// a serpentine path. Top/bottom are traversed in parallel; they meet through
// the middle row before separating again, producing a 20-frame braid.
const DOTS = 10
const ROWS = 3
// The head is at full strength and its two-point tail fades quickly so the
// 30-cell footprint stays quiet beside the quota stats.
const TRAIL = 2
const BRAID_OFFSET = DOTS * 2
// Tick four shows both heads, one on the top and one on the bottom rail.
const STILL_TICK = 4

type Point = { x: number; y: number }

/**
 * Trace the two Ribbon lanes in a continuous down-and-back loop. A second head
 * is offset by two rails, so it runs the lower lane while the first runs the
 * upper one, then they cross through the middle together.
 */
const TRACK: readonly Point[] = (() => {
  const points: Point[] = [{ x: 0, y: 0 }]
  const add = (x: number, y: number) => points.push({ x, y })

  for (let x = 1; x < DOTS; x++) add(x, 0)
  add(DOTS - 1, 1)
  for (let x = DOTS - 2; x >= 0; x--) add(x, 1)
  add(0, 2)
  for (let x = 1; x < DOTS; x++) add(x, 2)
  add(DOTS - 1, 1)
  for (let x = DOTS - 2; x >= 0; x--) add(x, 1)
  add(0, 0)

  return points.slice(0, -1)
})()

const mix = (tone: ScannerRgb, level: number): ScannerRgb => SCANNER_COLORS.panel.map(
  (low, channel) => Math.round(low + (tone[channel]! - low) * Math.min(1, level)),
) as unknown as ScannerRgb

/** Return one Scanner frame for a 100 ms animation tick. */
export function scannerRows(tick: number, working: boolean, options: ScannerOptions = {}): ScannerCell[][] {
  const mode = options.mode ?? 'full'
  const t = options.animate === false ? STILL_TICK : Math.max(0, Math.floor(tick))
  const tone: ScannerRgb = SCANNER_STAGE_COLORS[options.stage ?? 'waiting']
  const dot = (level: number): ScannerCell => ({ glyph: SCANNER_DOT, color: mix(tone, level) })
  const blank: ScannerCell = { glyph: ' ', color: SCANNER_COLORS.panel }

  const rows = Array.from({ length: ROWS }, () => Array.from({ length: DOTS }, () => blank))
  // Keep the footer's allocated size while inactive, but don't show an idle
  // marker that can be mistaken for an error or a still-working spinner.
  if (!working) return mode === 'compact' ? rows.map(row => [row[0]!]) : rows

  // The preview's 8%-opacity inactive squares are a dim raster track here.
  // Keep every cell as a glyph, not a shared background, so each stays distinct.
  for (const row of rows) row.fill(dot(SCANNER_TRACK_LEVEL))

  if (mode === 'compact') {
    const head = [0, 1, 2, 1][t % 4]!
    return Array.from({ length: ROWS }, (_, y) => [dot(y === head ? 1 : 0.18)])
  }

  const head = t % TRACK.length
  // Preserve the brighter dot when the two heads meet in the middle lane.
  for (const offset of [0, BRAID_OFFSET]) {
    for (let behind = 0; behind <= TRAIL; behind++) {
      const point = TRACK[(head + offset - behind + TRACK.length) % TRACK.length]!
      const level = behind === 0 ? 1 : 0.76 - 0.15 * behind
      const current = rows[point.y]![point.x]!
      const currentLevel = current.glyph === SCANNER_DOT
        ? current.color.reduce((brightest, channel, index) => Math.max(brightest, (channel - SCANNER_COLORS.panel[index]!) / (tone[index]! - SCANNER_COLORS.panel[index]!)), 0)
        : 0
      if (level > currentLevel) rows[point.y]![point.x] = dot(level)
    }
  }
  return rows
}
