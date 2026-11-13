import { describe, expect, it } from 'vitest'
import type { TrackSample } from './crossing.ts'
import { gateNormal } from './geometry.ts'
import { instantSpeeds } from './instantSpeed.ts'

/** Vídeo horizontal 1920 × 1080: x va de 0 a 1 en 1,78 altos de imagen. */
const ASPECT = 16 / 9

/** Trayectoria a 60 fps; `x(t)` e `y(t)` en coordenadas normalizadas. */
function track(seconds: number, x: (t: number) => number, y: (t: number) => number = () => 0.5): TrackSample[] {
  return Array.from({ length: Math.round(seconds * 60) + 1 }, (_, i) => {
    const t = i / 60
    return { frameIndex: i, timestampS: t, point: { x: x(t), y: y(t) } }
  })
}

describe('instantSpeeds', () => {
  // Escala: 10 m por alto de imagen.
  const SCALE = 10

  it('velocidad constante: la exacta, salvo en los bordes', () => {
    // 0,2 anchos por segundo = 0,2 · 1,78 altos/s = 3,56 m/s.
    const speeds = instantSpeeds(track(2, (t) => 0.1 + 0.2 * t), { aspect: ASPECT, scale: SCALE })
    const expected = 0.2 * ASPECT * SCALE
    expect(speeds[60]).toBeCloseTo(expected, 9)
    // En los primeros y últimos frames no hay ventana a los dos lados.
    expect(speeds[0]).toBeNull()
    expect(speeds.at(-1)).toBeNull()
    expect(speeds.filter((s) => s !== null).length).toBeGreaterThan(100)
  })

  it('aceleración: sigue la velocidad del momento', () => {
    // x = 0,1 + 0,05 t²  →  v = 0,1 t anchos/s.
    const speeds = instantSpeeds(track(3, (t) => 0.1 + 0.05 * t * t), { aspect: ASPECT, scale: SCALE })
    expect(speeds[60]).toBeCloseTo(0.1 * 1 * ASPECT * SCALE, 6)
    expect(speeds[120]).toBeCloseTo(0.1 * 2 * ASPECT * SCALE, 6)
  })

  it('de derecha a izquierda también es positiva', () => {
    const speeds = instantSpeeds(track(2, (t) => 0.9 - 0.2 * t), { aspect: ASPECT, scale: SCALE })
    expect(speeds[60]).toBeCloseTo(0.2 * ASPECT * SCALE, 9)
  })

  it('el balanceo vertical del torso no suma velocidad', () => {
    const bouncing = track(
      2,
      (t) => 0.1 + 0.2 * t,
      (t) => 0.5 + 0.02 * Math.sin(2 * Math.PI * 3 * t),
    )
    const axis = gateNormal({ a: { x: 0.5, y: 0.2 }, b: { x: 0.5, y: 0.8 } }, ASPECT)
    const speeds = instantSpeeds(bouncing, { aspect: ASPECT, scale: SCALE, axis })
    expect(speeds[60]).toBeCloseTo(0.2 * ASPECT * SCALE, 6)
  })

  it('suaviza el temblor del punto', () => {
    // Ruido determinista de ±0,002 (≈ 2 px en 1080p).
    const noise = (i: number) => ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 - 0.5) * 0.004
    const noisy = track(2, (t) => 0.1 + 0.2 * t).map((f, i) =>
      f.point ? { ...f, point: { x: f.point.x + noise(i), y: f.point.y } } : f,
    )
    const speeds = instantSpeeds(noisy, { aspect: ASPECT, scale: SCALE })
    const expected = 0.2 * ASPECT * SCALE
    const middle = speeds.slice(20, 100).filter((s): s is number => s !== null)
    expect(middle.length).toBe(80)
    for (const s of middle) expect(Math.abs(s - expected) / expected).toBeLessThan(0.15)
  })

  it('sin torso: null en ese frame y donde no quedan frames suficientes', () => {
    const withGap = track(2, (t) => 0.1 + 0.2 * t).map((f) =>
      f.frameIndex >= 50 && f.frameIndex < 80 ? { ...f, point: null } : f,
    )
    const speeds = instantSpeeds(withGap, { aspect: ASPECT, scale: SCALE })
    expect(speeds[60]).toBeNull()
    // Justo antes del hueco no hay frames después: no se extrapola.
    expect(speeds[49]).toBeNull()
    expect(speeds[100]).toBeCloseTo(0.2 * ASPECT * SCALE, 9)
  })

  it('timestamps irregulares (fps variables)', () => {
    const times = Array.from({ length: 121 }, (_, i) => i / 60 + (i % 3 === 0 ? 0.004 : 0))
    const irregular: TrackSample[] = times.map((t, i) => ({ frameIndex: i, timestampS: t, point: { x: 0.1 + 0.2 * t, y: 0.5 } }))
    expect(instantSpeeds(irregular, { aspect: ASPECT, scale: SCALE })[60]).toBeCloseTo(0.2 * ASPECT * SCALE, 9)
  })
})
