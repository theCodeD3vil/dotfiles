import { W, dots } from './dots'
import { hash } from './math'

// Flickering fire along the whole strip, with the odd spark above it. Compacting.
export const flame = dots(f => t => {
  const frame = Math.floor(t * 30)
  for (let x = 0; x < W; x++) {
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (x + 0.5)) / W) ** 0.8
    const sway = 0.5 + 0.5 * Math.sin(x * 0.8 + t * 7.3 + 2 * Math.sin(x * 0.31 - t * 4.1))
    const h = 1.4 + 5.6 * sway * envelope + (hash(x * 13 + frame) - 0.5) * 1.2
    for (let k = 0; k < h; k++) f.set(x, 7 - k, (1 - k / h) ** 0.7)
    if (hash(x * 5 + frame * 3) > 0.97) f.set(x, 7 - h - 1 - hash(x + frame) * 2, 0.8)
  }
})
