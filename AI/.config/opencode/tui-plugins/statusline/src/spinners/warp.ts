import { H, W, dots } from './dots'
import { hash, mod } from './math'

const STARS = Array.from({ length: 44 }, (_, i) => ({ y: Math.floor(hash(i) * H), speed: 12 + 52 * hash(i + 50) ** 2, x0: hash(i + 100) * W }))

// A parallax starfield flying left, its streaks surging. Approval.
export const warp = dots(f => t => {
  const surge = (0.5 + 0.5 * Math.sin(t * 1.3)) ** 3
  for (const s of STARS) {
    const head = mod(s.x0 - s.speed * t, W)
    const length = 1 + (s.speed / 9) * (1 + 2.5 * surge)
    for (let k = 0; k < length; k++) f.set((head + k) % W, s.y, (0.45 + (0.55 * s.speed) / 64) * (1 - k / length))
  }
}, { grid: true })
