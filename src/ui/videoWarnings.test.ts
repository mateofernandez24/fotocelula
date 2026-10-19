import { describe, expect, it } from 'vitest'
import { frameTimingStats } from '../video/fps.ts'
import { videoWarnings } from './videoWarnings.ts'

function video(timestamps: number[], overrides: Partial<Parameters<typeof videoWarnings>[0]> = {}) {
  return {
    timing: frameTimingStats(timestamps),
    slowMotionHints: [],
    displayWidth: 1080,
    displayHeight: 1920,
    multipleEditSegments: false,
    ...overrides,
  }
}

const at60 = Array.from({ length: 120 }, (_, i) => i / 60)

describe('videoWarnings', () => {
  it('sin avisos para un vídeo 1080p a 60 fps', () => {
    expect(videoWarnings(video(at60))).toEqual([])
  })

  it('cámara lenta: aviso grave con los motivos', () => {
    const [warning] = videoWarnings(video(at60, { slowMotionHints: ['high-frame-rate', 'playback-intent'] }))
    expect(warning?.severity).toBe('error')
    expect(warning?.text).toContain('más de 100 fps y el iPhone lo ha marcado como cámara lenta')
  })

  it('pocos fps', () => {
    const at30 = Array.from({ length: 60 }, (_, i) => i / 30)
    expect(videoWarnings(video(at30)).map((w) => w.text)).toEqual([
      expect.stringContaining('30,00 fps'),
    ])
  })

  it('frames perdidos, en singular y plural', () => {
    const oneMissing = at60.filter((_, i) => i !== 50)
    expect(videoWarnings(video(oneMissing))[0]?.text).toContain('Falta 1 frame en')
    const twoMissing = at60.filter((_, i) => i !== 50 && i !== 80)
    expect(videoWarnings(video(twoMissing))[0]?.text).toContain('Faltan 2 frames')
  })

  it('4K', () => {
    const warnings = videoWarnings(video(at60, { displayWidth: 2160, displayHeight: 3840 }))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.severity).toBe('info')
  })
})
