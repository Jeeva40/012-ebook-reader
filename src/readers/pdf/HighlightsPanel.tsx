import type { Highlight } from '../../lib/pdfHighlights'

interface HighlightsPanelProps {
  open: boolean
  highlights: Highlight[]
  onClose: () => void
  onJump: (pageIndex: number) => void
}

export default function HighlightsPanel({
  open,
  highlights,
  onClose,
  onJump,
}: HighlightsPanelProps) {
  if (!open) return null

  const sorted = [...highlights].sort((a, b) => a.pageIndex - b.pageIndex)

  return (
    <div className="absolute inset-y-0 right-0 z-20 w-72 max-w-[85vw] overflow-y-auto border-l border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Highlights</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close highlights panel"
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">
          No highlights yet. Select text to add one.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sorted.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onJump(h.pageIndex)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: h.color.swatch }}
                />
                <span className="text-sm text-gray-700">Page {h.pageIndex + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
