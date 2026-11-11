import { describe, expect, it } from 'vitest'
import type { Crossing } from './crossing.ts'
import { computeRunResults } from './results.ts'

function crossing(timeS: number, uncertaintyS = 0.01): Crossing {
  return { timeS, beforeFrame: 0, afterFrame: 1, gapFrames: 0, direction: -1, fitFrames: 4, uncertaintyS, atTrackEdge: false }
}

describe('computeRunResults', () => {
  it('dos puertas: tiempo, velocidad e incertidumbres', () => {
    const { segments, total } = computeRunResults([crossing(1.2, 0.006), crossing(3.2, 0.008)], [10])
    expect(segments).toHaveLength(1)
    expect(total).toEqual(segments[0])
    expect(total?.timeS).toBeCloseTo(2, 12)
    expect(total?.speedMs).toBeCloseTo(5, 12)
    expect(total?.speedKmh).toBeCloseTo(18, 12)
    // √(0,006² + 0,008²) = 0,01 s  →  Δv = 5 · 0,01 / 2 = 0,025 m/s
    expect(total?.uncertaintyS).toBeCloseTo(0.01, 12)
    expect(total?.speedUncertaintyMs).toBeCloseTo(0.025, 12)
  })

  it('tres puertas: parciales y total', () => {
    const { segments, total } = computeRunResults([crossing(0.5), crossing(1.7), crossing(2.7)], [10, 10])
    expect(segments.map((s) => s?.timeS)).toEqual([expect.closeTo(1.2, 12), expect.closeTo(1, 12)])
    expect(segments.map((s) => s?.speedMs)).toEqual([expect.closeTo(10 / 1.2, 12), expect.closeTo(10, 12)])
    expect(total?.distanceM).toBe(20)
    expect(total?.timeS).toBeCloseTo(2.2, 12)
    expect([total?.fromGate, total?.toGate]).toEqual([0, 2])
  })

  it('un cruce que falta deja sin calcular sus tramos y el total', () => {
    const { segments, total } = computeRunResults([crossing(0.5), null, crossing(2.7)], [10, 10])
    expect(segments).toEqual([null, null])
    expect(total?.timeS).toBeCloseTo(2.2, 12)
  })

  it('sin distancia válida no hay velocidad', () => {
    expect(computeRunResults([crossing(1), crossing(2)], []).total).toBeNull()
    expect(computeRunResults([crossing(1), crossing(2)], [0]).total).toBeNull()
    expect(computeRunResults([crossing(1), crossing(2)], [Number.NaN]).segments).toEqual([null])
    // Con 3 puertas, si falta una distancia el total tampoco se puede calcular.
    const partial = computeRunResults([crossing(1), crossing(2), crossing(3)], [5])
    expect(partial.segments[0]?.speedMs).toBeCloseTo(5, 12)
    expect(partial.segments[1]).toBeNull()
    expect(partial.total).toBeNull()
  })

  it('cruces en orden inverso: no hay resultado', () => {
    expect(computeRunResults([crossing(3), crossing(2)], [10]).total).toBeNull()
  })

  it('una sola puerta: nada que medir', () => {
    expect(computeRunResults([crossing(1)], [])).toEqual({ segments: [], total: null })
  })
})
