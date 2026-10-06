# Ember Ribbon footer for OpenCode

Ports Ember Ribbon's five-hour animated braille bar and weekly Nerd Font ring
from `AI/.claude/mods/ember-ribbon/hooks/register.tsx` into OpenCode 2.0.22.
The plugin replaces `prompt.footer`, so none of OpenCode's native footer (working
spinner, location label) renders; only Scanner, pinned to the far left, and
the quota stats, at the right, remain. The prompt enhancement is not ported.

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

Scanner is the selected **Ribbon**: a three-row, 10-column raster of compact
small-square cells (`▪`). Two bright heads braid across the top and bottom rails,
meet through the middle row, then separate again. It advances on *every* shared
100ms timer tick; the visible 20-step (2 second) loop has no held frames. Each
head carries a two-point tail at 61% and 46%, blended toward the panel colour.
Every unlit cell remains a faint 8%-strength square glyph on the terminal-default
background, so the raster reads as distinct cells rather than a single grey box.
The inactive session state is blank. The block remains three rows tall in every
state, so starting work never moves the prompt; the quota stats remain aligned to
its bottom row. The tests exercise the path, colours, and all frames over 400 ticks.

The colour follows the stage of the conversation, read from the session's
messages on the same tick (`src/stage.ts`). Waiting is the scanner's own red
`FF5A5A`: a prompt just sent, a tool that returned and the model's next step, or
a reply that has not started. Thinking is violet `B794F6`: the last part of the
reply is reasoning that has not completed. A tool call is amber `F0B35A`: the
last part is a tool that is streaming or running. Writing is green `7EE787`: the
last part is text. Approval is pink `F472B6`: a permission request is open, and
it wins over every other stage. Compacting is blue `79B8FF`: the latest message
is a compaction that is running.

Under 33 columns the scanner narrows to a one-column, three-row vertical pulse,
so the quota gauges keep their room. The dot is `▪` (U+25AA), one cell wide in
the usual terminal fonts. For a still frame, give the
plugin the option `animate: false` (read from `context.options`); the working
scanner then shows both outer-rail heads at tick 4, still in the stage colour.
The tests exercise this option and the stage colours through a mocked context.

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
positions, RGB colors, the scanner's separate-cell track, terminal-default backgrounds, and provider lifecycle
behavior.

The preview command writes OpenCode cell evidence to
`/private/tmp/opencode-ember-footer-preview`. It does not compare screenshots
from Claude Code's own terminal renderer.
