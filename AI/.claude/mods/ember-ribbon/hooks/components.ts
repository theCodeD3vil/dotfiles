import type { EngineInterface } from 'claude-code'

// The terminal's element table, as `$.ui.resolve(e)` returns it once `e.surface` is 'terminal'.
export type TerminalUi = Extract<ReturnType<EngineInterface['ui']['resolve']>, { Raster: unknown }>
