'use strict'
/* Ember Ribbon's gauges for the mocks, ported from ember-ribbon/hooks (rasters.ts, colors.ts,
 * stream.ts) and the OpenCode statusline's copies of them. Copies only; the mods are untouched. */
;(() => {
  const { claude, green, yellow, red, pink, teal, track } = Pet.COLORS
  const BITS = Pet.BRAILLE_BITS
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
  const cell = (code, fg) => ({ ch: String.fromCodePoint(code), fg, bg: null, bold: false })

  const severity = percent => (percent >= 85 ? red : percent >= 65 ? yellow : green)
  const HEAT = [
    [25, green],
    [50, claude],
    [75, yellow],
    [90, pink],
    [Infinity, red],
  ]
  const heat = percent => HEAT.find(([upTo]) => percent < upTo)[1]
  const fill = percent => {
    const ratio = clamp(percent / 100, 0, 1)
    return ratio < 0.5 ? Pet.mix(green, yellow, ratio * 2) : Pet.mix(yellow, red, (ratio - 0.5) * 2)
  }

  // The 5h bar: lit dots up to usage with a pulse running to the head, a ▐ for the window's time,
  // and rounded tips that sweep hues once the fill reaches them.
  function usage(percent, timePercent, width, ms) {
    const [hue] = Pet.toHsl(Pet.hexToRgb(severity(percent)))
    const fillEnd = percent > 0 ? Math.max(1, (percent / 100) * width) : 0
    const front = ((ms / 1000) * 10) % (fillEnd + 6)
    const cells = Array.from({ length: width }, (_, col) => {
      if (col + 0.5 >= fillEnd) return cell(0x28ff, track)
      const behind = front - col
      const pulse = behind >= 0 ? Math.exp(-behind / 3) : Math.exp(-(behind * behind) / 0.8)
      const glow = 0.28 + 0.12 * Math.pow(Math.min(1, (col + 0.5) / fillEnd), 0.9) + 0.6 * pulse
      return cell(0x28ff, Pet.fromHsl(hue, 0.9, 0.12 + 0.58 * glow))
    })
    const tip = phase => Pet.fromHsl(hue + 25 * Math.sin((ms / 1400 + phase) * Math.PI * 2), 0.95, 0.62)
    cells[Math.max(1, Math.min(width - 2, Math.round((width * timePercent) / 100)))] = cell(0x2590, severity(timePercent))
    cells[0] = cell(0x28be, percent > 0 ? tip(0) : track)
    cells[width - 1] = cell(0x2877, fillEnd >= width - 1 ? tip(0.5) : track)
    return cells
  }

  const columnBits = (half, level, cellRow, rows) => {
    let bits = 0
    for (let dotRow = 0; dotRow < 4; dotRow++) if (rows * 4 - 1 - (cellRow * 4 + dotRow) < level) bits |= BITS[dotRow][half]
    return bits
  }

  // One dot column per turn, two to a cell, newest at the right, as tall as the context percent.
  function fillChart(width, rows, percents) {
    const shown = percents.slice(-width * 2)
    const firstTurn = width * 2 - shown.length
    return Array.from({ length: rows }, (_, cellRow) =>
      Array.from({ length: width }, (_, col) => {
        const turns = [0, 1].map(half => shown[col * 2 + half - firstTurn])
        const levels = turns.map(percent => (percent === undefined ? -1 : Math.max(1, Math.round((clamp(percent, 0, 100) / 100) * rows * 4))))
        const top = Math.max(...turns.map(percent => percent ?? -1))
        const bits = levels.reduce((lit, level, half) => lit | columnBits(half, Math.max(1, level), cellRow, rows), 0)
        return cell(0x2800 + bits, top < 0 ? track : fill(top))
      }),
    )
  }

  // Characters streamed per 100 ms tick to the chart's points: each the mean of five ticks.
  const sum = values => values.reduce((total, value) => total + value, 0)
  const streamPoints = (history, width) =>
    Array.from({ length: width * 2 }, (_, index) => {
      const end = history.length - (width * 2 - 1 - index)
      const recent = history.slice(Math.max(0, end - 5), Math.max(0, end))
      return recent.length ? sum(recent) / recent.length : 0
    })
  const tokensPerSecond = history => Math.round(sum(history.slice(-10)) / 4)

  function stream(points, width) {
    const peak = Math.max(1, ...points)
    return Array.from({ length: width }, (_, col) => {
      const bits = [0, 1].reduce((lit, half) => lit | columnBits(half, Math.round((points[col * 2 + half] / peak) * 4), 0, 1), 0)
      return cell(0x2800 + (bits || BITS[3][0] + BITS[3][1]), bits ? teal : track)
    })
  }

  const RINGS = [0xf0766, 0xf0a9e, 0xf0a9f, 0xf0aa0, 0xf0aa1, 0xf0aa2, 0xf0aa3, 0xf0aa4, 0xf1807]
  const ring = percent => {
    const step = percent >= 100 ? 8 : Math.min(7, Math.ceil((percent * 7) / 100))
    return cell(RINGS[step], step === 0 ? track : severity(percent))
  }

  Pet.RIBBON = { severity, heat, usage, fillChart, stream, streamPoints, tokensPerSecond, ring, STREAM_HISTORY: 26 }
})()
