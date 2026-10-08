import { H, W, dots } from './dots'
import { hash } from './math'

// Drops fall onto a surface and send ripples across it, a new one every 0.6 seconds. Tool.
export const raindrops = dots(f => t => {
  const every = 0.6
  const last = Math.floor(t / every)
  for (let j = last - 3; j <= last + 1; j++) {
    const age = t - (j * every + 0.25 * hash(j))
    const cx = 2 + hash(j + 3) * 28
    if (age < -0.4 || age > 1.8) continue
    if (age < 0) { f.set(cx, 6 + age * 22, 1); f.set(cx, 5 + age * 22, 0.5); continue }
    if (age < 0.08) f.set(cx, 6, 1)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = Math.exp(-(((Math.hypot(x - cx, (y - 6) * 1.7) - age * 17) / 1.2) ** 2)) * (1 - age / 1.8)
        if (v > 0.17) f.set(x, y, v)
      }
    }
  }
})
