/**
 * The simulated backend for tests (Vitest, Node). Same handlers as the browser.
 *
 *   // src/test/setup.ts
 *   import { createTestBackend } from '@/mocks/node'
 *   export const backend = createTestBackend()
 *   beforeAll(() => backend.server.listen({ onUnhandledRequest: 'error' }))
 *   afterEach(() => backend.server.resetHandlers())
 *   afterAll(() => backend.server.close())
 *
 * The world's clock does NOT run by itself in tests. Move it on explicitly with
 * `backend.world.advance(5_000)` so tests are deterministic.
 */
import { setupServer } from 'msw/node'
import { type SimConfig, defaultConfig } from './config'
import { createSimulator } from './index'

export function createTestBackend(overrides: Partial<SimConfig> = {}) {
  const sim = createSimulator({ ...defaultConfig, latency: [0, 0], warmupMinutes: 1, ...overrides })
  const server = setupServer(...sim.handlers)
  return { ...sim, server }
}
