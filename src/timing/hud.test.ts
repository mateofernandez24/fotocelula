import { describe, expect, it } from 'vitest'
import { computeCourse } from './course.ts'
import type { TrackSample } from './crossing.ts'
import type { Gate } from './geometry.ts'
import { gatePassages, hudAt } from './hud.ts'

const OPTIONS = { aspect: 1080 / 1920 }
const NO_MANUAL = new Map()
const gateAt = (x: number): Gate => ({ a: { x, y: 0.2 }, b: { x, y: 0.8 } })
const at60 = Array.from({ length: 360 }, (_, i) => i / 60)
const track = (x0: number, vx: number): TrackSample[] =>
  at60.map((t, i) => ({ frameIndex: i, timestampS: t, point: { x: x0 + vx * t, y: 0.45 } }))

describe('gatePassages', () => {
  it('tres puertas en orden: tiempo acumulado, tramo de cada una y total en la última', () => {
    // Puertas en x 0,2 · 0,5 · 0,8 (3 m y 6 m); se corre a 0,2 anchos/s desde 0,05.
    const course = computeCourse(track(0.05, 0.2), [gateAt(0.2), gateAt(0.5), gateAt(0.8)], [3, 6], NO_MANUAL, OPTIONS)
    const passages = gatePassages(course)
    expect(passages.map((p) => p.gateIndex)).toEqual([0, 1, 2])
    expect(passages.map((p) => p.timeS)).toEqual([expect.closeTo(0.75, 9), expect.closeTo(2.25, 9), expect.closeTo(3.75, 9)])
    expect(passages.map((p) => p.elapsedS)).toEqual([0, expect.closeTo(1.5, 9), expect.closeTo(3, 9)])
    expect(passages[0]?.segment).toBeNull()
    expect(passages[1]?.segment?.speedMs).toBeCloseTo(2, 9)
    expect(passages[2]?.segment?.speedMs).toBeCloseTo(4, 9)
    expect(passages[2]?.total?.speedMs).toBeCloseTo(3, 9)
    expect(passages[1]?.total).toBeNull()
  })

  it('al revés: el orden de paso es el inverso a la lista y cada tramo sigue siendo el suyo', () => {
    const course = computeCourse(track(0.95, -0.2), [gateAt(0.2), gateAt(0.5), gateAt(0.8)], [3, 6], NO_MANUAL, OPTIONS)
    const passages = gatePassages(course)
    expect(passages.map((p) => p.gateIndex)).toEqual([2, 1, 0])
    // De la puerta 2 a la 1 hay 6 m en 1,5 s; de la 1 a la 0, 3 m en 1,5 s.
    expect(passages[1]?.segment?.distanceM).toBe(6)
    expect(passages[2]?.segment?.distanceM).toBe(3)
    expect(passages[2]?.total?.distanceM).toBe(9)
  })

  it('una puerta sin cruce no aparece', () => {
    const course = computeCourse(track(0.05, 0.2), [gateAt(0.2), gateAt(0.5), gateAt(1.5)], [3, 6], NO_MANUAL, OPTIONS)
    expect(gatePassages(course).map((p) => p.gateIndex)).toEqual([0, 1])
  })
})

describe('hudAt', () => {
  const course = computeCourse(track(0.05, 0.2), [gateAt(0.2), gateAt(0.8)], [9], NO_MANUAL, OPTIONS)
  const passages = gatePassages(course)

  it('antes de la primera puerta, sin cronómetro', () => {
    expect(hudAt(0.5, passages)).toEqual({ elapsedS: null, finished: false, lastPassage: null, sinceLastS: null })
  })

  it('entre puertas el cronómetro corre; al pasar la última se para', () => {
    const middle = hudAt(2, passages)
    expect(middle.elapsedS).toBeCloseTo(1.25, 9)
    expect(middle.finished).toBe(false)
    expect(middle.lastPassage?.gateIndex).toBe(0)
    expect(middle.sinceLastS).toBeCloseTo(1.25, 9)

    const after = hudAt(5, passages)
    expect(after.finished).toBe(true)
    expect(after.elapsedS).toBeCloseTo(3, 9)
    expect(after.lastPassage?.gateIndex).toBe(1)
    expect(after.lastPassage?.total?.speedMs).toBeCloseTo(3, 9)
  })

  it('sin pasos, nada', () => {
    expect(hudAt(1, []).elapsedS).toBeNull()
  })
})
