// TypeScript puro: detección del instante en que el torso cruza cada puerta, con
// interpolación entre frames usando los timestamps reales (nunca fps constantes).
import { signedDistance, type Gate, type Point } from './geometry.ts'

/** Un frame de la trayectoria del torso (null si en ese frame no hay torso). */
export interface TrackSample {
  frameIndex: number
  timestampS: number
  point: Point | null
}

export interface CrossingOptions {
  /** Ancho / alto de la imagen. */
  aspect: number
  /**
   * Histéresis, en altos de imagen: el torso tiene que alejarse al menos esto de la línea
   * a cada lado para contar un cruce. Evita que el temblor del punto sobre la línea cuente
   * como varios cruces. Por defecto, 1 % del alto de la imagen.
   */
  hysteresis?: number
  /** Huecos sin torso más largos que esto (s) cortan la trayectoria: no se cruza a ciegas. */
  maxGapS?: number
}

export const DEFAULT_HYSTERESIS = 0.01
export const DEFAULT_MAX_GAP_S = 0.2

export interface Crossing {
  /** Instante interpolado del cruce, en segundos. */
  timeS: number
  /** Último frame con torso antes del cruce y primero después (índices de frame). */
  beforeFrame: number
  afterFrame: number
  /** Frames sin torso entre `beforeFrame` y `afterFrame` (0 lo normal). */
  gapFrames: number
  /**
   * Sentido del cruce respecto a la puerta: de distancia negativa a positiva (1), al revés
   * (-1) o desconocido (0, cruce manual sin torso en esos frames).
   */
  direction: 1 | -1 | 0
  /** Frames usados para ajustar la recta del cruce (de un lado claro al otro). */
  fitFrames: number
}

interface Sample {
  frameIndex: number
  t: number
  s: number
}

/**
 * Todos los cruces de una puerta, en orden. Para cada uno, el instante se estima ajustando
 * una recta a la distancia con signo desde el último frame claramente a un lado hasta el
 * primero claramente al otro (con solo esos dos frames, es la interpolación lineal).
 */
export function findAllCrossings(
  track: readonly TrackSample[],
  gate: Gate,
  options: CrossingOptions,
): Crossing[] {
  const hysteresis = options.hysteresis ?? DEFAULT_HYSTERESIS
  const maxGapS = options.maxGapS ?? DEFAULT_MAX_GAP_S
  const samples: Sample[] = []
  for (const frame of track) {
    if (!frame.point) continue
    const s = signedDistance(gate, frame.point, options.aspect)
    if (Number.isFinite(s)) samples.push({ frameIndex: frame.frameIndex, t: frame.timestampS, s })
  }

  const crossings: Crossing[] = []
  // Lado en el que el torso estaba claramente (fuera de la banda de histéresis) y el
  // último frame en el que lo estaba.
  let side: 0 | 1 | -1 = 0
  let lastClear = -1
  for (let i = 0; i < samples.length; i++) {
    const current = samples[i] as Sample
    const previous = samples[i - 1]
    // Un hueco largo sin torso corta la trayectoria.
    if (previous && current.t - previous.t > maxGapS) {
      side = 0
      lastClear = -1
    }
    const clearSide = current.s >= hysteresis ? 1 : current.s <= -hysteresis ? -1 : 0
    if (clearSide === 0) continue
    if (side === 0 || clearSide === side) {
      side = clearSide
      lastClear = i
      continue
    }
    const crossing = fitCrossing(samples.slice(lastClear, i + 1), clearSide)
    if (crossing) crossings.push(crossing)
    side = clearSide
    lastClear = i
  }
  return crossings
}

/**
 * Cruce de cada puerta, en orden: el de la puerta k es el primero posterior al de la
 * puerta k − 1. null si una puerta no se cruza (o no se puede saber cuándo).
 */
export function findCrossings(
  track: readonly TrackSample[],
  gates: readonly Gate[],
  options: CrossingOptions,
): (Crossing | null)[] {
  let afterS = -Infinity
  return gates.map((gate) => {
    const crossing = findAllCrossings(track, gate, options).find((c) => c.timeS > afterS) ?? null
    if (crossing) afterS = crossing.timeS
    return crossing
  })
}

/**
 * Cruce marcado a mano: el torso cruza entre `beforeFrame` y `afterFrame`. Si los dos
 * frames tienen torso se interpola; si no, se toma el punto medio entre ambos.
 */
export function manualCrossing(
  track: readonly TrackSample[],
  gate: Gate,
  beforeFrame: number,
  afterFrame: number,
  aspect: number,
): Crossing | null {
  const before = track.find((f) => f.frameIndex === beforeFrame)
  const after = track.find((f) => f.frameIndex === afterFrame)
  if (!before || !after || after.timestampS <= before.timestampS) return null
  const gapFrames = Math.max(0, afterFrame - beforeFrame - 1)
  if (before.point && after.point) {
    const s0 = signedDistance(gate, before.point, aspect)
    const s1 = signedDistance(gate, after.point, aspect)
    // Si de verdad cambia de lado entre los dos frames, se interpola.
    if (s0 !== s1 && Math.sign(s0) !== Math.sign(s1)) {
      const fraction = s0 / (s0 - s1)
      return {
        timeS: before.timestampS + fraction * (after.timestampS - before.timestampS),
        beforeFrame,
        afterFrame,
        gapFrames,
        direction: s1 > s0 ? 1 : -1,
        fitFrames: 2,
      }
    }
  }
  return {
    timeS: (before.timestampS + after.timestampS) / 2,
    beforeFrame,
    afterFrame,
    gapFrames,
    direction: 0,
    fitFrames: 0,
  }
}

/** Ajuste por mínimos cuadrados de s(t) y su cero, acotado a donde cambia el signo. */
function fitCrossing(window: readonly Sample[], direction: 1 | -1): Crossing | null {
  const first = window[0]
  const last = window.at(-1)
  if (!first || !last || window.length < 2) return null

  // Tiempos relativos al primero, para no perder precisión.
  let sumT = 0
  let sumS = 0
  for (const p of window) {
    sumT += p.t - first.t
    sumS += p.s
  }
  const meanT = sumT / window.length
  const meanS = sumS / window.length
  let covariance = 0
  let variance = 0
  for (const p of window) {
    const dt = p.t - first.t - meanT
    covariance += dt * (p.s - meanS)
    variance += dt * dt
  }
  const slope = variance > 0 ? covariance / variance : 0
  // Si la recta no va en el sentido del cruce (ruido extremo), se usa la interpolación
  // entre los extremos del tramo, que sí cambian de lado.
  let timeS: number
  if (slope * direction > 0) {
    timeS = first.t + meanT - meanS / slope
  } else {
    timeS = first.t + (first.s / (first.s - last.s)) * (last.t - first.t)
  }

  // El cruce no puede caer donde los datos dicen que el torso aún no ha cambiado de lado:
  // se acota entre el primer y el último par de frames en que cambia el signo. (En el
  // borde de la imagen, un punto atípico puede tirar de la recta fuera de ese tramo.)
  const changes: number[] = []
  for (let i = 0; i < window.length - 1; i++) {
    const a = (window[i] as Sample).s
    const b = (window[i + 1] as Sample).s
    if (a !== b && Math.sign(a) !== Math.sign(b)) changes.push(i)
  }
  const firstChange = changes[0] ?? 0
  const lastChange = changes.at(-1) ?? window.length - 2
  const low = (window[firstChange] as Sample).t
  const high = (window[lastChange + 1] as Sample).t
  timeS = Math.min(high, Math.max(low, timeS))

  // Par de frames con cambio de signo que contiene el instante estimado.
  const beforeIndex = changes.find((i) => (window[i + 1] as Sample).t >= timeS) ?? lastChange
  const before = window[beforeIndex] as Sample
  const after = window[beforeIndex + 1] as Sample
  return {
    timeS,
    beforeFrame: before.frameIndex,
    afterFrame: after.frameIndex,
    gapFrames: Math.max(0, after.frameIndex - before.frameIndex - 1),
    direction,
    fitFrames: window.length,
  }
}
