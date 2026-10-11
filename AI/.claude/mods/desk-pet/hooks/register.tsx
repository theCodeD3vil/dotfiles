import type { EngineInterface, Register } from 'claude-code'

import { COLUMNS, ROWS, type PetProps } from './pet'
import type { PetState } from './wick'

// Wick, 12 × 4 cells of octants, sits at the right between the Ember ribbon's padding and its
// context row, facing left as the playground's right placement has it, and follows the main loop: waiting, thinking, a tool, writing, an approval, compacting, done.
// Listed after ember-ribbon in CLAUDE_CODE_PLUGIN_DIRS, it draws under what plugins beneath draw.
// The pet animates itself on the drawing thread (./pet.tsx); this module only tells it the
// state, redrawing the band when the state changes.

export { COLUMNS, FACING, ROWS } from './pet'
export const KEY = 'pet'

// What a streamed piece of the main loop's reply says it is doing.
const STEP_STATES: Partial<Record<string, PetState>> = { thinking: 'thinking', text: 'writing', tool: 'tool', input: 'tool' }

let state: PetState = 'idle'
let isTurnRunning = false
let runningTools = 0

function become(engine: EngineInterface, next: PetState) {
  if (next === state) return
  state = next
  engine.ui.invalidate('ui.render')
}
const settle = (engine: EngineInterface) => become(engine, runningTools > 0 ? 'tool' : isTurnRunning ? 'waiting' : 'idle')

export const register: Register = on => {
  on('turn.start', (engine, event, next) => {
    isTurnRunning = true
    runningTools = 0
    become(engine, 'waiting')
    return next(event)
  })

  // Passes every piece on untouched.
  on('turn.step', async function* (engine, event, next) {
    for await (const chunk of next(event)) {
      const step = event.agentId ? undefined : STEP_STATES[chunk.kind]
      if (step) become(engine, step)
      yield chunk
    }
  })

  // The main loop's calls make it work; any call that needed an answer from you ends the approval.
  on('tool.call', async (engine, event, next) => {
    const isMain = event.agentId === undefined
    if (isMain) {
      runningTools++
      become(engine, 'tool')
    }
    try {
      return await next(event)
    } finally {
      if (isMain) runningTools--
      if (isMain || state === 'approval') settle(engine)
    }
  })

  // Raised as the permission dialog opens, a subagent's included: either way it waits on you.
  on('classic.PermissionRequest', (engine, event, next) => {
    become(engine, 'approval')
    return next(event)
  })

  on('session.compact', async (engine, event, next) => {
    if (event.agentId !== undefined || event.trigger === 'precompute') return next(event)
    become(engine, 'compacting')
    try {
      return await next(event)
    } finally {
      settle(engine)
    }
  })

  // A finished answer is celebrated; the pet goes idle by itself DONE_SECONDS later.
  on('turn.complete', (engine, event, next) => {
    if (event.agentId !== undefined) return next(event)
    isTurnRunning = false
    runningTools = 0
    become(engine, event.reason === 'answer' ? 'done' : 'idle')
    return next(event)
  })

  on('ui.render', { component: 'AbovePrompt' }, async (engine, event, next) => {
    const below = await next(event)
    if (event.surface !== 'terminal' || event.props.hasSurvey) return below
    const { Box, Client } = engine.ui.resolve(event)
    const props: PetProps = { state }
    return (
      <Box flexDirection="column">
        {below}
        <Box flexDirection="row" justifyContent="flex-end">
          <Client key={KEY} module="./pet.tsx" props={props} width={COLUMNS} height={ROWS} />
        </Box>
      </Box>
    )
  })
}
