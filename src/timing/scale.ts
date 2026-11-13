// TypeScript puro: escala de la imagen a partir de una distancia de referencia conocida, y
// distancias reales entre las puertas calculadas con esa escala.
import { gateSeparation, type Gate } from './geometry.ts'

/**
 * Referencia: dos barras sobre los extremos de algo de longitud conocida que está en el
 * plano por el que pasa el deportista (una cinta en el suelo de su recorrido, dos conos…).
 */
export interface ScaleReference {
  bars: readonly [Gate, Gate]
  /** Distancia real entre las dos barras, en metros (null si aún no se ha escrito). */
  distanceM: number | null
}

/**
 * Separación mínima (en altos de imagen) entre las barras de la referencia o entre dos
 * puertas: más juntas, un error de pocos píxeles al colocarlas cambia mucho la distancia.
 */
export const MIN_SEPARATION = 0.02

/**
 * Metros por alto de imagen en el plano del deportista, o null si la referencia no vale
 * (sin distancia, barras no válidas o demasiado juntas).
 */
export function metersPerUnit(reference: ScaleReference, aspect: number): number | null {
  const { distanceM } = reference
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM <= 0) return null
  const separation = gateSeparation(reference.bars[0], reference.bars[1], aspect)
  if (!(separation >= MIN_SEPARATION)) return null
  return distanceM / separation
}

/**
 * Distancia real entre cada par de puertas consecutivas (una menos que puertas). null si no
 * hay escala o si esas dos puertas están demasiado juntas para medirla.
 */
export function gateDistances(
  gates: readonly Gate[],
  scale: number | null,
  aspect: number,
): (number | null)[] {
  const distances: (number | null)[] = []
  for (let i = 0; i + 1 < gates.length; i++) {
    const separation = gateSeparation(gates[i] as Gate, gates[i + 1] as Gate, aspect)
    distances.push(scale !== null && separation >= MIN_SEPARATION ? separation * scale : null)
  }
  return distances
}

/**
 * Cuántas veces es mayor la distancia total entre las puertas que la referencia. Por
 * encima de ~3, cualquier error al colocar las barras de la referencia se multiplica.
 */
export function extrapolationFactor(
  distancesM: readonly (number | null)[],
  reference: ScaleReference,
): number | null {
  if (reference.distanceM === null || !(reference.distanceM > 0)) return null
  if (distancesM.length === 0 || distancesM.some((d) => d === null)) return null
  const total = distancesM.reduce<number>((sum, d) => sum + (d ?? 0), 0)
  return total / reference.distanceM
}
