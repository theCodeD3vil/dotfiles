'use strict'
/* A terminal screen as a grid of cells, and a canvas painter that draws it the way a GPU terminal
 * does: block elements, sextants, octants, braille and box lines are shapes that fill the cell exactly
 * (WezTerm, Kaku and Ghostty draw them themselves), everything else is text centred in the cell. */
;(() => {
  Pet.FONT = '"Cartograph CF", "CaskaydiaCove Nerd Font Mono", "Symbols Nerd Font Mono", "JetBrains Mono", Menlo, monospace'

  const blank = () => ({ ch: ' ', fg: null, bg: null, bold: false })
  Pet.textWidth = text => [...text].length

  Pet.screen = (cols, rows) => {
    const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, blank))
    const screen = {
      cols,
      rows,
      cells,
      // Writes that fall off the screen, so a check can tell a layout overflowed.
      spilled: 0,
      put(x, y, ch, fg = null, bg = null, bold = false) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) {
          screen.spilled++
          return
        }
        cells[y][x] = { ch, fg, bg, bold }
      },
      // Returns the column after the text.
      text(x, y, text, fg, { bg = null, bold = false } = {}) {
        let col = x
        for (const ch of text) screen.put(col++, y, ch, fg, bg, bold)
        return col
      },
      // Lays down a block of cells; blank cells leave what is underneath.
      paste(x, y, block) {
        block.forEach((row, dy) =>
          row.forEach((cell, dx) => {
            if (cell.ch !== ' ' || cell.bg) screen.put(x + dx, y + dy, cell.ch, cell.fg, cell.bg, cell.bold)
          }),
        )
      },
      shade(x, y, width, bg) {
        for (let col = x; col < x + width; col++) if (cells[y]?.[col]) cells[y][col] = { ...cells[y][col], bg }
      },
    }
    return screen
  }

  // Terminals size cells in whole device pixels: the font's advance, and its line height times
  // the configured line height.
  Pet.measureCell = (fontSize, lineHeight) => {
    const dpr = globalThis.devicePixelRatio || 1
    const context = document.createElement('canvas').getContext('2d')
    context.font = `${fontSize}px ${Pet.FONT}`
    const metrics = context.measureText('M')
    const natural = (metrics.fontBoundingBoxAscent ?? fontSize * 0.95) + (metrics.fontBoundingBoxDescent ?? fontSize * 0.25)
    return { cw: Math.round(metrics.width * dpr) / dpr, ch: Math.round(natural * lineHeight * dpr) / dpr }
  }

  const QUADRANT_MASK = new Map([...'▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'].map((glyph, index) => [glyph, index + 1]))
  const LINES = { '─': 'h', '│': 'v', '┃': 'V' }

  // Fills the lit parts of a cols × rows pattern (bit i = row * cols + col) inside one cell.
  function fillPattern(context, mask, cols, rows, x0, y0, x1, y1) {
    const xs = Array.from({ length: cols + 1 }, (_, i) => Math.round(x0 + ((x1 - x0) * i) / cols))
    const ys = Array.from({ length: rows + 1 }, (_, i) => Math.round(y0 + ((y1 - y0) * i) / rows))
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (mask & (1 << (row * cols + col))) context.fillRect(xs[col], ys[row], xs[col + 1] - xs[col], ys[row + 1] - ys[row])
      }
    }
  }

  function fillBraille(context, bits, x0, y0, x1, y1) {
    const [slotW, slotH] = [(x1 - x0) / 2, (y1 - y0) / 4]
    const radius = Math.max(0.6, Math.min(slotW, slotH) * 0.34)
    context.beginPath()
    Pet.BRAILLE_BITS.forEach((pair, row) =>
      pair.forEach((bit, col) => {
        if (!(bits & bit)) return
        const [cx, cy] = [x0 + slotW * (col + 0.5), y0 + slotH * (row + 0.5)]
        context.moveTo(cx + radius, cy)
        context.arc(cx, cy, radius, 0, Math.PI * 2)
      }),
    )
    context.fill()
  }

  function fillLine(context, kind, x0, y0, x1, y1, dpr) {
    const thin = Math.max(1, Math.round(dpr))
    const weight = kind === 'V' ? thin * 2 : thin
    if (kind === 'h') context.fillRect(x0, Math.round((y0 + y1) / 2 - weight / 2), x1 - x0, weight)
    else context.fillRect(Math.round((x0 + x1) / 2 - weight / 2), y0, weight, y1 - y0)
  }

  function drawGlyph(context, cell, box, fontPx, dpr) {
    const [x0, y0, x1, y1] = box
    const code = cell.ch.codePointAt(0)
    context.fillStyle = cell.fg ?? Pet.COLORS.ink
    if (QUADRANT_MASK.has(cell.ch)) return fillPattern(context, QUADRANT_MASK.get(cell.ch), 2, 2, x0, y0, x1, y1)
    if (code >= 0x1fb00 && code <= 0x1fb3b) return fillPattern(context, Pet.sextantMaskOf(code), 2, 3, x0, y0, x1, y1)
    if (Pet.octantMaskOf(cell.ch) !== undefined) return fillPattern(context, Pet.octantMaskOf(cell.ch), 2, 4, x0, y0, x1, y1)
    if (code >= 0x2800 && code <= 0x28ff) return fillBraille(context, code - 0x2800, x0, y0, x1, y1)
    if (LINES[cell.ch]) return fillLine(context, LINES[cell.ch], x0, y0, x1, y1, dpr)
    context.save()
    context.beginPath()
    context.rect(x0, y0, x1 - x0, y1 - y0)
    context.clip()
    context.font = `${cell.bold ? '700 ' : ''}${fontPx}px ${Pet.FONT}`
    context.fillText(cell.ch, (x0 + x1) / 2, (y0 + y1) / 2)
    context.restore()
  }

  const signature = cell => `${cell.ch}${cell.fg}${cell.bg}${cell.bold}`

  // A painter for one canvas. It repaints only the cells that changed since its last frame,
  // unless the layout changed or `force` is set.
  Pet.painter = canvas => {
    const context = canvas.getContext('2d')
    let shown = []
    let layout = ''
    const paint = (screen, { cw, ch, fontSize, backdrop, force = false }) => {
      const dpr = globalThis.devicePixelRatio || 1
      const next = [screen.cols, screen.rows, cw, ch, fontSize, backdrop, dpr].join('|')
      if (force || next !== layout) {
        layout = next
        shown = []
        canvas.width = Math.round(screen.cols * cw * dpr)
        canvas.height = Math.round(screen.rows * ch * dpr)
        canvas.style.width = `${screen.cols * cw}px`
        context.fillStyle = backdrop
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      const X = col => Math.round(col * cw * dpr)
      const Y = row => Math.round(row * ch * dpr)
      screen.cells.forEach((row, y) =>
        row.forEach((cell, x) => {
          const index = y * screen.cols + x
          const sig = signature(cell)
          if (shown[index] === sig) return
          shown[index] = sig
          const box = [X(x), Y(y), X(x + 1), Y(y + 1)]
          context.fillStyle = cell.bg ?? backdrop
          context.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1])
          if (cell.ch !== ' ') drawGlyph(context, cell, box, fontSize * dpr, dpr)
        }),
      )
      return { context, dpr, X, Y }
    }
    return paint
  }
})()
