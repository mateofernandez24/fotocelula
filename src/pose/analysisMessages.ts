// Mensajes entre la interfaz y analysis.worker.ts.
import type { PoseFrame } from '../timing/torso.ts'
import type { PoseAnalysis } from './analyzePose.ts'
import type { PoseDelegate, PoseModel } from './landmarker.ts'

export type AnalysisRequest =
  | { type: 'start'; file: File; model: PoseModel; delegate: PoseDelegate }
  | { type: 'cancel' }

/**
 * Tipo de error:
 * - 'environment': el Worker no puede hacer el trabajo (sin WebCodecs o sin MediaPipe en
 *   este contexto). Merece la pena reintentarlo en el hilo principal.
 * - 'video': el vídeo no se puede leer o decodificar.
 * - 'cancelled': lo canceló el usuario.
 * - 'failed': cualquier otro fallo.
 */
export type AnalysisErrorKind = 'environment' | 'video' | 'cancelled' | 'failed'

export type AnalysisResponse =
  | { type: 'started'; frameCount: number; delegate: PoseDelegate }
  | { type: 'progress'; done: number; total: number; poses: PoseFrame[] }
  | { type: 'done'; analysis: PoseAnalysis }
  | { type: 'error'; kind: AnalysisErrorKind; message: string }
