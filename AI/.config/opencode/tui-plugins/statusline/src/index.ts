import { Plugin } from "@opencode/plugin"
import { usageRpc } from "./rpc"
import { createUsageReader } from "./usage"

export default Plugin.define({
  id: "statusline",
  async setup(context) {
    const usage = createUsageReader(context.integration.connection)
    const registration = await context.rpc.register(usageRpc, {
      get: (input, call) => usage.get(input.providerID, call.signal, input.force),
    })
    return async () => {
      usage.dispose()
      await registration.dispose()
    }
  },
})
