import { describe, expect, test } from 'bun:test'
import { RINGS, footerLayout, sevColor, timeLeft, usageCells } from '../src/footer'
import { oracle, sourceSha256, type Limit } from './oracle'

const now = Date.parse('2026-10-05T12:00:00.000Z')
const resetAfter = (minutes: number) => new Date(now + minutes * 60_000).toISOString()

describe('Ember Ribbon gauge parity', () => {
  test('executes the unchanged source with an auditable digest', () => {
    expect(sourceSha256).toMatch(/^[a-f0-9]{64}$/)
    console.info(`Ember footer source SHA-256: ${sourceSha256}`)
  })

  test('preserves source severity colours and countdown formatting', () => {
    for (const pct of [...Array.from({ length: 161 }, (_, index) => index - 20), 64.999, 65, 65.001, 84.999, 85, 85.001]) {
      expect(sevColor(pct), `pct=${pct}`).toBe(oracle.sevColor(pct))
    }
    const minutes = [-1000, -0.001, 0, 0.999, 1, 9, 59.999, 60, 61, 599, 1439.999, 1440, 1499, 1500, 2880, 10081]
    const limits: Array<Limit | undefined> = [undefined, {}, { resetsAt: '' }, { resetsAt: 'invalid-date' }, ...minutes.map(value => ({ resetsAt: resetAfter(value) }))]
    for (const limit of limits) expect(timeLeft(limit, now), JSON.stringify(limit)).toBe(oracle.timeLeft(limit, now))
  })

  test('matches every source raster word across ten pulse cycles', () => {
    for (let pct = 0; pct <= 100; pct++) {
      for (let tick = 0; tick <= 600; tick++) {
        const timePct = [0, 35, 64.999, 65, 84.999, 85, 100][tick % 7]!
        expect(usageCells(pct, timePct, 22, tick * 100), `pct=${pct}; tick=${tick}`).toEqual(oracle.usageCells(pct, timePct, 22, tick * 100))
      }
    }
  }, 30_000)

  test('uses only the two usage stats and selects the responsive gauge form', () => {
    const input = {
      fiveLimit: { percentUsed: 41, resetsAt: resetAfter(134) },
      weekLimit: { percentUsed: 18, resetsAt: resetAfter(3 * 1440 + 5 * 60) },
      now,
      tick: 0,
    }
    const full = footerLayout({ ...input, columns: 52 })
    expect(full).not.toHaveProperty('model')
    expect(full).not.toHaveProperty('spinner')
    expect(full.five.gauge.kind).toBe('raster')
    expect(full.five.time).toBe('2h14m')
    expect(full.week.time).toBe('3d05h')

    const rings = footerLayout({ ...input, columns: 51 })
    expect(rings.five.gauge).toEqual({ kind: 'ring', glyph: RINGS[3], color: '#A3BA82' })
    expect(rings.week.gauge).toEqual({ kind: 'ring', glyph: RINGS[2], color: '#A3BA82' })
    expect(rings.five.time).toBe('2h14m')
    expect(rings.week.time).toBe('3d05h')

    const noTime = footerLayout({ ...input, columns: 30 })
    expect(noTime.five.gauge.kind).toBe('ring')
    expect(noTime.five.time).toBeUndefined()
    expect(noTime.week.time).toBeUndefined()
  })
})
