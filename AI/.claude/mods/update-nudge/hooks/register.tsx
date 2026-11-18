import type { EngineInterface, Register } from 'claude-code'

// Update nudge. Claude Code's own "Update installed · /restart to apply" line cannot be closed, so its
// updater is off (DISABLE_AUTOUPDATER=1 in settings.json) and this mod updates instead: it runs
// `claude update` every 30 minutes, and once the installed version is newer than the one this session
// runs, it shows the line above the prompt with a × that closes it until the next update.

const CHECK_MS = 30 * 60_000
// `process.run` allows ten minutes at most; an install over a slow line gets all of them.
const UPDATE_TIMEOUT_MS = 10 * 60_000

// Catppuccin Mocha green and red, as in ember-ribbon's colors.ts (a mod cannot import another's files).
const GREEN = '#a6e3a1'
const RED = '#f38ba8'

// What the row says. `key` names it: a dismissal holds until the key changes, which a newer version does.
type Notice = { key: string; failed: boolean }
const FAILED: Notice = { key: 'failed', failed: true }

let notice: Notice | undefined
let dismissedKey = ''
let isChecking = false
let isScheduled = false

const redraw = (engine: EngineInterface) => engine.ui.invalidate('ui.render')

// "2.1.327 (Claude Code)" -> "2.1.327"; empty when there is no version in the text
const versionOf = (text: string) => text.match(/\d+\.\d+\.\d+/)?.[0] ?? ''

// Updates, then compares what is installed (`claude --version` is the newest installed copy) with
// the version this session runs.
async function checkForUpdate(engine: EngineInterface) {
  if (isChecking) return
  isChecking = true
  try {
    const update = await engine.process.run(['claude', 'update'], { timeoutMs: UPDATE_TIMEOUT_MS })
    const installed = versionOf((await engine.process.run(['claude', '--version'])).stdout)
    const running = versionOf((await engine.session.version()).version)
    if (update.exitCode !== 0 || !installed) notice = FAILED
    else notice = installed === running ? undefined : { key: installed, failed: false }
  } catch {
    notice = FAILED
  } finally {
    isChecking = false
  }
  // No notice: the next failure or update is a new event, so a closed one must not hide it.
  if (!notice) dismissedKey = ''
  redraw(engine)
}

// One timer, started from whichever hook runs first: session.start does not run again after
// /reload-plugins, so the render hook offers to start it too.
function ensureChecking(engine: EngineInterface) {
  if (isScheduled) return
  isScheduled = true
  try {
    engine.clock.every(CHECK_MS, () => void checkForUpdate(engine))
    void checkForUpdate(engine)
  } catch {
    isScheduled = false
  }
}

export const register: Register = on => {
  on('session.start', async (engine, event, next) => {
    ensureChecking(engine)
    return next(event)
  })

  on('ui.render', { component: 'AbovePrompt' }, async (engine, event, next) => {
    ensureChecking(engine)
    const shown = notice
    if (event.surface !== 'terminal' || !shown || shown.key === dismissedKey) return next(event)
    const { Box, Button, Text } = engine.ui.resolve(event)
    return (
      <Box gap={1}>
        {shown.failed
          ? <Text color={RED}>✘ Auto-update failed · run claude doctor</Text>
          : <Text color={GREEN}>✔ Update installed · /restart to apply</Text>}
        <Button key="dismiss" label="×" plain dimColor onPress={() => { dismissedKey = shown.key; redraw(engine) }} />
      </Box>
    )
  })
}
