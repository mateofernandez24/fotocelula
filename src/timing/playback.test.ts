import { describe, expect, it } from 'vitest'
import { playbackRate, playbackTimeline } from './playback.ts'

const at60 = (seconds: number) => Array.from({ length: Math.round(seconds * 60) + 1 }, (_, i) => i / 60)

describe('playbackRate', () => {
  it('normal lejos de los cruces, lenta cerca y rampa entre medias', () => {
    const crossings = [2]
    expect(playbackRate(0.5, crossings)).toBe(1)
    expect(playbackRate(2, crossings)).toBe(0.25)
    expect(playbackRate(2.29, crossings)).toBe(0.25)
    expect(playbackRate(1.71, crossings)).toBe(0.25)
    // A mitad de la rampa (0,3 + 0,075 s del cruce): a mitad de camino entre 0,25 y 1.
    expect(playbackRate(2.375, crossings)).toBeCloseTo(0.625, 12)
    expect(playbackRate(2.45, crossings)).toBe(1)
  })

  it('con dos cruces cerca manda el más lento', () => {
    // A 0,35 s del primero (rampa) y 0,25 s del segundo (lenta).
    expect(playbackRate(1.35, [1, 1.6])).toBe(0.25)
    // A 0,4 s de los dos: en la rampa de ambos.
    expect(playbackRate(1.4, [1, 1.8])).toBeCloseTo(0.75, 12)
  })

  it('opciones: otra velocidad lenta y sin rampa', () => {
    expect(playbackRate(1, [1], { slowRate: 0.5 })).toBe(0.5)
    expect(playbackRate(1.31, [1], { rampS: 0 })).toBe(1)
  })
})

describe('playbackTimeline', () => {
  it('sin cruces: el tiempo del vídeo desde el primer frame', () => {
    const timestamps = at60(1).map((t) => t + 0.5)
    const timeline = playbackTimeline(timestamps, [])
    timeline.forEach((wall, i) => expect(wall).toBeCloseTo(i / 60, 12))
  })

  it('en cámara lenta cada frame dura cuatro veces más', () => {
    const timestamps = at60(4)
    const timeline = playbackTimeline(timestamps, [2])
    // Lejos del cruce, 1/60 s por frame; junto al cruce, 4/60 s.
    expect((timeline[31] as number) - (timeline[30] as number)).toBeCloseTo(1 / 60, 12)
    expect((timeline[121] as number) - (timeline[120] as number)).toBeCloseTo(4 / 60, 12)
    // Total: 4 s de vídeo + 0,6 s lentos (×4: +1,8 s) + dos rampas de 0,15 s (algo más lentas).
    const total = timeline.at(-1) as number
    expect(total).toBeGreaterThan(4 + 1.8)
    expect(total).toBeLessThan(4 + 1.8 + 0.6)
  })

  it('siempre creciente, también con timestamps irregulares', () => {
    const timestamps = at60(3).map((t, i) => t + (i % 4 === 0 ? 0.003 : 0))
    const timeline = playbackTimeline(timestamps, [1, 2.2])
    expect(timeline.every((w, i) => i === 0 || w > (timeline[i - 1] as number))).toBe(true)
  })
})
