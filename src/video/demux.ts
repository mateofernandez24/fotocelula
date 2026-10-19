// Lectura del contenedor MP4/MOV con mp4box.js. Solo lee el índice (moov): los datos
// de cada frame se leen después, bajo demanda, a partir de su posición en el archivo.
// No usa APIs del DOM, así que funciona también en Node (tests) y en un Web Worker.
import {
  DataStream,
  Endianness,
  MP4BoxBuffer,
  createFile,
  type Box,
  type ISOFile,
  type Movie,
  type VisualSampleEntry,
} from 'mp4box'
import { frameTimingStats, type FrameTimingStats } from './fps.ts'
import {
  buildFrameTable,
  rotationFromMatrix,
  summarizeEditList,
  type EncodedSample,
  type FrameEntry,
  type Rotation,
} from './frameTable.ts'

// Nota: con los MOV del iPhone mp4box escribe en consola "Invalid box type: '    '" (una
// caja de relleno de QuickTime). Es inofensivo: no llega a onError ni corta la lectura.

const CHUNK_SIZE = 1 << 20
/** Cajas con la configuración del decodificador, en el formato que espera VideoDecoder. */
const DESCRIPTION_BOXES = ['avcC', 'hvcC', 'vpcC', 'av1C']
/** A partir de estos fps el vídeo se ha grabado a alta velocidad (cámara lenta). */
const HIGH_FRAME_RATE = 100

/** Origen de los bytes del vídeo: un File en el navegador, un archivo en los tests. */
export interface ByteSource {
  readonly size: number
  read(offset: number, length: number): Promise<ArrayBuffer>
}

export function blobByteSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: (offset, length) => blob.slice(offset, offset + length).arrayBuffer(),
  }
}

/** Motivos para sospechar que el vídeo es (o viene de) una cámara lenta. */
export type SlowMotionHint =
  /** Grabado a 100 fps o más. */
  | 'high-frame-rate'
  /** El iPhone lo marca para reproducirse ralentizado (full-frame-rate-playback-intent = 0). */
  | 'playback-intent'
  /** La edit list cambia la velocidad de reproducción. */
  | 'edit-rate'

export interface DemuxedVideo {
  brands: string[]
  /** Códec para VideoDecoder, p. ej. "hvc1.1.6.H153.b0". */
  codec: string
  /** Configuración del decodificador (avcC/hvcC…), sin la cabecera de la caja. */
  description: Uint8Array | null
  codedWidth: number
  codedHeight: number
  /** Giro horario a aplicar al frame decodificado. */
  rotation: Rotation
  /** Tamaño ya girado, tal como se ve el vídeo. */
  displayWidth: number
  displayHeight: number
  timescale: number
  /** Muestras en orden de decodificación. */
  samples: EncodedSample[]
  /** Frames visibles en orden de presentación, con su timestamp real. */
  frames: FrameEntry[]
  timing: FrameTimingStats
  slowMotionHints: SlowMotionHint[]
  /** La edit list tiene varios tramos; solo se usa el primero. */
  multipleEditSegments: boolean
  /** Fabricante, modelo y versión de software (nunca la ubicación). */
  device: { make: string | null; model: string | null; software: string | null }
}

/** Error con un mensaje apto para mostrar al usuario. */
export class VideoFormatError extends Error {
  override name = 'VideoFormatError'
}

export async function demuxVideo(source: ByteSource): Promise<DemuxedVideo> {
  const file = createFile()
  const state: { movie: Movie | null; error: string | null } = { movie: null, error: null }
  file.onReady = (movie) => {
    state.movie = movie
  }
  file.onError = (_module, message) => {
    state.error = message
  }

  let position = 0
  while (!state.movie && !state.error && position < source.size) {
    const length = Math.min(CHUNK_SIZE, source.size - position)
    const buffer = MP4BoxBuffer.fromArrayBuffer(await source.read(position, length), position)
    const next = file.appendBuffer(buffer, position + length >= source.size)
    // appendBuffer devuelve dónde seguir leyendo (salta el mdat si el moov va al final).
    position = next > position ? next : position + length
  }

  if (state.error) {
    throw new VideoFormatError(`No se ha podido leer el vídeo: ${state.error}`)
  }
  const movie = state.movie
  if (!movie) {
    throw new VideoFormatError('El archivo no es un vídeo MP4 o MOV compatible.')
  }
  const track = movie.videoTracks[0]
  if (!track) {
    throw new VideoFormatError('El archivo no contiene ninguna pista de vídeo.')
  }

  const entry = file.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0] as
    | VisualSampleEntry
    | undefined
  if (!entry) {
    throw new VideoFormatError('La pista de vídeo no describe su códec.')
  }

  const edit = summarizeEditList(
    (track.edits ?? []).map((e) => ({
      segmentDuration: e.segment_duration,
      mediaTime: e.media_time,
      mediaRate: e.media_rate_integer + e.media_rate_fraction / 0x10000,
    })),
    track.timescale,
    movie.timescale,
  )
  const { samples, frames } = buildFrameTable(
    file.getTrackSamplesInfo(track.id).map((s) => ({
      cts: s.cts,
      dts: s.dts,
      duration: s.duration,
      isSync: s.is_sync,
      offset: s.offset,
      size: s.size,
    })),
    track.timescale,
    edit,
  )
  if (frames.length < 2) {
    throw new VideoFormatError('El vídeo es demasiado corto: tiene menos de dos frames.')
  }

  const timing = frameTimingStats(
    frames.map((frame) => frame.timestampS),
    { tickS: 1 / track.timescale },
  )
  const metadata = readQuickTimeMetadata(file)
  const rotation = rotationFromMatrix(track.matrix)
  const rotated = rotation === 90 || rotation === 270

  const slowMotionHints: SlowMotionHint[] = []
  if (timing.fps >= HIGH_FRAME_RATE) slowMotionHints.push('high-frame-rate')
  if (metadata.get('com.apple.quicktime.full-frame-rate-playback-intent') === 0) {
    slowMotionHints.push('playback-intent')
  }
  if (edit.rateChanged) slowMotionHints.push('edit-rate')

  return {
    brands: movie.brands,
    codec: track.codec,
    description: decoderDescription(entry),
    codedWidth: entry.width,
    codedHeight: entry.height,
    rotation,
    displayWidth: rotated ? entry.height : entry.width,
    displayHeight: rotated ? entry.width : entry.height,
    timescale: track.timescale,
    samples,
    frames,
    timing,
    slowMotionHints,
    multipleEditSegments: edit.multipleSegments,
    device: {
      make: stringOrNull(metadata.get('com.apple.quicktime.make')),
      model: stringOrNull(metadata.get('com.apple.quicktime.model')),
      software: stringOrNull(metadata.get('com.apple.quicktime.software')),
    },
  }
}

/** Contenido de la caja avcC/hvcC… sin su cabecera de 8 bytes. */
function decoderDescription(entry: VisualSampleEntry): Uint8Array | null {
  const box = entry.boxes?.find((b) => DESCRIPTION_BOXES.includes(b.type ?? ''))
  if (!box) return null
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
  box.write(stream)
  return new Uint8Array(stream.buffer, 8)
}

/**
 * Metadatos QuickTime de la película (moov/meta con keys + ilst), como hace el iPhone.
 * Los valores numéricos se devuelven como number. Se omite cualquier dato de ubicación.
 */
function readQuickTimeMetadata(file: ISOFile): Map<string, string | number> {
  const result = new Map<string, string | number>()
  const meta = file.moov?.boxes?.find((b) => b.type === 'meta')
  const keys = findChild(meta, 'keys') as { keys?: Record<number, string> } | undefined
  const ilst = findChild(meta, 'ilst') as { list?: Record<number, unknown> } | undefined
  if (!keys?.keys || !ilst?.list) return result

  for (const [index, item] of Object.entries(ilst.list)) {
    // Las claves llevan delante el espacio de nombres ("mdta").
    const key = keys.keys[Number(index)]?.replace(/^mdta/, '')
    if (!key || key.includes('location')) continue
    const value = (item as { value?: unknown }).value
    if (typeof value === 'string') result.set(key, value)
    else if (typeof value === 'number') result.set(key, value)
    else if (typeof value === 'bigint') result.set(key, Number(value))
  }
  return result
}

function findChild(box: Box | undefined, type: string): Box | undefined {
  return box?.boxes?.find((b) => b.type === type)
}

function stringOrNull(value: string | number | undefined): string | null {
  return typeof value === 'string' ? value : null
}
