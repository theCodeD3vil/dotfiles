import { describe, expect, test } from 'bun:test'
import { conversationStage, type StageInput } from '../src/stage'

// Messages shaped like OpenCode 2.0.22's session messages, with only the fields the stage reads.
const user = { type: 'user' }
const assistant = (content: unknown[], completed?: number) => ({ type: 'assistant', time: { created: 1, completed }, content })
const reasoning = (completed?: number) => ({ type: 'reasoning', text: 'hmm', time: { created: 1, completed } })
const tool = (status: string) => ({ type: 'tool', id: 't1', name: 'read', state: { status }, time: { created: 1 } })
const text = { type: 'text', text: 'Here is' }

const stage = (messages: unknown[], permissions = 0) => conversationStage({ messages, permissions } as StageInput)

describe('conversation stage', () => {
  test('waits when nothing has been said or the model has not started its reply', () => {
    expect(stage([])).toBe('waiting')
    expect(stage([user])).toBe('waiting')
    expect(stage([user, assistant([])])).toBe('waiting')
  })

  test('is thinking while the latest part is reasoning that has not completed', () => {
    expect(stage([user, assistant([reasoning()])])).toBe('thinking')
    expect(stage([user, assistant([text, reasoning()])])).toBe('thinking')
  })

  test('waits again once the reasoning has completed and nothing follows', () => {
    expect(stage([user, assistant([reasoning(5)])])).toBe('waiting')
  })

  test('is in a tool call while the latest part is a tool that is streaming or running', () => {
    expect(stage([user, assistant([reasoning(5), tool('streaming')])])).toBe('tool')
    expect(stage([user, assistant([tool('running')])])).toBe('tool')
  })

  test('waits for the model again once a tool has completed or failed', () => {
    expect(stage([user, assistant([tool('completed')])])).toBe('waiting')
    expect(stage([user, assistant([tool('error')])])).toBe('waiting')
  })

  test('is writing while the latest part is reply text', () => {
    expect(stage([user, assistant([text])])).toBe('writing')
    expect(stage([user, assistant([reasoning(5), tool('completed'), text])])).toBe('writing')
  })

  test('follows the latest part, so a tool after text is a tool call', () => {
    expect(stage([user, assistant([text, tool('running')])])).toBe('tool')
    expect(stage([user, assistant([tool('completed'), reasoning()])])).toBe('thinking')
  })

  test('waits when the latest reply is already complete, such as between two model steps', () => {
    expect(stage([user, assistant([text], 9)])).toBe('waiting')
    expect(stage([user, assistant([tool('running')], 9)])).toBe('waiting')
  })

  test('is compacting while the latest message is a compaction that is running', () => {
    expect(stage([user, { type: 'compaction', status: 'running' }])).toBe('compacting')
    expect(stage([user, { type: 'compaction', status: 'completed' }])).toBe('waiting')
  })

  test('needs approval whenever a permission request is open, whatever else is going on', () => {
    expect(stage([], 1)).toBe('approval')
    expect(stage([user, assistant([reasoning()])], 2)).toBe('approval')
    expect(stage([user, assistant([tool('running')])], 1)).toBe('approval')
    expect(stage([user, { type: 'compaction', status: 'running' }], 1)).toBe('approval')
  })

  test('ignores messages of other kinds at the end', () => {
    expect(stage([user, assistant([text]), { type: 'idle', outcome: 'succeeded' }])).toBe('waiting')
  })
})
