import { createHash } from "node:crypto"
import type { IntegrationDomain } from "@opencode/plugin/promise/integration"
import type { z } from "zod"
import type { usageSnapshot } from "./rpc"

// The shape that crosses RPC is defined once, in rpc.ts.
export type UsageSnapshot = z.infer<typeof usageSnapshot>
export type RateLimit = UsageSnapshot["rateLimits"][number]

const WINDOWS = { five_hour: 18_000, seven_day: 604_800 } as const
const ENDPOINTS = {
  openai: "https://chatgpt.com/backend-api/wham/usage",
  anthropic: "https://api.anthropic.com/api/oauth/usage",
} as const
const EMPTY: UsageSnapshot = { rateLimits: [], status: "unavailable" }
const FAILED: UsageSnapshot = { rateLimits: [], status: "error" }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function percent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function reset(value: unknown): string | undefined {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined
  return value
}

const limit = (kind: RateLimit["kind"], percentUsed: number, resetsAt?: string): RateLimit =>
  ({ kind, percentUsed, ...(resetsAt ? { resetsAt } : {}) })

// Map subscription windows by their duration; an arbitrary short window is not a five-hour quota.
export function parseOpenAIUsage(body: unknown, now = Date.now()): RateLimit[] | undefined {
  if (!record(body) || !("rate_limit" in body)) return undefined
  if (body.rate_limit === null) return []
  if (!record(body.rate_limit)) return undefined
  const limits: RateLimit[] = []
  for (const value of [body.rate_limit.primary_window, body.rate_limit.secondary_window]) {
    if (!record(value) || !percent(value.used_percent)) continue
    const kind = (Object.keys(WINDOWS) as Array<keyof typeof WINDOWS>)
      .find((kind) => value.limit_window_seconds === WINDOWS[kind])
    if (!kind || limits.some((seen) => seen.kind === kind)) continue
    const resetMs = typeof value.reset_at === "number"
      ? value.reset_at * 1000
      : typeof value.reset_after_seconds === "number" ? now + value.reset_after_seconds * 1000 : NaN
    const resetsAt = Number.isFinite(resetMs) && Math.abs(resetMs) <= 8.64e15
      ? new Date(resetMs).toISOString() : undefined
    limits.push(limit(kind, value.used_percent, resetsAt))
  }
  return limits
}

export function parseAnthropicUsage(body: unknown): RateLimit[] | undefined {
  if (!record(body) || !("five_hour" in body || "seven_day" in body)) return undefined
  const limits: RateLimit[] = []
  for (const kind of ["five_hour", "seven_day"] as const) {
    const value = body[kind]
    if (!record(value) || !percent(value.utilization)) continue
    const resetsAt = reset(value.resets_at)
    limits.push(limit(kind, value.utilization, resetsAt))
  }
  return limits
}

function accountID(access: string, metadata: Record<string, unknown> | undefined): string | undefined {
  for (const key of ["accountID", "accountId", "account_id"]) {
    const value = metadata?.[key]
    if (typeof value === "string" && value) return value
  }
  try {
    const payload: unknown = JSON.parse(Buffer.from(access.split(".")[1] ?? "", "base64url").toString())
    const auth = record(payload) && payload["https://api.openai.com/auth"]
    if (record(auth) && typeof auth.chatgpt_account_id === "string") return auth.chatgpt_account_id
  } catch {}
  return undefined
}

type ReaderOptions = {
  fetch?: typeof fetch
  now?: () => number
  ttlMs?: number
  errorTtlMs?: number
  timeoutMs?: number
}

// Secrets stay in the server process. Only normalized percentages and reset dates cross RPC.
export function createUsageReader(connection: IntegrationDomain["connection"], options: ReaderOptions = {}) {
  const fetchUsage = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const cache = new Map<string, { at: number; value: UsageSnapshot }>()
  const pending = new Map<string, Promise<UsageSnapshot>>()
  const controllers = new Set<AbortController>()
  let disposed = false

  async function read(providerID: string, force: boolean): Promise<UsageSnapshot> {
    if (disposed || !Object.hasOwn(ENDPOINTS, providerID)) return EMPTY
    try {
      // Resolve the current connection before reading cache, including after an account switch.
      const active = await connection.active(providerID)
      if (!active || active.type !== "credential") return EMPTY
      const credential = await connection.resolve(active)
      if (credential?.type !== "oauth" || !credential.access || disposed) return EMPTY
      const key = `${providerID}:${active.id}:${createHash("sha256").update(credential.access).digest("hex")}`
      const existing = cache.get(key)
      const ttl = existing?.value.status === "ok" ? options.ttlMs ?? 30_000 : options.errorTtlMs ?? 5_000
      if (!force && existing && now() - existing.at < ttl) return existing.value
      const stillSelected = async (value: UsageSnapshot): Promise<UsageSnapshot> => {
        const selected = await connection.active(providerID)
        return selected?.type === "credential" && selected.id === active.id ? value : EMPTY
      }
      const inflight = pending.get(key)
      if (inflight) return await stillSelected(await inflight)

      const request = (async (): Promise<UsageSnapshot> => {
        const controller = new AbortController()
        controllers.add(controller)
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
        try {
          const headers: Record<string, string> = { Authorization: `Bearer ${credential.access}` }
          if (providerID === "openai") {
            const id = accountID(credential.access, credential.metadata)
            if (id) headers["ChatGPT-Account-Id"] = id
          } else headers["anthropic-beta"] = "oauth-2025-04-20"
          const response = await fetchUsage(ENDPOINTS[providerID as keyof typeof ENDPOINTS], {
            headers,
            signal: controller.signal,
          })
          if (!response.ok) return FAILED
          const body: unknown = await response.json()
          const rateLimits = providerID === "openai" ? parseOpenAIUsage(body, now()) : parseAnthropicUsage(body)
          return rateLimits ? { rateLimits, status: "ok" } : FAILED
        } catch {
          return FAILED
        } finally {
          clearTimeout(timeout)
          controllers.delete(controller)
        }
      })().then((value) => {
        if (!disposed) {
          // Bound retained account entries without ever reusing another account's figures.
          if (cache.size >= 8 && !cache.has(key)) cache.delete(cache.keys().next().value!)
          cache.set(key, { at: now(), value })
        }
        return value
      }).finally(() => pending.delete(key))
      pending.set(key, request)
      return await stillSelected(await request)
    } catch {
      return FAILED
    }
  }

  return {
    get(providerID: string, signal?: AbortSignal, force = false): Promise<UsageSnapshot> {
      if (signal?.aborted) return Promise.resolve(FAILED)
      const result = read(providerID, force)
      if (!signal) return result
      // One cancelled RPC caller must not cancel a request shared by other footer instances.
      return new Promise((resolve) => {
        const abort = () => resolve(FAILED)
        signal.addEventListener("abort", abort, { once: true })
        result.then(resolve).finally(() => signal.removeEventListener("abort", abort))
      })
    },
    dispose() {
      disposed = true
      for (const controller of controllers) controller.abort()
      cache.clear()
    },
  }
}
