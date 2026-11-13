// TypeScript puro: calendario de la repetición. El vídeo va a velocidad normal y pasa a
// cámara lenta alrededor de cada cruce de puerta, con rampas suaves de entrada y salida.

export interface SlowMotionOptions {
  /** Velocidad de reproducción en cámara lenta (0,25 = cuatro veces más lento). */
  slowRate?: number
  /** Tiempo de vídeo (s) a cada lado del cruce que se ve en cámara lenta. */
  holdS?: number
  /** Tiempo de vídeo (s) de cada rampa entre la velocidad normal y la lenta. */
  rampS?: number
}

export const DEFAULT_SLOW_RATE = 0.25
export const DEFAULT_SLOW_HOLD_S = 0.3
export const DEFAULT_SLOW_RAMP_S = 0.15

/**
 * Velocidad de reproducción en el instante `timeS` del vídeo: 1 lejos de los cruces,
 * `slowRate` cerca de ellos y una rampa lineal entre ambas. Si dos cruces están cerca,
 * manda el más lento.
 */
export function playbackRate(
  timeS: number,
  crossingTimesS: readonly number[],
  options: SlowMotionOptions = {},
): number {
  const slow = options.slowRate ?? DEFAULT_SLOW_RATE
  const hold = options.holdS ?? DEFAULT_SLOW_HOLD_S
  const ramp = options.rampS ?? DEFAULT_SLOW_RAMP_S
  let rate = 1
  for (const crossing of crossingTimesS) {
    const distance = Math.abs(timeS - crossing)
    if (distance <= hold) return slow
    if (ramp > 0 && distance < hold + ramp) {
      rate = Math.min(rate, slow + ((1 - slow) * (distance - hold)) / ramp)
    }
  }
  return rate
}

/**
 * Instante de la repetición (s de reloj desde el primer frame) en que se muestra cada frame.
 * Entre dos frames, el intervalo de vídeo se divide por la velocidad a mitad de camino.
 * Usa los timestamps reales de cada frame: con fps variables, la repetición también lo es.
 */
export function playbackTimeline(
  timestampsS: readonly number[],
  crossingTimesS: readonly number[],
  options: SlowMotionOptions = {},
): number[] {
  const timeline: number[] = []
  let wall = 0
  for (let i = 0; i < timestampsS.length; i++) {
    const t = timestampsS[i] as number
    if (i > 0) {
      const previous = timestampsS[i - 1] as number
      const rate = playbackRate((previous + t) / 2, crossingTimesS, options)
      wall += Math.max(0, t - previous) / rate
    }
    timeline.push(wall)
  }
  return timeline
}
