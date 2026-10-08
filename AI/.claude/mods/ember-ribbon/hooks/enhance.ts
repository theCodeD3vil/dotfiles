import type { SessionMessage } from 'claude-code'

// Prompt enhance: press Ctrl+E (or the button), or end a draft with "::e" and press Enter. Haiku
// rewrites the draft using the recent conversation, and the result lands in the box to review.
// Adapted from cc-prompt-enhance-mod by Yigit Budak (MIT).
// This file holds the parts that need no engine: the prompt and the text handling around it.

export const ENHANCE_TRIGGER = /\s*::e\s*$/
export const ENHANCE_MODEL = 'haiku'
export const ENHANCE_MAX_TOKENS = 4096
export const ENHANCE_TIMEOUT_MS = 60_000
export const DONE_TICKS = 30 // the check stays 3s (the clock ticks every 100ms)

const RECENT_MESSAGES = 10
const MESSAGE_CHARS = 2000
const TOOL_TARGET_CHARS = 200
const CONTEXT_CHARS = 12000

export const ENHANCE_SYSTEM_PROMPT = `You rewrite a developer's draft prompt for Claude Code into the prompt they would have written with more time and the whole session in view. You get the recent conversation, then the draft.

- Keep the author's intent, scope and language.
- Resolve vague references ("this", "that file", "the error") to the exact path, symbol, command or error message the conversation points to, in backticks.
- When the conversation shows how to tell the work is done (a test, a command), name it in one sentence.
- Carry over constraints the conversation already settled, such as files to leave alone or a rejected approach.
- Write a multi-part request as a short numbered list in order; keep a single ask to one or two sentences.
- Fix typos. Add nothing the draft or conversation does not support; leave open choices open.
- No filler: no role lines, "think step by step" or emphasis words. A draft that is already specific comes back with only typo fixes.

Output only the enhanced prompt, in the author's voice: no preamble, no quotes, no code fence.`

const truncate = (text: string, max: number) => (text.length > max ? text.slice(0, max) + '…' : text)

// "[user] run the tests\n(tools: Bash python -m pytest)"
function describeMessage(message: SessionMessage) {
  const tools = message.toolUses.map(use => {
    const target = use.input.file_path ?? use.input.command ?? use.input.path
    return typeof target === 'string' ? `${use.tool} ${truncate(target, TOOL_TARGET_CHARS)}` : use.tool
  })
  return `[${message.role}] ${truncate(message.text, MESSAGE_CHARS)}${tools.length ? `\n(tools: ${tools.join('; ')})` : ''}`
}

// The last few messages that said something, one block of text.
export function formatConversation(messages: SessionMessage[]) {
  const text = messages.filter(message => message.text.trim() !== '').slice(-RECENT_MESSAGES).map(describeMessage).join('\n\n')
  return text.length > CONTEXT_CHARS ? '…' + text.slice(-CONTEXT_CHARS) : text
}

export const buildEnhancePrompt = (conversation: string, draft: string) =>
  `<conversation>\n${conversation || '(none yet)'}\n</conversation>\n\n<draft>\n${draft}\n</draft>`

export const stripCodeFence = (text: string) => text.trim().replace(/^```[^\n]*\n([\s\S]*?)\n```$/, '$1').trim()

export const isTooShort = (draft: string) => draft.trim().split(/\s+/).length < 2
