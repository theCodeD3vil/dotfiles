# Ember Ribbon footer for OpenCode

Ports Ember Ribbon's five-hour animated braille bar and weekly Nerd Font ring
from `AI/.claude/mods/ember-ribbon/hooks/register.tsx` into OpenCode 2.0.22.
The plugin replaces `prompt.footer`, so none of OpenCode's native footer (working
spinner, location label) renders; only the stage spinner, pinned to the far left,
and the quota stats, at the right, remain. The prompt enhancement is not ported.

## Context and tokens above the prompt

OpenCode's `session.composer.top` slot sits directly above the prompt, so the
plugin appends Ember Ribbon's row there (`src/context.ts`, `src/above.tsx`):

```text
⠀⠀⠀⠀⠀⢀⣠⣴
⣀⣀⣠⣴⣾⣿⣿⣿ 134.4k / 200k   ⣀⣀⣀⣿⣿⣿⣿⣿  100 tok/s
```

- **Context fill history**: 8 cells by 2 rows of braille, one dot column per turn
  (16 turns), as tall as the context percent at the turn's end, green when low,
  yellow mid, red high. Cells before the first turn are dim floor dots.
- **Used / window**: the used count in the heat colour (green under 25%, Claude
  orange to 50%, yellow to 75%, pink to 90%, red above), the window dim.
- **Token stream**: 8 braille cells and `tok/s`, always drawn, flat while idle.
  Characters of the reply (`session.text.delta`, `session.reasoning.delta`,
  `session.tool.input.delta`) are counted per 100 ms tick, about four to a token;
  each dot column is the mean of five ticks. Only the session on screen counts, and
  the chart restarts when a run starts or another session opens.

The arithmetic is the Claude source's, compared cell for cell with it in
`tests/context.test.ts`. What differs is where the numbers come from. A turn is a
user message and the steps after it; its reading is its last step's
`input + output + reasoning + cache.read + cache.write`, over the model's
`limit.context`. As in Claude, a turn is added to the chart and the readout when it
ends; before any turn has, the readout shows the live context. Without a known
window the readout is `– / –`.

The row gives up the stream under about 44 columns and the chart under about 22,
counted with a `134.4k / 200k` readout (Claude's has no narrow layout), and keeps one blank line above and below it (`ROW_PAD`
in `src/above.tsx` and `PROMPT_PAD` in `src/tui.tsx`; Claude keeps two above).

## Stage spinners

The footer shows a different spinner, in a different colour, for each stage of the
conversation, read from the session's messages on the shared timer (`src/stage.ts`).
Each is a 16 by 2 cell strip: braille (a 32 by 8 dot field, each cell coloured by its
strongest dot) or glyphs. They are ported frame for frame from the spinner picker they
were chosen in, one module each in `src/spinners/`, and the registry in
`src/spinners/index.ts` says which stage gets which:

| Stage | Spinner | Colour (Catppuccin Mocha) | The stage is |
| --- | --- | --- | --- |
| waiting | Matrix Rain (`matrix-rain.ts`) | blue `89B4FA` | a prompt just sent, a tool that returned and the model's next step, or a reply that has not started |
| thinking | Life (`life.ts`) | peach `FAB387` | the last part of the reply is reasoning that has not completed |
| tool | Braid (`braid.ts`) | mauve `CBA6F7` | the last part is a tool that is streaming or running |
| writing | Data Stream (`data-stream.ts`) | green `A6E3A1` | the last part is text |
| approval | Warp (`warp.ts`) | yellow `F9E2AF` | a permission request is open; it wins over every other stage |
| compacting | Flame (`flame.ts`) | red `F38BA8` | the latest message is a compaction that is running |

Braid and mauve for a tool call are the plugin's own choice: it is the old scanner's
successor, and the colour keeps the six stages apart.

One timer runs at 30 frames a second (`FPS`), the rate OpenTUI paints at by default.
Every third frame is also the 100 ms tick that the gauges, the token stream and the
polling run on. A spinner is a function of the seconds since it started, so its speed
does not depend on the frame rate; Life also keeps state, so it starts afresh each time
its stage begins. Dots are lit above a brightness of 0.16, and the spinners that sit on
an LED matrix keep a faint full block in unlit cells.

The inactive session state is blank. The strip is two rows tall in every state, so starting
work never moves the prompt, and the quota stats stay aligned to its bottom row. When the
footer is narrow the strip gives up cells from its right edge first, down to one, so the
gauges keep their room (below about 24 columns). For a still frame, give the plugin the
option `animate: false` (read from `context.options`): the working spinner then shows its
state 1.5 seconds into its run, in the stage colour.

The server reads the active provider's OAuth subscription usage: OpenAI's
five-hour/weekly windows or Anthropic's `five_hour`/`seven_day` windows. Only
percentages and reset times cross RPC. Provider/account changes clear previous
figures. Missing limits render the source's `0%` and omit countdowns. Subscription
limits cannot be obtained from API-key providers or session token totals.

## Build and activate

```sh
./build.sh
```

This rebuilds the existing `git+file://.../opencode-statusline` package and
updates only that plugin. Its local Git history is retained. A running OpenCode
instance may need a restart to load the rebuilt package.

## Verify

```sh
npm run typecheck
npm test
bun run build.ts
bun --conditions=browser tests/preview.tsx
```

The oracle executes the untouched Claude source for gauge calculations. Tests
compare original raster words, then check the native OpenTUI footer's glyphs,
positions, RGB colors, terminal-default backgrounds, and provider lifecycle behavior.
`tests/spinners.test.ts` runs each stage's spinner beside the picker's own frame code
(`tests/artifact-spinners.js`) for thirty seconds and compares every frame.

The preview command writes OpenCode cell evidence to
`/private/tmp/opencode-ember-footer-preview`. It does not compare screenshots
from Claude Code's own terminal renderer.
