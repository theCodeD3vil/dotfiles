/**
 * Which stage of the conversation the session is in, read from its messages.
 * The footer spinner takes its animation and colour from this, so a glance says whether
 * the model is thinking, running a tool, writing, or waiting on you.
 */

export type ConversationStage = 'waiting' | 'thinking' | 'tool' | 'writing' | 'approval' | 'compacting'

// The few fields of OpenCode's session messages that the stage depends on.
type StagePart = { type: string; time?: { completed?: number }; state?: { status?: string } }
type StageMessage = { type: string; status?: string; time?: { completed?: number }; content?: readonly StagePart[] }

export type StageInput = {
  /** The session's messages, oldest first. */
  messages: ReadonlyArray<{ type: string }>
  /** Permission requests the session is waiting on you to answer. */
  permissions: number
}

/**
 * The stage of a running session:
 * - approval: a permission request is open and nothing moves until you answer;
 * - compacting: the history is being summarised;
 * - thinking: the latest part of the reply is reasoning that has not finished;
 * - tool: the latest part is a tool call that is still streaming or running;
 * - writing: the latest part is reply text;
 * - waiting: anything else, such as a prompt just sent, a tool that returned and the
 *   model's next step, or a reply that has not started.
 */
export function conversationStage({ messages, permissions }: StageInput): ConversationStage {
  if (permissions > 0) return 'approval'
  const last = messages[messages.length - 1] as StageMessage | undefined
  if (!last) return 'waiting'
  if (last.type === 'compaction') return last.status === 'running' ? 'compacting' : 'waiting'
  if (last.type !== 'assistant' || last.time?.completed !== undefined) return 'waiting'
  const part = last.content?.[last.content.length - 1]
  if (!part) return 'waiting'
  if (part.type === 'reasoning') return part.time?.completed === undefined ? 'thinking' : 'waiting'
  if (part.type === 'tool') return part.state?.status === 'streaming' || part.state?.status === 'running' ? 'tool' : 'waiting'
  return part.type === 'text' ? 'writing' : 'waiting'
}
