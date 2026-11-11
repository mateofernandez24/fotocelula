import { describe, expect, it } from 'vitest'
import { gateLength, isValidGate, signedDistance, type Gate } from './geometry.ts'

/** Vídeo vertical del iPhone: 1080 × 1920. */
const PORTRAIT = 1080 / 1920

const vertical: Gate = { a: { x: 0.5, y: 0.2 }, b: { x: 0.5, y: 0.8 } }

describe('signedDistance', () => {
  it('puerta vertical: positivo a la derecha, negativo a la izquierda, 0 encima', () => {
    expect(signedDistance(vertical, { x: 0.6, y: 0.5 }, PORTRAIT)).toBeGreaterThan(0)
    expect(signedDistance(vertical, { x: 0.4, y: 0.5 }, PORTRAIT)).toBeLessThan(0)
    expect(signedDistance(vertical, { x: 0.5, y: 0.9 }, PORTRAIT)).toBeCloseTo(0, 12)
  })

  it('mide en altos de imagen: 0,1 de ancho en un vídeo vertical son 0,05625 altos', () => {
    expect(signedDistance(vertical, { x: 0.6, y: 0.5 }, PORTRAIT)).toBeCloseTo(0.1 * PORTRAIT, 12)
  })

  it('no depende de lo larga que sea la puerta ni de la altura del punto', () => {
    const short: Gate = { a: { x: 0.5, y: 0.45 }, b: { x: 0.5, y: 0.55 } }
    const d1 = signedDistance(vertical, { x: 0.7, y: 0.1 }, PORTRAIT)
    const d2 = signedDistance(short, { x: 0.7, y: 0.95 }, PORTRAIT)
    expect(d1).toBeCloseTo(d2, 12)
  })

  it('invertir la puerta (b → a) invierte el signo', () => {
    const reversed: Gate = { a: vertical.b, b: vertical.a }
    const p = { x: 0.62, y: 0.4 }
    expect(signedDistance(reversed, p, PORTRAIT)).toBeCloseTo(-signedDistance(vertical, p, PORTRAIT), 12)
  })

  it('puerta inclinada (cámara algo torcida)', () => {
    // Recta de (0,5; 0) a (0,6; 1) en un vídeo cuadrado: el punto (0,55; 0,5) está encima.
    const tilted: Gate = { a: { x: 0.5, y: 0 }, b: { x: 0.6, y: 1 } }
    expect(signedDistance(tilted, { x: 0.55, y: 0.5 }, 1)).toBeCloseTo(0, 12)
    expect(signedDistance(tilted, { x: 0.5, y: 0.5 }, 1)).toBeLessThan(0)
    expect(signedDistance(tilted, { x: 0.6, y: 0.5 }, 1)).toBeGreaterThan(0)
  })

  it('el punto de cruce interpolado no depende de la proporción de la imagen', () => {
    // La interpolación usa s1 / (s1 − s2): con otra proporción cambia la escala, no la fracción.
    const tilted: Gate = { a: { x: 0.3, y: 0.1 }, b: { x: 0.45, y: 0.9 } }
    const p1 = { x: 0.2, y: 0.5 }
    const p2 = { x: 0.6, y: 0.45 }
    const fraction = (aspect: number) => {
      const s1 = signedDistance(tilted, p1, aspect)
      const s2 = signedDistance(tilted, p2, aspect)
      return s1 / (s1 - s2)
    }
    expect(fraction(PORTRAIT)).toBeCloseTo(fraction(1), 12)
    expect(fraction(16 / 9)).toBeCloseTo(fraction(1), 12)
  })

  it('rechaza puertas demasiado cortas o con coordenadas no válidas', () => {
    expect(() => signedDistance({ a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0.5 } }, { x: 0, y: 0 }, 1)).toThrow(
      RangeError,
    )
    expect(() =>
      signedDistance({ a: { x: Number.NaN, y: 0 }, b: { x: 0.5, y: 1 } }, { x: 0, y: 0 }, 1),
    ).toThrow(RangeError)
  })
})

describe('gateLength / isValidGate', () => {
  it('longitud en altos de imagen', () => {
    expect(gateLength(vertical, PORTRAIT)).toBeCloseTo(0.6, 12)
    expect(gateLength({ a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 } }, PORTRAIT)).toBeCloseTo(PORTRAIT, 12)
  })

  it('puertas válidas y no válidas', () => {
    expect(isValidGate(vertical, PORTRAIT)).toBe(true)
    expect(isValidGate({ a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0.505 } }, PORTRAIT)).toBe(false)
  })
})
