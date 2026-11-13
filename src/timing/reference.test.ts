// Comprueba la detección de cruces con datos reales: cada test-data/<vídeo>.reference.json
// (cruces observados a mano) junto con su <vídeo>.pose.json (salida del análisis de pose).
// Los JSON sí están en el repositorio, así que estos tests también corren en GitHub Actions.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PoseDataFile } from '../pose/poseExport.ts'
import { findCrossings, manualCrossing } from './crossing.ts'
import { gateNormal, gateSeparation, type Gate } from './geometry.ts'
import { instantSpeeds } from './instantSpeed.ts'
import { computeRunResults } from './results.ts'
import { torsoTrack } from './torso.ts'

interface ReferenceFile {
  format: 'fotocelula-reference'
  version: 1
  video: string
  pose: string
  distanceM: number
  direction: 'right-to-left' | 'left-to-right'
  gates: Gate[]
  /** Índices de frame desde 0. */
  crossings: { gate: number; betweenFrames: [number, number] }[]
  notes: string[]
}

const TEST_DATA = 'test-data'
const references = readdirSync(TEST_DATA).filter((name) => name.endsWith('.reference.json'))

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(TEST_DATA, name), 'utf8')) as T
}

describe('referencias de test-data', () => {
  it('hay al menos una referencia', () => {
    expect(references.length).toBeGreaterThan(0)
  })

  describe.each(references)('%s', (name) => {
    const reference = readJson<ReferenceFile>(name)
    const pose = readJson<PoseDataFile>(reference.pose)
    const aspect = pose.video.displayWidth / pose.video.displayHeight
    const track = torsoTrack(pose.analysis.frames)
    const frameInterval = 1 / pose.video.fps
    const detected = findCrossings(track, reference.gates, { aspect })
    // Instante de referencia: el cruce entre los frames observados, interpolado con el torso.
    const expected = reference.crossings.map((c) => {
      const gate = reference.gates[c.gate]
      const [before, after] = c.betweenFrames
      return gate ? manualCrossing(track, gate, before, after, aspect) : null
    })

    it('el formato es el esperado', () => {
      expect(reference.format).toBe('fotocelula-reference')
      expect(pose.format).toBe('fotocelula-pose')
      expect(reference.crossings).toHaveLength(reference.gates.length)
      expect(expected.every(Boolean)).toBe(true)
    })

    it('detecta el cruce de cada puerta a ±1 frame de lo observado', () => {
      reference.crossings.forEach((c, i) => {
        const crossing = detected[c.gate]
        expect(crossing, `puerta ${c.gate}`).not.toBeNull()
        expect(Math.abs((crossing?.beforeFrame ?? -99) - c.betweenFrames[0])).toBeLessThanOrEqual(1)
        // El instante, dentro de su propio margen o, como mucho, a un frame.
        const error = Math.abs((crossing?.timeS ?? 0) - (expected[i]?.timeS ?? 0))
        expect(error).toBeLessThanOrEqual(Math.max(crossing?.uncertaintyS ?? 0, frameInterval))
      })
    })

    it('el sentido del recorrido coincide con el de la referencia', () => {
      const first = detected[0]
      const last = detected.at(-1)
      expect(first && last && last.timeS > first.timeS).toBe(true)
      // De derecha a izquierda, el torso pasa antes por la puerta con la x mayor.
      const xFirst = reference.gates[0]?.a.x ?? 0
      const xLast = reference.gates.at(-1)?.a.x ?? 0
      expect(xFirst > xLast).toBe(reference.direction === 'right-to-left')
    })

    it('la velocidad coincide con la de la referencia dentro del margen', () => {
      const distances = Array.from({ length: reference.gates.length - 1 }, () => reference.distanceM)
      const result = computeRunResults(detected, distances).total
      const referenceResult = computeRunResults(expected, distances).total
      expect(result).not.toBeNull()
      expect(referenceResult).not.toBeNull()
      const speedError = Math.abs((result?.speedMs ?? 0) - (referenceResult?.speedMs ?? 0))
      // Margen combinado de la medida y de la referencia (la referencia también es una medida).
      const tolerance = Math.hypot(result?.speedUncertaintyMs ?? 0, referenceResult?.speedUncertaintyMs ?? 0)
      expect(speedError).toBeLessThanOrEqual(tolerance)
    })

    it('la velocidad instantánea, de media entre las puertas, se parece a la media medida', () => {
      const first = reference.gates[0]
      const last = reference.gates.at(-1)
      const start = detected[0]
      const end = detected.at(-1)
      if (!first || !last || !start || !end) throw new Error('faltan puertas o cruces')
      // Escala como la daría una referencia sobre las mismas puertas.
      const scale = reference.distanceM / gateSeparation(first, last, aspect)
      const speeds = instantSpeeds(track, { aspect, scale, axis: gateNormal(first, aspect) })
      const between = speeds.filter(
        (s, i): s is number =>
          s !== null && (track[i]?.timestampS ?? -1) > start.timeS && (track[i]?.timestampS ?? Infinity) < end.timeS,
      )
      expect(between.length).toBeGreaterThan(10)
      const mean = between.reduce((sum, s) => sum + s, 0) / between.length
      const average = reference.distanceM / (end.timeS - start.timeS)
      expect(Math.abs(mean - average) / average).toBeLessThan(0.1)
    })
  })
})
