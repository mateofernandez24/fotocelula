import { describe, expect, it } from 'vitest'
import { frameTimingStats } from './fps.ts'

/** Timestamps a fps constantes, redondeados a ticks del contenedor como en un MOV/MP4 real. */
function timestamps(count: number, fps: number, timescale = 600, start = 0): number[] {
  return Array.from({ length: count }, (_, i) => start + Math.round((i * timescale) / fps) / timescale)
}

describe('frameTimingStats', () => {
  it('60 fps constantes', () => {
    const stats = frameTimingStats(timestamps(181, 60))
    expect(stats.frameCount).toBe(181)
    expect(stats.spanS).toBeCloseTo(3, 10)
    expect(stats.fps).toBeCloseTo(60, 6)
    expect(stats.nominalFps).toBe(60)
    expect(stats.isVariable).toBe(false)
    expect(stats.droppedFrames).toBe(0)
    expect(stats.gaps).toEqual([])
    expect(stats.gateErrorS).toBeCloseTo(1 / 120, 10)
  })

  it('no depende de que el primer frame esté en t = 0', () => {
    const stats = frameTimingStats(timestamps(61, 60, 600, 12.35))
    expect(stats.spanS).toBeCloseTo(1, 10)
    expect(stats.fps).toBeCloseTo(60, 6)
  })

  it('29,97 fps con timescale 600: mide la media, no el intervalo redondeado', () => {
    // Intervalos de 20 y 21 ticks: la mediana sería 30 fps, pero la media es 29,97.
    const stats = frameTimingStats(timestamps(300, 29.97), { tickS: 1 / 600 })
    expect(stats.fps).toBeCloseTo(29.97, 2)
    expect(stats.nominalFps).toBe(29.97)
    expect(stats.isVariable).toBe(false)
  })

  it('29,97 fps exactos con timescale 30000', () => {
    const stats = frameTimingStats(timestamps(300, 30000 / 1001, 30000))
    expect(stats.fps).toBeCloseTo(29.97, 2)
    expect(stats.nominalFps).toBe(29.97)
  })

  it('59,94 fps con timescale 600: una diferencia de un tick no es variación', () => {
    const stats = frameTimingStats(timestamps(600, 59.94), { tickS: 1 / 600 })
    expect(stats.nominalFps).toBe(59.94)
    expect(stats.isVariable).toBe(false)
  })

  it('240 fps de cámara lenta (sin re-temporizar)', () => {
    const stats = frameTimingStats(timestamps(480, 240, 24000))
    expect(stats.fps).toBeCloseTo(240, 4)
    expect(stats.nominalFps).toBe(240)
  })

  it('detecta frames perdidos sin que afecten a los fps medidos', () => {
    const all = timestamps(121, 60)
    // Faltan los frames 10, 11 y 50.
    const withGaps = all.filter((_, i) => i !== 10 && i !== 11 && i !== 50)
    const stats = frameTimingStats(withGaps)
    expect(stats.droppedFrames).toBe(3)
    expect(stats.gaps).toHaveLength(2)
    expect(stats.gaps[0]?.afterIndex).toBe(9)
    expect(stats.gaps[0]?.missingFrames).toBe(2)
    expect(stats.gaps[0]?.intervalS).toBeCloseTo(3 / 60, 10)
    expect(stats.gaps[1]?.missingFrames).toBe(1)
    expect(stats.maxIntervalS).toBeCloseTo(3 / 60, 10)
    expect(stats.fps).toBeCloseTo(60, 6)
    expect(stats.isVariable).toBe(true)
  })

  it('detecta fps variables (p. ej. el iPhone bajando a 30 fps con poca luz)', () => {
    const fast = timestamps(60, 60)
    const slowStart = (fast.at(-1) ?? 0) + 1 / 30
    const slow = timestamps(20, 30, 600, slowStart)
    const stats = frameTimingStats([...fast, ...slow])
    expect(stats.isVariable).toBe(true)
    expect(stats.minIntervalS).toBeCloseTo(1 / 60, 10)
    expect(stats.maxIntervalS).toBeCloseTo(1 / 30, 10)
  })

  it('tolera un poco de jitter sin marcar fps variables', () => {
    // ±0,2 ms: los intervalos difieren un ~5 % entre sí.
    const jittered = Array.from({ length: 120 }, (_, i) => i / 60 + (i % 2 === 0 ? 0.0002 : -0.0002))
    const stats = frameTimingStats(jittered)
    expect(stats.isVariable).toBe(false)
    expect(stats.fps).toBeCloseTo(60, 0)
  })

  it('no asocia frecuencias raras a una nominal', () => {
    expect(frameTimingStats(timestamps(100, 45, 90000)).nominalFps).toBeNull()
  })

  it('con dos frames usa ese único intervalo', () => {
    const stats = frameTimingStats([1, 1.02])
    expect(stats.fps).toBeCloseTo(50, 6)
    expect(stats.medianIntervalS).toBeCloseTo(0.02, 10)
  })

  it('acepta vídeos largos (más argumentos de los que admite Math.min en Safari)', () => {
    const stats = frameTimingStats(timestamps(100_000, 60))
    expect(stats.frameCount).toBe(100_000)
    expect(stats.fps).toBeCloseTo(60, 6)
  })

  it('rechaza entradas no válidas', () => {
    expect(() => frameTimingStats([])).toThrow(RangeError)
    expect(() => frameTimingStats([0.5])).toThrow(RangeError)
    expect(() => frameTimingStats([0, 0.1, 0.1])).toThrow(RangeError)
    expect(() => frameTimingStats([0, 0.2, 0.1])).toThrow(RangeError)
    expect(() => frameTimingStats([0, Number.NaN])).toThrow(RangeError)
  })
})
