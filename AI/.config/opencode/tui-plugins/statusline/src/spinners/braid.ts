import { W, dots, type Field } from './dots'
import { mod } from './math'

const TAU = Math.PI * 2
const TRAIL = 40 // positions drawn behind a head
const SPAN = 0.5 // seconds the trail reaches back
const tri = (p: number) => { const q = mod(p, 1); return q < 0.5 ? 2 * q : 2 - 2 * q } // 0 to 1 and back
const ease = (v: number) => 0.5 - 0.5 * Math.cos(v * Math.PI)

// The last positions of a moving point, fading toward the tail.
const trail = (f: Field, at: (time: number) => [number, number], t: number) => {
  for (let k = 0; k < TRAIL; k++) {
    const [x, y] = at(t - (k * SPAN) / TRAIL)
    f.set(x, y, (1 - k / TRAIL) ** 1.5)
  }
}

// Two heads weave through each other, trailing long fades. The scanner's successor. Tool.
export const braid = dots(f => t => {
  const head = (time: number): [number, number] => {
    const p = tri(time * 0.5)
    return [(W - 1) * ease(p), 3.5 + 3.2 * Math.sin(p * TAU * 1.5)]
  }
  trail(f, head, t)
  trail(f, time => { const [x, y] = head(time); return [W - 1 - x, 7 - y] }, t)
})
