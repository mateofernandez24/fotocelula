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
 * Al recorrer el vídeo, frames ya decodificados que pueden esperar a quien los procesa.
 * Cada frame abierto retiene memoria del decodificador (un frame 4K ocupa ~12 MB); en
 * Safari, retener varios provoca "Decoder failure".
 */
const MAX_PENDING = 2
/** Muestras enviadas al decodificador cuya salida aún no ha llegado. */
const MAX_DECODER_AHEAD = 12
/**
 * Si el decodificador no entrega nada en este tiempo, se le envían más muestras aunque se
 * haya alcanzado MAX_DECODER_AHEAD (algunos descartan frames y nunca los entregan).
 */
const STALL_MS = 1000
/** Muestras que se leen del archivo de una vez al recorrer el vídeo. */
const READ_BATCH = 32
/** Si no llega ninguna salida en este tiempo, se comprueba de nuevo si cabe más entrada. */
const POLL_MS = 20
/** Reintentos con un decodificador nuevo si falla a mitad (fallos puntuales de Safari). */
const MAX_DECODER_RESTARTS = 3
const RESTART_DELAY_MS = 200
/** Sin peticiones durante este tiempo, se libera el decodificador (recursos de hardware). */
const IDLE_RELEASE_MS = 3000

export interface ForEachFrameOptions {
  signal?: AbortSignal
  /** Primer frame (incluido). Por defecto, 0. */
  from?: number
  /** Último frame (excluido). Por defecto, hasta el final. */
  to?: number
  /** Aviso cuando el decodificador falla y se reanuda con uno nuevo desde `frameIndex`. */
  onDecoderRestart?: (frameIndex: number, reason: string) => void
}

/** Fallo del propio VideoDecoder (no del vídeo ni de quien procesa los frames). */
class DecoderFailure extends Error {
  override name = 'DecoderFailure'
}

function decoderFailure(error: unknown): DecoderFailure {
  return new DecoderFailure(error instanceof Error ? error.message : String(error))
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
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
  /** Peticiones en curso o en cola; con 0 durante un rato se libera el decodificador. */
  #active = 0
  #idleTimer: ReturnType<typeof setTimeout> | null = null
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
    return this.#enqueue(async () => {
      try {
        return await this.#decodeFrame(index, signal)
      } catch (error) {
        if (!(error instanceof DecoderFailure)) throw error
        // Fallo puntual del decodificador: se reintenta una vez con uno nuevo.
        this.#discardDecoder()
        try {
          return await this.#decodeFrame(index, signal)
        } catch (retryError) {
          if (!(retryError instanceof DecoderFailure)) throw retryError
          throw new Error(`No se ha podido decodificar el frame ${index + 1}: ${retryError.message}`)
        }
      }
    })
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
    return this.#enqueue(() => this.#forEachFrame(onFrame, options))
  }

  /** Libera el decodificador. Se puede seguir usando: se crea otro al pedir frames. */
  close(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer)
    this.#idleTimer = null
    this.#discardDecoder()
  }

  /** Atiende las peticiones de una en una y libera el decodificador cuando quedan inactivas. */
  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.#active++
    if (this.#idleTimer) clearTimeout(this.#idleTimer)
    this.#idleTimer = null
    const result = this.#queue.then(task)
    this.#queue = result.catch(() => undefined)
    const settle = () => {
      this.#active--
      if (this.#active === 0) {
        this.#idleTimer = setTimeout(() => {
          this.#idleTimer = null
          if (this.#active === 0) this.#discardDecoder()
        }, IDLE_RELEASE_MS)
      }
    }
    result.then(settle, settle)
    return result
  }

  #discardDecoder(): void {
    if (this.#decoder && this.#decoder.state !== 'closed') this.#decoder.close()
    this.#decoder = null
  }

  async #forEachFrame(
    onFrame: (frame: VideoFrame, entry: FrameEntry) => void | Promise<void>,
    { signal, from = 0, to = this.video.frames.length, onDecoderRestart }: ForEachFrameOptions,
  ): Promise<void> {
    signal?.throwIfAborted()
    const first = Math.max(0, from)
    const last = Math.min(this.video.frames.length, to)
    // Primer frame aún no entregado: si el decodificador falla, se reanuda desde aquí.
    let next = first
    for (let restarts = 0; next < last; restarts++) {
      try {
        await this.#decodeRun(next, last, signal, async (frame, entry) => {
          await onFrame(frame, entry)
          next = entry.index + 1
        })
        return
      } catch (error) {
        if (!(error instanceof DecoderFailure)) throw error
        if (next >= last) return
        if (restarts >= MAX_DECODER_RESTARTS) {
          throw new Error(
            `El decodificador de vídeo ha fallado en el frame ${next + 1} ` +
              `(${restarts} reintentos): ${error.message}`,
          )
        }
        onDecoderRestart?.(next, error.message)
        this.#discardDecoder()
        await delay(RESTART_DELAY_MS * (restarts + 1), signal)
      }
    }
  }

  /**
   * Decodifica en secuencia desde el fotograma clave de `firstFrame` y entrega, en orden de
   * presentación, los frames [firstFrame, last). Los fallos del decodificador se lanzan
   * como DecoderFailure para que #forEachFrame pueda reanudar.
   */
  async #decodeRun(
    firstFrame: number,
    last: number,
    signal: AbortSignal | undefined,
    deliver: (frame: VideoFrame, entry: FrameEntry) => Promise<void>,
  ): Promise<void> {
    const { frames, samples } = this.video
    const firstEntry = frames[firstFrame]
    if (!firstEntry) return

    // Muestras a decodificar: desde el fotograma clave del primer frame hasta la última
    // muestra que produce un frame del rango (con frames B no es la del último frame).
    const start = decodeStartFor(samples, firstEntry.sampleIndex)
    let end = start
    for (let i = firstFrame; i < last; i++) end = Math.max(end, (frames[i]?.sampleIndex ?? 0) + 1)
    const toleranceUs = (this.video.timing.medianIntervalS * 1e6) / 2

    const pending: VideoFrame[] = []
    const state: {
      error: unknown
      flushed: boolean
      received: number
      lastOutputAt: number
      wake: (() => void) | null
    } = { error: null, flushed: false, received: 0, lastOutputAt: performance.now(), wake: null }
    const notify = () => {
      state.wake?.()
      state.wake = null
    }
    this.#onOutput = (frame) => {
      pending.push(frame)
      state.received++
      state.lastOutputAt = performance.now()
      notify()
    }
    this.#onError = (error) => {
      state.error = error
      notify()
    }

    const decoder = this.#ensureDecoder()
    let next = start
    let fed = 0
    let buffered: EncodedVideoChunk[] = []
    let flushing = false
    try {
      for (;;) {
        signal?.throwIfAborted()
        if (state.error) throw decoderFailure(state.error)

        const stalled = performance.now() - state.lastOutputAt > STALL_MS
        while (
          next < end &&
          pending.length < MAX_PENDING &&
          (fed - state.received < MAX_DECODER_AHEAD || stalled)
        ) {
          if (buffered.length === 0) {
            buffered = await this.#readChunks(next, Math.min(end, next + READ_BATCH))
          }
          const chunk = buffered.shift()
          if (!chunk) break
          try {
            decoder.decode(chunk)
          } catch (error) {
            // El decodificador se cerró por un error que aún no ha llegado al callback.
            throw decoderFailure(state.error ?? error)
          }
          next++
          fed++
          if (stalled) break
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
            // Tras reanudar se vuelven a decodificar frames ya entregados: se saltan.
            if (entry && entry.index >= firstFrame && entry.index < last) await deliver(frame, entry)
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
      // Cancelación, fallo del decodificador o de quien procesa los frames: se descarta lo
      // que quede en el decodificador para que la siguiente petición empiece limpia.
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
    if (state.error) {
      best?.close()
      throw decoderFailure(state.error)
    }
    if (!best || distance(best) > target.durationUs / 2) {
      best?.close()
      throw new Error(`No se ha podido decodificar el frame ${index + 1}`)
    }
    return best
  }

  #ensureDecoder(): VideoDecoder {
    if (this.#decoder?.state === 'configured') return this.#decoder
    // Tras un error el decodificador queda cerrado: se crea uno nuevo.
    this.#discardDecoder()
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
