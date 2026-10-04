import type { EngineInterface, Register } from 'claude-code'

// Guard rails for this machine.
//  - Dotfiles safety net: config files in the home folder may only be edited through ~/dotfiles.
//    ~/.claude/settings.json stays out of git (apps rewrite it), so editing it asks you instead.

// Home-folder config that should only change through its stowed copy in ~/dotfiles.
const WATCHED = ['/.zshrc', '/.gitconfig', '/.config/ghostty/config', '/.config/tmux/tmux.conf']

// Untracked config that Claude may edit, but only after you say yes.
const ASK_FIRST = ['/.claude/settings.json']

// True when `path` is a watched file that does not resolve into ~/dotfiles.
async function isOutsideDotfiles($: EngineInterface, path: string) {
  if (!WATCHED.some(p => path.endsWith(p))) return false
  const { stdout } = await $.process.run(['realpath', path])
  return !stdout.includes('/dotfiles/')
}

const outsideReason = (path: string) =>
  `${path} is not linked into ~/dotfiles. Edit the copy in ~/dotfiles instead, or move the file there and stow it first.`

// Why an edit to `path` may not run, or undefined when it may.
async function editBlocked($: EngineInterface, path: string) {
  if (ASK_FIRST.some(p => path.endsWith(p))) {
    const answer = await $.ui.ask(`Let Claude edit ${path}? It is not tracked in ~/dotfiles.`, ['Allow', 'Cancel']).catch(() => 'Cancel')
    return answer === 'Allow' ? undefined : `The user did not allow editing ${path}.`
  }
  return (await isOutsideDotfiles($, path)) ? outsideReason(path) : undefined
}

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const reason = await editBlocked($, e.file_path)
    return reason ? { deny: reason } : next(e)
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const reason = await editBlocked($, e.file_path)
    return reason ? { deny: reason } : next(e)
  })
}
