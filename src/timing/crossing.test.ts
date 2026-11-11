import { describe, expect, it } from 'vitest'
import { findAllCrossings, findCrossings, manualCrossing, type TrackSample } from './crossing.ts'
import type { Gate } from './geometry.ts'

const PORTRAIT = 1080 / 1920
const OPTIONS = { aspect: PORTRAIT }

/** Puerta vertical en x, de arriba abajo. */
const gateAt = (x: number): Gate => ({ a: { x, y: 0.2 }, b: { x, y: 0.8 } })

/**
 * Trayectoria a velocidad constante: x(t) = x0 + vx · t, con los timestamps dados.
 * `noise(i)` añade un desplazamiento en x al frame i (por defecto, ninguno).
 */
function track(
  times: readonly number[],
  x0: number,
  vx: number,
  noise: (i: number) => number = () => 0,
): TrackSample[] {
  return times.map((t, i) => ({ frameIndex: i, timestampS: t, point: { x: x0 + vx * t + noise(i), y: 0.45 } }))
}

const at30 = Array.from({ length: 120 }, (_, i) => i / 30)
const at60 = Array.from({ length: 240 }, (_, i) => i / 60)

/** Ruido determinista en [-amplitude, amplitude] (sin Math.random, para que el test sea estable). */
const jitter =
  (amplitude: number, seed = 4.1414) =>
  (i: number) =>
    amplitude * Math.sin(i * 12.9898 + seed)

/** Interpolación simple entre los dos frames donde cambia el signo (para comparar). */
function naiveCrossing(samples: readonly TrackSample[], x: number): number | null {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    if (!a?.point || !b?.point) continue
    const sa = a.point.x - x
    const sb = b.point.x - x
    if (sa > 0 && sb <= 0) return a.timestampS + (sa / (sa - sb)) * (b.timestampS - a.timestampS)
  }
  return null
}

describe('findAllCrossings', () => {
  it('de derecha a izquierda a velocidad constante: instante exacto', () => {
    // x = 0,9 − 0,2·t cruza x = 0,495 en t = 2,025 s: entre los frames 60 (2,000 s) y 61 (2,033 s).
    const [crossing, ...rest] = findAllCrossings(track(at30, 0.9, -0.2), gateAt(0.495), OPTIONS)
    expect(rest).toEqual([])
    expect(crossing?.timeS).toBeCloseTo(2.025, 9)
    expect(crossing?.direction).toBe(-1)
    expect([crossing?.beforeFrame, crossing?.afterFrame]).toEqual([60, 61])
  })

  it('de izquierda a derecha, con el cruce a mitad de dos frames', () => {
    // x = 0,1 + 0,3·t cruza x = 0,6 en t = 1,6667 s.
    const crossing = findAllCrossings(track(at60, 0.1, 0.3), gateAt(0.6), OPTIONS)[0]
    expect(crossing?.timeS).toBeCloseTo(5 / 3, 9)
    expect(crossing?.direction).toBe(1)
  })

  it('usa los timestamps reales aunque los fps sean variables', () => {
    // Intervalos irregulares (como un iPhone con poca luz): 1/60 y 1/30 alternos.
    const times = [0]
    for (let i = 1; i < 150; i++) times.push((times[i - 1] ?? 0) + (i % 2 === 0 ? 1 / 30 : 1 / 60))
    const crossing = findAllCrossings(track(times, 0.95, -0.25), gateAt(0.45), OPTIONS)[0]
    expect(crossing?.timeS).toBeCloseTo(2, 9)
  })

  it('con temblor del punto: un solo cruce, error < ½ frame y menor que interpolar entre 2 frames', () => {
    let fitError = 0
    let naiveError = 0
    for (let k = 0; k < 50; k++) {
      const samples = track(at30, 0.9, -0.2, jitter(0.004, k * 0.37))
      const crossings = findAllCrossings(samples, gateAt(0.5), OPTIONS)
      expect(crossings).toHaveLength(1)
      const error = Math.abs((crossings[0]?.timeS ?? 0) - 2)
      expect(error).toBeLessThan(1 / 30 / 2)
      fitError += error
      naiveError += Math.abs((naiveCrossing(samples, 0.5) ?? 0) - 2)
    }
    expect(fitError).toBeLessThan(naiveError)
  })

  it('el punto que tiembla encima de la línea cuenta como un solo cruce', () => {
    // Muy despacio (0,02/s) y con temblor de ±0,008 en x: cruza la línea varias veces.
    const crossings = findAllCrossings(track(at30, 0.54, -0.02, jitter(0.008)), gateAt(0.5), OPTIONS)
    expect(crossings).toHaveLength(1)
    expect(crossings[0]?.fitFrames).toBeGreaterThan(10)
    expect(Math.abs((crossings[0]?.timeS ?? 0) - 2)).toBeLessThan(0.15)
  })

  it('interpola sobre un hueco corto sin torso justo en el cruce', () => {
    const samples = track(at30, 0.9, -0.2).map((f) => (f.frameIndex >= 59 && f.frameIndex <= 61 ? { ...f, point: null } : f))
    const crossing = findAllCrossings(samples, gateAt(0.5), OPTIONS)[0]
    expect(crossing?.timeS).toBeCloseTo(2, 9)
    expect([crossing?.beforeFrame, crossing?.afterFrame]).toEqual([58, 62])
    expect(crossing?.gapFrames).toBe(3)
  })

  it('no cruza a ciegas sobre un hueco largo', () => {
    // 0,5 s sin torso alrededor del cruce: no se puede saber cuándo cruzó.
    const samples = track(at30, 0.9, -0.2).map((f) => (f.timestampS > 1.75 && f.timestampS < 2.25 ? { ...f, point: null } : f))
    expect(findAllCrossings(samples, gateAt(0.5), OPTIONS)).toEqual([])
  })

  it('sin cruce: el torso no llega a la puerta', () => {
    expect(findAllCrossings(track(at30, 0.9, -0.05), gateAt(0.5), OPTIONS)).toEqual([])
  })

  it('ida y vuelta: dos cruces en sentidos opuestos', () => {
    // Va de 0,8 a 0,2 en 2 s y vuelve.
    const samples: TrackSample[] = at30.map((t, i) => ({
      frameIndex: i,
      timestampS: t,
      point: { x: t <= 2 ? 0.8 - 0.3 * t : 0.2 + 0.3 * (t - 2), y: 0.45 },
    }))
    const crossings = findAllCrossings(samples, gateAt(0.5), OPTIONS)
    expect(crossings.map((c) => c.direction)).toEqual([-1, 1])
    expect(crossings[0]?.timeS).toBeCloseTo(1, 9)
    expect(crossings[1]?.timeS).toBeCloseTo(3, 9)
  })

  it('puerta inclinada', () => {
    // Recta de (0,45; 0) a (0,55; 1): a la altura del torso (y = 0,45) está en x = 0,495.
    const tilted: Gate = { a: { x: 0.45, y: 0 }, b: { x: 0.55, y: 1 } }
    const crossing = findAllCrossings(track(at30, 0.9, -0.2), tilted, OPTIONS)[0]
    expect(crossing?.timeS).toBeCloseTo((0.9 - 0.495) / 0.2, 9)
  })
})

describe('findCrossings (varias puertas, en orden)', () => {
  it('tres puertas: parciales en orden', () => {
    const result = findCrossings(track(at60, 0.95, -0.2), [gateAt(0.8), gateAt(0.5), gateAt(0.2)], OPTIONS)
    expect(result.map((c) => c?.timeS)).toEqual([
      expect.closeTo(0.75, 9),
      expect.closeTo(2.25, 9),
      expect.closeTo(3.75, 9),
    ])
  })

  it('cada puerta se busca después de la anterior (alguien pasa antes por delante)', () => {
    // Ida y vuelta por la puerta 0,5 y luego la carrera de verdad hacia la izquierda.
    const samples: TrackSample[] = at60.map((t, i) => ({
      frameIndex: i,
      timestampS: t,
      point: { x: t < 1 ? 0.4 + 0.2 * t : 0.6 - 0.15 * (t - 1), y: 0.45 },
    }))
    // Puertas en orden de la carrera: primero 0,55 y después 0,3.
    const [first, second] = findCrossings(samples, [gateAt(0.55), gateAt(0.3)], OPTIONS)
    // La puerta 0,55 se cruza dos veces (ida a la derecha y vuelta): vale la primera.
    expect(first?.timeS).toBeCloseTo(0.75, 9)
    expect(second?.timeS).toBeCloseTo(1 + 0.3 / 0.15, 9)
  })

  it('null si una puerta no se cruza', () => {
    const result = findCrossings(track(at30, 0.9, -0.1), [gateAt(0.7), gateAt(0.1)], OPTIONS)
    expect(result[0]?.timeS).toBeCloseTo(2, 9)
    expect(result[1]).toBeNull()
  })
})

describe('manualCrossing', () => {
  const samples = track(at30, 0.9, -0.2)

  it('interpola entre los dos frames elegidos si el torso cambia de lado', () => {
    const crossing = manualCrossing(samples, gateAt(0.5), 59, 61, PORTRAIT)
    expect(crossing?.timeS).toBeCloseTo(2, 9)
    expect(crossing?.fitFrames).toBe(2)
  })

  it('si no hay torso en esos frames, toma el punto medio', () => {
    const withoutTorso = samples.map((f) => (f.frameIndex === 70 ? { ...f, point: null } : f))
    const crossing = manualCrossing(withoutTorso, gateAt(0.5), 70, 71, PORTRAIT)
    expect(crossing?.timeS).toBeCloseTo((70 + 71) / 2 / 30, 9)
    expect(crossing?.direction).toBe(0)
  })

  it('null con frames que no existen o en orden inverso', () => {
    expect(manualCrossing(samples, gateAt(0.5), 61, 60, PORTRAIT)).toBeNull()
    expect(manualCrossing(samples, gateAt(0.5), 500, 501, PORTRAIT)).toBeNull()
  })
})
