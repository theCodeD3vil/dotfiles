/** @jsxImportSource @opentui/solid */
/** Capture cell-level previews for the quota gauges and Scanner footer, in each stage colour. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RGBA, type CapturedFrame } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin'
import { scannerWidth, SCANNER_GAP } from '../src/scanner'
import { footerLayout } from '../src/footer'

Bun.plugin(createSolidTransformPlugin({ moduleName: '@opentui/solid' }))
const { FooterView } = await import('../src/view.tsx')

const directory = resolve(process.argv[2] ?? '/private/tmp/opencode-ember-footer-preview')
const now = Date.parse('2026-10-05T12:00:00.000Z')
const base = {
  fiveLimit: { percentUsed: 41, resetsAt: new Date(now + (134 * 60 + 30) * 1000).toISOString() },
  weekLimit: { percentUsed: 18, resetsAt: new Date(now + ((3 * 24 + 5) * 3600 + 30) * 1000).toISOString() },
  now,
  tick: 0,
}

function cells(frame: CapturedFrame) {
  const color = (value: RGBA) => ({ intent: value.intent, rgba: value.toInts(), slot: value.slot })
  return frame.lines.map(line => line.spans.flatMap(span => Array.from(span.text).map(glyph => ({
    glyph, fg: color(span.fg), bg: color(span.bg), attributes: span.attributes,
  }))))
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const previews = []
for (const [name, columns, tick, mode, working, stage] of [
  ['Waiting, head part way across, full gauge', 80, 14, 'full', true, 'waiting'],
  ['Thinking, on the way back', 80, 30, 'full', true, 'thinking'],
  ['Tool call', 80, 14, 'full', true, 'tool'],
  ['Writing', 80, 14, 'full', true, 'writing'],
  ['Approval', 80, 14, 'full', true, 'approval'],
  ['Compacting', 80, 14, 'full', true, 'compacting'],
  ['Inactive (blank scanner area)', 80, 0, 'full', false, 'waiting'],
  ['Compact bar, rings with countdowns', 51, 3, 'compact', true, 'thinking'],
  ['Compact, rings without countdowns', 30, 0, 'compact', true, 'tool'],
] as const) {
  const candidate = await testRender(() => (
    <box width={columns} flexDirection="row">
      <FooterView
        frame={footerLayout({ ...base, columns: columns - scannerWidth(mode) - SCANNER_GAP, tick })}
        animationTick={tick}
        working={working}
        mode={mode}
        stage={stage}
      />
    </box>
  ), { width: columns, height: 3 })
  try {
    await candidate.renderOnce()
    const rendered = cells(candidate.captureSpans())
    previews.push({
      name, columns, tick, mode, working, stage,
      text: candidate.captureCharFrame().trimEnd(),
      sha256: digest(rendered),
      cells: rendered,
    })
  } finally {
    candidate.renderer.destroy()
  }
}

mkdirSync(directory, { recursive: true })
writeFileSync(resolve(directory, 'preview.json'), JSON.stringify({
  verification: 'OpenCode native cell capture for the far-left scanner and right-aligned usage footer.',
  previews,
}, null, 2) + '\n')
writeFileSync(resolve(directory, 'preview.md'), [
  '# Scanner footer previews', '',
  'Scanner replaces the native footer: the strip sits at the far left, in the colour of the conversation stage, and the quota stats at the right of the supplied composer width.', '',
  ...previews.flatMap(preview => [
    `## ${preview.name} (${preview.columns} columns, stage ${preview.stage})`, '', '```text', preview.text, '```', '',
    `Cell-buffer SHA-256: \`${preview.sha256}\``, '',
  ]),
].join('\n'))
console.info(`Wrote native footer previews: ${resolve(directory, 'preview.md')}`)
console.info(`Wrote cell and color evidence: ${resolve(directory, 'preview.json')}`)
