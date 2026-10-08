import type { EngineInterface, Register } from 'claude-code'

// Guard rails for this machine.
//  - Dotfiles safety net: config files in the home folder may only be edited through ~/dotfiles.
//    ~/.claude/settings.json stays out of git (apps rewrite it), so editing it asks you instead.

// Home-folder config that should only change through its stowed copy in ~/dotfiles.
const WATCHED_PATHS = ['/.zshrc', '/.gitconfig', '/.config/ghostty/config', '/.config/tmux/tmux.conf']

// Untracked config that Claude may edit, but only after you say yes.
const ASK_FIRST_PATHS = ['/.claude/settings.json']

const endsWithAny = (path: string, suffixes: string[]) => suffixes.some(suffix => path.endsWith(suffix))

// True when `path` is a watched file that does not resolve into ~/dotfiles.
async function isOutsideDotfiles(engine: EngineInterface, path: string) {
  if (!endsWithAny(path, WATCHED_PATHS)) return false
  const { stdout } = await engine.process.run(['realpath', path])
  return !stdout.includes('/dotfiles/')
}

// Why an edit to `path` may not run, or undefined when it may.
async function denialReason(engine: EngineInterface, path: string) {
  if (endsWithAny(path, ASK_FIRST_PATHS)) {
    const answer = await engine.ui.ask(`Let Claude edit ${path}? It is not tracked in ~/dotfiles.`, ['Allow', 'Cancel']).catch(() => 'Cancel')
    return answer === 'Allow' ? undefined : `The user did not allow editing ${path}.`
  }
  if (await isOutsideDotfiles(engine, path)) {
    return `${path} is not linked into ~/dotfiles. Edit the copy in ~/dotfiles instead, or move the file there and stow it first.`
  }
}

// Edit and Write carry the same `file_path`, so one guard serves both.
async function guardEdit<Event extends { file_path: string }, Result>(engine: EngineInterface, event: Event, next: (event: Event) => Promise<Result>) {
  const reason = await denialReason(engine, event.file_path)
  return reason ? { deny: reason } : next(event)
}

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, guardEdit)
  on('tool.call', { tool: 'Write' }, guardEdit)
}
