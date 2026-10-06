import { describe, expect, test } from "bun:test"
import type { IntegrationDomain } from "@opencode/plugin/promise/integration"
import { usageRpc } from "../src/rpc"
import { createUsageReader, parseAnthropicUsage, parseOpenAIUsage } from "../src/usage"
import serverPlugin from "../src/index"

const NOW = Date.parse("2026-10-05T12:00:00Z")
const payload = (five = 41, week = 18) => ({
  rate_limit: {
    primary_window: { used_percent: five, limit_window_seconds: 18_000, reset_at: NOW / 1000 + 8_040 },
    secondary_window: { used_percent: week, limit_window_seconds: 604_800, reset_at: NOW / 1000 + 277_200 },
  },
})

type Connection = IntegrationDomain["connection"]
function connection() {
  const state = { id: "first", access: "test-token-first", type: "oauth", providerCalls: [] as string[], resolves: 0 }
  const domain = {
    active: async (providerID: string) => {
      state.providerCalls.push(providerID)
      return { type: "credential", id: state.id, label: "Test", method: "oauth" }
    },
    resolve: async () => {
      state.resolves++
      return { type: state.type, access: state.access, methodID: "test", refresh: "test", expires: NOW + 3_600_000, metadata: { accountID: state.id } }
    },
  } as unknown as Connection
  return { state, domain }
}

function responder(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return ((url, init) => handler(String(url), init ?? {})) as typeof fetch
}

describe("provider subscription quota mapping", () => {
  test("maps actual OpenAI windows by duration, including swapped order and reset timestamps", () => {
    const body = payload()
    expect(parseOpenAIUsage(body, NOW)).toEqual([
      { kind: "five_hour", percentUsed: 41, resetsAt: "2026-10-05T14:14:00.000Z" },
      { kind: "seven_day", percentUsed: 18, resetsAt: "2026-10-08T17:00:00.000Z" },
    ])
    const swapped = { rate_limit: { primary_window: body.rate_limit.secondary_window, secondary_window: body.rate_limit.primary_window } }
    expect(parseOpenAIUsage(swapped, NOW)?.map((limit) => limit.kind)).toEqual(["seven_day", "five_hour"])
    expect(parseOpenAIUsage({ rate_limit: { primary_window: { used_percent: 22, limit_window_seconds: 300 } } }, NOW)).toEqual([])
    expect(parseOpenAIUsage({ rate_limit: null }, NOW)).toEqual([])
    expect(parseOpenAIUsage({ usage: { tokens: 1000 } }, NOW)).toBeUndefined()
  })

  test("keeps valid zero/fractional usage, validates dates, and uses relative OpenAI resets when needed", () => {
    expect(parseOpenAIUsage({ rate_limit: { primary_window: { used_percent: 0, limit_window_seconds: 18_000, reset_after_seconds: 60 } } }, NOW)).toEqual([
      { kind: "five_hour", percentUsed: 0, resetsAt: "2026-10-05T12:01:00.000Z" },
    ])
    expect(parseAnthropicUsage({ five_hour: { utilization: 41.4, resets_at: "2026-10-05T14:14:00Z" }, seven_day: { utilization: 0, resets_at: null } })).toEqual([
      { kind: "five_hour", percentUsed: 41.4, resetsAt: "2026-10-05T14:14:00Z" },
      { kind: "seven_day", percentUsed: 0 },
    ])
    expect(parseAnthropicUsage({ five_hour: { utilization: NaN, resets_at: "invalid" }, seven_day: { utilization: 99, resets_at: "invalid" } })).toEqual([{ kind: "seven_day", percentUsed: 99 }])
    expect(parseAnthropicUsage(null)).toBeUndefined()
    expect(parseAnthropicUsage({ five_hour: null, seven_day: null })).toEqual([])
  })
})

describe("server usage reader", () => {
  test("fetches only the provider GET endpoint and returns no credential material", async () => {
    const { domain, state } = connection()
    let calls = 0
    const reader = createUsageReader(domain, { now: () => NOW, fetch: responder((url, init) => {
      calls++
      expect(url).toBe("https://chatgpt.com/backend-api/wham/usage")
      expect(init.method).toBeUndefined()
      expect(init.body).toBeUndefined()
      expect(init.headers).toEqual({ Authorization: `Bearer ${state.access}`, "ChatGPT-Account-Id": "first" })
      expect(init.signal).toBeInstanceOf(AbortSignal)
      return Response.json(payload())
    }) })
    const result = await reader.get("openai")
    expect(result.status).toBe("ok")
    expect(result.rateLimits).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain(state.access)
    expect(JSON.stringify(result)).not.toContain("first")
    await reader.get("openai")
    expect(calls).toBe(1)
    expect(state.resolves).toBe(2)
    reader.dispose()
  })

  test("uses the Anthropic usage schema and OAuth beta header", async () => {
    const { domain } = connection()
    const reader = createUsageReader(domain, { fetch: responder((url, init) => {
      expect(url).toBe("https://api.anthropic.com/api/oauth/usage")
      expect(init.headers).toEqual({ Authorization: "Bearer test-token-first", "anthropic-beta": "oauth-2025-04-20" })
      return Response.json({ five_hour: { utilization: 65, resets_at: "2026-10-05T14:14:00Z" }, seven_day: { utilization: 85, resets_at: "2026-10-08T17:00:00Z" } })
    }) })
    expect((await reader.get("anthropic")).rateLimits.map((limit) => limit.percentUsed)).toEqual([65, 85])
    reader.dispose()
  })

  test("does not fetch unsupported providers, missing connections, or API keys", async () => {
    const { domain, state } = connection()
    const reader = createUsageReader(domain, { fetch: responder(() => { throw new Error("unexpected fetch") }) })
    expect(await reader.get("other")).toEqual({ status: "unavailable", rateLimits: [] })
    expect(await reader.get("toString")).toEqual({ status: "unavailable", rateLimits: [] })
    expect(state.providerCalls).toEqual([])
    state.type = "key"
    expect(await reader.get("openai")).toEqual({ status: "unavailable", rateLimits: [] })
    reader.dispose()
    const missing = createUsageReader({ active: async () => undefined } as unknown as Connection)
    expect(await missing.get("openai")).toEqual({ status: "unavailable", rateLimits: [] })
    missing.dispose()
  })

  test("deduplicates shared requests, expires cache, and force-refreshes after turns", async () => {
    const { domain } = connection()
    let time = NOW
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const reader = createUsageReader(domain, { now: () => time, ttlMs: 30_000, fetch: responder(async () => {
      calls++
      await gate
      return Response.json(payload(calls))
    }) })
    const first = reader.get("openai")
    const second = reader.get("openai")
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(1)
    release()
    expect(await first).toEqual(await second)
    expect((await reader.get("openai")).rateLimits[0]?.percentUsed).toBe(1)
    expect(calls).toBe(1)
    expect((await reader.get("openai", undefined, true)).rateLimits[0]?.percentUsed).toBe(2)
    time += 30_000
    expect((await reader.get("openai")).rateLimits[0]?.percentUsed).toBe(3)
    reader.dispose()
  })

  test("isolates account and provider switches while a previous request remains pending", async () => {
    const { domain, state } = connection()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const reader = createUsageReader(domain, { fetch: responder(async (url, init) => {
      calls++
      if (new Headers(init.headers).get("ChatGPT-Account-Id") === "first") {
        await gate
        return Response.json(payload(10))
      }
      return url.includes("anthropic") ? Response.json({ five_hour: { utilization: 30 } }) : Response.json(payload(20))
    }) })
    const old = reader.get("openai")
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    state.id = "second"
    state.access = "test-token-second"
    expect((await reader.get("openai")).rateLimits[0]?.percentUsed).toBe(20)
    release()
    expect(await old).toEqual({ status: "unavailable", rateLimits: [] })
    expect((await reader.get("openai")).rateLimits[0]?.percentUsed).toBe(20)
    expect((await reader.get("anthropic")).rateLimits[0]?.percentUsed).toBe(30)
    expect(calls).toBe(3)
    reader.dispose()
  })

  test("a failed refresh clears previous usage and retries after the short error TTL", async () => {
    const { domain } = connection()
    let time = NOW
    let calls = 0
    const reader = createUsageReader(domain, { now: () => time, errorTtlMs: 5_000, fetch: responder(() => {
      calls++
      return calls === 1 ? Response.json(payload()) : new Response("private server response", { status: 401 })
    }) })
    expect((await reader.get("openai")).status).toBe("ok")
    expect(await reader.get("openai", undefined, true)).toEqual({ status: "error", rateLimits: [] })
    expect(await reader.get("openai")).toEqual({ status: "error", rateLimits: [] })
    expect(calls).toBe(2)
    time += 5_000
    await reader.get("openai")
    expect(calls).toBe(3)
    reader.dispose()
  })

  test("aborts timed out requests and disposed readers without leaking errors", async () => {
    const { domain } = connection()
    let aborts = 0
    const reader = createUsageReader(domain, { timeoutMs: 5, fetch: responder((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => { aborts++; reject(new Error("secret error")) }, { once: true })
    })) })
    expect(await reader.get("openai")).toEqual({ status: "error", rateLimits: [] })
    expect(aborts).toBe(1)
    const pending = reader.get("openai", undefined, true)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    reader.dispose()
    expect(await pending).toEqual({ status: "error", rateLimits: [] })
    expect(aborts).toBe(2)
    expect(await reader.get("openai")).toEqual({ status: "unavailable", rateLimits: [] })
  })

  test("caller cancellation does not abort quota requests shared by another footer", async () => {
    const { domain } = connection()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const reader = createUsageReader(domain, { fetch: responder(async (_url, init) => {
      await gate
      expect(init.signal?.aborted).toBe(false)
      return Response.json(payload())
    }) })
    const controller = new AbortController()
    const first = reader.get("openai", controller.signal)
    const second = reader.get("openai")
    controller.abort()
    expect(await first).toEqual({ status: "error", rateLimits: [] })
    release()
    expect((await second).status).toBe("ok")
    reader.dispose()
  })
})

test("portable RPC contract rejects invalid payloads and strips credential fields", () => {
  const schema = usageRpc.methods.get.output
  expect(schema.parse({ status: "ok", rateLimits: [], secret: "never cross RPC" })).toEqual({ status: "ok", rateLimits: [] })
  expect(schema.safeParse({ status: "ok", rateLimits: [{ kind: "tokens", percentUsed: 50 }] }).success).toBe(false)
  expect(usageRpc.methods.get.input.parse({ providerID: "openai", force: true })).toEqual({ providerID: "openai", force: true })
})

test("server registers typed quota RPC and disposes its registration and reader", async () => {
  const { domain } = connection()
  let handler!: (input: { providerID: string; force?: boolean }, call: { signal: AbortSignal }) => Promise<unknown>
  let disposed = 0
  const cleanup = await serverPlugin.setup({
    integration: { connection: domain },
    rpc: {
      register: async (definition: unknown, handlers: { get: typeof handler }) => {
        expect(definition).toBe(usageRpc)
        handler = handlers.get
        return { dispose: async () => { disposed++ } }
      },
    },
  } as never)
  expect(await handler({ providerID: "unsupported" }, { signal: new AbortController().signal })).toEqual({ status: "unavailable", rateLimits: [] })
  const abort = new AbortController()
  abort.abort()
  expect(await handler({ providerID: "openai", force: true }, { signal: abort.signal })).toEqual({ status: "error", rateLimits: [] })
  expect(typeof cleanup).toBe("function")
  await (cleanup as () => Promise<void>)()
  expect(disposed).toBe(1)
  expect(await handler({ providerID: "openai" }, { signal: new AbortController().signal })).toEqual({ status: "unavailable", rateLimits: [] })
})
