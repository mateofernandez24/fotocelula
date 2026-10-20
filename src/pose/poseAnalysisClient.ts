// Lanza el análisis de pose desde la interfaz: en un Worker si se puede y, si el Worker
// no sirve en este navegador, en el hilo principal (más lento para la interfaz, pero
// funciona).
import type { PoseFrame } from '../timing/torso.ts'
import type { FrameSource as FrameSourceInstance } from '../video/frameSource.ts'
import type { AnalysisErrorKind, AnalysisRequest, AnalysisResponse } from './analysisMessages.ts'
import type { PoseAnalysis } from './analyzePose.ts'
import type { PoseDelegate, PoseModel } from './landmarker.ts'

/** Cada cuántos frames se avisa del progreso en el hilo principal (igual que el Worker). */
const PROGRESS_EVERY = 5
/** Si el Worker no confirma la cancelación en este tiempo, se cierra igualmente. */
const CANCEL_GRACE_MS = 1000

export class PoseAnalysisError extends Error {
  override name = 'PoseAnalysisError'
  readonly kind: AnalysisErrorKind

  constructor(kind: AnalysisErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export interface PoseAnalysisOptions {
  model: PoseModel
  delegate: PoseDelegate
}

export interface PoseAnalysisCallbacks {
  onStarted?: (info: { frameCount: number; delegate: PoseDelegate; inWorker: boolean }) => void
  /** Poses nuevas desde el último aviso. */
  onProgress?: (done: number, total: number, poses: PoseFrame[]) => void
}

export interface PoseAnalysisJob {
  /** Se rechaza con PoseAnalysisError (kind 'cancelled' si se cancela). */
  result: Promise<PoseAnalysis>
  cancel(): void
}

type Outcome = { ok: true; analysis: PoseAnalysis } | { ok: false; kind: AnalysisErrorKind; message: string }

export function startPoseAnalysis(
  file: File,
  options: PoseAnalysisOptions,
  callbacks: PoseAnalysisCallbacks = {},
): PoseAnalysisJob {
  const controller = new AbortController()
  const result = (async () => {
    let outcome = await runInWorker(file, options, callbacks, controller.signal)
    if (!outcome.ok && outcome.kind === 'environment' && !controller.signal.aborted) {
      console.warn(`Análisis de pose en el hilo principal: ${outcome.message}`)
      outcome = await runInMainThread(file, options, callbacks, controller.signal)
    }
    if (!outcome.ok) throw new PoseAnalysisError(outcome.kind, outcome.message)
    return outcome.analysis
  })()
  return { result, cancel: () => controller.abort() }
}

function runInWorker(
  file: File,
  options: PoseAnalysisOptions,
  callbacks: PoseAnalysisCallbacks,
  signal: AbortSignal,
): Promise<Outcome> {
  let worker: Worker
  try {
    worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Promise.resolve({ ok: false, kind: 'environment', message: `No se ha podido crear el Worker: ${message}` })
  }
  return new Promise<Outcome>((resolve) => {
    const finish = (outcome: Outcome) => {
      signal.removeEventListener('abort', onAbort)
      worker.terminate()
      resolve(outcome)
    }
    const onAbort = () => {
      worker.postMessage({ type: 'cancel' } satisfies AnalysisRequest)
      setTimeout(() => finish({ ok: false, kind: 'cancelled', message: 'Análisis cancelado.' }), CANCEL_GRACE_MS)
    }
    signal.addEventListener('abort', onAbort)

    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      const message = event.data
      switch (message.type) {
        case 'started':
          callbacks.onStarted?.({ frameCount: message.frameCount, delegate: message.delegate, inWorker: true })
          break
        case 'progress':
          callbacks.onProgress?.(message.done, message.total, message.poses)
          break
        case 'done':
          finish({ ok: true, analysis: message.analysis })
          break
        case 'error':
          finish({ ok: false, kind: message.kind, message: message.message })
          break
      }
    }
    // El Worker no ha llegado a cargar (p. ej. un navegador sin Workers de tipo module).
    worker.onerror = (event) => {
      event.preventDefault()
      finish({ ok: false, kind: 'environment', message: event.message || 'No se ha podido cargar el Worker.' })
    }
    worker.postMessage({ type: 'start', file, ...options } satisfies AnalysisRequest)
  })
}

async function runInMainThread(
  file: File,
  options: PoseAnalysisOptions,
  callbacks: PoseAnalysisCallbacks,
  signal: AbortSignal,
): Promise<Outcome> {
  // Solo se cargan si hacen falta: MediaPipe pesa ~160 KB.
  const [{ blobByteSource, demuxVideo, VideoFormatError }, { FrameSource }, { analyzePose }] =
    await Promise.all([
      import('../video/demux.ts'),
      import('../video/frameSource.ts'),
      import('./analyzePose.ts'),
    ])
  let source: FrameSourceInstance | null = null
  try {
    const bytes = blobByteSource(file)
    const video = await demuxVideo(bytes)
    source = await FrameSource.open(bytes, video)
    let batch: PoseFrame[] = []
    const analysis = await analyzePose(source, {
      ...options,
      signal,
      onReady: (delegate) =>
        callbacks.onStarted?.({ frameCount: video.frames.length, delegate, inWorker: false }),
      onFrame: (pose, done, total) => {
        batch.push(pose)
        if (batch.length >= PROGRESS_EVERY || done === total) {
          callbacks.onProgress?.(done, total, batch)
          batch = []
        }
      },
    })
    return { ok: true, analysis }
  } catch (error) {
    if (signal.aborted) return { ok: false, kind: 'cancelled', message: 'Análisis cancelado.' }
    if (error instanceof VideoFormatError) return { ok: false, kind: 'video', message: error.message }
    return { ok: false, kind: 'failed', message: error instanceof Error ? error.message : String(error) }
  } finally {
    source?.close()
  }
}
