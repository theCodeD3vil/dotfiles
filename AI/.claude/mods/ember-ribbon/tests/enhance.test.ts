import { expect, test } from 'claude-code/testing'

// $.model.complete is no event, so the kit can't fake Haiku's reply: this covers the trigger.
test('only a composer prompt ending in ::e is held back', async ($, on) => {
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('prompt.fill', (_$, e) => ({ isFilled: true, text: e.text }) as never)

  const plain = await $.prompt.submit({ text: 'fix the failing test', wait: false, origin: { kind: 'composer' } })
  expect(plain.text).toBe('fix the failing test')

  const mid = await $.prompt.submit({ text: 'what does ::e mean here', wait: false, origin: { kind: 'composer' } })
  expect(mid.text).toBe('what does ::e mean here')

  const short = await $.prompt.submit({ text: 'fix ::e', wait: false, origin: { kind: 'composer' } })
  expect(short.drop).toBe('Too short to enhance')
})

test('the band shows the enhance button before any context reading', async $ => {
  const band = await $.ui.mount({
    plugin: 'ember-ribbon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} } as never,
  })
  expect(await band.find({ key: 'enhance' })).toBeDefined()
})
