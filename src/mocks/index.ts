import { createApi } from './api'
import { type SimConfig, loadConfig } from './config'
import { createHandlers } from './handlers'
import { World } from './world'

export { LIVE_URL } from './config'

export type Simulator = ReturnType<typeof createSimulator>

/** Build a world, its REST API and the MSW handlers that expose them. */
export function createSimulator(config: SimConfig = loadConfig()) {
  const world = new World(config)
  const api = createApi(world)
  const handlers = createHandlers(world, api)
  return { world, api, handlers }
}
