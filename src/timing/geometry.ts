// TypeScript puro: geometría de las puertas sobre la imagen.
// Coordenadas normalizadas de la imagen derecha (como se ve el vídeo): x e y van de 0 a 1,
// con y hacia abajo. Como la imagen no es cuadrada, las distancias se miden en "altos de
// imagen": x se multiplica por la proporción ancho / alto.

export interface Point {
  x: number
  y: number
}

/** Puerta: segmento de `a` a `b`. El cruce se mide contra la recta que los une. */
export interface Gate {
  a: Point
  b: Point
}

/** Longitud mínima de una puerta (en altos de imagen) para que su dirección sea fiable. */
export const MIN_GATE_LENGTH = 0.01

/** Longitud de la puerta en altos de imagen. */
export function gateLength(gate: Gate, aspect: number): number {
  return Math.hypot((gate.b.x - gate.a.x) * aspect, gate.b.y - gate.a.y)
}

export function isValidGate(gate: Gate, aspect: number): boolean {
  const coords = [gate.a.x, gate.a.y, gate.b.x, gate.b.y]
  return coords.every(Number.isFinite) && gateLength(gate, aspect) >= MIN_GATE_LENGTH
}

/**
 * Distancia con signo de `point` a la recta de la puerta, en altos de imagen.
 * El signo indica el lado: es el mismo para todos los puntos de un lado y cambia al
 * cruzar. Con una puerta vertical de arriba (`a`) abajo (`b`), es positivo a la derecha
 * de la pantalla.
 * @param aspect ancho / alto de la imagen (p. ej. 1080 / 1920)
 */
export function signedDistance(gate: Gate, point: Point, aspect: number): number {
  if (!isValidGate(gate, aspect)) {
    throw new RangeError('La puerta es demasiado corta o tiene coordenadas no válidas')
  }
  const dx = (gate.b.x - gate.a.x) * aspect
  const dy = gate.b.y - gate.a.y
  const px = (point.x - gate.a.x) * aspect
  const py = point.y - gate.a.y
  return (dy * px - dx * py) / Math.hypot(dx, dy)
}

/** Punto medio de una puerta. */
export function gateMidpoint(gate: Gate): Point {
  return { x: (gate.a.x + gate.b.x) / 2, y: (gate.a.y + gate.b.y) / 2 }
}

/**
 * Separación entre dos puertas (o dos barras), en altos de imagen: media de la distancia
 * perpendicular del centro de cada una a la recta de la otra. Con barras paralelas es la
 * distancia entre ellas; no depende de lo largas que sean ni de su altura en la imagen, y
 * vale igual para barras verticales (una distancia horizontal) que horizontales (una altura).
 * NaN si alguna de las dos no es válida.
 */
export function gateSeparation(first: Gate, second: Gate, aspect: number): number {
  if (!isValidGate(first, aspect) || !isValidGate(second, aspect)) return Number.NaN
  const d1 = Math.abs(signedDistance(first, gateMidpoint(second), aspect))
  const d2 = Math.abs(signedDistance(second, gateMidpoint(first), aspect))
  return (d1 + d2) / 2
}
