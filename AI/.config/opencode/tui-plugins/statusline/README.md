# Ember Ribbon footer for OpenCode

Ports Ember Ribbon's five-hour animated braille bar and weekly Nerd Font ring
from the `AI/.claude/mods/ember-ribbon/hooks/` modules into OpenCode 2.0.22.
The plugin replaces `prompt.footer`, so none of OpenCode's native footer (working
spinner, location label) renders; only the quota stats, at the right, remain. Wick,
the desk pet, stands at the right of the context row above the prompt. The prompt
enhancement is not ported.

## Context and tokens above the prompt

OpenCode's `session.composer.top` slot sits directly above the prompt, so the
plugin appends Ember Ribbon's row there (`src/context.ts`, `src/above.tsx`):

```text
▁▂▃▄▅▆▇█  134.4k / 200k   ⣀⣤⣶⣿⣦⣀⣀⣀  100 tok/s    ▁▂▆█▂▅ 15.3k
```

- **Context sparkline**: 8 `▁▂▃▄▅▆▇█` glyphs, one per completed turn,
  coloured with the existing continuous green → yellow → red context ramp. Empty
  history is a dim `▁` baseline.
- **Used / window**: the used count in the heat colour (green under 25%, Claude
  orange to 50%, yellow to 75%, pink to 90%, red above), the window dim.
- **Token stream**: 8 braille cells and `tok/s`, always drawn, flat while idle.
  Characters of the reply (`session.text.delta`, `session.reasoning.delta`,
  `session.tool.input.delta`) are counted per 100 ms tick, about four to a token;
  each dot column is the mean of five ticks. Only the session on screen counts, and
  the chart restarts when a run starts or another session opens.
- **Headroom savings**: the life ring, an orange one-row sparkline of tokens saved per completed turn, and the saved-token total.


The arithmetic is the Claude source's, compared cell for cell with it in
`tests/context.test.ts`. What differs is where the numbers come from. A turn is a
user message and the steps after it; its reading is its last step's
`input + output + reasoning + cache.read + cache.write`, over the model's
`limit.context`. As in Claude, a turn is added to the chart and the readout when it
ends; before any turn has, the readout shows the live context. Without a known
window the readout is `– / –`.

The row gives up the stream under about 44 columns and the chart under about 22,
counted with a `134.4k / 200k` readout (Claude's has no narrow layout). The pet stands
at its right end with two clear columns between them (`PET_GAP`), and only when the
whole row, stream included, still fits beside him (about 58 columns with that readout):
a narrower row gets no pet and keeps its width. The slot keeps one blank line above the
pet and one below the row (`ROW_PAD` in `src/above.tsx` and `PROMPT_PAD` in
`src/tui.tsx`; Claude keeps two above).

## The pet

At the far right of the context row, his feet on it, is Wick, the desk pet Claude Code
has there too (`AI/.claude/mods/desk-pet`). Both hosts draw it with that
mod's own module, `hooks/wick.ts`, which `src/pet.ts` imports, so the two are the same
pet: 12 by 4 cells of octants (Unicode 16's 2 × 4 blocks, U+1CD00), 24 by 16 pixels, at
the right, facing left (`COLS`, `ROWS` and `FACING` in `src/pet.ts`). A cell holds two
colours, the pair nearest its eight pixels. The terminal's font must have the octants:
CaskaydiaCove Nerd Font does, and Ghostty draws them itself. Its body keeps its colour, and the
flame on its head and its props take the stage's. What it acts out is read from the
session's messages on the shared timer (`src/stage.ts`):

| State | Colour (Vira Deepforest) | When |
| --- | --- | --- |
| idle | candle yellow `FFCB6B` | the session is not running; it falls asleep after a while |
| waiting | blue `6FA0DE` | a prompt just sent, a tool that returned and the model's next step, or a reply that has not started |
| thinking | orange `CC8868` | the last part of the reply is reasoning that has not completed |
| tool | pink `CB7FA3` | the last part is a tool that is streaming or running |
| writing | lime `C3E88D` | the last part is text |
| approval | yellow `FFCB6B` | a permission request is open; it wins over every other stage |
| compacting | red `f07178` | the latest message is a compaction that is running |
| done | cyan `74C9DE` | a turn just ended with `outcome: "succeeded"`, for `DONE_SECONDS`, then idle |

A failed or interrupted turn goes straight to idle, and a turn that ended before its
session came on screen is not celebrated.

One timer runs at 30 frames a second (`FPS`), the rate OpenTUI paints at by default.
Every third frame is also the 100 ms tick that the gauges, the token stream and the
polling run on. The pet is a function of the seconds since its state began and of the
seconds its timer has run (blinks and the flame), so its speed does not depend on the
frame rate. Clear pixels keep the terminal-default background.

The strip is four rows tall in every state, so starting work never moves the prompt.
In a row too narrow for the context row and the pet, he is left out. `session.composer.top`
exists only in a session, so the home screen has no pet. For a still frame, give the plugin the option `animate: false` (read
from `context.options`): the pet then shows its state 1.5 seconds in.

The stage spinners the pet replaced are still in `src/spinners/`, which also holds the
frame rate.

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
`tests/pet.test.ts` runs the desk-pet playground's own Wick beside the shared module,
in every state for twenty seconds at both hosts' sizes and frame rates, and compares
every pixel and cell. `tests/spinners.test.ts` runs each stage's spinner beside the
picker's own frame code (`tests/artifact-spinners.js`) for thirty seconds and compares
every frame.

The preview command writes OpenCode cell evidence to
`/private/tmp/opencode-ember-footer-preview`. It does not compare screenshots
from Claude Code's own terminal renderer.
