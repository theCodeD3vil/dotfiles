export const mod = (v: number, n: number) => ((v % n) + n) % n

// A repeatable pseudo-random number from 0 to 1 for any input.
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
