import { W, dots } from './dots'
import { mod } from './math'

const BALLS = [{ rate: 0.9, phase: 0, vx: 9, x0: 3 }, { rate: 1.15, phase: 0.33, vx: -7, x0: 20 }, { rate: 1.4, phase: 0.66, vx: 5, x0: 11 }]

// Three balls on a dotted floor, each on its own bounce arc, drifting sideways and wrapping around
// with a short fading trail. Waiting.
export const bouncingBalls = dots(f => t => {
  for (let x = 0; x < W; x += 2) f.set(x, 7, 0.2)
  for (const b of BALLS) {
    const at = (time: number): [number, number] => [mod(b.x0 + b.vx * time, W), 6 - 5.2 * (1 - (2 * mod(time * b.rate + b.phase, 1) - 1) ** 2)]
    for (let k = 0; k < 10; k++) {
      const [x, y] = at(t - (k * 0.12) / 10)
      f.set(x, y, 0.7 * (1 - k / 10) ** 1.5)
    }
    const [x, y] = at(t).map(Math.round) as [number, number]
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) f.set(x + dx!, y + dy!, 1)
  }
})
