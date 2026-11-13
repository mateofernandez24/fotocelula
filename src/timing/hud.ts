// TypeScript puro: lo que muestra el marcador de la repetición en cada instante del vídeo
// (cronómetro y última puerta cruzada con su tiempo y velocidad).
import type { CourseResult } from './course.ts'
import type { SegmentResult } from './results.ts'

/** Paso del deportista por una puerta, en el orden en que las cruza. */
export interface GatePassage {
  /** Índice de la puerta en la lista de puertas. */
  gateIndex: number
  /** Orden de paso: 0 la primera que cruza. */
  passageIndex: number
  /** Instante del cruce en el vídeo (s). */
  timeS: number
  /** Tiempo desde la primera puerta (0 en la primera). */
  elapsedS: number
  /** Tramo que termina en esta puerta (null en la primera o si no se pudo calcular). */
  segment: SegmentResult | null
  /** Resultado total, solo en la última puerta. */
  total: SegmentResult | null
}

/** Pasos por las puertas ordenados por tiempo. Solo las puertas con cruce. */
export function gatePassages(course: CourseResult): GatePassage[] {
  const crossed = course.gates
    .map((g, gateIndex) => (g.crossing ? { gateIndex, timeS: g.crossing.timeS } : null))
    .filter((p): p is { gateIndex: number; timeS: number } => p !== null)
    .sort((a, b) => a.timeS - b.timeS)
  const startS = crossed[0]?.timeS ?? 0
  return crossed.map((p, passageIndex) => {
    const previous = crossed[passageIndex - 1]
    // El tramo entre dos puertas consecutivas de la lista es segments[la menor de las dos].
    const segment =
      previous && Math.abs(previous.gateIndex - p.gateIndex) === 1
        ? (course.segments[Math.min(previous.gateIndex, p.gateIndex)] ?? null)
        : null
    const isLast = passageIndex === crossed.length - 1 && passageIndex > 0
    return {
      gateIndex: p.gateIndex,
      passageIndex,
      timeS: p.timeS,
      elapsedS: p.timeS - startS,
      segment,
      total: isLast ? course.total : null,
    }
  })
}

export interface HudState {
  /** Cronómetro desde la primera puerta; null antes de cruzarla. */
  elapsedS: number | null
  /** true si ya ha cruzado la última puerta (el cronómetro se queda parado). */
  finished: boolean
  /** Última puerta cruzada hasta este instante, o null. */
  lastPassage: GatePassage | null
  /** Tiempo de vídeo (s) desde que cruzó `lastPassage`. */
  sinceLastS: number | null
}

/** Estado del marcador en el instante `timeS` del vídeo. */
export function hudAt(timeS: number, passages: readonly GatePassage[]): HudState {
  const first = passages[0]
  const last = passages.at(-1)
  if (!first || !last || timeS < first.timeS) {
    return { elapsedS: null, finished: false, lastPassage: null, sinceLastS: null }
  }
  const lastPassage = passages.findLast((p) => p.timeS <= timeS) ?? null
  const finished = passages.length > 1 && timeS >= last.timeS
  return {
    elapsedS: finished ? last.timeS - first.timeS : timeS - first.timeS,
    finished,
    lastPassage,
    sinceLastS: lastPassage ? timeS - lastPassage.timeS : null,
  }
}
