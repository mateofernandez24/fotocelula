// Creación del Pose Landmarker de MediaPipe con los archivos servidos desde la propia
// app (public/mediapipe y public/models): nunca se descarga nada de terceros.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { blockCrossOriginFetch } from '../privacy/networkGuard.ts'

export type PoseModel = 'lite' | 'full'
export type PoseDelegate = 'GPU' | 'CPU'

const BASE = import.meta.env.BASE_URL

export const POSE_MODEL_URLS: Record<PoseModel, string> = {
  lite: `${BASE}models/pose_landmarker_lite.task`,
  full: `${BASE}models/pose_landmarker_full.task`,
}

export interface PoseLandmarkerOptions {
  model: PoseModel
  delegate: PoseDelegate
  /** Variante ES module del WASM, necesaria dentro de un Worker de tipo module. */
  moduleWasm?: boolean
}

/**
 * Pose Landmarker en modo VIDEO: hay que llamar a detectForVideo con timestamps
 * crecientes (los reales del vídeo, en ms) y aprovecha el seguimiento entre frames.
 *
 * Importante: hay que pasarle la imagen ya derecha (girada en un canvas). Con un
 * VideoFrame y `rotationDegrees` (90, 270 o -90) la versión 1.1.1 devuelve puntos sin
 * sentido (tobillos a la altura de las caderas); comprobado con un vídeo del iPhone.
 */
export async function createPoseLandmarker(options: PoseLandmarkerOptions): Promise<PoseLandmarker> {
  // Antes de crear la tarea: MediaPipe intenta enviar telemetría a Google.
  blockCrossOriginFetch()
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`, options.moduleWasm)
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URLS[options.model],
      delegate: options.delegate,
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}
