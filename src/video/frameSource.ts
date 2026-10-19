// Decodificación de frames concretos con WebCodecs (VideoDecoder).
// Funciona en el hilo principal y en un Web Worker (no usa el DOM).
import { VideoFormatError, type ByteSource, type DemuxedVideo } from './demux.ts'
import { decodeStartFor, type EncodedSample } from './frameTable.ts'

/** Por encima de esto se leen las muestras una a una en vez de en un único bloque. */
const MAX_BLOCK_READ = 64 * 1024 * 1024

/** Nombre legible del códec para los mensajes al usuario. */
export function codecLabel(codec: string): string {
  switch (codec.split('.')[0]) {
    case 'avc1':
    case 'avc3':
      return 'H.264'
    case 'hvc1':
    case 'hev1':
      return 'HEVC (H.265)'
    case 'dvh1':
    case 'dvhe':
      return 'Dolby Vision (HDR)'
    case 'vp09':
      return 'VP9'
    case 'av01':
      return 'AV1'
    default:
      return codec
  }
}

/**
 * Da acceso a cualquier frame del vídeo por su índice (orden de presentación).
 * Las peticiones se atienden de una en una con un único decodificador.
 */
export class FrameSource {
  readonly video: DemuxedVideo
  readonly #source: ByteSource
  readonly #config: VideoDecoderConfig
  #decoder: VideoDecoder | null = null
  #queue: Promise<unknown> = Promise.resolve()
  #onOutput: ((frame: VideoFrame) => void) | null = null
  #onError: ((error: DOMException) => void) | null = null

  private constructor(source: ByteSource, video: DemuxedVideo, config: VideoDecoderConfig) {
    this.#source = source
    this.video = video
    this.#config = config
  }

  /** Comprueba que el navegador sabe decodificar el vídeo antes de crear el decodificador. */
  static async open(source: ByteSource, video: DemuxedVideo): Promise<FrameSource> {
    if (typeof VideoDecoder === 'undefined') {
      throw new VideoFormatError(
        'Este navegador no permite leer el vídeo frame a frame (no tiene WebCodecs).',
      )
    }
    const config: VideoDecoderConfig = {
      codec: video.codec,
      codedWidth: video.codedWidth,
      codedHeight: video.codedHeight,
      optimizeForLatency: true,
    }
    if (video.description) config.description = video.description
    const support = await VideoDecoder.isConfigSupported(config).catch(() => null)
    if (!support?.supported) {
      throw new VideoFormatError(
        `Este navegador no puede decodificar vídeo ${codecLabel(video.codec)}. ` +
          'En el iPhone puedes grabar en H.264: Ajustes → Cámara → Formatos → Más compatible.',
      )
    }
    return new FrameSource(source, video, config)
  }

  /**
   * Decodifica el frame `index`. Quien lo recibe debe llamar a `frame.close()` en cuanto
   * termine: los frames sin cerrar retienen memoria del decodificador y pueden bloquearlo.
   */
  getFrame(index: number, signal?: AbortSignal): Promise<VideoFrame> {
    const result = this.#queue.then(() => this.#decodeFrame(index, signal))
    this.#queue = result.catch(() => undefined)
    return result
  }

  close(): void {
    if (this.#decoder && this.#decoder.state !== 'closed') this.#decoder.close()
    this.#decoder = null
  }

  async #decodeFrame(index: number, signal: AbortSignal | undefined): Promise<VideoFrame> {
    signal?.throwIfAborted()
    const entry = this.video.frames[index]
    const target = entry && this.video.samples[entry.sampleIndex]
    if (!entry || !target) throw new RangeError(`No existe el frame ${index}`)

    const start = decodeStartFor(this.video.samples, entry.sampleIndex)
    const chunks = await this.#readChunks(start, entry.sampleIndex + 1)
    signal?.throwIfAborted()

    // Nos quedamos con la salida cuyo timestamp coincide con el del frame pedido
    // (o la más cercana, por si el navegador redondea) y cerramos el resto.
    const state: { best: VideoFrame | null; error: unknown } = { best: null, error: null }
    const distance = (frame: VideoFrame) => Math.abs(frame.timestamp - target.timestampUs)
    this.#onOutput = (frame) => {
      if (!state.best || distance(frame) < distance(state.best)) {
        state.best?.close()
        state.best = frame
      } else {
        frame.close()
      }
    }
    this.#onError = (error) => {
      state.error = error
    }

    try {
      const decoder = this.#ensureDecoder()
      for (const chunk of chunks) decoder.decode(chunk)
      await decoder.flush()
    } catch (error) {
      state.error ??= error
    } finally {
      this.#onOutput = null
      this.#onError = null
    }

    const best = state.best as VideoFrame | null
    if (state.error || !best || distance(best) > target.durationUs / 2) {
      best?.close()
      const reason = state.error instanceof Error ? `: ${state.error.message}` : ''
      throw new Error(`No se ha podido decodificar el frame ${index}${reason}`)
    }
    return best
  }

  #ensureDecoder(): VideoDecoder {
    if (this.#decoder?.state === 'configured') return this.#decoder
    // Tras un error el decodificador queda cerrado: se crea uno nuevo.
    this.close()
    const decoder = new VideoDecoder({
      output: (frame) => (this.#onOutput ? this.#onOutput(frame) : frame.close()),
      error: (error) => this.#onError?.(error),
    })
    decoder.configure(this.#config)
    this.#decoder = decoder
    return decoder
  }

  /** Lee las muestras [start, end) del archivo, en un único bloque si están cerca. */
  async #readChunks(start: number, end: number): Promise<EncodedVideoChunk[]> {
    const samples = this.video.samples.slice(start, end)
    const from = samples.reduce((min, s) => Math.min(min, s.offset), Infinity)
    const to = samples.reduce((max, s) => Math.max(max, s.offset + s.size), 0)

    if (to - from <= MAX_BLOCK_READ) {
      const block = await this.#source.read(from, to - from)
      return samples.map((s) => toChunk(s, new Uint8Array(block, s.offset - from, s.size)))
    }
    return Promise.all(
      samples.map(async (s) => toChunk(s, new Uint8Array(await this.#source.read(s.offset, s.size)))),
    )
  }
}

function toChunk(sample: EncodedSample, data: Uint8Array): EncodedVideoChunk {
  return new EncodedVideoChunk({
    type: sample.isKeyframe ? 'key' : 'delta',
    timestamp: sample.timestampUs,
    duration: sample.durationUs,
    data,
  })
}
