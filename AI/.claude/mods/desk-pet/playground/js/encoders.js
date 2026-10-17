'use strict'
/* Pixels to terminal cells. A cell is { ch, fg, bg, bold } with '#rrggbb' colours or null for the
 * terminal's own background, the way both hosts' rasters keep transparent terminals transparent. */
;(() => {
  // Indexed by mask: bit 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
  const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
  const BRAILLE_BITS = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
  ]
  const LEFT_HALF = 0b010101
  const RIGHT_HALF = 0b101010
  const SEXTANT_FULL = 0b111111

  // U+1FB00 to U+1FB3B hold every 2 × 3 pattern but the four older blocks already have:
  // blank, full, and the left and right halves.
  Pet.sextantGlyph = mask => {
    if (mask === 0) return ' '
    if (mask === SEXTANT_FULL) return '█'
    if (mask === LEFT_HALF) return '▌'
    if (mask === RIGHT_HALF) return '▐'
    return String.fromCodePoint(0x1fb00 + mask - 1 - (mask > LEFT_HALF ? 1 : 0) - (mask > RIGHT_HALF ? 1 : 0))
  }
  Pet.sextantMaskOf = code => {
    let mask = code - 0x1fb00 + 1
    if (mask >= LEFT_HALF) mask++
    if (mask >= RIGHT_HALF) mask++
    return mask
  }
  Pet.QUADRANTS = QUADRANTS
  Pet.BRAILLE_BITS = BRAILLE_BITS

  // Unicode 16's octants, U+1CD00 to U+1CDE5, run through every 2 × 4 pattern in order, but for
  // the 26 that older blocks already draw. Bit i is pixel i in reading order.
  const OCTANT_OLDER = {
    0: 0x20, 255: 0x2588, 15: 0x2580, 240: 0x2584, 85: 0x258c, 170: 0x2590,
    5: 0x2598, 10: 0x259d, 80: 0x2596, 160: 0x2597, 165: 0x259a, 90: 0x259e, 95: 0x259b, 175: 0x259c, 245: 0x2599, 250: 0x259f,
    3: 0x1fb82, 192: 0x2582, 63: 0x1fb85, 252: 0x2586,
    1: 0x1cea8, 2: 0x1ceab, 64: 0x1cea3, 128: 0x1cea0, 20: 0x1fbe6, 40: 0x1fbe7,
  }
  const OCTANTS = (() => {
    let next = 0x1cd00
    return Array.from({ length: 256 }, (_, mask) => String.fromCodePoint(OCTANT_OLDER[mask] ?? next++))
  })()
  const OCTANT_MASK = new Map(OCTANTS.map((glyph, mask) => [glyph, mask]))
  Pet.octantGlyph = mask => OCTANTS[mask]
  Pet.octantMaskOf = glyph => OCTANT_MASK.get(glyph)

  const distance = (a, b) => {
    const [x, y] = [Pet.hexToRgb(a), Pet.hexToRgb(b)]
    return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2
  }

  const ranked = pixels => {
    const counts = new Map()
    for (const color of pixels) if (color) counts.set(color, (counts.get(color) ?? 0) + 1)
    return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a))
  }

  // At most two colours for one cell's pixels. A clear pixel must keep the terminal background,
  // so a cell with any clear pixel draws all its others in its most common colour. Otherwise the
  // two most common colours split the cell, each pixel taking the nearer. Bit i of `mask` is set
  // for each pixel drawn in `fg`.
  function twoTone(pixels) {
    const colors = ranked(pixels)
    if (!colors.length) return { mask: 0, fg: null, bg: null }
    const full = (1 << pixels.length) - 1
    if (pixels.includes(null)) return { mask: pixels.reduce((mask, color, i) => (color ? mask | (1 << i) : mask), 0), fg: colors[0], bg: null }
    if (colors.length === 1) return { mask: full, fg: colors[0], bg: null }
    const [base, other] = colors
    const mask = pixels.reduce((bits, color, i) => (distance(color, other) < distance(color, base) ? bits | (1 << i) : bits), 0)
    return { mask, fg: other, bg: base }
  }

  // The same two-colour limit, but the two colours are the pair that keeps the cell closest to
  // its pixels, so with eight pixels a cell a lone outline or eye pixel is not simply outvoted.
  // A cell with clear pixels draws the rest in the one colour nearest them all.
  function closestTwo(pixels) {
    const colors = ranked(pixels)
    if (!colors.length) return { mask: 0, fg: null, bg: null }
    const drawn = pixels.filter(Boolean)
    const cost = (palette, of) => of.reduce((total, color) => total + Math.min(...palette.map(choice => distance(color, choice))), 0)
    if (pixels.includes(null)) {
      const fg = colors.reduce((best, color) => (cost([color], drawn) < cost([best], drawn) ? color : best))
      return { mask: pixels.reduce((mask, color, i) => (color ? mask | (1 << i) : mask), 0), fg, bg: null }
    }
    if (colors.length === 1) return { mask: (1 << pixels.length) - 1, fg: colors[0], bg: null }
    let pair = [colors[0], colors[1]]
    for (let a = 0; a < colors.length; a++) {
      for (let b = a + 1; b < colors.length; b++) if (cost([colors[a], colors[b]], pixels) < cost(pair, pixels)) pair = [colors[a], colors[b]]
    }
    const [base, other] = pair
    const mask = pixels.reduce((bits, color, i) => (distance(color, other) < distance(color, base) ? bits | (1 << i) : bits), 0)
    return { mask, fg: other, bg: base }
  }

  const cell = (ch, fg = null, bg = null) => ({ ch, fg, bg, bold: false })

  Pet.ENCODERS = {
    half: {
      label: 'Half blocks',
      px: [1, 2],
      note: '▀ ▄ █ — two stacked pixels a cell, each in its own colour. The fullest colour any terminal draws.',
      cell(pixels) {
        const { mask, fg, bg } = twoTone(pixels)
        return cell(' ▀▄█'[mask], fg, bg)
      },
    },
    quad: {
      label: 'Quadrants',
      px: [2, 2],
      note: '▘ ▝ ▖ ▗ — four pixels a cell, two colours at most: finer edges, coarser colour.',
      cell(pixels) {
        const { mask, fg, bg } = twoTone(pixels)
        return cell(QUADRANTS[mask], fg, bg)
      },
    },
    sextant: {
      label: 'Sextants',
      px: [2, 3],
      note: '🬀 🬁 🬂 — six pixels a cell, two colours at most. Needs a terminal that draws U+1FB00 itself (WezTerm, Kaku, Ghostty do).',
      cell(pixels) {
        const { mask, fg, bg } = twoTone(pixels)
        return cell(Pet.sextantGlyph(mask), fg, bg)
      },
    },
    octant: {
      label: 'Octants',
      px: [2, 4],
      note: '𜴀 𜴁 𜴂 — eight square pixels a cell: the half-block pixel art at half its size each way, two colours a cell at most. Unicode 16 (U+1CD00); Ghostty draws them itself, and CaskaydiaCove Nerd Font has them for WezTerm and Kaku.',
      cell(pixels) {
        const { mask, fg, bg } = closestTwo(pixels)
        return cell(Pet.octantGlyph(mask), fg, bg)
      },
    },
    braille: {
      label: 'Braille',
      px: [2, 4],
      note: '⣿ — eight dots a cell in one colour, like the stage spinners. A line-art pet rather than a filled one.',
      cell(pixels) {
        let bits = 0
        pixels.forEach((color, i) => {
          if (color) bits |= BRAILLE_BITS[i >> 1][i & 1]
        })
        return bits ? cell(String.fromCodePoint(0x2800 + bits), ranked(pixels)[0]) : cell(' ')
      },
    },
  }
  Pet.ENCODER_KEYS = Object.keys(Pet.ENCODERS)

  // One cell's pixels in reading order: across, then down.
  const pixelsOf = (grid, col, row, [pw, ph]) => {
    const pixels = []
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) pixels.push(grid.get(col * pw + x, row * ph + y))
    return pixels
  }

  Pet.encode = (key, grid, cols, rows) => {
    const encoder = Pet.ENCODERS[key]
    return Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => encoder.cell(pixelsOf(grid, col, row, encoder.px))))
  }
})()
