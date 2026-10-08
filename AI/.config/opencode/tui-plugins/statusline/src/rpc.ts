import { Rpc } from "@opencode/plugin/rpc"
import { z } from "zod"

export const usageSnapshot = z.object({
  rateLimits: z.array(z.object({
    kind: z.enum(["five_hour", "seven_day"]),
    percentUsed: z.number(),
    resetsAt: z.string().optional(),
  })),
  status: z.enum(["ok", "unavailable", "error"]),
})

export const usageRpc = Rpc.define({
  id: "statusline",
  methods: {
    get: {
      input: z.object({ providerID: z.string(), force: z.boolean().optional() }),
      output: usageSnapshot,
    },
  },
  events: {},
})
