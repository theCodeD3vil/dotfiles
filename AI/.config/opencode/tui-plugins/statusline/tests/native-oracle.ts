import { BoxRenderable, RGBA, StyledText, TextAttributes, TextRenderable, type RenderContext, type Renderable } from "@opentui/core"
import type { Element } from "./oracle"

const defaultBackground = RGBA.defaultBackground()
let id = 0

/** Projects the unchanged Claude tree directly into core renderables, bypassing candidate JSX. */
export function renderReference(context: RenderContext, tree: Element): Renderable {
  if (tree.type === "Box") {
    const box = new BoxRenderable(context, {
      id: `reference-${id++}`,
      flexDirection: "row",
      backgroundColor: defaultBackground,
      ...tree.props,
    })
    for (const child of tree.children) {
      if (child && typeof child === "object") box.add(renderReference(context, child))
    }
    return box
  }
  if (tree.type === "Raster") {
    const words = new Uint32Array(new Uint8Array(Buffer.from(tree.props.cells as string, "base64")).buffer)
    const content = new StyledText(Array.from({ length: words.length / 3 }, (_, cell) => {
      const color = words[cell * 3 + 1]!
      return {
        __isChunk: true as const,
        text: String.fromCodePoint(words[cell * 3]!),
        fg: RGBA.fromInts((color >> 16) & 255, (color >> 8) & 255, color & 255),
        bg: defaultBackground,
        attributes: TextAttributes.NONE,
      }
    }))
    return new TextRenderable(context, {
      id: `reference-${id++}`,
      width: tree.props.columns as number,
      height: tree.props.rows as number,
      bg: defaultBackground,
      content,
    })
  }
  return new TextRenderable(context, {
    id: `reference-${id++}`,
    content: tree.children.filter(child => typeof child === "string" || typeof child === "number").join(""),
    fg: tree.props.color as string,
    bg: defaultBackground,
    attributes: tree.props.bold ? TextAttributes.BOLD : TextAttributes.NONE,
  })
}
