import { H, W, dots } from './dots'
import { mod } from './math'

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}

// Conway's Life on a torus, ten generations a second, that reseeds itself when it settles.
// Cells fade out instead of vanishing. Thinking.
export const life = dots(f => {
  const rand = rng(7)
  const glow = new Float32Array(W * H)
  let cells = new Uint8Array(W * H)
  let recent: string[] = []
  let acc = 0
  const reseed = () => { cells = cells.map(() => (rand() < 0.32 ? 1 : 0)); recent = [] }
  const step = () => {
    const next = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += cells[mod(y + dy, H) * W + mod(x + dx, W)]!
        next[y * W + x] = n === 3 || (n === 2 && cells[y * W + x]) ? 1 : 0
      }
    }
    cells = next
    const signature = cells.join('')
    if (recent.includes(signature) || !cells.includes(1)) reseed()
    recent.push(signature)
    if (recent.length > 8) recent.shift()
  }
  reseed()
  return (_t, dt) => {
    for (acc += dt; acc >= 0.1; acc -= 0.1) step()
    const fade = Math.exp(-dt * 9)
    for (let i = 0; i < glow.length; i++) f.px[i] = glow[i] = cells[i] ? 1 : glow[i]! * fade
  }
}, { grid: true })
