import { useState } from 'react'

export interface TocNavItem {
  id: string
  href: string
  label: string
  subitems?: TocNavItem[]
}

interface TocSidebarProps {
  open: boolean
  items: TocNavItem[]
  currentHref: string | null
  onNavigate: (href: string) => void
  onClose: () => void
}

export default function TocSidebar({
  open,
  items,
  currentHref,
  onNavigate,
  onClose,
}: TocSidebarProps) {
  if (!open) return null

  return (
    <div className="absolute inset-y-0 left-0 z-20 w-72 max-w-[85vw] overflow-y-auto border-r border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Contents</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contents"
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">
          No table of contents available.
        </p>
      ) : (
        <TocList items={items} currentHref={currentHref} onNavigate={onNavigate} depth={0} />
      )}
    </div>
  )
}

function TocList({
  items,
  currentHref,
  onNavigate,
  depth,
}: {
  items: TocNavItem[]
  currentHref: string | null
  onNavigate: (href: string) => void
  depth: number
}) {
  return (
    <ul>
      {items.map((item) => (
        <TocEntry
          key={item.id || item.href}
          item={item}
          currentHref={currentHref}
          onNavigate={onNavigate}
          depth={depth}
        />
      ))}
    </ul>
  )
}

function TocEntry({
  item,
  currentHref,
  onNavigate,
  depth,
}: {
  item: TocNavItem
  currentHref: string | null
  onNavigate: (href: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = Boolean(item.subitems && item.subitems.length > 0)
  const isActive =
    currentHref != null && item.href != null && currentHref.split('#')[0] === item.href.split('#')[0]

  return (
    <li>
      <div className="flex items-center">
        {hasChildren && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse section' : 'Expand section'}
            className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700"
            style={{ marginLeft: depth * 12 }}
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => onNavigate(item.href)}
          className={`flex-1 truncate px-2 py-2 text-left text-sm ${
            isActive ? 'font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
          style={{ paddingLeft: hasChildren ? undefined : depth * 12 + 20 }}
        >
          {item.label.trim()}
        </button>
      </div>
      {hasChildren && expanded && (
        <TocList
          items={item.subitems ?? []}
          currentHref={currentHref}
          onNavigate={onNavigate}
          depth={depth + 1}
        />
      )}
    </li>
  )
}
