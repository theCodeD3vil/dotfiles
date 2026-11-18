export type ContextReading = { tokens: number; window: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'ember-ribbon': { readings: ContextReading[]; previous: string | null }
  }
}
