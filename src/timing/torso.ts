// TypeScript puro: sin dependencias del navegador ni de MediaPipe.
// El cruce de cada puerta se determina por el torso (no por manos, pies ni cabeza).

/** Punto de la pose en coordenadas normalizadas de la imagen derecha (0–1, y hacia abajo). */
export interface Landmark {
  x: number
  y: number
  /** Probabilidad de que el punto se vea (0–1). Si falta, se considera visible. */
  visibility?: number
}

export interface TorsoLandmarks {
  leftShoulder: Landmark
  rightShoulder: Landmark
  leftHip: Landmark
  rightHip: Landmark
}

/** Pose de un frame: lo que guarda el análisis y lo que usan los tests con datos reales. */
export interface PoseFrame {
  frameIndex: number
  /** Timestamp real del frame, en segundos. */
  timestampS: number
  /** null si no se detectó a nadie en ese frame. */
  torso: TorsoLandmarks | null
}

/**
 * De qué puntos sale el punto del torso:
 * - 'both': media de los dos hombros y las dos caderas (lo normal).
 * - 'left' / 'right': solo hombro y cadera de ese lado, porque el otro lado está tapado
 *   (típico al grabar de perfil). Es menos exacto que 'both'.
 */
export type TorsoSource = 'both' | 'left' | 'right'

export interface TorsoPoint {
  x: number
  y: number
  source: TorsoSource
  /** Visibilidad mínima de los puntos usados. */
  visibility: number
}

export const DEFAULT_MIN_VISIBILITY = 0.5

function visibilityOf(landmark: Landmark): number {
  return landmark.visibility ?? 1
}

function isUsable(landmark: Landmark, minVisibility: number): boolean {
  return Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && visibilityOf(landmark) >= minVisibility
}

function mean(points: readonly Landmark[], source: TorsoSource): TorsoPoint {
  let x = 0
  let y = 0
  let visibility = 1
  for (const point of points) {
    x += point.x
    y += point.y
    visibility = Math.min(visibility, visibilityOf(point))
  }
  return { x: x / points.length, y: y / points.length, source, visibility }
}

/**
 * Punto del torso: media de hombros y caderas. Si un lado no es lo bastante visible se
 * usa solo el otro (hombro + cadera del mismo lado); si ninguno lo es, null.
 */
export function torsoPoint(
  torso: TorsoLandmarks,
  minVisibility: number = DEFAULT_MIN_VISIBILITY,
): TorsoPoint | null {
  const left = isUsable(torso.leftShoulder, minVisibility) && isUsable(torso.leftHip, minVisibility)
  const right = isUsable(torso.rightShoulder, minVisibility) && isUsable(torso.rightHip, minVisibility)

  if (left && right) {
    return mean([torso.leftShoulder, torso.rightShoulder, torso.leftHip, torso.rightHip], 'both')
  }
  if (left) return mean([torso.leftShoulder, torso.leftHip], 'left')
  if (right) return mean([torso.rightShoulder, torso.rightHip], 'right')
  return null
}

export interface TorsoTrackPoint {
  frameIndex: number
  timestampS: number
  /** null si en ese frame no hay pose o el torso no se ve bien. */
  point: TorsoPoint | null
}

/** Punto del torso de cada frame, en el mismo orden. */
export function torsoTrack(
  poses: readonly PoseFrame[],
  minVisibility: number = DEFAULT_MIN_VISIBILITY,
): TorsoTrackPoint[] {
  return poses.map((pose) => ({
    frameIndex: pose.frameIndex,
    timestampS: pose.timestampS,
    point: pose.torso ? torsoPoint(pose.torso, minVisibility) : null,
  }))
}
