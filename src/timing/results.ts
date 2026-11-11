// TypeScript puro: tiempos, parciales y velocidades a partir de los cruces de las puertas.
import type { Crossing } from './crossing.ts'
import { averageSpeed, toKmh } from './speed.ts'

export interface SegmentResult {
  /** Índices de las puertas de salida y llegada. */
  fromGate: number
  toGate: number
  distanceM: number
  timeS: number
  /** ± s: combinación de las incertidumbres de los dos cruces. */
  uncertaintyS: number
  speedMs: number
  speedKmh: number
  /** ± m/s que corresponden a la incertidumbre del tiempo. */
  speedUncertaintyMs: number
}

export interface RunResults {
  /** Un tramo por cada par de puertas consecutivas; null si falta un cruce o la distancia. */
  segments: (SegmentResult | null)[]
  /** De la primera a la última puerta (con 2 puertas coincide con el único tramo). */
  total: SegmentResult | null
}

/**
 * @param crossings cruce de cada puerta, en orden (null si no se detectó)
 * @param distancesM distancia entre cada par de puertas consecutivas (una menos que puertas)
 */
export function computeRunResults(
  crossings: readonly (Crossing | null)[],
  distancesM: readonly number[],
): RunResults {
  const segments: (SegmentResult | null)[] = []
  for (let i = 0; i + 1 < crossings.length; i++) {
    segments.push(segment(crossings, i, i + 1, distancesM[i]))
  }

  let total: SegmentResult | null = null
  const last = crossings.length - 1
  if (last >= 1) {
    const parts = distancesM.slice(0, last)
    const valid = parts.length === last && parts.every(isValidDistance)
    total = valid ? segment(crossings, 0, last, parts.reduce((sum, d) => sum + d, 0)) : null
  }
  return { segments, total }
}

function isValidDistance(distanceM: number | undefined): distanceM is number {
  return distanceM !== undefined && Number.isFinite(distanceM) && distanceM > 0
}

function segment(
  crossings: readonly (Crossing | null)[],
  fromGate: number,
  toGate: number,
  distanceM: number | undefined,
): SegmentResult | null {
  const from = crossings[fromGate]
  const to = crossings[toGate]
  if (!from || !to || !isValidDistance(distanceM) || to.timeS <= from.timeS) return null
  const timeS = to.timeS - from.timeS
  const uncertaintyS = Math.hypot(from.uncertaintyS, to.uncertaintyS)
  const speedMs = averageSpeed(distanceM, from.timeS, to.timeS)
  return {
    fromGate,
    toGate,
    distanceM,
    timeS,
    uncertaintyS,
    speedMs,
    speedKmh: toKmh(speedMs),
    // v = d / t  →  Δv ≈ v · Δt / t
    speedUncertaintyMs: (speedMs * uncertaintyS) / timeS,
  }
}
