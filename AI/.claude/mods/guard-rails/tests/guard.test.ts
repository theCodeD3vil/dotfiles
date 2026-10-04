import { expect, test } from 'claude-code/testing'

const realpaths: Record<string, string> = {
  '/Users/me/.gitconfig': '/Users/me/.gitconfig',
  '/Users/me/.zshrc': '/Users/me/dotfiles/.zshrc',
}

test('edits to watched config outside ~/dotfiles are denied, stowed ones pass', async ($, on) => {
  on('process.run', (_$, e) => ({ value: { exitCode: 0, stdout: `${realpaths[e.argv[1] ?? ''] ?? ''}\n`, stderr: '', isStdoutTruncated: false } }))
  on('tool.call', () => ({ result: 'edited' }))

  const blocked = await $.tool.call({ tool: 'Edit', file_path: '/Users/me/.gitconfig', old_string: 'a', new_string: 'b' })
  expect(blocked.deny).toContain('not linked into ~/dotfiles')

  const allowed = await $.tool.call({ tool: 'Edit', file_path: '/Users/me/.zshrc', old_string: 'a', new_string: 'b' })
  expect(allowed.deny).toBeUndefined()

  // settings.json asks first; with no "Allow" answer it does not run.
  const settings = await $.tool.call({ tool: 'Edit', file_path: '/Users/me/.claude/settings.json', old_string: 'a', new_string: 'b' })
  expect(settings.deny).toContain('did not allow')

  const unwatched = await $.tool.call({ tool: 'Edit', file_path: '/Users/me/project/a.ts', old_string: 'a', new_string: 'b' })
  expect(unwatched.deny).toBeUndefined()
})
