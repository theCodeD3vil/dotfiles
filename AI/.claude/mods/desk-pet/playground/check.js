'use strict'
/* Checks what needs no browser: the glyph tables, every encoder, the host layouts, and that each
 * character draws every state in both hosts. Run with `node check.js`; open index.html to look. */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file })
for (const file of ['core', 'pixels', 'encoders', 'terminal', 'ribbon', 'hosts']) run(`js/${file}.js`)
for (const file of fs.readdirSync(path.join(__dirname, 'js/characters')).sort()) run(`js/characters/${file}`)

let failures = 0
const fail = message => {
  failures++
  console.log(`FAIL ${message}`)
}
const HEX = /^#[0-9a-fA-F]{6}$/

// Glyph tables: 64 distinct sextants that the painter reads back to the same mask.
const sextants = Array.from({ length: 64 }, (_, mask) => Pet.sextantGlyph(mask))
if (new Set(sextants).size !== 64) fail('sextant glyphs are not distinct')
sextants.forEach((glyph, mask) => {
  const code = glyph.codePointAt(0)
  if (code >= 0x1fb00 && Pet.sextantMaskOf(code) !== mask) fail(`sextant ${mask} reads back as ${Pet.sextantMaskOf(code)}`)
})
if (new Set(Pet.QUADRANTS).size !== 16) fail('quadrant glyphs are not distinct')
const octants = Array.from({ length: 256 }, (_, mask) => Pet.octantGlyph(mask))
if (new Set(octants).size !== 256) fail('octant glyphs are not distinct')
octants.forEach((glyph, mask) => {
  if (Pet.octantMaskOf(glyph) !== mask) fail(`octant ${mask} reads back as ${Pet.octantMaskOf(glyph)}`)
})
console.log('glyph tables checked')

// Encoders: a grid with at most two colours a cell, or one colour beside clear pixels, decodes
// back to itself exactly. Braille keeps which dots are lit.
const random = (seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(7)
const COLORS = ['#D97757', '#E9E6DC', '#3A3733', '#89B4FA']
const maskOf = (encoder, ch) => {
  if (ch === ' ') return 0
  if (encoder === 'half') return ' ▀▄█'.indexOf(ch)
  if (encoder === 'quad') return Pet.QUADRANTS.indexOf(ch)
  if (encoder === 'octant') return Pet.octantMaskOf(ch)
  const code = ch.codePointAt(0)
  if (encoder === 'braille') return code - 0x2800
  return { '█': 63, '▌': 21, '▐': 42 }[ch] ?? Pet.sextantMaskOf(code)
}
for (const key of Pet.ENCODER_KEYS) {
  const [pw, ph] = Pet.ENCODERS[key].px
  const [cols, rows] = [9, 3]
  for (let trial = 0; trial < 200; trial++) {
    const grid = Pet.grid(cols * pw, rows * ph)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pair = key === 'braille' || random() < 0.5 ? [COLORS[trial % 4], null] : [COLORS[trial % 4], COLORS[(trial + 1) % 4]]
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) grid.set(col * pw + x, row * ph + y, pair[random() < 0.5 ? 0 : 1])
      }
    }
    const cells = Pet.encode(key, grid, cols, rows)
    cells.forEach((line, row) =>
      line.forEach(({ ch, fg, bg }, col) => {
        const mask = maskOf(key, ch)
        for (let i = 0; i < pw * ph; i++) {
          const [x, y] = [col * pw + (i % pw), row * ph + Math.floor(i / pw)]
          const bit = key === 'braille' ? Pet.BRAILLE_BITS[Math.floor(i / 2)][i % 2] : 1 << i
          const decoded = mask & bit ? fg : bg
          if (decoded !== grid.get(x, y)) {
            fail(`${key}: cell ${col},${row} pixel ${i} decodes as ${decoded}, drawn ${grid.get(x, y)}`)
            return
          }
        }
      }),
    )
  }
}
console.log(`encoders checked: ${Pet.ENCODER_KEYS.join(', ')}`)

// Host layouts: nothing spills off the screen at any width the playground offers, and the pet
// lands where the layout says.
for (const cols of [60, 80, 100, 160]) {
  for (const [petCols, petRows] of [
    [12, 4],
    [16, 2],
    [24, 8],
  ]) {
    const pet = Array.from({ length: petRows }, () => Array.from({ length: petCols }, () => ({ ch: '█', fg: '#FFFFFF', bg: null, bold: false })))
    for (const [host, build] of [
      ['claude', Pet.claudeScreen],
      ['opencode', Pet.opencodeScreen],
    ]) {
      const { screen, petBox } = build({ cols, pet, petX: 0, working: true, ms: 1234, stream: [0, 120, 170, 90], backdrop: '#0A0A0A' })
      const name = `${host} ${cols} cols, pet ${petCols}×${petRows}`
      if (screen.spilled) fail(`${name}: ${screen.spilled} cells off the screen`)
      if (screen.cells.some(row => row.length !== cols)) fail(`${name}: a row is the wrong width`)
      if (screen.cells[petBox.y][petBox.x].ch !== '█' || screen.cells[petBox.y + petRows - 1][petBox.x + petCols - 1].ch !== '█') fail(`${name}: the pet is not at its box`)
    }
  }
}
console.log('host layouts checked')

// Characters: every state in both hosts, at each of the character's sizes under every encoder,
// draws valid colours, something in every state, and a frame that changes over time.
const sizesOf = (character, host) =>
  [character.hosts?.[host], character.larger?.[host]].filter(Boolean).map(size => ({ ...Pet.HOSTS[host].defaults, ...size }))
const drawAt = (character, host, config, encoder, state, t) => {
  const [pw, ph] = Pet.ENCODERS[encoder].px
  const grid = Pet.grid(config.cols * pw, config.rows * ph)
  character.draw(grid, { host, state, prev: 'idle', t, clock: t + 10, facing: 1, moving: false, encoder, cols: config.cols, rows: config.rows })
  return grid
}
const TIMES = [0, 0.3, 0.7, 1.2, 2.5, 4.1]
for (const character of Pet.CHARACTERS) {
  for (const host of Pet.HOST_KEYS) {
    for (const config of sizesOf(character, host)) {
      for (const encoder of Pet.ENCODER_KEYS) {
        for (const { key: state } of Pet.STATES) {
          const frames = new Set()
          for (const t of TIMES) {
            const name = `${character.id} ${host} ${config.cols}×${config.rows} ${encoder} ${state} t=${t}`
            let grid
            try {
              grid = drawAt(character, host, config, encoder, state, t)
            } catch (error) {
              fail(`${name}: threw ${error.message}`)
              continue
            }
            if (grid.px.some(color => color !== null && !HEX.test(color))) fail(`${name}: a pixel is not #rrggbb or null`)
            if (grid.px.every(color => color === null)) fail(`${name}: empty`)
            frames.add(grid.px.join())
          }
          if (frames.size < 2) fail(`${character.id} ${host} ${config.cols}×${config.rows} ${encoder} ${state}: never moves`)
        }
      }
    }
  }
}
console.log(`characters checked: ${Pet.CHARACTERS.map(character => character.id).join(', ')}`)

console.log(failures ? `\n${failures} failures` : '\nall checks passed')
process.exit(failures ? 1 : 0)
