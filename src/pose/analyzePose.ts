// Análisis de pose de todo el vídeo: recorre los frames en orden, los gira (el modelo
// necesita la imagen derecha), los reduce y guarda hombros y caderas de cada frame.
// Funciona en un Worker (analysis.worker.ts) y, si no se puede, en el hilo principal.
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Landmark, PoseFrame, TorsoLandmarks } from '../timing/torso.ts'
import { drawRotatedFrame } from '../video/drawFrame.ts'
import type { FrameSource } from '../video/frameSource.ts'
import { createPoseLandmarker, type PoseDelegate, type PoseModel } from './landmarker.ts'
import { LANDMARK } from './landmarkCheck.ts'

/** Lado mayor de la imagen que recibe el modelo: de sobra para su entrada de 256 px. */
export const DEFAULT_MAX_SIDE = 960

/** Resultado del análisis. Es JSON puro: se puede guardar en test-data para los tests. */
export interface PoseAnalysis {
  version: 1
  model: PoseModel
  /** El que se usó realmente (si la GPU falla se pasa a CPU). */
  delegate: PoseDelegate
  /** Tamaño de la imagen derecha que recibió el modelo (las coordenadas van de 0 a 1). */
  imageWidth: number
  imageHeight: number
  /** Una entrada por frame del rango analizado, en orden. */
  frames: PoseFrame[]
  elapsedMs: number
  /** Veces que falló el decodificador y se reanudó con uno nuevo (0 lo normal). */
  decoderRestarts: number
}

export interface AnalyzePoseOptions {
  model: PoseModel
  delegate: PoseDelegate
  /** Variante ES module del WASM (necesaria en un Worker de tipo module). */
  moduleWasm?: boolean
  maxSide?: number
  signal?: AbortSignal
  /** Se llama cuando el modelo está cargado, antes del primer frame. */
  onReady?: (delegate: PoseDelegate) => void
  /** Se llama con cada frame analizado. */
  onFrame?: (pose: PoseFrame, done: number, total: number) => void
}

/** Crea el landmarker; si la GPU falla, lo intenta con CPU. */
export async function createLandmarkerWithFallback(
  model: PoseModel,
  delegate: PoseDelegate,
  moduleWasm?: boolean,
): Promise<{ landmarker: PoseLandmarker; delegate: PoseDelegate }> {
  try {
    return { landmarker: await createPoseLandmarker({ model, delegate, moduleWasm }), delegate }
  } catch (error) {
    if (delegate !== 'GPU') throw error
    return { landmarker: await createPoseLandmarker({ model, delegate: 'CPU', moduleWasm }), delegate: 'CPU' }
  }
}

export async function analyzePose(source: FrameSource, options: AnalyzePoseOptions): Promise<PoseAnalysis> {
  const start = performance.now()
  const { video } = source
  const { landmarker, delegate } = await createLandmarkerWithFallback(
    options.model,
    options.delegate,
    options.moduleWasm,
  )
  try {
    options.onReady?.(delegate)
    const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE
    const scale = Math.min(1, maxSide / Math.max(video.displayWidth, video.displayHeight))
    const canvas = new OffscreenCanvas(
      Math.round(video.displayWidth * scale),
      Math.round(video.displayHeight * scale),
    )
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se ha podido crear un canvas 2D.')

    const frames: PoseFrame[] = []
    const total = video.frames.length
    let decoderRestarts = 0
    await source.forEachFrame(
      (frame, entry) => {
        drawRotatedFrame(ctx, frame, video.rotation)
        // Modo VIDEO: timestamps reales y crecientes, en ms.
        const result = landmarker.detectForVideo(canvas, entry.timestampS * 1000)
        const pose: PoseFrame = {
          frameIndex: entry.index,
          timestampS: entry.timestampS,
          torso: toTorso(result.landmarks[0]),
        }
        frames.push(pose)
        options.onFrame?.(pose, frames.length, total)
      },
      {
        ...(options.signal ? { signal: options.signal } : {}),
        onDecoderRestart: (frameIndex, reason) => {
          decoderRestarts++
          console.warn(`Decodificador reiniciado en el frame ${frameIndex + 1}: ${reason}`)
        },
      },
    )

    return {
      version: 1,
      model: options.model,
      delegate,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      frames,
      elapsedMs: Math.round(performance.now() - start),
      decoderRestarts,
    }
  } finally {
    landmarker.close()
  }
}

/** Hombros y caderas de la pose detectada, redondeados para que el JSON ocupe poco. */
function toTorso(landmarks: NormalizedLandmark[] | undefined): TorsoLandmarks | null {
  if (!landmarks) return null
  const pick = (index: number): Landmark | null => {
    const point = landmarks[index]
    return point ? { x: round(point.x, 5), y: round(point.y, 5), visibility: round(point.visibility, 3) } : null
  }
  const leftShoulder = pick(LANDMARK.leftShoulder)
  const rightShoulder = pick(LANDMARK.rightShoulder)
  const leftHip = pick(LANDMARK.leftHip)
  const rightHip = pick(LANDMARK.rightHip)
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null
  return { leftShoulder, rightShoulder, leftHip, rightHip }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
