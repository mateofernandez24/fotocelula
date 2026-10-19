// TypeScript puro: este módulo no puede depender del navegador (ni DOM ni APIs web).

/**
 * Velocidad media en m/s entre dos cruces de puerta.
 * @param distanceM distancia real entre las puertas, en metros
 * @param t1 instante del primer cruce, en segundos (timestamp real del vídeo)
 * @param t2 instante del segundo cruce, en segundos
 */
export function averageSpeed(distanceM: number, t1: number, t2: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    throw new RangeError('La distancia debe ser un número mayor que 0')
  }
  const dt = t2 - t1
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new RangeError('El segundo cruce debe ser posterior al primero')
  }
  return distanceM / dt
}

/** Convierte m/s a km/h. */
export function toKmh(speedMs: number): number {
  return speedMs * 3.6
}
