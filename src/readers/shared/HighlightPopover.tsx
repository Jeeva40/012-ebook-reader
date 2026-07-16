import { useEffect, useRef } from 'react'
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../lib/highlightColors'

interface HighlightPopoverProps {
  x: number
  y: number
  onDelete: () => void
  onRecolor: (color: HighlightColor) => void
  onClose: () => void
}

export default function HighlightPopover({
  x,
  y,
  onDelete,
  onRecolor,
  onClose,
}: HighlightPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (!popoverRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: y + 10, left: x, transform: 'translateX(-50%)' }}
      className="z-30 flex flex-col gap-2.5 rounded-xl bg-white p-3 shadow-lg ring-1 ring-gray-200"
    >
      <div className="flex items-center gap-1.5">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            onClick={() => (color.isEraser ? onDelete() : onRecolor(color))}
            aria-label={color.isEraser ? 'Remove highlight' : `Recolor ${color.label}`}
            className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
              color.isEraser ? 'ring-2 ring-gray-300' : 'ring-1 ring-black/10'
            }`}
            style={{ backgroundColor: color.swatch }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m14.74 9-.346 9m-4.788 0L9.26 9M19.228 5.79c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
        Delete highlight
      </button>
    </div>
  )
}
