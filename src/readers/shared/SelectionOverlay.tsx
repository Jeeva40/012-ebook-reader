/** How long to wait, after the browser's Selection stops changing, before
 * treating a text-selection gesture as "finished" and reacting to it.
 * epub.js debounces its own 'selected' event internally (250ms), so this is
 * only consumed by the PDF reader's own selectionchange listener — kept
 * here so both readers' selection-settle timing stays easy to compare. */
export const SELECTION_SETTLE_DELAY_MS = 150

/** Matches .textLayer ::selection in index.css, so this overlay reads as a
 * natural continuation of the browser's own selection color rather than a
 * visibly different shade. */
const SELECTION_OVERLAY_COLOR = 'rgba(38, 132, 255, 0.35)'

export interface OverlayRect {
  left: number
  top: number
  width: number
  height: number
}

interface SelectionOverlayProps {
  rects: OverlayRect[]
}

/**
 * Renders the app's own "selection in progress" highlight in place of the
 * browser's native text-selection highlight. Both readers deliberately
 * clear the real browser Selection as soon as it's captured, because on
 * mobile a live Selection makes the OS's native Copy/Share/Select-all
 * action bar appear over our own SelectionToolbar — and that bar can't be
 * styled away, only removed by leaving nothing for it to attach to. This
 * overlay is what lets the user still see what they selected.
 */
export default function SelectionOverlay({ rects }: SelectionOverlayProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'fixed',
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            background: SELECTION_OVERLAY_COLOR,
          }}
        />
      ))}
    </div>
  )
}
