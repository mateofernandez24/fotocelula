// TypeScript puro: sin dependencias del navegador, para poder probarlo con Vitest.
// Analiza los timestamps reales de los frames; nunca asume fps constantes.

/** Frecuencias de grabación habituales, para mostrar la nominal junto a la medida. */
const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 100, 119.88, 120, 240]

/** Un intervalo es un salto (frames perdidos) si dura al menos esto × el intervalo mediano. */
const GAP_FACTOR = 1.5
/** Desviación máxima respecto al intervalo mediano para considerar los fps constantes. */
const JITTER_TOLERANCE = 0.1
/** Desviación relativa máxima para asociar los fps medidos a una frecuencia nominal. */
const NOMINAL_TOLERANCE = 0.005

export interface FrameGap {
  /** Índice del frame justo antes del salto. */
  afterIndex: number
  intervalS: number
  /** Frames que faltan según el intervalo mediano. */
  missingFrames: number
}

export interface FrameTimingStats {
  frameCount: number
  /** Tiempo entre el primer y el último frame, en segundos. */
  spanS: number
  medianIntervalS: number
  minIntervalS: number
  maxIntervalS: number
  /** fps medidos, sin contar los saltos. */
  fps: number
  /** Frecuencia nominal más cercana (p. ej. 59.94), o null si no se parece a ninguna. */
  nominalFps: number | null
  /** true si algún intervalo se aparta del mediano más de la tolerancia. */
  isVariable: boolean
  gaps: FrameGap[]
  droppedFrames: number
  /** Margen de error orientativo por puerta, sin interpolación: ± medio intervalo. */
  gateErrorS: number
}

export interface FrameTimingOptions {
  /**
   * Duración de un tick del contenedor (1 / timescale), en segundos. Los timestamps
   * vienen redondeados a ticks, así que una diferencia de un tick no cuenta como variación.
   */
  tickS?: number
}

/**
 * Estadísticas de los timestamps de presentación de un vídeo.
 * @param timestamps segundos, en orden de presentación y estrictamente crecientes
 */
export function frameTimingStats(
  timestamps: readonly number[],
  options: FrameTimingOptions = {},
): FrameTimingStats {
  if (timestamps.length < 2) {
    throw new RangeError('Se necesitan al menos dos frames')
  }

  const intervals: number[] = []
  let previous: number | undefined
  for (const t of timestamps) {
    if (!Number.isFinite(t)) {
      throw new RangeError('Los timestamps deben ser números finitos')
    }
    if (previous !== undefined) {
      const dt = t - previous
      if (dt <= 0) {
        throw new RangeError('Los timestamps deben ser estrictamente crecientes')
      }
      intervals.push(dt)
    }
    previous = t
  }

  const medianIntervalS = median(intervals)
  const gaps: FrameGap[] = []
  let regularCount = 0
  let regularSum = 0
  intervals.forEach((dt, i) => {
    if (dt >= GAP_FACTOR * medianIntervalS) {
      gaps.push({
        afterIndex: i,
        intervalS: dt,
        missingFrames: Math.round(dt / medianIntervalS) - 1,
      })
    } else {
      regularCount++
      regularSum += dt
    }
  })
  // Siempre hay intervalos regulares: al menos la mitad no supera la mediana.
  const fps = regularCount / regularSum

  const tolerance = Math.max(JITTER_TOLERANCE * medianIntervalS, (options.tickS ?? 0) * 1.01)

  return {
    frameCount: timestamps.length,
    spanS: (timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0),
    medianIntervalS,
    // reduce en vez de Math.min(...): Safari limita el número de argumentos (~65 000).
    minIntervalS: intervals.reduce((a, b) => Math.min(a, b)),
    maxIntervalS: intervals.reduce((a, b) => Math.max(a, b)),
    fps,
    nominalFps: nearestNominalFps(fps),
    isVariable: intervals.some((dt) => Math.abs(dt - medianIntervalS) > tolerance),
    gaps,
    droppedFrames: gaps.reduce((sum, gap) => sum + gap.missingFrames, 0),
    gateErrorS: medianIntervalS / 2,
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] ?? Number.NaN
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? Number.NaN) + upper) / 2 : upper
}

function nearestNominalFps(fps: number): number | null {
  let best: number | null = null
  let bestError = NOMINAL_TOLERANCE
  for (const nominal of COMMON_FPS) {
    const error = Math.abs(fps - nominal) / nominal
    if (error <= bestError) {
      best = nominal
      bestError = error
    }
  }
  return best
}
