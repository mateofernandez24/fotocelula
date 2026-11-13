import { describe, expect, it } from 'vitest'
import { clampStep, STEPS, stepIndex } from './steps.ts'

describe('pasos de Medir', () => {
  it('en orden: vídeo, movimiento, referencia, puertas', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['video', 'motion', 'reference', 'gates'])
    expect(stepIndex('reference')).toBe(2)
  })

  it('no deja ir más allá del último paso disponible', () => {
    expect(clampStep('gates', 'reference')).toBe('reference')
    expect(clampStep('motion', 'reference')).toBe('motion')
    expect(clampStep('video', 'video')).toBe('video')
  })
})
