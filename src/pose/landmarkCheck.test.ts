import { describe, expect, it } from 'vitest'
import { LANDMARK, looksUpright, type Point2 } from './landmarkCheck.ts'

/** 33 puntos con las alturas dadas para nariz, hombros, caderas, rodillas y tobillos. */
function pose(nose: number, shoulders: number, hips: number, knees: number, ankles: number): Point2[] {
  const points: Point2[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }))
  const set = (index: number, y: number) => {
    points[index] = { x: 0.5, y }
  }
  set(LANDMARK.nose, nose)
  set(LANDMARK.leftShoulder, shoulders)
  set(LANDMARK.rightShoulder, shoulders)
  set(LANDMARK.leftHip, hips)
  set(LANDMARK.rightHip, hips)
  set(LANDMARK.leftKnee, knees)
  set(LANDMARK.rightKnee, knees)
  set(LANDMARK.leftAnkle, ankles)
  set(LANDMARK.rightAnkle, ankles)
  return points
}

describe('looksUpright', () => {
  it('persona derecha (valores reales con el frame girado en canvas)', () => {
    expect(looksUpright(pose(0.429, 0.461, 0.569, 0.645, 0.719))).toBe(true)
  })

  it('puntos amontonados de una imagen mal girada', () => {
    // Valores reales usando rotationDegrees: tobillos a la altura de las caderas.
    expect(looksUpright(pose(0.443, 0.457, 0.47, 0.417, 0.415))).toBe(false)
  })

  it('persona cabeza abajo', () => {
    expect(looksUpright(pose(0.9, 0.8, 0.6, 0.4, 0.2))).toBe(false)
  })

  it('faltan puntos', () => {
    expect(looksUpright([])).toBe(false)
    expect(looksUpright(pose(0.1, 0.2, 0.3, 0.4, 0.5).slice(0, 25))).toBe(false)
  })
})
