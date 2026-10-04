import type { Register } from 'claude-code'

// Session panes.
//  - /files:  files Claude edited this session, with lines added and removed.
//  - /recalled: the ICM memories recalled for the last prompt.

type Memory = { topic: string; summary: string }

// One row of `icm recall` output: score,id,topic,importance,weight,"summary"
function parseRecall(stdout: string): Memory[] {
  return stdout
    .split('\n')
    .map(line => line.match(/^\s+[\d.]+,\w+,([^,]+),\w+,[\d.]+,"?(.*?)"?$/))
    .filter(m => m !== null)
    .map(m => ({ topic: m[1] ?? '', summary: m[2] ?? '' }))
}

export const register: Register = on => {
  const touched = new Set<string>()
  let recalled: Memory[] = []

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'files', description: 'Show the files Claude edited this session' })
    await $.command.register({ name: 'recalled', description: 'Show the ICM memories recalled for the last prompt' })
    return next(e)
  })

  on('command.run', { command: 'files' }, async $ => {
    await $.ui.open({ id: 'files', title: 'Edited this session' })
    return { text: 'Opened the files pane.' }
  })

  on('command.run', { command: 'recalled' }, async $ => {
    await $.ui.open({ id: 'recall', title: 'Recalled for this prompt' })
    return { text: 'Opened the recall pane.' }
  })

  // Remember every file an Edit or Write actually changed.
  on('tool.call', async ($, e, next) => {
    const done = await next(e)
    const path = (e as unknown as { file_path?: unknown }).file_path
    if ((e.tool === 'Edit' || e.tool === 'Write') && typeof path === 'string' && done.deny === undefined && !done.isError) {
      touched.add(path)
      $.ui.invalidate('ui.render')
    }
    return done
  })

  // Look up memories in the background so the prompt is not held up.
  on('prompt.submit', ($, e, next) => {
    void $.process.run(['icm', 'recall', e.text, '--limit', '3']).then(({ stdout }) => {
      recalled = parseRecall(stdout)
      $.ui.invalidate('ui.render')
    }, () => {})
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'files' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (touched.size === 0) return <Text dimColor>No files edited yet.</Text>

    const rows = await Promise.all(
      [...touched].map(async path => {
        const dir = path.slice(0, path.lastIndexOf('/')) || '/'
        const { stdout } = await $.process.run(['git', 'diff', '--numstat', '--', path], { cwd: dir })
        const [added, removed] = stdout.trim().split('\t')
        return { name: path.split('/').pop() ?? path, dir, added, removed }
      }),
    )

    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Box gap={1}>
            <Text>{row.name}</Text>
            {row.added === undefined || row.added === '' ? (
              <Text color="#7FA9D6">new</Text>
            ) : (
              <Box gap={1}>
                <Text color="#A3BA82">+{row.added}</Text>
                <Text color="#E2766A">−{row.removed}</Text>
              </Box>
            )}
            <Text dimColor wrap="truncate-start">{row.dir.replace(/^\/Users\/[^/]+/, '~')}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: 'recall' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (recalled.length === 0) return <Text dimColor>Nothing recalled for the last prompt.</Text>
    return (
      <Box flexDirection="column" gap={1}>
        {recalled.map(memory => (
          <Box flexDirection="column">
            <Text color="#D97757">{memory.topic}</Text>
            <Text wrap="wrap">{memory.summary}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
