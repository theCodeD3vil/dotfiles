import path from "node:path"
import { OpenCode } from "@opencode/client"
import { usageRpc } from "../src/rpc"

// Start our own loopback server, privately consume its generated password, and send no model requests.
const repository = path.resolve(import.meta.dirname, "../../../../../..")
const sessionSmoke = Bun.argv.includes("--session-smoke")
const diagnostics = Bun.argv.includes("--diagnostics") || sessionSmoke
const smokeDirectory = "/private/tmp/opencode-ember-footer-smoke"
const directory = diagnostics ? path.join(smokeDirectory, "workspace") : repository
const environment = { ...process.env }
delete environment.OPENCODE_PASSWORD
delete environment.OPENCODE_SERVER_PASSWORD
delete environment.OPENCODE_CONFIG
delete environment.OPENCODE_CONFIG_CONTENT
delete environment.OPENCODE_CONFIG_DIR

const server = Bun.spawn(["opencode", "serve", "--hostname", "127.0.0.1", "--port", "0"], {
  cwd: repository,
  env: environment,
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
})
const deadline = new AbortController()
let phase = "server startup"
let client: ReturnType<typeof OpenCode.make> | undefined
let createdSessionID: string | undefined
let smoke: ReturnType<typeof Bun.spawn> | undefined
let ready!: (value: { url: string; password: string }) => void
let fail!: () => void
const listening = new Promise<{ url: string; password: string }>((resolve, reject) => {
  ready = resolve
  fail = () => reject(new Error("Server startup failed"))
})
const timeout = setTimeout(() => {
  deadline.abort()
  fail()
  smoke?.kill("SIGTERM")
  // Keep the server available until finally has removed our optional empty fixture session.
  if (!createdSessionID) server.kill("SIGTERM")
}, 30_000)

// Drain both streams without printing them: startup output includes the authentication password.
const stdout = (async () => {
  let pending = ""
  let url: string | undefined
  let password: string | undefined
  const decoder = new TextDecoder()
  for await (const chunk of server.stdout) {
    pending += decoder.decode(chunk, { stream: true })
    let end: number
    while ((end = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, end).trim()
      pending = pending.slice(end + 1)
      url = /^server listening on (http:\/\/127\.0\.0\.1:\d+)$/.exec(line)?.[1] ?? url
      password = /^server password (\S+)$/.exec(line)?.[1] ?? password
      if (url && password) ready({ url, password })
    }
    if (pending.length > 8192) pending = pending.slice(-8192)
  }
})().catch(() => fail())
const stderr = (async () => {
  for await (const _chunk of server.stderr) {
    // Server logs can include private paths or provider diagnostics; consume without displaying them.
  }
})().catch(() => {})
void server.exited.then(() => fail())

try {
  const { url, password } = await listening
  client = OpenCode.make({
    baseUrl: url,
    headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` },
  })
  phase = "server version verification"
  const info = await client.server.info({ signal: deadline.signal })
  if (info.version !== "2.0.22") throw new Error("Unexpected server version")
  phase = "plugin registration verification"
  let listed = await client.plugin.list({ location: { directory } }, { signal: deadline.signal })
  const findPlugin = () => listed.data.find((plugin) => plugin.id === "statusline" ||
    (plugin.source.type === "package" && plugin.source.target.includes("/opencode-statusline")))
  let plugin = findPlugin()
  // Plugin.list intentionally returns current inventory without awaiting the asynchronous activation queue.
  while (!plugin && !deadline.signal.aborted) {
    await Bun.sleep(100)
    listed = await client.plugin.list({ location: { directory } }, { signal: deadline.signal })
    plugin = findPlugin()
  }
  if (plugin?.state.status !== "active") {
    console.log(JSON.stringify({ registration: { total: listed.data.length, found: Boolean(plugin), status: plugin?.state.status } }))
    throw new Error("Statusline is not active")
  }
  if (diagnostics) {
    const sanitize = (value: string) => value
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi, "[authentication]")
      .replace(/(?:https?:\/\/)[^\s)]+/g, "[url]")
      .replace(/(?:\/(?:Users|private|opt|tmp|usr|var|Volumes)|[A-Z]:\\)[^\s"'<>]+/g, "[path]")
      .replace(/\b(?:sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+)\b/g, "[credential]")
      .replace(/(?:password|access_token|refresh_token|api_key|secret)\s*[:=]\s*[^,\s}]+/gi, "[credential]")
      .replace(/\s+/g, " ").slice(0, 400)
    const failed = listed.data.flatMap((candidate) => {
      if (candidate.state.status !== "failed") return []
      const source = candidate.source.type === "local" ? candidate.source.path
        : candidate.source.type === "package" ? candidate.source.target : candidate.source.type
      return [{ id: candidate.id, source: path.basename(source), error: sanitize(candidate.state.error) }]
    })
    console.log(JSON.stringify({ statusline: "active", failedPlugins: failed }, null, 2))
  }
  phase = "authenticated subscription usage verification"
  const usage = await client.rpc(usageRpc).get({ providerID: "openai", force: true }, {
    location: { directory },
    signal: deadline.signal,
  })
  console.log(JSON.stringify({
    serverVersion: info.version,
    plugin: { id: plugin.id, status: plugin.state.status },
    usage,
  }, null, 2))
  if (usage.status !== "ok" || !["five_hour", "seven_day"].every((kind) => usage.rateLimits.some((limit) => limit.kind === kind))) {
    throw new Error("Subscription windows unavailable")
  }
  if (sessionSmoke) {
    phase = "empty fixture session creation"
    const session = await client.session.create({ title: "Ember footer verification fixture", location: { directory } }, { signal: deadline.signal })
    createdSessionID = session.id
    phase = "installed session footer smoke"
    smoke = Bun.spawn(["python3", path.join(import.meta.dirname, "tui-smoke.py"), "--columns", "240", "--seconds", "10", "--server", url, "--session", session.id, "--directory", smokeDirectory], {
      cwd: repository,
      env: { ...environment, OPENCODE_PASSWORD: password },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    })
    if (await smoke.exited !== 0) throw new Error("TUI smoke failed")
  }
} catch {
  // Keep SDK exceptions, provider bodies, credentials, and raw startup logs out of terminal output.
  console.error(`Live check failed during ${phase}.`)
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
  deadline.abort()
  if (smoke && smoke.exitCode === null) {
    smoke.kill("SIGTERM")
    await smoke.exited
  }
  if (createdSessionID && client) {
    try {
      await client.session.remove({ sessionID: createdSessionID }, { signal: AbortSignal.timeout(5000) })
      console.log("Empty verification fixture session removed.")
    } catch {
      console.error("Unable to remove the empty verification fixture session.")
      process.exitCode = 1
    }
  }
  server.kill("SIGTERM")
  const forceStop = setTimeout(() => server.kill("SIGKILL"), 5000)
  await server.exited
  clearTimeout(forceStop)
  await Promise.allSettled([stdout, stderr])
}
