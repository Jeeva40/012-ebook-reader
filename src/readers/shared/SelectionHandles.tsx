import { useEffect, useRef } from 'react'

const HANDLE_COLOR = 'rgb(38, 132, 255)'
const HANDLE_KNOB_SIZE = 14
const HANDLE_STEM_HEIGHT = 10
/** Generous invisible touch-target padding around the visible knob, per
 * standard mobile tap-target sizing guidance — the visible dot alone is too
 * small to reliably grab with a fingertip. */
const HANDLE_HIT_SIZE = 44

interface SelectionHandlesProps {
  start: { x: number; y: number }
  end: { x: number; y: number }
  onStartTouchStart: (e: TouchEvent) => void
  onEndTouchStart: (e: TouchEvent) => void
}

/** Draggable start/end handles for the custom touch-selection UI (see
 * useTouchSelection). Each point is the bottom corner of its boundary
 * rect — the stem hangs down from there, matching where native mobile
 * selection handles anchor. */
export default function SelectionHandles({
  start,
  end,
  onStartTouchStart,
  onEndTouchStart,
}: SelectionHandlesProps) {
  return (
    <>
      <Handle point={start} onTouchStart={onStartTouchStart} />
      <Handle point={end} onTouchStart={onEndTouchStart} />
    </>
  )
}

function Handle({
  point,
  onTouchStart,
}: {
  point: { x: number; y: number }
  onTouchStart: (e: TouchEvent) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    // Registered manually (not via React's onTouchStart prop) so
    // preventDefault() inside the handler actually takes effect — React
    // binds touchstart passively by default, which would silently drop it
    // and let a stray click get synthesized right after the drag begins.
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    return () => el.removeEventListener('touchstart', onTouchStart)
  }, [onTouchStart])

  return (
    <div
      ref={elRef}
      className="fixed z-20 flex flex-col items-center"
      style={{
        left: point.x - HANDLE_HIT_SIZE / 2,
        top: point.y - HANDLE_HIT_SIZE / 6,
        width: HANDLE_HIT_SIZE,
        height: HANDLE_HIT_SIZE,
        touchAction: 'none',
      }}
    >
      <div style={{ width: 2, height: HANDLE_STEM_HEIGHT, background: HANDLE_COLOR }} />
      <div
        style={{
          width: HANDLE_KNOB_SIZE,
          height: HANDLE_KNOB_SIZE,
          borderRadius: '50%',
          background: HANDLE_COLOR,
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  )
}
