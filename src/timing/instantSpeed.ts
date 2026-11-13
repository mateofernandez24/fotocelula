// TypeScript puro: velocidad instantánea aproximada del torso, frame a frame.
// Es orientativa (para el marcador de la repetición): la medida precisa es la velocidad
// media entre puertas. Usa los timestamps reales de cada frame, nunca fps constantes.
import type { TrackSample } from './crossing.ts'
import type { Point } from './geometry.ts'

export interface InstantSpeedOptions {
  /** Ancho / alto de la imagen. */
  aspect: number
  /** Metros por alto de imagen en el plano del deportista (la escala de la referencia). */
  scale: number
  /**
   * Dirección del recorrido en la imagen, en altos de imagen (no hace falta que sea
   * unitaria), p. ej. la perpendicular a las puertas. Solo cuenta el movimiento en esa
   * dirección: el balanceo vertical del torso al correr no suma velocidad. Si falta, se usa
   * la del desplazamiento total del torso.
   */
  axis?: Point | undefined
  /** Media ventana (s) del ajuste alrededor de cada frame. Más ancha, menos ruido y menos detalle. */
  halfWindowS?: number
  /** Frames con torso necesarios en la ventana. */
  minPoints?: number
}

export const DEFAULT_SPEED_HALF_WINDOW_S = 0.1
const DEFAULT_MIN_POINTS = 4

interface Sample {
  t: number
  /** Posición a lo largo del recorrido, en altos de imagen. */
  u: number
}

/**
 * Velocidad (m/s) en cada frame de la trayectoria, o null donde no se puede estimar (sin
 * torso, o sin frames suficientes alrededor). Para cada frame se ajusta una recta a la
 * posición a lo largo del recorrido en una ventana de ±`halfWindowS`; la pendiente es la
 * velocidad. Así se suaviza el temblor del punto del torso.
 */
export function instantSpeeds(track: readonly TrackSample[], options: InstantSpeedOptions): (number | null)[] {
  const halfWindow = options.halfWindowS ?? DEFAULT_SPEED_HALF_WINDOW_S
  const minPoints = options.minPoints ?? DEFAULT_MIN_POINTS
  const axis = unit(options.axis ?? overallDirection(track, options.aspect))

  // Muestras con torso, en orden, y su posición en el array de la trayectoria.
  const samples: Sample[] = []
  const sampleOf: (number | null)[] = []
  for (const frame of track) {
    if (frame.point) {
      sampleOf.push(samples.length)
      samples.push({
        t: frame.timestampS,
        u: frame.point.x * options.aspect * axis.x + frame.point.y * axis.y,
      })
    } else {
      sampleOf.push(null)
    }
  }

  // Ventana deslizante sobre las muestras (están ordenadas por tiempo).
  let start = 0
  let end = 0
  return sampleOf.map((index) => {
    if (index === null) return null
    const center = samples[index] as Sample
    while (start < samples.length && (samples[start] as Sample).t < center.t - halfWindow) start++
    while (end < samples.length && (samples[end] as Sample).t <= center.t + halfWindow) end++
    const window = samples.slice(start, end)
    if (window.length < minPoints) return null
    // Hacen falta frames a los dos lados: si no, en los bordes la recta se extrapola.
    const first = window[0] as Sample
    const last = window.at(-1) as Sample
    if (center.t - first.t < halfWindow / 2 || last.t - center.t < halfWindow / 2) return null
    const slope = fitSlope(window)
    return slope === null ? null : Math.abs(slope) * options.scale
  })
}

/** Pendiente de la recta de mínimos cuadrados u(t). */
function fitSlope(window: readonly Sample[]): number | null {
  const t0 = (window[0] as Sample).t
  let sumT = 0
  let sumU = 0
  for (const p of window) {
    sumT += p.t - t0
    sumU += p.u
  }
  const meanT = sumT / window.length
  const meanU = sumU / window.length
  let covariance = 0
  let variance = 0
  for (const p of window) {
    const dt = p.t - t0 - meanT
    covariance += dt * (p.u - meanU)
    variance += dt * dt
  }
  return variance > 0 ? covariance / variance : null
}

/** Dirección del primer al último punto con torso (en altos de imagen). */
function overallDirection(track: readonly TrackSample[], aspect: number): Point {
  const first = track.find((f) => f.point)?.point
  const last = track.findLast((f) => f.point)?.point
  if (!first || !last) return { x: 1, y: 0 }
  return { x: (last.x - first.x) * aspect, y: last.y - first.y }
}

function unit(v: Point): Point {
  const length = Math.hypot(v.x, v.y)
  return length > 0 ? { x: v.x / length, y: v.y / length } : { x: 1, y: 0 }
}
