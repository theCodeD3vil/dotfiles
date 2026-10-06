const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { Terminal } = require("/private/tmp/opencode-ember-footer-smoke/node_modules/@xterm/headless")

async function main() {
  const capture = process.argv[2]
  if (!capture) throw new Error("Pass the private ANSI capture path")
  const metadata = JSON.parse(fs.readFileSync(capture.replace(/\.ansi$/, ".json"), "utf8"))
  assert.equal(metadata.childWasRunning, true, "The installed TUI stayed running until capture")
  const terminal = new Terminal({ cols: metadata.columns, rows: metadata.rows, allowProposedApi: true })
  await new Promise(resolve => terminal.write(fs.readFileSync(capture), resolve))
  const buffer = terminal.buffer.active
  const lines = Array.from({ length: metadata.rows }, (_, row) => buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "")
  const row = lines.findIndex(line => line.includes("5h") && line.includes("wk"))
  const safe = { columns: metadata.columns, bytes: metadata.bytes, queriesAnswered: metadata.queriesAnswered, footerFound: row !== -1 }
  if (row === -1) {
    safe.pluginError = /plugin.{0,80}(error|failed)|error.{0,80}plugin/i.test(lines.join("\n"))
    console.log(JSON.stringify(safe))
    throw new Error("The installed OpenCode TUI did not draw the Ember footer")
  }
  const line = buffer.getLine(buffer.viewportY + row)
  const footerText = lines[row].trim()
  const indexOf = text => cells.findIndex((cell, column) => Array.from(text).every((glyph, offset) => cells[column + offset]?.glyph === glyph))
  const cells = Array.from({ length: metadata.columns }, (_, column) => {
    const cell = line.getCell(column)
    return { column, glyph: cell.getChars(), foreground: cell.isFgRGB() ? `#${cell.getFgColor().toString(16).padStart(6, "0").toUpperCase()}` : null, bold: !!cell.isBold(), defaultBackground: cell.isBgDefault() }
  })
  assert.equal(cells[indexOf("5h")].foreground, "#7C776D", "5h label colour")
  assert.equal(cells[indexOf("wk")].foreground, "#7C776D", "wk label colour")
  assert.ok(!cells.some(cell => ["·", "✢", "✳", "✶", "✻", "✽"].includes(cell.glyph) && cell.foreground === "#D97757"), "No model spinner")
  assert.ok(!cells.some(cell => cell.foreground === "#E9E6DC" && cell.glyph.trim()), "No model label")
  const isRaster = cell => cell.glyph.codePointAt(0) === 0x2590 || cell.glyph.codePointAt(0) >= 0x2800 && cell.glyph.codePointAt(0) <= 0x28ff
  const gauge = cells.filter(cell => isRaster(cell) || cell.glyph.codePointAt(0) >= 0xf0000)
  assert.ok(gauge.length >= 2, "Both gauges present")
  assert.ok(gauge.every(cell => cell.defaultBackground), "Gauge background is terminal default")
  assert.ok(!/tok\/s|\$\d+\.\d+/.test(footerText), "Previous context/cost statusline absent")
  assert.ok(!/statusline.{0,80}(error|failed)|(?:error|failed).{0,80}statusline/i.test(lines.join("\n")), "No visible statusline plugin errors")
  safe.footer = footerText
  safe.row = row
  safe.gaugeCells = gauge.length
  safe.rasterCells = cells.filter(isRaster).length
  if (safe.rasterCells) assert.equal(safe.rasterCells, 22, "The wide usage raster is exactly 22 cells")
  safe.footerColumnStart = indexOf("5h")
  safe.footerColumnEnd = cells.findLast(cell => cell.glyph.trim())?.column
  const promptRow = lines.findIndex(line => line.includes("Ask anything"))
  if (promptRow !== -1) {
    safe.promptColumnStart = lines[promptRow].indexOf("┃")
    safe.promptColumnEnd = lines[promptRow].lastIndexOf("┃")
  }
  safe.paletteVerified = true
  safe.defaultBackgroundVerified = true
  safe.genericPluginFailureNotice = /plugins?\s+failed/i.test(lines.join("\n"))
  const evidence = path.join(path.dirname(capture), `verified-${metadata.columns}.json`)
  fs.writeFileSync(evidence, JSON.stringify({ ...safe, cells }, null, 2) + "\n", { mode: 0o600 })
  fs.chmodSync(evidence, 0o600)
  console.log(JSON.stringify(safe))
  terminal.dispose()
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
