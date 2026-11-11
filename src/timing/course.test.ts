import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PoseDataFile } from '../pose/poseExport.ts'
import { computeCourse } from './course.ts'
import type { TrackSample } from './crossing.ts'
import type { Gate } from './geometry.ts'
import { torsoTrack } from './torso.ts'

const OPTIONS = { aspect: 1080 / 1920 }
const NO_MANUAL = new Map()
const gateAt = (x: number): Gate => ({ a: { x, y: 0.2 }, b: { x, y: 0.8 } })
const at60 = Array.from({ length: 300 }, (_, i) => i / 60)
const track = (x0: number, vx: number): TrackSample[] =>
  at60.map((t, i) => ({ frameIndex: i, timestampS: t, point: { x: x0 + vx * t, y: 0.45 } }))

describe('computeCourse', () => {
  it('puertas en el orden en que se cruzan (izquierda → derecha)', () => {
    const result = computeCourse(track(0.05, 0.2), [gateAt(0.25), gateAt(0.75)], [5], NO_MANUAL, OPTIONS)
    expect(result.order).toBe('forward')
    expect(result.gates.map((g) => g.crossing?.timeS)).toEqual([expect.closeTo(1, 9), expect.closeTo(3.5, 9)])
    expect(result.total?.timeS).toBeCloseTo(2.5, 9)
    expect(result.total?.speedMs).toBeCloseTo(2, 9)
    expect([result.total?.fromGate, result.total?.toGate]).toEqual([0, 1])
  })

  it('deduce el sentido contrario: la lista va de izquierda a derecha pero se corre al revés', () => {
    const result = computeCourse(track(0.95, -0.2), [gateAt(0.25), gateAt(0.75)], [5], NO_MANUAL, OPTIONS)
    expect(result.order).toBe('reverse')
    expect(result.gates.map((g) => g.crossing?.timeS)).toEqual([expect.closeTo(3.5, 9), expect.closeTo(1, 9)])
    expect(result.total?.timeS).toBeCloseTo(2.5, 9)
    // El total va de la puerta que se cruza primero (la 2.ª de la lista) a la 1.ª.
    expect([result.total?.fromGate, result.total?.toGate]).toEqual([1, 0])
  })

  it('al revés con tres puertas: cada distancia sigue en su tramo de la lista', () => {
    // Lista: 0,2 · 0,5 · 0,8 con 3 m y 6 m. Se corre de derecha a izquierda a 0,2/s.
    const result = computeCourse(track(0.95, -0.2), [gateAt(0.2), gateAt(0.5), gateAt(0.8)], [3, 6], NO_MANUAL, OPTIONS)
    expect(result.order).toBe('reverse')
    // segments[0]: entre la puerta 0 (x 0,2) y la 1 (x 0,5): 1,5 s para 3 m.
    expect(result.segments[0]?.timeS).toBeCloseTo(1.5, 9)
    expect(result.segments[0]?.speedMs).toBeCloseTo(2, 9)
    expect([result.segments[0]?.fromGate, result.segments[0]?.toGate]).toEqual([1, 0])
    // segments[1]: entre la 1 (x 0,5) y la 2 (x 0,8): 1,5 s para 6 m.
    expect(result.segments[1]?.speedMs).toBeCloseTo(4, 9)
    expect(result.total?.distanceM).toBe(9)
    expect(result.total?.timeS).toBeCloseTo(3, 9)
  })

  it('un cruce manual sustituye al automático', () => {
    const samples = track(0.05, 0.2)
    // Automático: la puerta 0,25 se cruza en t = 1 s (frame 60). A mano: entre 70 y 71.
    const manual = new Map([[0, { beforeFrame: 70, afterFrame: 71 }]])
    const result = computeCourse(samples, [gateAt(0.25), gateAt(0.75)], [5], manual, OPTIONS)
    expect(result.gates[0]?.manual).toBe(true)
    expect(result.gates[1]?.manual).toBe(false)
    // Entre 70 y 71 el torso no cambia de lado: punto medio, con medio frame de margen.
    expect(result.gates[0]?.crossing?.timeS).toBeCloseTo(70.5 / 60, 9)
    expect(result.gates[0]?.crossing?.uncertaintyS).toBeCloseTo(1 / 120, 9)
  })

  it('cruces manuales incoherentes (desordenados): sin resultado', () => {
    const manual = new Map([[0, { beforeFrame: 250, afterFrame: 251 }]])
    const result = computeCourse(track(0.05, 0.2), [gateAt(0.25), gateAt(0.75)], [5], manual, OPTIONS)
    expect(result.order).toBe('reverse')
    // Con solo dos puertas, cualquier par de instantes tiene un orden: el resultado existe.
    expect(result.total).not.toBeNull()
    const three = computeCourse(
      track(0.05, 0.2),
      [gateAt(0.25), gateAt(0.5), gateAt(0.75)],
      [5, 5],
      new Map([[1, { beforeFrame: 280, afterFrame: 281 }]]),
      OPTIONS,
    )
    expect(three.order).toBeNull()
    expect(three.total).toBeNull()
    expect(three.segments).toEqual([null, null])
  })

  it('sin distancia: cruces sí, velocidad no', () => {
    const result = computeCourse(track(0.05, 0.2), [gateAt(0.25), gateAt(0.75)], [null], NO_MANUAL, OPTIONS)
    expect(result.gates.every((g) => g.crossing)).toBe(true)
    expect(result.total).toBeNull()
  })

  it('una puerta que no se cruza', () => {
    const result = computeCourse(track(0.05, 0.1), [gateAt(0.25), gateAt(0.9)], [5], NO_MANUAL, OPTIONS)
    expect(result.gates[1]?.crossing).toBeNull()
    expect(result.order).toBeNull()
    expect(result.total).toBeNull()
  })

  it('vídeo real (IMG_E0936) con las puertas en orden inverso al de paso', () => {
    const pose = JSON.parse(readFileSync('test-data/IMG_E0936.pose.json', 'utf8')) as PoseDataFile
    const aspect = pose.video.displayWidth / pose.video.displayHeight
    // Se camina de derecha a izquierda; la lista pone primero la puerta de la izquierda.
    const gates = [gateAt(0.006), gateAt(0.968)]
    const result = computeCourse(torsoTrack(pose.analysis.frames), gates, [2], NO_MANUAL, { aspect })
    expect(result.order).toBe('reverse')
    expect(result.total?.speedMs).toBeCloseTo(0.85, 1)
  })
})
