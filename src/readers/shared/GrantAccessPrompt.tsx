interface GrantAccessPromptProps {
  anchorRect: DOMRect
  onGrant: () => void
}

/** Shown instead of the color-swatch toolbar when text is selected but the
 * app doesn't yet have write permission for the original file, so a
 * highlight can't be saved to disk until the user explicitly grants it. */
export default function GrantAccessPrompt({ anchorRect, onGrant }: GrantAccessPromptProps) {
  const top = Math.max(8, anchorRect.top - 52)
  const left = anchorRect.left + anchorRect.width / 2

  return (
    <div
      style={{ position: 'fixed', top, left, transform: 'translateX(-50%)' }}
      className="z-30 flex max-w-[min(90vw,320px)] items-center gap-2 rounded-full bg-gray-900 px-3 py-2 shadow-lg"
    >
      <svg
        className="h-4 w-4 shrink-0 text-amber-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onGrant}
        className="text-left text-xs font-medium leading-snug text-white underline underline-offset-2"
      >
        Grant access to save changes to this file
      </button>
    </div>
  )
}
