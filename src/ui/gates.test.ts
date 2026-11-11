import { describe, expect, it } from 'vitest'
import { addGate, defaultGates, parseDistance, removeGate, verticalGate } from './gates.ts'

describe('defaultGates', () => {
  it('dos puertas verticales', () => {
    const gates = defaultGates()
    expect(gates).toHaveLength(2)
    expect(gates.every((g) => g.a.x === g.b.x)).toBe(true)
  })
})

describe('addGate', () => {
  it('a la misma separación que las dos últimas', () => {
    const { gates, distances } = addGate([verticalGate(0.2), verticalGate(0.45)], [5])
    expect(gates.map((g) => g.a.x)).toEqual([0.2, 0.45, expect.closeTo(0.7, 12)])
    expect(distances).toEqual([5, null])
  })

  it('si caería fuera, entre la última y el borde', () => {
    const { gates } = addGate([verticalGate(0.3), verticalGate(0.7)], [5])
    expect(gates[2]?.a.x).toBeCloseTo((0.7 + 0.95) / 2, 12)
    const leftwards = addGate([verticalGate(0.7), verticalGate(0.3)], [5])
    expect(leftwards.gates[2]?.a.x).toBeCloseTo((0.3 + 0.05) / 2, 12)
  })

  it('sin puertas: en el centro y sin distancia', () => {
    expect(addGate([], [])).toEqual({ gates: [verticalGate(0.5)], distances: [] })
  })
})

describe('removeGate', () => {
  const gates = [verticalGate(0.2), verticalGate(0.5), verticalGate(0.8)]

  it('quitar la primera o la última quita su distancia', () => {
    expect(removeGate(gates, [3, 4], 0).distances).toEqual([4])
    expect(removeGate(gates, [3, 4], 2).distances).toEqual([3])
    expect(removeGate(gates, [3, 4], 0).gates.map((g) => g.a.x)).toEqual([0.5, 0.8])
  })

  it('quitar una del medio suma sus dos distancias', () => {
    expect(removeGate(gates, [3, 4], 1).distances).toEqual([7])
    expect(removeGate(gates, [3, null], 1).distances).toEqual([null])
  })
})

describe('parseDistance', () => {
  it.each([
    ['2', 2],
    ['2,5', 2.5],
    ['2.50', 2.5],
    [' 30 m', 30],
    ['0,75', 0.75],
    [',5', 0.5],
    ['.5', 0.5],
  ])('%j → %s', (text, expected) => {
    expect(parseDistance(text)).toBe(expected)
  })

  it.each(['', '0', '-2', 'abc', '2,5,1', '1e3', '2 metros'])('%j no es válida', (text) => {
    expect(parseDistance(text)).toBeNull()
  })
})
