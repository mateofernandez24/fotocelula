import { describe, expect, it, vi } from 'vitest'
import { blockCrossOriginFetch } from './networkGuard.ts'

function scope() {
  const fetch = vi.fn(async () => new Response('ok'))
  const s = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    location: { origin: 'https://user.github.io', href: 'https://user.github.io/fotocelula/' },
  }
  return { s, fetch }
}

describe('blockCrossOriginFetch', () => {
  it('deja pasar las peticiones a la propia app', async () => {
    const { s, fetch } = scope()
    blockCrossOriginFetch(s)
    await s.fetch('models/pose_landmarker_lite.task')
    await s.fetch('/fotocelula/mediapipe/wasm/vision_wasm_internal.wasm')
    await s.fetch(new URL('https://user.github.io/otra/ruta'))
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('bloquea la telemetría de MediaPipe y cualquier otro origen', async () => {
    const { s, fetch } = scope()
    blockCrossOriginFetch(s)
    await expect(
      s.fetch('https://odml.pa.googleapis.com/v1/log', { method: 'POST' }),
    ).rejects.toThrow('odml.pa.googleapis.com')
    await expect(s.fetch(new Request('https://cdn.jsdelivr.net/x.js'))).rejects.toBeInstanceOf(TypeError)
    await expect(s.fetch('http://user.github.io/')).rejects.toBeInstanceOf(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('permite data: (no sale a la red)', async () => {
    const { s, fetch } = scope()
    blockCrossOriginFetch(s)
    await s.fetch('data:text/plain,hola')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('instalarlo dos veces no lo duplica', async () => {
    const { s, fetch } = scope()
    blockCrossOriginFetch(s)
    const once = s.fetch
    blockCrossOriginFetch(s)
    expect(s.fetch).toBe(once)
    await s.fetch('a')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
