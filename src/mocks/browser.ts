/**
 * Starts the simulated backend in the browser. Call (and await) this before rendering the app:
 *
 *   // src/main.tsx
 *   import { startMockBackend } from './mocks/browser'
 *   await startMockBackend()
 *   createRoot(...).render(...)
 *
 * In the browser console, `__sim` gives you the running simulator, e.g.
 *   __sim.world.trigger('fault')        // make something break
 *   __sim.world.trigger('disconnect')   // drop the live connection
 *   __sim.world.updateConfig({ timeScale: 10 })
 */
import { setupWorker } from 'msw/browser'
import { createSimulator, type Simulator } from './index'

declare global {
  var __sim: Simulator | undefined
}

export async function startMockBackend(): Promise<Simulator> {
  if (globalThis.__sim) return globalThis.__sim // Vite HMR re-ran this module
  const sim = createSimulator()
  const worker = setupWorker(...sim.handlers)
  await worker.start({
    onUnhandledFrame: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
  sim.world.start()
  globalThis.__sim = sim
  console.info(
    '%c🛰  Hexapod simulator online%c  %d robots · type __sim in the console',
    'color:#22d3ee;font-weight:bold',
    'color:inherit',
    sim.world.robots.size,
  )
  return sim
}
