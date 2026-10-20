// TypeScript puro: comprobaciones sobre los puntos de MediaPipe Pose (coordenadas
// normalizadas, y crece hacia abajo).

/** Índices de los puntos de MediaPipe Pose que usa la app. */
export const LANDMARK = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const

export interface Point2 {
  x: number
  y: number
}

/**
 * true si, de arriba abajo, van nariz → hombros → caderas → rodillas → tobillos, como en
 * una persona de pie o corriendo. Sirve para detectar que la imagen llegó mal girada al
 * modelo (los puntos salen amontonados o en otro orden).
 */
export function looksUpright(landmarks: readonly Point2[]): boolean {
  const mid = (a: number, b: number) => {
    const pa = landmarks[a]
    const pb = landmarks[b]
    return pa && pb ? (pa.y + pb.y) / 2 : Number.NaN
  }
  const nose = landmarks[LANDMARK.nose]?.y ?? Number.NaN
  const shoulders = mid(LANDMARK.leftShoulder, LANDMARK.rightShoulder)
  const hips = mid(LANDMARK.leftHip, LANDMARK.rightHip)
  const knees = mid(LANDMARK.leftKnee, LANDMARK.rightKnee)
  const ankles = mid(LANDMARK.leftAnkle, LANDMARK.rightAnkle)
  // Las comparaciones con NaN son falsas: si falta algún punto, no es "derecha".
  return nose < shoulders && shoulders < hips && hips < knees && knees < ankles
}
