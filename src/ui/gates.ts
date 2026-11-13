// Edición de las puertas y de las barras de la referencia (funciones puras).
import type { Gate } from '../timing/geometry.ts'

/** Extremos verticales por defecto de una puerta nueva. */
const TOP = 0.15
const BOTTOM = 0.85
/** Margen respecto a los bordes de la imagen al colocar una puerta nueva. */
const EDGE = 0.05

export function verticalGate(x: number, top = TOP, bottom = BOTTOM): Gate {
  return { a: { x, y: top }, b: { x, y: bottom } }
}

/** Dos puertas verticales en el tercio izquierdo y el derecho. */
export function defaultGates(): Gate[] {
  return [verticalGate(0.3), verticalGate(0.7)]
}

/**
 * Barras de la referencia por defecto: más cortas que las puertas y en la mitad de abajo,
 * donde suele estar lo que se usa de referencia (una cinta o unos conos en el suelo).
 */
export function defaultReferenceBars(): [Gate, Gate] {
  return [verticalGate(0.35, 0.55, 0.9), verticalGate(0.65, 0.55, 0.9)]
}

const clamp = (x: number) => Math.min(1 - EDGE, Math.max(EDGE, x))

/**
 * Añade una puerta a continuación de la última, a la misma separación que las dos
 * últimas (o en el centro si eso cae fuera).
 */
export function addGate(gates: readonly Gate[]): Gate[] {
  const last = gates.at(-1)
  const previous = gates.at(-2)
  let x = 0.5
  if (last && previous) {
    const next = last.a.x + (last.a.x - previous.a.x)
    x = next > EDGE && next < 1 - EDGE ? next : (last.a.x + (next > 0.5 ? 1 - EDGE : EDGE)) / 2
  }
  return [...gates, verticalGate(clamp(x))]
}

export function removeGate(gates: readonly Gate[], index: number): Gate[] {
  return gates.filter((_, i) => i !== index)
}

/** Lee una distancia en metros escrita por el usuario ("2", "2,5", "2.50 m"). null si no vale. */
export function parseDistance(text: string): number | null {
  const cleaned = text.trim().replace(/\s*m$/i, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}
