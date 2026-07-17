/** Not yet in lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

// Captured at module scope (imported at the top of main.tsx) rather than
// inside a component, since beforeinstallprompt can fire before React ever
// mounts and only fires once per page load — a component-scoped listener
// risks missing it if the component mounts even a tick late.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Resolves true if the user accepted the install prompt. The browser only
 * honors prompt() within a user gesture, so this must be called directly
 * from a click handler. Each captured event can only be prompted once —
 * afterward the button hides itself since getInstallPrompt() goes back to
 * null, matching how the browser won't refire beforeinstallprompt until the
 * next eligible page load anyway. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt
  if (!event) return false
  await event.prompt()
  const choice = await event.userChoice
  deferredPrompt = null
  notify()
  return choice.outcome === 'accepted'
}
