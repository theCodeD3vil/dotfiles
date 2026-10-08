import { BLUE, GREEN, MAUVE, PEACH, RED, SKY, YELLOW } from './colors'

// One 100 ms timer drives every animation; the tick counts its beats.
export const TICK_MS = 100
export const TICKS_PER_MINUTE = 600

export const elapsedMs = (tick: number) => tick * TICK_MS

// Claude's own spinner frames, played forward and back while it works
export const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']

export const RAINBOW = [RED, PEACH, YELLOW, GREEN, SKY, BLUE, MAUVE]

// One RAINBOW colour per character, shifted one step each frame.
export const rainbowDecorations = (text: string, frame: number) =>
  Array.from({ length: text.length }, (_, index) => ({
    start: index,
    end: index + 1,
    color: RAINBOW[(index - (frame % RAINBOW.length) + RAINBOW.length) % RAINBOW.length],
  }))
