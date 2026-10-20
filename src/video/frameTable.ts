// TypeScript puro: construye la tabla de frames a partir de las muestras del contenedor.
// No depende de mp4box ni del navegador, para poder probarlo con datos sintéticos.

/** Muestra tal como viene en el contenedor, en orden de decodificación. Tiempos en ticks. */
export interface ContainerSample {
  cts: number
  dts: number
  duration: number
  isSync: boolean
  /** Posición y tamaño de los datos comprimidos dentro del archivo. */
  offset: number
  size: number
}

/** Entrada de la edit list (elst). */
export interface EditListEntry {
  /** En unidades del timescale de la película (mvhd). */
  segmentDuration: number
  /** En unidades del timescale de la pista; -1 indica un tramo vacío. */
  mediaTime: number
  mediaRate: number
}

/** Muestra lista para el decodificador, en orden de decodificación. */
export interface EncodedSample {
  offset: number
  size: number
  isKeyframe: boolean
  /** Timestamp de presentación en µs enteros (lo exige EncodedVideoChunk). */
  timestampUs: number
  durationUs: number
  /** Frame que produce, o null si queda fuera de la edit list (no se muestra). */
  frameIndex: number | null
}

/** Frame visible, en orden de presentación. */
export interface FrameEntry {
  index: number
  /** Instante real de presentación, en segundos desde el inicio del vídeo. */
  timestampS: number
  durationS: number
  isKeyframe: boolean
  /** Índice de su muestra en `samples` (orden de decodificación). */
  sampleIndex: number
}

export interface FrameTable {
  samples: EncodedSample[]
  frames: FrameEntry[]
}

export interface EditListSummary {
  /** Se suma a cts / timescale para obtener el instante de presentación. */
  offsetS: number
  /** Tramo visible, en segundos de presentación. `endS` es Infinity si no hay edit list. */
  startS: number
  endS: number
  /** Algún tramo se reproduce a velocidad distinta de 1 (típico de cámara lenta). */
  rateChanged: boolean
  /** Hay más de un tramo con contenido: solo se aplica el primero. */
  multipleSegments: boolean
}

export function summarizeEditList(
  edits: readonly EditListEntry[],
  mediaTimescale: number,
  movieTimescale: number,
): EditListSummary {
  let delayS = 0
  let first: EditListEntry | undefined
  let segments = 0
  for (const edit of edits) {
    if (edit.mediaTime === -1) {
      if (!first) delayS += edit.segmentDuration / movieTimescale
    } else {
      segments++
      first ??= edit
    }
  }
  const rateChanged = edits.some((edit) => edit.mediaTime !== -1 && edit.mediaRate !== 1)
  if (!first) {
    return { offsetS: 0, startS: 0, endS: Infinity, rateChanged, multipleSegments: false }
  }
  return {
    offsetS: delayS - first.mediaTime / mediaTimescale,
    startS: delayS,
    // segmentDuration 0 significa "hasta el final de la pista".
    endS: first.segmentDuration > 0 ? delayS + first.segmentDuration / movieTimescale : Infinity,
    rateChanged,
    multipleSegments: segments > 1,
  }
}

/**
 * Ordena las muestras por instante de presentación (con frames B el orden de
 * decodificación es distinto) y descarta las que quedan fuera del tramo visible.
 */
export function buildFrameTable(
  samples: readonly ContainerSample[],
  timescale: number,
  edit: Pick<EditListSummary, 'offsetS' | 'startS' | 'endS'>,
): FrameTable {
  // Margen para el redondeo de los ticks al comparar con los límites del tramo.
  const epsilon = 1e-6
  const encoded: EncodedSample[] = []
  const visible: { sampleIndex: number; timestampS: number; durationS: number; isKeyframe: boolean }[] = []

  samples.forEach((sample, sampleIndex) => {
    const timestampS = sample.cts / timescale + edit.offsetS
    const durationS = sample.duration / timescale
    encoded.push({
      offset: sample.offset,
      size: sample.size,
      isKeyframe: sample.isSync,
      timestampUs: Math.round(timestampS * 1e6),
      durationUs: Math.round(durationS * 1e6),
      frameIndex: null,
    })
    if (timestampS >= edit.startS - epsilon && timestampS < edit.endS - epsilon) {
      visible.push({ sampleIndex, timestampS, durationS, isKeyframe: sample.isSync })
    }
  })

  visible.sort((a, b) => a.timestampS - b.timestampS)
  const frames = visible.map((frame, index): FrameEntry => {
    const sample = encoded[frame.sampleIndex]
    if (sample) sample.frameIndex = index
    return { index, ...frame }
  })
  return { samples: encoded, frames }
}

/**
 * Muestra (en orden de decodificación) desde la que hay que empezar a decodificar para
 * obtener la muestra `sampleIndex`: el último fotograma clave anterior. Si la muestra se
 * muestra antes que ese fotograma clave (frame B "adelantado" de un GOP abierto), depende
 * del GOP anterior y hay que empezar en el fotograma clave previo.
 */
export function decodeStartFor(samples: readonly EncodedSample[], sampleIndex: number): number {
  const target = samples[sampleIndex]
  if (!target) throw new RangeError(`No existe la muestra ${sampleIndex}`)
  for (let i = sampleIndex; i >= 0; i--) {
    const sample = samples[i]
    if (sample?.isKeyframe && sample.timestampUs <= target.timestampUs) return i
  }
  throw new RangeError(`No hay ningún fotograma clave antes de la muestra ${sampleIndex}`)
}

/**
 * Índice del frame cuyo timestamp (µs) es el más cercano a `timestampUs`, o null si el
 * más cercano está a más de `toleranceUs`. Sirve para identificar la salida del
 * decodificador aunque el navegador redondee el timestamp.
 * @param frameTimestampsUs timestamps de los frames visibles, en orden creciente
 */
export function findFrameByTimestamp(
  frameTimestampsUs: readonly number[],
  timestampUs: number,
  toleranceUs: number,
): number | null {
  let low = 0
  let high = frameTimestampsUs.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if ((frameTimestampsUs[mid] ?? Infinity) < timestampUs) low = mid + 1
    else high = mid
  }
  // `low` es el primero >= timestampUs; el anterior puede estar más cerca.
  let best: number | null = null
  let bestDistance = Infinity
  for (const index of [low - 1, low]) {
    const t = frameTimestampsUs[index]
    if (t === undefined) continue
    const distance = Math.abs(t - timestampUs)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return bestDistance <= toleranceUs ? best : null
}

export type Rotation = 0 | 90 | 180 | 270

/**
 * Giro en sentido horario que hay que aplicar al frame decodificado para verlo derecho,
 * a partir de la matriz de transformación de la pista (tkhd). El iPhone guarda los
 * vídeos verticales en horizontal con una rotación de 90°.
 */
export function rotationFromMatrix(matrix: ArrayLike<number>): Rotation {
  const a = matrix[0] ?? 1
  const b = matrix[1] ?? 0
  const degrees = (Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90 + 360) % 360
  return degrees as Rotation
}
