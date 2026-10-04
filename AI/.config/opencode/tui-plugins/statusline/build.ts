import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["src/index.ts", "src/tui.tsx"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  plugins: [createSolidTransformPlugin({ moduleName: "@opentui/solid" })],
  external: ["@opencode/plugin", "@opencode/plugin/*", "@opentui/*", "solid-js", "solid-js/*"],
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
for (const out of result.outputs) console.log("built", out.path)
