import { describe, expect, it } from 'vitest'
import { torsoPoint, torsoTrack, type Landmark, type TorsoLandmarks } from './torso.ts'

const p = (x: number, y: number, visibility = 1): Landmark => ({ x, y, visibility })

/** Persona de frente: hombros en y = 0,40, caderas en y = 0,60, centrada en x = 0,5. */
function frontal(overrides: Partial<TorsoLandmarks> = {}): TorsoLandmarks {
  return {
    leftShoulder: p(0.55, 0.4),
    rightShoulder: p(0.45, 0.4),
    leftHip: p(0.53, 0.6),
    rightHip: p(0.47, 0.6),
    ...overrides,
  }
}

describe('torsoPoint', () => {
  it('media de hombros y caderas', () => {
    const point = torsoPoint(frontal())
    expect(point?.source).toBe('both')
    expect(point?.x).toBeCloseTo(0.5, 10)
    expect(point?.y).toBeCloseTo(0.5, 10)
    expect(point?.visibility).toBe(1)
  })

  it('valores reales de MediaPipe (vídeo de pádel, frame girado en canvas)', () => {
    const point = torsoPoint({
      leftShoulder: p(0.527, 0.462, 0.99),
      rightShoulder: p(0.542, 0.46, 0.98),
      leftHip: p(0.528, 0.569, 0.97),
      rightHip: p(0.527, 0.569, 0.96),
    })
    expect(point?.x).toBeCloseTo(0.531, 3)
    expect(point?.y).toBeCloseTo(0.515, 3)
    expect(point?.visibility).toBe(0.96)
  })

  it('de perfil: si el lado derecho está tapado usa hombro y cadera izquierdos', () => {
    const point = torsoPoint(frontal({ rightShoulder: p(0.45, 0.4, 0.2), rightHip: p(0.47, 0.6, 0.3) }))
    expect(point?.source).toBe('left')
    expect(point?.x).toBeCloseTo(0.54, 10)
    expect(point?.y).toBeCloseTo(0.5, 10)
  })

  it('basta con que falle un punto de un lado para no usar ese lado', () => {
    expect(torsoPoint(frontal({ leftHip: p(0.53, 0.6, 0.1) }))?.source).toBe('right')
  })

  it('null si ningún lado se ve completo', () => {
    expect(torsoPoint(frontal({ leftHip: p(0.53, 0.6, 0.1), rightShoulder: p(0.45, 0.4, 0.1) }))).toBeNull()
  })

  it('el umbral de visibilidad es configurable', () => {
    const blurry = frontal({ leftShoulder: p(0.55, 0.4, 0.6), rightShoulder: p(0.45, 0.4, 0.6) })
    expect(torsoPoint(blurry)?.source).toBe('both')
    expect(torsoPoint(blurry, 0.7)).toBeNull()
  })

  it('sin visibilidad (p. ej. JSON antiguo) se considera visible', () => {
    expect(torsoPoint(frontal({ leftShoulder: { x: 0.55, y: 0.4 } }))?.source).toBe('both')
  })

  it('descarta coordenadas no numéricas', () => {
    expect(torsoPoint(frontal({ leftShoulder: p(Number.NaN, 0.4) }))?.source).toBe('right')
  })
})

describe('torsoTrack', () => {
  it('un punto por frame, con null si no hay pose', () => {
    const track = torsoTrack([
      { frameIndex: 0, timestampS: 0, torso: frontal() },
      { frameIndex: 1, timestampS: 0.0167, torso: null },
      { frameIndex: 2, timestampS: 0.0333, torso: frontal({ leftHip: p(0.53, 0.6, 0) }) },
    ])
    expect(track.map((t) => t.frameIndex)).toEqual([0, 1, 2])
    expect(track.map((t) => t.timestampS)).toEqual([0, 0.0167, 0.0333])
    expect(track.map((t) => t.point?.source ?? null)).toEqual(['both', null, 'right'])
  })
})
