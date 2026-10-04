import { expect, test } from 'claude-code/testing'

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

const BAND = {
  plugin: 'ember-ribbon',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as never

// A prompt box, Haiku and the effects an enhancement touches, faked.
function fakeSession(on: Parameters<Extract<Parameters<typeof test>[1], Function>>[1]) {
  const box = { text: '' }
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  on('prompt.fill', (_$, e) => {
    box.text = e.text
    return { isFilled: true, text: e.text } as never
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Fix the `KeyError` in `create_user`.' } }) as never)
  on('session.messages', () => ({ value: [] }) as never)
  on('clock.sleep', () => ({ value: undefined }) as never)
  on('audio.play', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  return box
}

test('after ::e the button undoes the enhancement, once', async ($, on) => {
  const box = fakeSession(on)
  await $.prompt.submit({ text: 'fix that error ::e', wait: false, origin: { kind: 'composer' } })
  expect(box.text).toBe('Fix the `KeyError` in `create_user`.')

  const band = await $.ui.mount(BAND)
  await band.press({ key: 'enhance' })
  expect(box.text).toBe('fix that error')

  // The undo is spent: the next press enhances again.
  await band.press({ key: 'enhance' })
  expect(box.text).toBe('Fix the `KeyError` in `create_user`.')
})

test('sending the enhanced text drops the undo', async ($, on) => {
  const box = fakeSession(on)
  await $.prompt.submit({ text: 'fix that error ::e', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: box.text, wait: false, origin: { kind: 'composer' } })

  // Pressing now enhances again rather than putting the old draft back.
  box.text = 'another rough draft'
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'enhance' })
  expect(box.text).toBe('Fix the `KeyError` in `create_user`.')
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
