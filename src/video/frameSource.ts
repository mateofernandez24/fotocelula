// Decodificación de frames concretos con WebCodecs (VideoDecoder).
// Funciona en el hilo principal y en un Web Worker (no usa el DOM).
import { VideoFormatError, type ByteSource, type DemuxedVideo } from './demux.ts'
import {
  decodeStartFor,
  findFrameByTimestamp,
  type EncodedSample,
  type FrameEntry,
} from './frameTable.ts'

/** Por encima de esto se leen las muestras una a una en vez de en un único bloque. */
const MAX_BLOCK_READ = 64 * 1024 * 1024
/**
 * Al recorrer el vídeo, máximo de frames "en vuelo": en la cola del decodificador o
 * esperando a que los procese quien llama. Limita la memoria (un frame 4K ocupa ~12 MB)
 * y evita que el decodificador se quede sin búferes.
 */
const MAX_IN_FLIGHT = 8
/** Muestras que se leen del archivo de una vez al recorrer el vídeo. */
const READ_BATCH = 32
/** Si no llega ninguna salida en este tiempo, se comprueba de nuevo si cabe más entrada. */
const POLL_MS = 20

export interface ForEachFrameOptions {
  signal?: AbortSignal
  /** Primer frame (incluido). Por defecto, 0. */
  from?: number
  /** Último frame (excluido). Por defecto, hasta el final. */
  to?: number
}

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
  /** Timestamp (µs) de cada frame visible, en orden: para identificar las salidas. */
  readonly #frameTimestampsUs: number[]

  private constructor(source: ByteSource, video: DemuxedVideo, config: VideoDecoderConfig) {
    this.#source = source
    this.video = video
    this.#config = config
    this.#frameTimestampsUs = video.frames.map(
      (frame) => video.samples[frame.sampleIndex]?.timestampUs ?? Number.NaN,
    )
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

  /**
   * Recorre los frames en orden de presentación, decodificando en secuencia (mucho más
   * rápido que pedirlos uno a uno con getFrame). Espera a que `onFrame` termine antes de
   * pasar al siguiente y cierra cada frame después: `onFrame` no debe guardarlo.
   */
  forEachFrame(
    onFrame: (frame: VideoFrame, entry: FrameEntry) => void | Promise<void>,
    options: ForEachFrameOptions = {},
  ): Promise<void> {
    const result = this.#queue.then(() => this.#forEachFrame(onFrame, options))
    this.#queue = result.catch(() => undefined)
    return result
  }

  close(): void {
    if (this.#decoder && this.#decoder.state !== 'closed') this.#decoder.close()
    this.#decoder = null
  }

  async #forEachFrame(
    onFrame: (frame: VideoFrame, entry: FrameEntry) => void | Promise<void>,
    { signal, from = 0, to = this.video.frames.length }: ForEachFrameOptions,
  ): Promise<void> {
    signal?.throwIfAborted()
    const { frames, samples } = this.video
    const first = Math.max(0, from)
    const last = Math.min(frames.length, to)
    const firstEntry = frames[first]
    if (!firstEntry || first >= last) return

    // Muestras a decodificar: desde el fotograma clave del primer frame hasta la última
    // muestra que produce un frame del rango (con frames B no es la del último frame).
    const start = decodeStartFor(samples, firstEntry.sampleIndex)
    let end = start
    for (let i = first; i < last; i++) end = Math.max(end, (frames[i]?.sampleIndex ?? 0) + 1)
    const toleranceUs = (this.video.timing.medianIntervalS * 1e6) / 2

    const pending: VideoFrame[] = []
    const state: { error: unknown; flushed: boolean; wake: (() => void) | null } = {
      error: null,
      flushed: false,
      wake: null,
    }
    const notify = () => {
      state.wake?.()
      state.wake = null
    }
    this.#onOutput = (frame) => {
      pending.push(frame)
      notify()
    }
    this.#onError = (error) => {
      state.error = error
      notify()
    }

    const decoder = this.#ensureDecoder()
    let next = start
    let buffered: EncodedVideoChunk[] = []
    let flushing = false
    try {
      for (;;) {
        signal?.throwIfAborted()
        if (state.error) {
          const reason = state.error instanceof Error ? state.error.message : String(state.error)
          throw new Error(`No se ha podido decodificar el vídeo: ${reason}`)
        }

        while (next < end && decoder.decodeQueueSize + pending.length < MAX_IN_FLIGHT) {
          if (buffered.length === 0) {
            buffered = await this.#readChunks(next, Math.min(end, next + READ_BATCH))
          }
          const chunk = buffered.shift()
          if (!chunk) break
          decoder.decode(chunk)
          next++
        }
        if (next >= end && !flushing) {
          flushing = true
          decoder.flush().then(
            () => {
              state.flushed = true
              notify()
            },
            (error: unknown) => {
              state.error ??= error
              notify()
            },
          )
        }

        const frame = pending.shift()
        if (frame) {
          try {
            const index = findFrameByTimestamp(this.#frameTimestampsUs, frame.timestamp, toleranceUs)
            const entry = index === null ? undefined : frames[index]
            if (entry && entry.index >= first && entry.index < last) await onFrame(frame, entry)
          } finally {
            frame.close()
          }
          continue
        }
        // flush() se resuelve después de entregar todas las salidas: ya no quedan frames.
        if (state.flushed) break
        await new Promise<void>((resolve) => {
          state.wake = resolve
          setTimeout(resolve, POLL_MS)
        })
      }
    } catch (error) {
      // Cancelación, fallo del decodificador o de `onFrame`: se descarta lo que quede en
      // el decodificador para que la siguiente petición empiece limpia.
      if (decoder.state === 'configured') decoder.reset()
      throw error
    } finally {
      for (const frame of pending) frame.close()
      this.#onOutput = null
      this.#onError = null
    }
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
