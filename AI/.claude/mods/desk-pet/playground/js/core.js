'use strict'
/* The playground's namespace: colours, the conversation states the pet answers to, the two hosts
 * it lives in, and the character registry. Every other script adds to globalThis.Pet. */
globalThis.Pet = globalThis.Pet || {}

;(() => {
  // Ember Ribbon's own palette (ember-ribbon/hooks/colors.ts), which is Vira Deepforest's.
  Pet.COLORS = {
    claude: '#CC8868',
    ink: '#CAE5D5',
    dim: '#76887f',
    track: '#283834',
    red: '#f07178',
    peach: '#CC8868',
    yellow: '#FFCB6B',
    green: '#C3E88D',
    sky: '#74C9DE',
    blue: '#6FA0DE',
    pink: '#CB7FA3',
    teal: '#80CBC4',
  }

  const clampByte = value => Math.max(0, Math.min(255, Math.round(value)))
  Pet.hexToRgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
  Pet.rgbToHex = rgb => `#${rgb.map(value => clampByte(value).toString(16).padStart(2, '0')).join('')}`
  Pet.mix = (from, to, amount) => {
    const [a, b] = [Pet.hexToRgb(from), Pet.hexToRgb(to)]
    return Pet.rgbToHex(a.map((value, index) => value + (b[index] - value) * amount))
  }

  // [r, g, b] 0-255 <-> [hue 0-360, saturation 0-1, lightness 0-1], as in Ember Ribbon.
  Pet.toHsl = ([red, green, blue]) => {
    const [r, g, b] = [red / 255, green / 255, blue / 255]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2
    const delta = max - min
    if (delta === 0) return [0, 0, lightness]
    const saturation = delta / (1 - Math.abs(2 * lightness - 1))
    const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
    return [(sector * 60 + 360) % 360, saturation, lightness]
  }
  Pet.fromHsl = (hue, saturation, lightness) => {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const sector = (((hue % 360) + 360) % 360) / 60
    const second = chroma * (1 - Math.abs((sector % 2) - 1))
    const offset = lightness - chroma / 2
    const rgb =
      sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] : sector < 3 ? [0, chroma, second] : sector < 4 ? [0, second, chroma] : sector < 5 ? [second, 0, chroma] : [chroma, 0, second]
    return Pet.rgbToHex(rgb.map(value => (value + offset) * 255))
  }

  const { blue, peach, pink, green, yellow, red, sky, dim } = Pet.COLORS

  // The stages OpenCode's statusline already reads (src/stage.ts), with its colours, plus idle and
  // done, which a pet needs and a spinner does not.
  Pet.STATES = [
    { key: 'idle', label: 'Idle', tone: dim, claude: 'between turns', opencode: 'session not running (the strip is blank today)' },
    { key: 'waiting', label: 'Waiting', tone: blue, claude: 'turn started, or a tool returned and the next step has not', opencode: 'stage “waiting”' },
    { key: 'thinking', label: 'Thinking', tone: peach, claude: 'thinking chunks are streaming', opencode: 'stage “thinking”' },
    { key: 'tool', label: 'Tool', tone: pink, claude: 'tool input is streaming, or the tool is running', opencode: 'stage “tool”' },
    { key: 'writing', label: 'Writing', tone: green, claude: 'reply text is streaming', opencode: 'stage “writing”' },
    { key: 'approval', label: 'Approval', tone: yellow, claude: 'a permission prompt is open', opencode: 'stage “approval”' },
    { key: 'compacting', label: 'Compacting', tone: red, claude: 'the history is being compacted', opencode: 'stage “compacting”' },
    { key: 'done', label: 'Done', tone: sky, claude: 'turn.complete, held a moment before idle', opencode: 'the run ended, held a moment before idle' },
  ]
  Pet.STATE = Object.fromEntries(Pet.STATES.map(state => [state.key, state]))

  // A typical turn, [state, seconds], for "Play a turn".
  Pet.TURN = [
    ['waiting', 1.2],
    ['thinking', 3.5],
    ['tool', 2.4],
    ['waiting', 0.8],
    ['tool', 1.8],
    ['approval', 3],
    ['tool', 1.4],
    ['writing', 4.5],
    ['done', 2.5],
    ['idle', 2],
  ]

  // Claude Code redraws on Ember Ribbon's 100 ms timer; OpenCode paints at 30 fps.
  Pet.HOSTS = {
    claude: { label: 'Claude Code', where: 'above the Ember ribbon', defaults: { cols: 16, rows: 4, encoder: 'half', fps: 10, align: 'left' } },
    opencode: { label: 'OpenCode', where: 'above the prompt, at the right', defaults: { cols: 16, rows: 2, encoder: 'half', fps: 30, align: 'right' } },
  }
  Pet.HOST_KEYS = Object.keys(Pet.HOSTS)

  // A character: { id, name, blurb, hosts?: { claude?, opencode? } defaults, larger?: the same
  // per host at a larger size, draw(grid, frame) }.
  Pet.CHARACTERS = []
  Pet.defineCharacter = character => {
    Pet.CHARACTERS.push(character)
    return character
  }
  Pet.characterOf = id => Pet.CHARACTERS.find(character => character.id === id) ?? Pet.CHARACTERS[0]
})()
