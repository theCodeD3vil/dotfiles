import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

/** Runs the unchanged Claude implementation as the reference for parity checks. */
const sourcePath = new URL("../../../../../.claude/mods/ember-ribbon/hooks/register.tsx", import.meta.url)
const source = readFileSync(sourcePath, "utf8")

export const sourceSha256 = createHash("sha256").update(source).digest("hex")

export type Limit = { percentUsed?: number; resetsAt?: string }
export type Fixture = {
  model: string
  fiveLimit?: Limit
  weekLimit?: Limit
  now: number
  columns?: number
  working: boolean
  tick: number
}
export type Element = {
  type: "Box" | "Text" | "Raster"
  props: Record<string, unknown>
  children: Array<Element | string | number | null | undefined | boolean>
}

const jsx = (type: Element["type"], props: Element["props"] | null, ...children: Element["children"]): Element => ({
  type,
  props: props ?? {},
  children,
})

const compiled = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: { compilerOptions: { jsx: "react", jsxFactory: "__jsx" } },
}).transformSync(source.replace("export const register:", "const register:") + `
  return {
    register, sevColor, modelName, timeLeft, usageCells,
    short, fillColor, fillCells, streamCells, tokensPerSecond, HEAT, FILL_CELLS, FILL_ROWS, FILL_TURNS, STREAM_CELLS,
    setStream(value) { stream = value; },
    setTick(value) { tick = value; },
    getMountedBar() { return mountedBar; },
  }
`)

const reference = new Function("__jsx", compiled)(jsx) as {
  register: (on: (...args: unknown[]) => void) => void
  sevColor: (pct: number) => string
  modelName: (id: string) => string
  timeLeft: (limit: Limit | undefined, now: number) => string
  usageCells: (pct: number, timePct: number, width: number, t: number) => string
  short: (n: number) => string
  fillColor: (percent: number) => number[]
  fillCells: (width: number, rows: number, percents: number[]) => string
  streamCells: (width: number) => string
  tokensPerSecond: () => number
  HEAT: ReadonlyArray<{ upTo: number; color: string }>
  FILL_CELLS: number
  FILL_ROWS: number
  FILL_TURNS: number
  STREAM_CELLS: number
  setStream: (value: number[]) => void
  setTick: (tick: number) => void
  getMountedBar: () => { requestId: string; pct: number; timePct: number; width: number } | undefined
}

type Hook = (engine: unknown, event: unknown, next: (event: unknown) => unknown) => Promise<Element>
let footerHook: Hook | undefined
reference.register((...args) => {
  if (args[0] === "ui.render" && (args[1] as { component?: string })?.component === "PromptHint") footerHook = args[2] as Hook
})
if (!footerHook) throw new Error("Claude PromptHint registration was not found")

export const oracle = {
  sevColor: reference.sevColor,
  modelName: reference.modelName,
  timeLeft: reference.timeLeft,
  usageCells(pct: number, timePct: number, width: number, t: number) {
    const bytes = Buffer.from(reference.usageCells(pct, timePct, width, t), "base64")
    const copy = new Uint8Array(bytes)
    return new Uint32Array(copy.buffer)
  },
  // The row above the prompt, from the same untouched source.
  short: reference.short,
  fillColor: reference.fillColor,
  HEAT: reference.HEAT,
  FILL_CELLS: reference.FILL_CELLS,
  FILL_ROWS: reference.FILL_ROWS,
  FILL_TURNS: reference.FILL_TURNS,
  STREAM_CELLS: reference.STREAM_CELLS,
  fillCells(width: number, rows: number, percents: number[]) {
    return new Uint32Array(new Uint8Array(Buffer.from(reference.fillCells(width, rows, percents), "base64")).buffer)
  },
  streamCells(stream: number[], width: number) {
    reference.setStream(stream)
    return new Uint32Array(new Uint8Array(Buffer.from(reference.streamCells(width), "base64")).buffer)
  },
  tokensPerSecond(stream: number[]) {
    reference.setStream(stream)
    return reference.tokensPerSecond()
  },
  async render(fixture: Fixture): Promise<{ tree: Element; mountedBar: ReturnType<typeof reference.getMountedBar> }> {
    reference.setTick(fixture.tick)
    const rateLimits = [
      fixture.fiveLimit && { ...fixture.fiveLimit, kind: "five_hour" },
      fixture.weekLimit && { ...fixture.weekLimit, kind: "seven_day" },
    ].filter(Boolean)
    const engine = {
      clock: { every() {}, now: async () => fixture.now },
      session: { usage: async () => ({ rateLimits }), model: async () => fixture.model },
      ui: { resolve: () => ({ Box: "Box", Text: "Text", Raster: "Raster" }) },
    }
    const event = {
      surface: "terminal",
      requestId: "oracle-footer",
      props: { isWorking: fixture.working },
      ...(fixture.columns === undefined ? {} : { viewport: { columns: fixture.columns } }),
    }
    const tree = await footerHook!(engine, event, () => { throw new Error("The terminal footer unexpectedly delegated to the original hint") })
    return { tree, mountedBar: reference.getMountedBar() }
  },
}

/** Decodes references without rewriting or rounding any cell colour. */
export function normalizeTree(element: Element): unknown {
  const props = { ...element.props }
  if (element.type === "Raster") {
    const bytes = Buffer.from(props.cells as string, "base64")
    props.cells = Array.from(new Uint32Array(new Uint8Array(bytes).buffer))
  }
  return {
    type: element.type,
    props,
    children: element.children.filter(child => child !== null && child !== undefined && child !== false).map(child => {
      return typeof child === "object" ? normalizeTree(child as Element) : child
    }),
  }
}
