import { expect, mock, test } from 'claude-code/testing'

const HOUR = 3600_000

test('footer shows model, context and both usage windows', async ($, on) => {
  const now = Date.parse('2026-10-04T12:00:00Z')
  mock.clock(on, { now })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: {
    startedAt: now,
    context: { window: 200_000, tokens: 124_000, percent: 62 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 41, resetsAt: new Date(now + 2 * HOUR + 14 * 60_000 + 30_000).toISOString() },
      { kind: 'seven_day', percentUsed: 18, resetsAt: new Date(now + 3 * 24 * HOUR + 5 * HOUR + 30_000).toISOString() },
    ],
  } }))
  const ui = await $.ui.mount({
    plugin: 'ember-ribbon',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })

  expect(await ui.find({ text: 'Opus 5.5' })).toBeDefined()
  expect(await ui.find({ text: '41%' })).toBeDefined()
  expect(await ui.find({ text: '2h14m' })).toBeDefined()
  expect(await ui.find({ text: '18%' })).toBeDefined()
  expect(await ui.find({ text: '3d05h' })).toBeDefined()
  expect(await ui.find({ text: '? for shortcuts' })).toBeUndefined()

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as never)
  const band = await $.ui.mount({
    plugin: 'ember-ribbon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
  })
  expect(await band.find({ text: /Hot/ })).toBeUndefined()
  expect(await band.find({ text: '124k' })).toBeDefined()
  expect(await band.find({ text: / \/ 200k/ })).toBeDefined()
  expect(await band.find({ key: 'enhance' })).toBeDefined()
})
