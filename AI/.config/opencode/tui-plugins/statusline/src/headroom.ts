import { createSignal } from 'solid-js'
import { ORANGE, hex, pack } from './footer'

// The row's Headroom item, after Ember Ribbon's: the life ring (U+F1CD), a graph of the tokens saved
// in each recent turn, and the total. The proxy OpenCode's provider points at reports what it saved
// for each client; OpenCode's share (all its sessions since the proxy started) is what the item shows.
export const HEADROOM_STATS_URL = 'http://127.0.0.1:6767/stats'
// 100 ms ticks between reads.
export const HEADROOM_POLL_TICKS = 50
const HEADROOM_TIMEOUT_MS = 2000

export const HEADROOM_ICON = '\u{F1CD}'
export const HEADROOM_COLOR = pack(hex(ORANGE))
export const HEADROOM_CELLS = 6
export const HEADROOM_POINTS = HEADROOM_CELLS * 2
// Room for "999.9k", so the item keeps its width as the total grows.
export const HEADROOM_COUNT_COLUMNS = 6
// The item's columns: the 3 that part it from the stream, the ring, the graph and the count, 1 apart.
export const HEADROOM_WIDTH = 3 + 1 + 1 + HEADROOM_CELLS + 1 + HEADROOM_COUNT_COLUMNS

type Stats = { agent_usage?: { agents?: { agent?: string; tokens_saved?: number }[] } }

// Undefined until Headroom has seen an OpenCode request.
export function openCodeSavedTokens(stats: Stats) {
  const saved = stats.agent_usage?.agents?.find(agent => agent.agent === 'opencode')?.tokens_saved
  return typeof saved === 'number' ? saved : undefined
}

// Undefined too when the proxy is not running.
export async function fetchHeadroomSaved(fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  try {
    return openCodeSavedTokens(await (await fetcher(HEADROOM_STATS_URL, { signal: AbortSignal.timeout(HEADROOM_TIMEOUT_MS) })).json())
  } catch {
    return undefined
  }
}

// What each of the last HEADROOM_POINTS turns saved, from the total at the end of each: the newest
// last, zero-padded at the left until there are that many turns.
export function savedPerTurn(totals: number[]) {
  const recent = totals.slice(-(HEADROOM_POINTS + 1))
  const saved = recent.slice(1).map((total, index) => Math.max(0, total - recent[index]!))
  return [...Array<number>(HEADROOM_POINTS - saved.length).fill(0), ...saved]
}

// Plugin state, like the token stream: the total is read every HEADROOM_POLL_TICKS and as a turn
// ends. The first read is the baseline the graph counts from, since the proxy's total reaches
// back before this session. A read that fails keeps the last count: the item is always drawn.
export function createHeadroomSaved() {
  const [total, setTotal] = createSignal(0)
  const [ends, setEnds] = createSignal<number[]>([])
  const refresh = async () => {
    const saved = await fetchHeadroomSaved()
    if (saved === undefined) return
    setTotal(saved)
    if (!ends().length) setEnds([saved])
  }
  return {
    total,
    // The total at the end of each recent turn, then now, oldest first.
    totals: () => [...ends(), total()],
    refresh,
    async endTurn() {
      await refresh()
      setEnds(list => [...list, total()].slice(-(HEADROOM_POINTS + 1)))
    },
  }
}

export type HeadroomSaved = ReturnType<typeof createHeadroomSaved>
