import { H, W, dots } from './dots'
import { hash, mod } from './math'

// Falling streams at different speeds over an LED grid. Waiting.
export const matrixRain = dots(f => t => {
  for (let x = 0; x < W; x++) {
    const tail = 3 + 6 * hash(x + 9)
    const span = H + tail + 6
    const head = mod(t * (7 + 16 * hash(x)) + hash(x + 40) * span, span) - 3
    for (let k = 0; k < tail; k++) f.set(x, head - k, (1 - k / tail) ** 1.4)
  }
}, { grid: true })
