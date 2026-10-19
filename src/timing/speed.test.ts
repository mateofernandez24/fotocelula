import { describe, expect, it } from 'vitest'
import { averageSpeed, toKmh } from './speed.ts'

describe('averageSpeed', () => {
  it('divide la distancia entre el tiempo transcurrido', () => {
    expect(averageSpeed(30, 1.25, 5.25)).toBe(7.5)
  })

  it('no asume que el primer cruce sea en t = 0', () => {
    expect(averageSpeed(10, 12.4, 13.65)).toBeCloseTo(8, 10)
  })

  it('rechaza distancias no positivas', () => {
    expect(() => averageSpeed(0, 1, 2)).toThrow(RangeError)
    expect(() => averageSpeed(-5, 1, 2)).toThrow(RangeError)
    expect(() => averageSpeed(Number.NaN, 1, 2)).toThrow(RangeError)
  })

  it('rechaza cruces en orden inverso o simultáneos', () => {
    expect(() => averageSpeed(10, 2, 2)).toThrow(RangeError)
    expect(() => averageSpeed(10, 3, 2)).toThrow(RangeError)
  })
})

describe('toKmh', () => {
  it('convierte m/s a km/h', () => {
    expect(toKmh(10)).toBeCloseTo(36, 10)
  })
})
