import { HIGHLIGHT_COLORS, type HighlightColor } from '../../lib/pdfHighlights'

interface SelectionToolbarProps {
  anchorRect: DOMRect
  onPick: (color: HighlightColor) => void
}

export default function SelectionToolbar({ anchorRect, onPick }: SelectionToolbarProps) {
  const top = Math.max(8, anchorRect.top - 52)
  const left = anchorRect.left + anchorRect.width / 2

  return (
    <div
      style={{ position: 'fixed', top, left, transform: 'translateX(-50%)' }}
      className="z-30 flex items-center gap-1.5 rounded-full bg-gray-900 px-2.5 py-2 shadow-lg"
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(color)}
          aria-label={color.isEraser ? 'Cancel' : `Highlight ${color.label}`}
          className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
            color.isEraser ? 'ring-2 ring-gray-300' : 'ring-1 ring-white/30'
          }`}
          style={{ backgroundColor: color.swatch }}
        />
      ))}
    </div>
  )
}
