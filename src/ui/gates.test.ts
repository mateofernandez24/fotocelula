import { describe, expect, it } from 'vitest'
import { addGate, defaultGates, defaultReferenceBars, parseDistance, removeGate, verticalGate } from './gates.ts'

describe('defaultGates', () => {
  it('dos puertas verticales', () => {
    const gates = defaultGates()
    expect(gates).toHaveLength(2)
    expect(gates.every((g) => g.a.x === g.b.x)).toBe(true)
  })
})

describe('addGate', () => {
  it('a la misma separación que las dos últimas', () => {
    const gates = addGate([verticalGate(0.2), verticalGate(0.45)])
    expect(gates.map((g) => g.a.x)).toEqual([0.2, 0.45, expect.closeTo(0.7, 12)])
  })

  it('si caería fuera, entre la última y el borde', () => {
    expect(addGate([verticalGate(0.3), verticalGate(0.7)])[2]?.a.x).toBeCloseTo((0.7 + 0.95) / 2, 12)
    expect(addGate([verticalGate(0.7), verticalGate(0.3)])[2]?.a.x).toBeCloseTo((0.3 + 0.05) / 2, 12)
  })

  it('sin puertas: en el centro', () => {
    expect(addGate([])).toEqual([verticalGate(0.5)])
  })
})

describe('removeGate', () => {
  it('quita la puerta indicada', () => {
    const gates = [verticalGate(0.2), verticalGate(0.5), verticalGate(0.8)]
    expect(removeGate(gates, 1).map((g) => g.a.x)).toEqual([0.2, 0.8])
  })
})

describe('defaultReferenceBars', () => {
  it('dos barras verticales separadas', () => {
    const [first, second] = defaultReferenceBars()
    expect(first.a.x).toBe(first.b.x)
    expect(second.a.x - first.a.x).toBeGreaterThan(0.1)
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
