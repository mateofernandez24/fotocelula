import { existsSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { blobByteSource, demuxVideo, VideoFormatError, type ByteSource } from './demux.ts'

/** Lee un archivo local por trozos, como hace blobByteSource con un File. */
async function fileByteSource(path: string): Promise<ByteSource & { close(): Promise<void> }> {
  const handle = await open(path, 'r')
  const { size } = await handle.stat()
  return {
    size,
    async read(offset, length) {
      const buffer = new ArrayBuffer(length)
      await handle.read(new Uint8Array(buffer), 0, length, offset)
      return buffer
    },
    close: () => handle.close(),
  }
}

describe('demuxVideo con datos no válidos', () => {
  it('rechaza un archivo que no es un vídeo', async () => {
    const source = blobByteSource(new Blob(['esto no es un vídeo'.repeat(100)]))
    await expect(demuxVideo(source)).rejects.toBeInstanceOf(VideoFormatError)
  })

  it('rechaza un archivo vacío', async () => {
    await expect(demuxVideo(blobByteSource(new Blob([])))).rejects.toBeInstanceOf(VideoFormatError)
  })
})

// Vídeo real del iPhone 12 (4K, 60 fps, HEVC, vertical). No está en el repositorio
// (lleva la ubicación en los metadatos), así que en GitHub Actions estos tests se saltan.
const IPHONE_60FPS = 'test-data/IMG_0589.MOV'

describe.skipIf(!existsSync(IPHONE_60FPS))('demuxVideo con un vídeo del iPhone', () => {
  it('lee el índice sin cargar el vídeo entero', async () => {
    const source = await fileByteSource(IPHONE_60FPS)
    let bytesRead = 0
    const counting: ByteSource = {
      size: source.size,
      read: (offset, length) => {
        bytesRead += length
        return source.read(offset, length)
      },
    }
    try {
      const video = await demuxVideo(counting)

      expect(bytesRead).toBeLessThan(source.size / 10)
      expect(video.brands).toContain('qt  ')
      expect(video.codec).toBe('hvc1.1.6.H153.b0')
      // hvcC empieza por configurationVersion = 1.
      expect(video.description?.[0]).toBe(1)

      expect(video.codedWidth).toBe(3840)
      expect(video.codedHeight).toBe(2160)
      expect(video.rotation).toBe(90)
      expect(video.displayWidth).toBe(2160)
      expect(video.displayHeight).toBe(3840)

      expect(video.timing.nominalFps).toBe(59.94)
      expect(video.timing.fps).toBeCloseTo(59.94, 1)
      expect(video.slowMotionHints).toEqual([])
      expect(video.device).toEqual({ make: 'Apple', model: 'iPhone 12', software: '26.6.1' })
    } finally {
      await source.close()
    }
  })

  it('frames en orden de presentación y enlazados con sus muestras', async () => {
    const source = await fileByteSource(IPHONE_60FPS)
    try {
      const { frames, samples } = await demuxVideo(source)

      expect(samples).toHaveLength(284)
      // La edit list termina a 2821/600 s: los últimos frames no se muestran.
      expect(frames.length).toBeLessThan(samples.length)
      expect(frames.at(-1)?.timestampS).toBeLessThan(2821 / 600)
      expect(frames[0]?.timestampS).toBe(0)
      expect(frames[0]?.isKeyframe).toBe(true)

      for (const [i, frame] of frames.entries()) {
        expect(frame.index).toBe(i)
        expect(samples[frame.sampleIndex]?.frameIndex).toBe(i)
        if (i > 0) expect(frame.timestampS).toBeGreaterThan(frames[i - 1]?.timestampS ?? Infinity)
      }
      // Hay frames B: el orden de decodificación no es el de presentación.
      expect(frames.some((frame, i) => frame.sampleIndex !== i)).toBe(true)
      // Los datos de cada muestra están dentro del archivo.
      expect(samples.every((s) => s.offset > 0 && s.offset + s.size <= source.size)).toBe(true)
    } finally {
      await source.close()
    }
  })
})
