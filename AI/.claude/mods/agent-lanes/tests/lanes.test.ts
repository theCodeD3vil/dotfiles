import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'agent-lanes',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as never

test('a subagent streaming and calling tools gets a lane, which says done when it finishes and leaves 30 s later', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'Explore the repo', type: 'Explore', status: 'running' }] }) as never)
  on('tool.call', () => ({ result: '3 matches' }) as never)
  on('turn.complete', () => ({ text: 'done' }))
  // Stands for the subagent's model: one streamed piece.
  on('turn.step', async function* () {
    yield { kind: 'text', index: 0, text: 'Looking through hooks/ for the band code.' }
    return { turnId: 'a1-run', index: 0, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null }
  } as never)
  // Stands for what plugins beneath draw (plan-progress's bars); the lanes keep it.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'beneath' }))

  for await (const _ of $.turn.step({ turnId: 'a1-run', index: 0, model: 'claude-haiku-4-5', messageCount: 1, agentId: 'a1' } as never)) void _
  await $.tool.call({ tool: 'Grep', input: { pattern: 'AbovePrompt' }, agentId: 'a1' } as never)

  const busy = await $.ui.mount(BAND)
  expect(await busy.find({ key: 'trace-a1' })).toBeDefined()
  expect(await busy.find({ text: 'Grep' })).toBeDefined()
  expect(await busy.find({ text: 'beneath' })).toBeDefined()
  await busy.unmount()

  await $.turn.complete({ answer: 'ok', durationMs: 4_000, isAborted: false, turnId: 'a1-run', reason: 'answer', agentId: 'a1' } as never)
  const finished = await $.ui.mount(BAND)
  expect(await finished.find({ key: 'trace-a1' })).toBeDefined()
  expect(await finished.find({ text: '✓ done' })).toBeDefined()
  await finished.unmount()

  await clock.advance(31_000)
  const after = await $.ui.mount(BAND)
  expect(await after.find({ key: 'trace-a1' })).toBeUndefined()
})

test('a background subagent that sends no events still gets a lane from the roll call, marked failed when killed', async ($, on) => {
  const clock = mock.clock(on)
  const agents = [{ id: 'bg1', description: 'Run the pings', type: 'general-purpose', status: 'running' }]
  on('agent.list', () => ({ value: agents }) as never)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'beneath' }))

  // The first draw starts the timer; a second later the roll call finds the subagent.
  await (await $.ui.mount(BAND)).unmount()
  await clock.advance(1_000)
  const running = await $.ui.mount(BAND)
  expect(await running.find({ key: 'trace-bg1' })).toBeDefined()
  expect(await running.find({ text: 'run-the-' })).toBeDefined()
  await running.unmount()

  agents[0]!.status = 'killed'
  await clock.advance(1_000)
  const stopped = await $.ui.mount(BAND)
  expect(await stopped.find({ text: '✕ failed' })).toBeDefined()
  await stopped.unmount()

  await clock.advance(30_000)
  const gone = await $.ui.mount(BAND)
  expect(await gone.find({ key: 'trace-bg1' })).toBeUndefined()

  // A subagent paused on a permission prompt is still active, not finished.
  agents.push({ id: 'w1', description: 'Edit the config', type: 'general-purpose', status: 'waiting' })
  await clock.advance(1_000)
  const waiting = await $.ui.mount(BAND)
  expect(await waiting.find({ key: 'trace-w1' })).toBeDefined()
  expect(await waiting.find({ text: '✓ done' })).toBeUndefined()
})
