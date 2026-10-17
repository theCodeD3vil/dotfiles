'use strict'
/* Pixel grids the characters draw into, and sprites written as rows of palette keys. */
;(() => {
  const CLEAR_KEYS = new Set(['.', ' '])
  const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  // w × h pixels, each a '#rrggbb' colour or null for the terminal's own background.
  Pet.grid = (w, h) => {
    const px = new Array(w * h).fill(null)
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h
    const grid = {
      w,
      h,
      px,
      get: (x, y) => (inside(x, y) ? px[y * w + x] : null),
      set(x, y, color) {
        const [col, row] = [Math.round(x), Math.round(y)]
        if (inside(col, row)) px[row * w + col] = color
      },
      rect(x, y, width, height, color) {
        for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) grid.set(x + dx, y + dy, color)
      },
      // Draws a sprite with its top-left at (x, y); `flip` mirrors it left to right.
      blit(sprite, x, y, { flip = false } = {}) {
        const [left, top] = [Math.round(x), Math.round(y)]
        for (let sy = 0; sy < sprite.h; sy++) {
          for (let sx = 0; sx < sprite.w; sx++) {
            const color = sprite.px[sy * sprite.w + sx]
            if (color) grid.set(left + (flip ? sprite.w - 1 - sx : sx), top + sy, color)
          }
        }
      },
      clear: () => px.fill(null),
    }
    return grid
  }

  // Rows of palette keys to a sprite. '.' and ' ' are clear; an unknown key is an authoring mistake.
  Pet.sprite = (rows, palette) => {
    const w = Math.max(...rows.map(row => row.length))
    const px = []
    for (const row of rows) {
      for (let x = 0; x < w; x++) {
        const key = row[x] ?? '.'
        if (CLEAR_KEYS.has(key)) {
          px.push(null)
          continue
        }
        if (!(key in palette)) throw new Error(`sprite: no colour for "${key}"`)
        px.push(palette[key])
      }
    }
    return { w, h: rows.length, px }
  }

  // A grid as rows of letters with a legend, ready to paste into a character file.
  Pet.gridToText = grid => {
    const keys = new Map()
    const rows = []
    for (let y = 0; y < grid.h; y++) {
      let row = ''
      for (let x = 0; x < grid.w; x++) {
        const color = grid.get(x, y)
        if (!color) {
          row += '.'
          continue
        }
        if (!keys.has(color)) keys.set(color, LETTERS[keys.size] ?? '?')
        row += keys.get(color)
      }
      rows.push(row)
    }
    const legend = [...keys].map(([color, key]) => `${key}: '${color}'`).join(', ')
    return `// ${legend}\n${rows.map(row => `'${row}',`).join('\n')}\n`
  }
})()
