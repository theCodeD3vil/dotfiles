import { Plugin } from "@opencode/plugin"

// Server half is intentionally empty; the footer lives in ./tui.tsx.
export default Plugin.define({
  id: "statusline",
  setup() {},
})
