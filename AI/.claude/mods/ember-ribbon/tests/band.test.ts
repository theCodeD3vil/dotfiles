import { expect, test } from 'claude-code/testing'

const band = (isWorking: boolean) =>
  ({
    plugin: 'ember-ribbon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
  }) as never

test('the token stream is drawn whether or not Claude works', async ($, on) => {
  // Stands for what plugins beneath draw (plan-progress's bars); the band keeps it.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'beneath' }))

  const busy = await $.ui.mount(band(true))
  expect(await busy.find({ key: 'stream' })).toBeDefined()
  expect(await busy.find({ text: /tok\/s/ })).toBeDefined()
  expect(await busy.find({ text: 'beneath' })).toBeDefined()
  await busy.unmount()

  const idle = await $.ui.mount(band(false))
  expect(await idle.find({ key: 'stream' })).toBeDefined()
  expect(await idle.find({ key: 'fill' })).toBeDefined()
  expect(await idle.find({ key: 'enhance' })).toBeDefined()
})
