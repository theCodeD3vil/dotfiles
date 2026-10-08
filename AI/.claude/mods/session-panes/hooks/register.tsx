import type { EngineInterface, Register } from 'claude-code'

// Session panes.
//  - /files:  files Claude edited this session, with lines added and removed.
//  - /recalled: the ICM memories recalled for the last prompt.

type Memory = { topic: string; summary: string }

// Each pane: the slash command that opens it and what that command says. `id` is the Pane
// component's requestId, drawn by the ui.render hooks below.
const PANES = [
  { command: 'files', id: 'files', title: 'Edited this session', description: 'Show the files Claude edited this session', opened: 'Opened the files pane.' },
  { command: 'recalled', id: 'recall', title: 'Recalled for this prompt', description: 'Show the ICM memories recalled for the last prompt', opened: 'Opened the recall pane.' },
] as const

const NEW_FILE_COLOR = '#7FA9D6'
const ADDED_COLOR = '#A3BA82'
const REMOVED_COLOR = '#E2766A'
const TOPIC_COLOR = '#D97757'
const HOME_FOLDER = /^\/Users\/[^/]+/
const RECALL_LIMIT = '3'

// One row of `icm recall` output: score,id,topic,importance,weight,"summary"
function parseRecall(stdout: string): Memory[] {
  return stdout
    .split('\n')
    .map(line => line.match(/^\s+[\d.]+,\w+,([^,]+),\w+,[\d.]+,"?(.*?)"?$/))
    .filter(match => match !== null)
    .map(match => ({ topic: match[1] ?? '', summary: match[2] ?? '' }))
}

// Lines added and removed in `path` per git; both are empty for a file git does not track yet.
async function readDiffStat(engine: EngineInterface, path: string) {
  const directory = path.slice(0, path.lastIndexOf('/')) || '/'
  const { stdout } = await engine.process.run(['git', 'diff', '--numstat', '--', path], { cwd: directory })
  const [added, removed] = stdout.trim().split('\t')
  return { name: path.split('/').pop() ?? path, directory, added, removed }
}

export const register: Register = on => {
  const touchedPaths = new Set<string>()
  let recalled: Memory[] = []

  on('session.start', async (engine, event, next) => {
    for (const { command, description } of PANES) await engine.command.register({ name: command, description })
    return next(event)
  })

  for (const { command, id, title, opened } of PANES) {
    on('command.run', { command }, async engine => {
      await engine.ui.open({ id, title })
      return { text: opened }
    })
  }

  // Remember every file an Edit or Write actually changed.
  on('tool.call', async (engine, event, next) => {
    const result = await next(event)
    const path = (event as unknown as { file_path?: unknown }).file_path
    const isEdit = event.tool === 'Edit' || event.tool === 'Write'
    const succeeded = result.deny === undefined && !result.isError
    if (isEdit && typeof path === 'string' && succeeded) {
      touchedPaths.add(path)
      engine.ui.invalidate('ui.render')
    }
    return result
  })

  // Look up memories in the background so the prompt is not held up.
  on('prompt.submit', (engine, event, next) => {
    void engine.process.run(['icm', 'recall', event.text, '--limit', RECALL_LIMIT]).then(({ stdout }) => {
      recalled = parseRecall(stdout)
      engine.ui.invalidate('ui.render')
    }, () => {})
    return next(event)
  })

  on('ui.render', { component: 'Pane', requestId: 'files' }, async (engine, event) => {
    const { Box, Text } = engine.ui.resolve(event)
    if (touchedPaths.size === 0) return <Text dimColor>No files edited yet.</Text>

    const rows = await Promise.all([...touchedPaths].map(path => readDiffStat(engine, path)))

    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Box gap={1}>
            <Text>{row.name}</Text>
            {row.added === undefined || row.added === '' ? (
              <Text color={NEW_FILE_COLOR}>new</Text>
            ) : (
              <Box gap={1}>
                <Text color={ADDED_COLOR}>+{row.added}</Text>
                <Text color={REMOVED_COLOR}>−{row.removed}</Text>
              </Box>
            )}
            <Text dimColor wrap="truncate-start">{row.directory.replace(HOME_FOLDER, '~')}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: 'recall' }, (engine, event) => {
    const { Box, Text } = engine.ui.resolve(event)
    if (recalled.length === 0) return <Text dimColor>Nothing recalled for the last prompt.</Text>
    return (
      <Box flexDirection="column" gap={1}>
        {recalled.map(memory => (
          <Box flexDirection="column">
            <Text color={TOPIC_COLOR}>{memory.topic}</Text>
            <Text wrap="wrap">{memory.summary}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
