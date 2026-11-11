// Edición de las puertas y de las distancias entre ellas (funciones puras).
import type { Gate } from '../timing/geometry.ts'

/** Extremos verticales por defecto de una puerta nueva. */
const TOP = 0.15
const BOTTOM = 0.85
/** Margen respecto a los bordes de la imagen al colocar una puerta nueva. */
const EDGE = 0.05

export function verticalGate(x: number): Gate {
  return { a: { x, y: TOP }, b: { x, y: BOTTOM } }
}

/** Dos puertas verticales en el tercio izquierdo y el derecho. */
export function defaultGates(): Gate[] {
  return [verticalGate(0.3), verticalGate(0.7)]
}

const clamp = (x: number) => Math.min(1 - EDGE, Math.max(EDGE, x))

/**
 * Añade una puerta a continuación de la última, a la misma separación que las dos
 * últimas (o en el centro si eso cae fuera). Añade también su distancia, aún sin rellenar.
 */
export function addGate(
  gates: readonly Gate[],
  distances: readonly (number | null)[],
): { gates: Gate[]; distances: (number | null)[] } {
  const last = gates.at(-1)
  const previous = gates.at(-2)
  let x = 0.5
  if (last && previous) {
    const next = last.a.x + (last.a.x - previous.a.x)
    x = next > EDGE && next < 1 - EDGE ? next : (last.a.x + (next > 0.5 ? 1 - EDGE : EDGE)) / 2
  }
  return {
    gates: [...gates, verticalGate(clamp(x))],
    distances: gates.length > 0 ? [...distances, null] : [...distances],
  }
}

/**
 * Quita la puerta `index`. Si estaba entre otras dos, sus dos distancias se suman (si se
 * conocen ambas) para que siga habiendo una por cada par de puertas consecutivas.
 */
export function removeGate(
  gates: readonly Gate[],
  distances: readonly (number | null)[],
  index: number,
): { gates: Gate[]; distances: (number | null)[] } {
  const nextGates = gates.filter((_, i) => i !== index)
  const nextDistances = [...distances]
  if (index === 0) nextDistances.splice(0, 1)
  else if (index === gates.length - 1) nextDistances.splice(index - 1, 1)
  else {
    const left = distances[index - 1] ?? null
    const right = distances[index] ?? null
    nextDistances.splice(index - 1, 2, left !== null && right !== null ? left + right : null)
  }
  return { gates: nextGates, distances: nextDistances }
}

/** Lee una distancia en metros escrita por el usuario ("2", "2,5", "2.50 m"). null si no vale. */
export function parseDistance(text: string): number | null {
  const cleaned = text.trim().replace(/\s*m$/i, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}
