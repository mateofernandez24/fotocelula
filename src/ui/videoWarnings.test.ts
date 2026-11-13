import { describe, expect, it } from 'vitest'
import { frameTimingStats } from '../video/fps.ts'
import { looksConvertedByIos, videoWarnings } from './videoWarnings.ts'

function video(timestamps: number[], overrides: Partial<Parameters<typeof videoWarnings>[0]> = {}) {
  return {
    timing: frameTimingStats(timestamps),
    slowMotionHints: [],
    displayWidth: 1080,
    displayHeight: 1920,
    multipleEditSegments: false,
    codec: 'hvc1.1.6.L123.b0',
    device: { make: null, model: null, software: null },
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

  describe('vídeo convertido por iOS al importarlo', () => {
    const at30 = Array.from({ length: 60 }, (_, i) => i / 30)
    const iphone = { make: 'Apple', model: 'iPhone 14 Plus', software: '18.1' }

    it('iPhone + H.264 + 30 fps: aviso específico en lugar del de pocos fps', () => {
      const warnings = videoWarnings(video(at30, { codec: 'avc1.640033', device: iphone }))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]?.severity).toBe('warning')
      expect(warnings[0]?.text).toContain('iOS lo ha convertido')
      expect(warnings[0]?.text).toContain('Grabar vídeo')
    })

    it('no avisa con un original del iPhone en HEVC a 30 fps, ni a 60 fps, ni sin metadatos de Apple', () => {
      expect(looksConvertedByIos(video(at30, { device: iphone }))).toBe(false)
      expect(looksConvertedByIos(video(at60, { codec: 'avc1.640033', device: iphone }))).toBe(false)
      expect(looksConvertedByIos(video(at30, { codec: 'avc1.640033' }))).toBe(false)
      // Sin metadatos de Apple queda el aviso genérico de pocos fps.
      expect(videoWarnings(video(at30, { codec: 'avc1.640033' }))[0]?.text).toContain('30,00 fps')
    })

    it('también a 29,97 fps', () => {
      const at2997 = Array.from({ length: 60 }, (_, i) => (i * 1001) / 30000)
      expect(looksConvertedByIos(video(at2997, { codec: 'avc1.4d0028', device: iphone }))).toBe(true)
    })
  })
})
