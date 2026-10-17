'use strict'
/* The two places the pet lives, each drawn as a terminal screen around the pet's cells.
 *
 * Claude Code with Ember Ribbon: the band renders [2 rows of padding][what mods beneath it draw]
 * [its 2-row context row], so the pet takes the rows between the padding and the band.
 * OpenCode with the statusline plugin: above the prompt is [1 row of padding][the pet, at the
 * right][its 2-row context row], and the footer under the prompt is the quota stats, right-aligned. */
;(() => {
  const { claude, ink, dim, blue } = Pet.COLORS
  const R = Pet.RIBBON
  const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
  const SPARKLE = '\u{F51B}'
  const TOOL_GREEN = '#4EBA65'
  const RULE = '#5C5852'
  const HISTORY = [6, 9, 13, 16, 21, 24, 29, 33, 38, 41, 47, 52, 55, 61, 64, 67]
  const CONTEXT = { tokens: '134.4k', window: '200k', percent: 67 }
  const FIVE = { percent: 41, time: '2h14m', timePercent: 55 }
  const WEEK = { percent: 18, time: '3d05h' }
  const MODEL = 'Opus 5.5'
  const CLAUDE_PAD_ROWS = 2
  const CLAUDE_MODE_LABEL = 26
  const CLAUDE_ROW_INSET = 4
  const OPENCODE_PAD_ROWS = 1

  const gap = width => ({ text: ' '.repeat(width) })
  const partWidth = part => (part.cells ? part.cells.length : Pet.textWidth(part.text))
  const partsWidth = parts => parts.reduce((total, part) => total + partWidth(part), 0)
  const writeParts = (screen, x, y, parts) =>
    parts.reduce((col, part) => {
      if (part.cells) screen.paste(col, y, [part.cells])
      else screen.text(col, y, part.text, part.fg ?? null, { bold: part.bold, bg: part.bg })
      return col + partWidth(part)
    }, x)
  const clip = (text, width) => [...text].slice(0, Math.max(0, width)).join('')

  const stat = (label, { percent, time }, gauge, showTime) => [
    { text: label, fg: dim },
    gap(1),
    { cells: gauge },
    gap(1),
    { text: `${percent}%`, fg: R.severity(percent) },
    ...(showTime ? [gap(1), { text: time, fg: dim }] : []),
  ]
  const statWidth = (label, gauge, { percent, time }, showTime) => label.length + 1 + gauge + 1 + `${percent}%`.length + (showTime ? 1 + time.length : 0)

  // Fill chart, used / window, token stream and rate, right-aligned to end before column `end`,
  // and bottom-aligned on the second of its two rows.
  function contextRow(screen, end, top, stream) {
    const bottom = top + 1
    const rate = `${String(Math.min(9999, R.tokensPerSecond(stream))).padStart(4, ' ')} tok/s`
    let x = end - Pet.textWidth(rate)
    screen.text(x, bottom, rate, dim)
    x -= 1 + 8
    screen.paste(x, bottom, [R.stream(R.streamPoints(stream, 8), 8)])
    const window = ` / ${CONTEXT.window}`
    x -= 3 + CONTEXT.tokens.length + window.length
    screen.text(screen.text(x, bottom, CONTEXT.tokens, R.heat(CONTEXT.percent), { bold: true }), bottom, window, dim)
    x -= 1 + 8
    screen.paste(x, top, R.fillChart(8, 2, HISTORY))
  }

  // Ember Ribbon's footer: right-aligned in the row less the longest mode label; the 5h bar
  // becomes a ring when it does not fit, then the times go.
  function claudeFooter(screen, y, cols, working, ms) {
    const room = Math.max(0, cols - CLAUDE_MODE_LABEL - CLAUDE_ROW_INSET)
    const widthWith = gauge => 2 + statWidth('5h', gauge, FIVE, true) + 3 + statWidth('wk', 1, WEEK, true) + 3 + 2 + MODEL.length
    const hasRing = widthWith(22) > room
    const showTime = !(hasRing && widthWith(1) > room)
    const fiveGauge = hasRing ? [R.ring(FIVE.percent)] : R.usage(FIVE.percent, FIVE.timePercent, 22, ms)
    const parts = [
      { text: working ? SPIN[Math.floor(ms / 100) % SPIN.length] : '✻', fg: claude, bold: true },
      gap(1),
      { text: MODEL, fg: ink },
      gap(3),
      ...stat('5h', FIVE, fiveGauge, showTime),
      gap(3),
      ...stat('wk', WEEK, [R.ring(WEEK.percent)], showTime),
    ]
    writeParts(screen, 2 + room - partsWidth(parts), y, parts)
  }

  Pet.claudeScreen = ({ cols, pet, petX, working, ms, stream }) => {
    const petRows = pet.length
    const petTop = 5 + CLAUDE_PAD_ROWS
    const band = petTop + petRows
    const prompt = band + 2
    const screen = Pet.screen(cols, prompt + 4)

    screen.text(0, 0, '⏺', TOOL_GREEN)
    writeParts(screen, 2, 0, [{ text: 'Read', fg: ink, bold: true }, { text: '(desk-pet/hooks/pet.tsx)', fg: ink }])
    screen.text(2, 1, '⎿  Read 64 lines', dim)
    screen.text(0, 3, '⏺', ink)
    screen.text(2, 3, clip('The pet sits above the ribbon now and follows the turn.', cols - 3), ink)

    screen.paste(petX, petTop, pet)

    screen.text(0, band + 1, SPARKLE, blue)
    contextRow(screen, cols - 1, band, stream)

    screen.text(0, prompt, '─'.repeat(cols), RULE)
    screen.text(0, prompt + 1, '>', ink)
    screen.put(2, prompt + 1, ' ', null, ink)
    screen.text(0, prompt + 2, '─'.repeat(cols), RULE)
    claudeFooter(screen, prompt + 3, cols, working, ms)

    return { screen, petBox: { x: petX, y: petTop, cols: pet[0]?.length ?? 0, rows: petRows } }
  }

  Pet.opencodeScreen = ({ cols, pet, ms, stream, backdrop }) => {
    const panel = Pet.mix(backdrop, '#FFFFFF', 0.05)
    const petRows = pet.length
    const petCols = pet[0]?.length ?? 0
    const [left, end] = [2, cols - 2]
    const petTop = 4 + OPENCODE_PAD_ROWS
    const petX = Math.max(left, end - petCols)
    const contextTop = petTop + petRows
    const promptTop = contextTop + 3
    const footerTop = promptTop + 4
    const screen = Pet.screen(cols, footerTop + 1)
    const box = (y, parts = []) => {
      screen.shade(left, y, end - left, panel)
      screen.text(left, y, '┃', blue, { bg: panel })
      writeParts(screen, left + 2, y, parts.map(part => ({ ...part, bg: panel })))
    }

    box(0, [{ text: clip('move the pet above the prompt', end - left - 3), fg: ink }])
    screen.text(left + 2, 2, '→ Read src/above.tsx', dim)
    screen.text(left + 2, 3, clip('The pet sits above the context row now, at the right.', end - left - 2), ink)

    screen.paste(petX, petTop, pet)
    contextRow(screen, end, contextTop, stream)

    box(promptTop)
    box(promptTop + 1, [{ text: clip('Ask anything… "name the pet"', end - left - 3), fg: dim }])
    box(promptTop + 2)
    box(promptTop + 3, [{ text: 'Build', fg: blue, bold: true }, gap(1), { text: MODEL, fg: ink }, gap(1), { text: 'Anthropic', fg: dim }])

    // The statusline's footerLayout: the 5h bar becomes a ring, then the times go.
    const room = end - left
    const layoutWidth = (full, showTime) => statWidth('5h', full ? 22 : 1, FIVE, showTime) + 3 + statWidth('wk', 1, WEEK, showTime)
    const narrow = layoutWidth(true, true) > room
    const showTime = !(narrow && layoutWidth(false, true) > room)
    const parts = [
      ...stat('5h', FIVE, narrow ? [R.ring(FIVE.percent)] : R.usage(FIVE.percent, FIVE.timePercent, 22, ms), showTime),
      gap(3),
      ...stat('wk', WEEK, [R.ring(WEEK.percent)], showTime),
    ]
    writeParts(screen, end - partsWidth(parts), footerTop, parts)

    return { screen, petBox: { x: petX, y: petTop, cols: petCols, rows: petRows } }
  }
})()
