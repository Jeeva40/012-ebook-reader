export interface HighlightColor {
  id: string
  label: string
  swatch: string
  rgb: { r: number; g: number; b: number }
  /** When true, this swatch erases a highlight instead of applying a color. */
  isEraser?: boolean
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  {
    id: 'yellow',
    label: 'Yellow',
    swatch: '#fde047',
    rgb: { r: 0.98, g: 0.85, b: 0.31 },
  },
  {
    id: 'green',
    label: 'Green',
    swatch: '#86efac',
    rgb: { r: 0.53, g: 0.94, b: 0.65 },
  },
  {
    id: 'blue',
    label: 'Blue',
    swatch: '#93c5fd',
    rgb: { r: 0.58, g: 0.77, b: 0.99 },
  },
  {
    id: 'pink',
    label: 'Pink',
    swatch: '#f9a8d4',
    rgb: { r: 0.98, g: 0.66, b: 0.83 },
  },
  {
    id: 'white',
    label: 'White',
    swatch: '#ffffff',
    rgb: { r: 1, g: 1, b: 1 },
    isEraser: true,
  },
]

export const HIGHLIGHT_OPACITY = 0.42

export function nearestHighlightColor(rgb: { r: number; g: number; b: number }): HighlightColor {
  let closest = HIGHLIGHT_COLORS[0]
  let bestDist = Infinity
  for (const candidate of HIGHLIGHT_COLORS) {
    const dist =
      (candidate.rgb.r - rgb.r) ** 2 +
      (candidate.rgb.g - rgb.g) ** 2 +
      (candidate.rgb.b - rgb.b) ** 2
    if (dist < bestDist) {
      bestDist = dist
      closest = candidate
    }
  }
  return closest
}
