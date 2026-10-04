import { expect, mock, test } from 'claude-code/testing'

test('the receipt keeps the stage a plugin beneath drew beside the line (clawd)', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-04T12:00:00Z') })
  on('session.usage', () => ({ value: { cost: { usd: 0.08 }, rateLimits: [] } }) as never)
  on('turn.complete', () => ({ text: 'done' }))
  // Stands for clawd: Claude Code's line with a 2-row Raster stage beside it.
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const t = $.ui.resolve(e)
    if (!('Raster' in t)) throw new Error('the terminal table has Raster')
    const { Box, Raster, Text } = t
    // 14 × 2 blank cells: a space on the terminal's default colours
    const words = new Uint32Array(14 * 2 * 3).map((_, i) => (i % 3 === 0 ? 32 : 0x01000000))
    const blank = new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }
    return Box({
      flexDirection: 'row',
      children: [Text({ children: 'Baked for 12s' }), Box({ marginLeft: 2, children: Raster({ key: 'stage', columns: 14, rows: 2, cells: blank.toBase64() }) })],
    })
  })

  await $.turn.complete({ answer: 'done', durationMs: 12_000, isAborted: false, turnId: 't1', reason: 'answer', usage: { output_tokens: 1200 } } as never)
  const line = await $.ui.mount({
    plugin: 'turn-insights',
    surface: 'terminal',
    component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 12_000 } as never,
  })
  expect(await line.find({ text: /Baked for 12s · done .* · 0 tools · 1\.2k out/ })).toBeDefined()
  expect(await line.find({ key: 'stage' })).toBeDefined()
})
