import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './lib/rafFallback'
// Side-effect only: attaches the beforeinstallprompt/appinstalled listeners
// at module scope, before React mounts, so an early prompt isn't missed.
import './lib/installPrompt'
import './index.css'
import App from './App.tsx'

// registerType: 'autoUpdate' in vite.config.ts means the new service worker
// activates and takes over immediately on update rather than waiting for a
// user prompt — this call is what actually wires that up client-side. A
// no-op outside of the production build (see vite-plugin-pwa's devOptions),
// so this is safe to call unconditionally in dev too.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    console.log('Service worker registered:', swUrl, registration)
  },
  onRegisterError(error) {
    console.error('Service worker registration failed:', error)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
