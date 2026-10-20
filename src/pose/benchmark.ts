// Prueba de rendimiento del Pose Landmarker sobre unos frames ya preparados (derechos).
// Se usa igual en el hilo principal y dentro de un Worker (benchmark.worker.ts).
import { createPoseLandmarker, type PoseLandmarkerOptions } from './landmarker.ts'
import { looksUpright } from './landmarkCheck.ts'

export interface PoseBenchmarkResult {
  createMs: number
  /** El primer frame incluye la preparación del modelo (con GPU, compilar shaders). */
  firstDetectMs: number
  medianDetectMs: number
  frameCount: number
  /** Frames con una persona detectada. */
  detectedFrames: number
  /** Frames cuya pose tiene sentido de arriba abajo (ver looksUpright). */
  uprightFrames: number
}

export async function benchmarkPose(
  images: readonly ImageBitmap[],
  timestampsMs: readonly number[],
  options: PoseLandmarkerOptions,
): Promise<PoseBenchmarkResult> {
  let start = performance.now()
  const landmarker = await createPoseLandmarker(options)
  const createMs = performance.now() - start

  const times: number[] = []
  let detectedFrames = 0
  let uprightFrames = 0
  try {
    images.forEach((image, i) => {
      start = performance.now()
      const result = landmarker.detectForVideo(image, timestampsMs[i] ?? i)
      times.push(performance.now() - start)
      const pose = result.landmarks[0]
      if (pose) {
        detectedFrames++
        if (looksUpright(pose)) uprightFrames++
      }
    })
  } finally {
    landmarker.close()
  }

  const rest = times.slice(1).sort((a, b) => a - b)
  return {
    createMs,
    firstDetectMs: times[0] ?? Number.NaN,
    medianDetectMs: rest[Math.floor(rest.length / 2)] ?? Number.NaN,
    frameCount: images.length,
    detectedFrames,
    uprightFrames,
  }
}
