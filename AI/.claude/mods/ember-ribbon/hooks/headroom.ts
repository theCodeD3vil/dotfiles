// Headroom Desktop keeps what it saved in each Claude session in a state file:
//   {"sessions": {"<session id>": {"tokensSaved": 26946, ...}}, ...}
// A mod has no file access, so the shell cats it.
export const READ_HEADROOM_STATE = ['sh', '-c', 'cat "$HOME/Library/Application Support/Headroom/config/claude-statusline.json"'] as const

// The band redraws ten times a second while Claude works; the file is read at most this often.
export const HEADROOM_REFRESH_MS = 2000

// The band's Headroom item: U+F0768 (Symbols Nerd Font), a graph of the tokens saved
// in each recent turn, two to a cell with the newest at the right, and the session's total.
export const HEADROOM_ICON = '\u{F0768}'
export const HEADROOM_CELLS = 6
export const HEADROOM_POINTS = HEADROOM_CELLS * 2
// Room for "999.9k", so the item keeps its width as the total grows.
export const HEADROOM_COUNT_COLUMNS = 6

// Tokens Headroom saved this session: none while it has no entry for it yet. Throws on a file caught
// mid-rewrite, so the caller can keep the last count instead of blanking the item.
export const savedTokens = (json: string, sessionId: string): number => JSON.parse(json).sessions?.[sessionId]?.tokensSaved ?? 0

// What each of the last HEADROOM_POINTS turns saved, from the session total at the end of each:
// the first of them against zero. Zero-padded at the left until there are that many turns.
export function savedPerTurn(totals: number[]) {
  const recent = totals.slice(-(HEADROOM_POINTS + 1))
  const ends = recent.length > HEADROOM_POINTS ? recent : [0, ...recent]
  const saved = ends.slice(1).map((total, index) => Math.max(0, total - ends[index]!))
  return [...Array<number>(HEADROOM_POINTS - saved.length).fill(0), ...saved]
}
