// Worker que hace todo el análisis de pose fuera del hilo principal: lee el archivo,
// decodifica en orden, gira cada frame y ejecuta MediaPipe. A la interfaz solo le llegan
// el progreso y los resultados.
import type { PoseFrame } from '../timing/torso.ts'
import { blobByteSource, demuxVideo, VideoFormatError } from '../video/demux.ts'
import { FrameSource } from '../video/frameSource.ts'
import type { AnalysisRequest, AnalysisResponse } from './analysisMessages.ts'
import { analyzePose } from './analyzePose.ts'

/** Cada cuántos frames se manda el progreso (con las poses nuevas). */
const PROGRESS_EVERY = 5

let controller: AbortController | null = null

function send(message: AnalysisResponse) {
  self.postMessage(message)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function start(request: Extract<AnalysisRequest, { type: 'start' }>) {
  controller?.abort()
  const current = new AbortController()
  controller = current

  if (typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    send({
      type: 'error',
      kind: 'environment',
      message: 'WebCodecs u OffscreenCanvas no están disponibles en el Worker.',
    })
    return
  }

  let source: FrameSource | null = null
  // Hasta que MediaPipe carga, un fallo es del entorno (el Worker), no del vídeo.
  let ready = false
  try {
    const bytes = blobByteSource(request.file)
    const video = await demuxVideo(bytes)
    source = await FrameSource.open(bytes, video)
    let batch: PoseFrame[] = []

    const analysis = await analyzePose(source, {
      model: request.model,
      delegate: request.delegate,
      moduleWasm: true,
      signal: current.signal,
      onReady: (delegate) => {
        ready = true
        send({ type: 'started', frameCount: video.frames.length, delegate })
      },
      onFrame: (pose, done, total) => {
        batch.push(pose)
        if (batch.length >= PROGRESS_EVERY || done === total) {
          send({ type: 'progress', done, total, poses: batch })
          batch = []
        }
      },
    })
    send({ type: 'done', analysis })
  } catch (error) {
    if (current.signal.aborted) {
      send({ type: 'error', kind: 'cancelled', message: 'Análisis cancelado.' })
    } else if (error instanceof VideoFormatError) {
      send({ type: 'error', kind: 'video', message: error.message })
    } else if (source && !ready) {
      send({ type: 'error', kind: 'environment', message: `MediaPipe no carga en el Worker: ${errorText(error)}` })
    } else {
      send({ type: 'error', kind: 'failed', message: errorText(error) })
    }
  } finally {
    source?.close()
    if (controller === current) controller = null
  }
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data
  if (request.type === 'cancel') controller?.abort()
  else void start(request)
}
