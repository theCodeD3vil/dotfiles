import { hash } from './math'
import { COLS, type SpinnerFactory } from './types'

const HEX = '0123456789ABCDEF'

// Hex scrolling in two lanes with a decoding wave. Writing.
export const dataStream: SpinnerFactory = () => t => [0, 1].map(lane => Array.from({ length: COLS }, (_, x) => {
  const wave = (0.5 + 0.5 * Math.sin(x * 0.55 - t * 7 + lane * 1.3)) ** 5
  const index = Math.floor(x + t * (lane ? 11 : 7))
  const decoding = wave > 0.55 ? hash(x * 3 + lane * 5 + Math.floor(t * 30)) : hash(index * 2.1 + lane * 17)
  return [HEX[Math.floor(decoding * 16)]!, 0.22 + 0.78 * wave] as const
}))
