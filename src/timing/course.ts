// TypeScript puro: une la detección de cruces, los ajustes manuales y los resultados.
// El sentido de la carrera se deduce solo: las puertas pueden estar en la lista en el
// orden en que se cruzan o al revés.
import {
  findCrossings,
  manualCrossing,
  type Crossing,
  type CrossingOptions,
  type TrackSample,
} from './crossing.ts'
import type { Gate } from './geometry.ts'
import { computeRunResults, type SegmentResult } from './results.ts'

/** Cruce marcado a mano: el torso cruza la puerta entre estos dos frames. */
export interface ManualPair {
  beforeFrame: number
  afterFrame: number
}

export interface GateCrossing {
  crossing: Crossing | null
  manual: boolean
}

/**
 * - 'forward': las puertas se cruzan en el orden de la lista (1, 2, 3…).
 * - 'reverse': en orden inverso (… 3, 2, 1).
 * - null: no se sabe (menos de dos cruces) o los instantes no siguen ningún orden.
 */
export type CourseOrder = 'forward' | 'reverse' | null

export interface CourseResult {
  /** Cruce de cada puerta, en el orden de la lista de puertas. */
  gates: GateCrossing[]
  order: CourseOrder
  /** segments[i]: tramo entre la puerta i y la i + 1 de la lista (null si no se puede calcular). */
  segments: (SegmentResult | null)[]
  /** De la primera puerta que se cruza a la última. */
  total: SegmentResult | null
}

export function computeCourse(
  track: readonly TrackSample[],
  gates: readonly Gate[],
  distancesM: readonly (number | null)[],
  manual: ReadonlyMap<number, ManualPair>,
  options: CrossingOptions,
): CourseResult {
  // Detección automática en los dos sentidos; vale la que encuentra más cruces.
  const forward = findCrossings(track, gates, options)
  const backward = findCrossings(track, [...gates].reverse(), options).reverse()
  const found = (list: (Crossing | null)[]) => list.filter(Boolean).length
  const automatic = found(backward) > found(forward) ? backward : forward

  const gateCrossings: GateCrossing[] = automatic.map((crossing, index) => {
    const pair = manual.get(index)
    const gate = gates[index]
    if (pair && gate) {
      return { crossing: manualCrossing(track, gate, pair.beforeFrame, pair.afterFrame, options.aspect), manual: true }
    }
    return { crossing, manual: false }
  })

  const order = courseOrder(gateCrossings.map((g) => g.crossing?.timeS ?? null))
  const count = gates.length
  const distances = distancesM.slice(0, Math.max(0, count - 1)).map((d) => d ?? Number.NaN)
  if (order === null) {
    return { gates: gateCrossings, order, segments: Array.from({ length: Math.max(0, count - 1) }, () => null), total: null }
  }

  // Resultados en el orden en que se cruzan y, después, de vuelta al orden de la lista.
  const crossings = gateCrossings.map((g) => g.crossing)
  const reversed = order === 'reverse'
  const passage = computeRunResults(
    reversed ? [...crossings].reverse() : crossings,
    reversed ? [...distances].reverse() : distances,
  )
  const toList = (segment: SegmentResult | null): SegmentResult | null =>
    segment && reversed
      ? { ...segment, fromGate: count - 1 - segment.fromGate, toGate: count - 1 - segment.toGate }
      : segment
  const segments = passage.segments.map(toList)
  return {
    gates: gateCrossings,
    order,
    segments: reversed ? segments.reverse() : segments,
    total: toList(passage.total),
  }
}

/** Orden de paso según los instantes conocidos (los null no cuentan). */
function courseOrder(times: readonly (number | null)[]): CourseOrder {
  const known = times.filter((t): t is number => t !== null)
  if (known.length < 2) return null
  const increasing = known.every((t, i) => i === 0 || t > (known[i - 1] as number))
  const decreasing = known.every((t, i) => i === 0 || t < (known[i - 1] as number))
  return increasing ? 'forward' : decreasing ? 'reverse' : null
}
