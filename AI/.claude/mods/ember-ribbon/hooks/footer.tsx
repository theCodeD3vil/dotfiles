import type { RenderChildren } from 'claude-code'

import { elapsedMs } from './animation'
import { DIM, TRACK, severityColor } from './colors'
import type { TerminalUi } from './components'
import { usageCells } from './rasters'
import type { MountedBar } from './state'

// Claude Code's footer, replaced:  5h ⣿⣿⣷⣿▐⣿⣿ 41% 2h14m   wk ⣿⣷⣿▐⣿⣿ 18% 3d05h
// Each bar fills with usage; the ▐ marker shows how much of its window has passed.
// The model's name is in turn-insights' receipt line.

// "Ember pie" rings for narrow terminals: empty circle, a solid wedge filling in 7 steps, a fire circle at 100%.
const RINGS = ['\u{F0766}', '\u{F0A9E}', '\u{F0A9F}', '\u{F0AA0}', '\u{F0AA1}', '\u{F0AA2}', '\u{F0AA3}', '\u{F0AA4}', '\u{F1807}']
// Claude Code draws its permission-mode label beside the footer; keep room for the longest one,
// "⏵⏵ bypass permissions on ·" (26 columns with the engine's trailing " ·"; auto mode is 17).
const MODE_LABEL_COLUMNS = 26
// The prompt row is narrower than the terminal: about 2 columns of inset on each side.
const ROW_INSET_COLUMNS = 4

export const DEFAULT_COLUMNS = 200
export const FIVE_HOURS = 5 * 3600_000
export const SEVEN_DAYS = 7 * 24 * 3600_000
export const USAGE_BAR_WIDTH = 12

export type FooterStat = { percent: number; time: string }
// `bars` is how many gauges are bars: 2, then 1 (the 5h one), then 0, where both are rings.
export type FooterLayout = { room: number; bars: 0 | 1 | 2; hasNoTime: boolean }
export type FooterView = {
  tick: number
  five: FooterStat
  week: FooterStat
  layout: FooterLayout
  // The mounted bars, the 5h one first: as many as the layout has, the rest are rings.
  bars: MountedBar[]
}

// Columns a stat takes: label, gauge and "41%" with a gap of 1 between them, plus the time left.
const statWidth = (label: string, gaugeWidth: number, { percent, time }: FooterStat) =>
  label.length + 1 + gaugeWidth + 1 + `${percent}%`.length + (time ? 1 + time.length : 0)

// The footer gets exactly the row's width minus the longest mode label, so every label stays on one
// line; everything is right-aligned in it. Widths are counted from the Boxes in renderFooter: gap 3
// between items, gap 1 inside one, plus 2 columns kept clear after the label. Pick the fullest
// layout that fits: the weekly bar becomes a ring first, then the 5h bar, then time left goes.
export function footerLayout(columns: number, five: FooterStat, week: FooterStat): FooterLayout {
  const gaugeWidth = (isBar: boolean) => (isBar ? USAGE_BAR_WIDTH : 1)
  const widthWith = (bars: number) =>
    2 + statWidth('5h', gaugeWidth(bars >= 1), five) + 3 + statWidth('wk', gaugeWidth(bars >= 2), week)
  const room = Math.max(0, columns - MODE_LABEL_COLUMNS - ROW_INSET_COLUMNS)
  const bars = ([2, 1] as const).find(count => widthWith(count) <= room) ?? 0
  return { room, bars, hasNoTime: bars === 0 && widthWith(0) > room }
}

function renderRing({ Text }: TerminalUi, percent: number) {
  const step = percent >= 100 ? 8 : Math.min(7, Math.ceil((percent * 7) / 100))
  return <Text color={step === 0 ? TRACK : severityColor(percent)}>{RINGS[step]}</Text>
}

// ▬▬▬▬▬▮▬▬▬▬ filled up to usage (severity colour); ▮ marks how much of the window has passed,
// coloured like usage: lime early in the window, yellow past 65%, red past 85%
function renderUsageBar({ Raster }: TerminalUi, bar: MountedBar, tick: number) {
  return <Raster key={bar.key} columns={bar.width} rows={1} cells={usageCells(bar.percent, bar.timePercent, bar.width, elapsedMs(tick))} />
}

function renderStat({ Box, Text }: TerminalUi, { label, stat, gauge }: { label: string; stat: FooterStat; gauge: RenderChildren }) {
  return (
    <Box gap={1}>
      <Text color={DIM}>{label}</Text>
      {gauge}
      <Text color={severityColor(stat.percent)}>{stat.percent}%</Text>
      {stat.time ? <Text color={DIM}>{stat.time}</Text> : null}
    </Box>
  )
}

export function renderFooter(components: TerminalUi, { tick, five, week, layout, bars }: FooterView) {
  const { Box } = components
  const gauge = (bar: MountedBar | undefined, percent: number) => (bar ? renderUsageBar(components, bar, tick) : renderRing(components, percent))
  // `hasNoTime` drops the time left from both stats at once.
  const shownTime = (stat: FooterStat) => (layout.hasNoTime ? '' : stat.time)
  return (
    <Box width={layout.room} justifyContent="flex-end" gap={3}>
      {renderStat(components, { label: '5h', stat: { ...five, time: shownTime(five) }, gauge: gauge(bars[0], five.percent) })}
      {renderStat(components, { label: 'wk', stat: { ...week, time: shownTime(week) }, gauge: gauge(bars[1], week.percent) })}
    </Box>
  )
}
