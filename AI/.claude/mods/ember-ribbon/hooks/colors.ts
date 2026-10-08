// Palette and color math. Colors are '#RRGGBB' strings; math works on [r, g, b] arrays (0-255).

export const CLAUDE = '#D97757'
export const INK = '#E9E6DC'
export const DIM = '#7C776D'
export const TRACK = '#3A3733'
// Catppuccin Mocha
export const RED = '#F38BA8'
export const PEACH = '#FAB387'
export const YELLOW = '#F9E2AF'
export const GREEN = '#A6E3A1'
export const SKY = '#89DCEB'
export const BLUE = '#89B4FA'
export const MAUVE = '#CBA6F7'

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export const hexToRgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
export const blendRgb = (from: number[], to: number[], amount: number) => from.map((value, index) => Math.round(value + ((to[index] ?? 0) - value) * amount))
export const packRgb = (rgb: number[]) => ((rgb[0] ?? 0) << 16) | ((rgb[1] ?? 0) << 8) | (rgb[2] ?? 0)

export const TRACK_PACKED = packRgb(hexToRgb(TRACK))

// [r, g, b] 0-255 <-> [hue 0-360, saturation 0-1, lightness 0-1]
export function toHsl([red = 0, green = 0, blue = 0]: number[]): [number, number, number] {
  const [redUnit, greenUnit, blueUnit] = [red / 255, green / 255, blue / 255]
  const max = Math.max(redUnit, greenUnit, blueUnit)
  const min = Math.min(redUnit, greenUnit, blueUnit)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, lightness]
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const sector =
    max === redUnit ? ((greenUnit - blueUnit) / delta) % 6 : max === greenUnit ? (blueUnit - redUnit) / delta + 2 : (redUnit - greenUnit) / delta + 4
  return [(sector * 60 + 360) % 360, saturation, lightness]
}

export function fromHsl(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = (((hue % 360) + 360) % 360) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = lightness - chroma / 2
  const rgb: [number, number, number] =
    sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] : sector < 3 ? [0, chroma, second] : sector < 4 ? [0, second, chroma] : sector < 5 ? [second, 0, chroma] : [chroma, 0, second]
  return rgb.map(value => Math.round((value + offset) * 255))
}

export function severityColor(percent: number) {
  if (percent >= 85) return '#E2766A'
  if (percent >= 65) return '#E2B064'
  return '#A3BA82'
}

// Ember heat (Claude orange at 25-50%): the used tokens coloured by how full the context window is.
export const HEAT = [
  { upTo: 25, color: GREEN },
  { upTo: 50, color: CLAUDE },
  { upTo: 75, color: YELLOW },
  { upTo: 90, color: '#F5C2E7' },
  { upTo: Infinity, color: RED },
]
export const heatColor = (percent: number) => (HEAT.find(band => percent < band.upTo) ?? HEAT[HEAT.length - 1]!).color

// The context chart's column colour: green when low, yellow mid, red high.
const FILL_GREEN = hexToRgb(GREEN)
const FILL_YELLOW = hexToRgb(YELLOW)
const FILL_RED = hexToRgb(RED)

export const fillColor = (percent: number) => {
  const ratio = clamp(percent / 100, 0, 1)
  return ratio < 0.5 ? blendRgb(FILL_GREEN, FILL_YELLOW, ratio * 2) : blendRgb(FILL_YELLOW, FILL_RED, (ratio - 0.5) * 2)
}
