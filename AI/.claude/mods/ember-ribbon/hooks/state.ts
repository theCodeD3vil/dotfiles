// What the hooks, the timer and the drawing share while the module is loaded. A hot reload loads it
// afresh. Held by the host instead, so they survive a reload: `readings` and `previous` ($.state).

// Where the 5h bar is mounted and what it shows, so the timer can repaint just its cells.
export type MountedBar = { requestId: string; percent: number; timePercent: number; width: number }

export const state = {
  tick: 0,
  isWorking: false,
  isEnhancing: false,
  doneTicks: 0,
  // Characters the main loop's reply streamed in each tick, newest last; `streamedChars` is this tick's so far.
  streamTicks: [] as number[],
  streamedChars: 0,
  mountedBar: undefined as MountedBar | undefined,
}
