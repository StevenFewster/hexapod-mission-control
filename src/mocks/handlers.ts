/**
 * MSW adapters: one catch-all REST handler that forwards to `api.handle()`, and the live
 * WebSocket channel. Everything interesting lives in api.ts and world.ts.
 */
import { HttpResponse, delay, http, ws } from 'msw'
import type { Api } from './api'
import { LIVE_URL } from './config'
import type { ClientMessage, ServerMessage } from './types'
import type { World } from './world'

export function createHandlers(world: World, api: Api) {
  // `*/api/*` matches any origin, so both `/api/robots` in the browser and
  // `http://localhost:3000/api/robots` in tests are handled.
  const rest = http.all('*/api/*', async ({ request }) => {
    const url = new URL(request.url)
    const isSimControl = url.pathname.startsWith('/api/sim/')

    if (!isSimControl) {
      const [min, max] = world.config.latency
      await delay(Math.round(min + Math.random() * Math.max(0, max - min)))
      const isAuth = url.pathname.startsWith('/api/auth/')
      if (!isAuth && Math.random() < world.config.errorRate) {
        return HttpResponse.json(
          { error: { code: 'internal', message: 'Simulated server error (errorRate)' } },
          { status: 500 },
        )
      }
    }

    let body: unknown
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text()
      if (text) {
        try {
          body = JSON.parse(text)
        } catch {
          return HttpResponse.json(
            { error: { code: 'bad_request', message: 'Body is not valid JSON' } },
            { status: 400 },
          )
        }
      }
    }

    const auth = request.headers.get('authorization')
    const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
    const response = api.handle({
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      body,
      token,
    })

    if (response.body === undefined) return new HttpResponse(null, { status: response.status })
    return HttpResponse.json(response.body as Record<string, unknown>, { status: response.status })
  })

  const live = ws.link(LIVE_URL)

  const liveHandler = live.addEventListener('connection', ({ client }) => {
    let authenticated = !world.config.requireAuth
    let filter: Set<string> | '*' = '*'
    const send = (message: ServerMessage) => client.send(JSON.stringify(message))
    const hello = () =>
      send({
        type: 'hello',
        serverTime: Date.now(),
        robots: structuredClone([...world.robots.values()]),
      })

    const unsubscribe = world.subscribe((message) => {
      if (!authenticated) return
      if (message.type === 'telemetry' && filter !== '*' && !filter.has(message.frame.robotId))
        return
      send(message)
    })

    const offControl = world.onControl((signal) => {
      if (signal.type === 'drop-connections') client.close(4000, 'Simulated disconnect')
    })

    let authTimer: ReturnType<typeof setTimeout> | null = null
    if (authenticated) {
      hello()
    } else {
      authTimer = setTimeout(() => {
        if (authenticated) return
        send({
          type: 'error',
          code: 'unauthorized',
          message: 'Send {"type":"auth","token":"…"} within 5 seconds',
        })
        client.close(4401, 'Unauthorized')
      }, 5_000)
    }

    client.addEventListener('message', (event) => {
      let message: ClientMessage
      try {
        message = JSON.parse(String(event.data)) as ClientMessage
      } catch {
        send({ type: 'error', code: 'bad_message', message: 'Messages must be JSON' })
        return
      }
      switch (message.type) {
        case 'auth':
          if (api.userFor(message.token)) {
            const wasAuthenticated = authenticated
            authenticated = true
            if (authTimer) clearTimeout(authTimer)
            if (!wasAuthenticated) hello()
          } else {
            send({ type: 'error', code: 'unauthorized', message: 'Invalid or expired token' })
            client.close(4401, 'Unauthorized')
          }
          break
        case 'subscribe':
          filter = message.robotIds === '*' ? '*' : new Set(message.robotIds)
          break
        case 'ping':
          send({ type: 'pong', id: message.id, serverTime: Date.now() })
          break
        default:
          send({ type: 'error', code: 'bad_message', message: 'Unknown message type' })
      }
    })

    client.addEventListener('close', () => {
      unsubscribe()
      offControl()
      if (authTimer) clearTimeout(authTimer)
    })
  })

  return [rest, liveHandler]
}
