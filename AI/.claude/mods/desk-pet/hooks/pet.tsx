import type { ClientModule } from 'claude-code'

import { DEFAULT_COLOR, petCells, petClock, type PetState } from './wick'

// The pet's surface module: it runs on the drawing thread, on the surface's frame clock, and
// redraws only its own region. A Raster takes only BMP characters and octants are not, so the
// pet is rows of coloured Text, and drawing it from the hooks module would redraw the whole band
// every frame.

export const TICK_MS = 100
export const COLUMNS = 12
export const ROWS = 4
export const FACING = -1

/** What the hooks module hands the pet: the state the main loop is in. */
export type PetProps = { state: PetState }

/** A stretch of one row whose cells share their colours; absent, the terminal's own. */
export type Run = { text: string; color?: string; backgroundColor?: string }

const hex = (word: number) => (word === DEFAULT_COLOR ? undefined : `#${word.toString(16).padStart(6, '0')}`)

/** Raster words as rows of runs, one Text to each run. */
export function petRuns(words: Uint32Array): Run[][] {
  return Array.from({ length: ROWS }, (_, row) => {
    const runs: Run[] = []
    for (let col = 0; col < COLUMNS; col++) {
      const i = (row * COLUMNS + col) * 3
      const [color, backgroundColor] = [hex(words[i + 1]!), hex(words[i + 2]!)]
      const last = runs[runs.length - 1]
      const glyph = String.fromCodePoint(words[i]!)
      if (last && last.color === color && last.backgroundColor === backgroundColor) last.text += glyph
      else runs.push({ text: glyph, ...(color && { color }), ...(backgroundColor && { backgroundColor }) })
    }
    return runs
  })
}

const same = (a: Uint32Array, b: Uint32Array) => a.length === b.length && a.every((word, i) => word === b[i])

// `told`: the state the hooks module last handed over. The pet leaves `done` for idle by itself,
// so a redraw that hands `done` over again must not start the celebration again. Most ticks
// leave the picture as it was, so a tick redraws only when `drawn` would change.
type Act = { pet: ReturnType<typeof petClock>; frame: number; drawn: Uint32Array; told?: PetState }
type Local = { redraws: number; act: Act }

const Pet: ClientModule<PetProps, Local> = (props, surface) => {
  let local = surface.state
  if (!local) {
    const act: Act = { pet: petClock(1000 / TICK_MS), frame: 0, drawn: new Uint32Array() }
    local = { redraws: 0, act }
    surface.setState(local)
    surface.every(TICK_MS, () => {
      act.frame++
      if (same(petCells(COLUMNS, ROWS, act.pet.at(act.frame), FACING), act.drawn)) return
      surface.setState({ redraws: surface.state!.redraws + 1, act })
    })
  }
  const { act } = local
  if (props.state !== act.told) {
    act.told = props.state
    act.pet.set(props.state, act.frame)
  }
  act.drawn = petCells(COLUMNS, ROWS, act.pet.at(act.frame), FACING)
  const { Box, Text } = surface.elements
  return (
    <Box flexDirection="column" width={COLUMNS} height={ROWS}>
      {petRuns(act.drawn).map(row => (
        <Box flexDirection="row" height={1}>
          {row.map(({ text, ...colors }) => (
            <Text {...colors}>{text}</Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default Pet
