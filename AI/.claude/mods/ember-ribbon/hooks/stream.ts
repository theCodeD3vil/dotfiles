// Token stream: characters the main loop's reply streams in each 100 ms tick (text, thinking and
// tool input; about four to a token), drawn as a 1-row braille chart at the far right of the row.

export const STREAM_CELLS = 8
const STREAM_HISTORY_TICKS = STREAM_CELLS * 2 + 10
const CHARS_PER_TOKEN = 4
const RATE_WINDOW_TICKS = 10 // the last second
const POINT_TICKS = 5 // each dot column is the mean of this many ticks, half a second, so the line reads as a rate

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

// The history with this tick's characters added, keeping what the chart can show.
export const nextStreamHistory = (history: number[], chars: number) => [...history, chars].slice(-STREAM_HISTORY_TICKS)

export const tokensPerSecond = (history: number[]) => Math.round(sum(history.slice(-RATE_WINDOW_TICKS)) / CHARS_PER_TOKEN)

// Two points per cell, oldest first, the newest at the right.
export function streamPoints(history: number[], width: number) {
  return Array.from({ length: width * 2 }, (_, index) => {
    const end = history.length - (width * 2 - 1 - index)
    const recent = history.slice(Math.max(0, end - POINT_TICKS), Math.max(0, end))
    return recent.length ? sum(recent) / recent.length : 0
  })
}
