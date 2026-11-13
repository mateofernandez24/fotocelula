import { describe, expect, it } from 'vitest'
import { gateSeparation, type Gate } from './geometry.ts'
import { extrapolationFactor, gateDistances, metersPerUnit, type ScaleReference } from './scale.ts'

/** Vídeo horizontal: 1920 × 1080. */
const LANDSCAPE = 1920 / 1080
const vertical = (x: number, top = 0.3, bottom = 0.8): Gate => ({ a: { x, y: top }, b: { x, y: bottom } })
const horizontal = (y: number, left = 0.4, right = 0.6): Gate => ({ a: { x: left, y }, b: { x: right, y } })

describe('gateSeparation', () => {
  it('barras verticales: distancia horizontal en altos de imagen', () => {
    expect(gateSeparation(vertical(0.2), vertical(0.7), LANDSCAPE)).toBeCloseTo(0.5 * LANDSCAPE, 12)
  })

  it('no depende de la longitud ni de la altura de las barras, ni del orden', () => {
    const d = gateSeparation(vertical(0.2), vertical(0.7), LANDSCAPE)
    expect(gateSeparation(vertical(0.2, 0.1, 0.2), vertical(0.7, 0.6, 0.95), LANDSCAPE)).toBeCloseTo(d, 12)
    expect(gateSeparation(vertical(0.7), vertical(0.2), LANDSCAPE)).toBeCloseTo(d, 12)
  })

  it('barras horizontales: mide una altura', () => {
    expect(gateSeparation(horizontal(0.2), horizontal(0.6), LANDSCAPE)).toBeCloseTo(0.4, 12)
  })

  it('barras no paralelas: media de las dos distancias perpendiculares', () => {
    const tilted: Gate = { a: { x: 0.65, y: 0.3 }, b: { x: 0.75, y: 0.8 } }
    const d = gateSeparation(vertical(0.2), tilted, LANDSCAPE)
    // El centro de la inclinada está en x = 0,7: la distancia queda algo por debajo de 0,5 anchos.
    expect(d).toBeGreaterThan(0.45 * LANDSCAPE)
    expect(d).toBeLessThan(0.5 * LANDSCAPE)
  })

  it('NaN si una barra no es válida', () => {
    expect(gateSeparation(vertical(0.2, 0.5, 0.5), vertical(0.7), LANDSCAPE)).toBeNaN()
  })
})

describe('metersPerUnit', () => {
  const reference = (distanceM: number | null, x1 = 0.3, x2 = 0.5): ScaleReference => ({
    bars: [vertical(x1), vertical(x2)],
    distanceM,
  })

  it('distancia real entre la separación en la imagen', () => {
    expect(metersPerUnit(reference(2), LANDSCAPE)).toBeCloseTo(2 / (0.2 * LANDSCAPE), 12)
  })

  it('null sin distancia, con distancia no válida o con las barras casi juntas', () => {
    expect(metersPerUnit(reference(null), LANDSCAPE)).toBeNull()
    expect(metersPerUnit(reference(0), LANDSCAPE)).toBeNull()
    expect(metersPerUnit(reference(Number.NaN), LANDSCAPE)).toBeNull()
    expect(metersPerUnit(reference(2, 0.5, 0.505), LANDSCAPE)).toBeNull()
  })
})

describe('gateDistances', () => {
  it('distancias reales entre puertas consecutivas con la escala de la referencia', () => {
    // Referencia: 2 m entre x = 0,4 y x = 0,5  →  las puertas en 0,1, 0,6 y 0,9 están a 10 m y 6 m.
    const scale = metersPerUnit({ bars: [vertical(0.4), vertical(0.5)], distanceM: 2 }, LANDSCAPE)
    const distances = gateDistances([vertical(0.1), vertical(0.6), vertical(0.9)], scale, LANDSCAPE)
    expect(distances).toEqual([expect.closeTo(10, 9), expect.closeTo(6, 9)])
  })

  it('puertas sobre la referencia: la distancia de la referencia', () => {
    const bars: [Gate, Gate] = [vertical(0.968, 0.3, 0.711), vertical(0.006, 0.3, 0.694)]
    const aspect = 1080 / 1920
    const scale = metersPerUnit({ bars, distanceM: 2 }, aspect)
    expect(gateDistances(bars, scale, aspect)).toEqual([expect.closeTo(2, 9)])
  })

  it('null sin escala o con dos puertas casi juntas', () => {
    expect(gateDistances([vertical(0.1), vertical(0.6)], null, LANDSCAPE)).toEqual([null])
    expect(gateDistances([vertical(0.1), vertical(0.105), vertical(0.6)], 10, LANDSCAPE)).toEqual([
      null,
      expect.closeTo(0.495 * LANDSCAPE * 10, 9),
    ])
  })

  it('con una sola puerta no hay distancias', () => {
    expect(gateDistances([vertical(0.1)], 10, LANDSCAPE)).toEqual([])
  })
})

describe('extrapolationFactor', () => {
  const reference: ScaleReference = { bars: [vertical(0.4), vertical(0.5)], distanceM: 2 }

  it('distancia total medida entre la referencia', () => {
    expect(extrapolationFactor([4, 6], reference)).toBeCloseTo(5, 12)
  })

  it('null si falta alguna distancia o la referencia', () => {
    expect(extrapolationFactor([4, null], reference)).toBeNull()
    expect(extrapolationFactor([4], { ...reference, distanceM: null })).toBeNull()
  })
})
