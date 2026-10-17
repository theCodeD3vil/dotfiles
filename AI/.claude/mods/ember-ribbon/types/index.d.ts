export type ContextReading = { tokens: number; window: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    // `saved` is Headroom's session total at the end of each turn.
    'ember-ribbon': { readings: ContextReading[]; previous: string | null; saved: number[] }
  }
}
