// Lista de las cajas de primer nivel de un MP4/MOV (ftyp, moov, mdat, moof…) leyendo solo
// sus cabeceras. Sirve para saber cómo está organizado un archivo, p. ej. si es un MP4
// fragmentado (moof + mdat repetidos), como los que puede producir MediaRecorder.
import type { ByteSource } from './demux.ts'

export interface BoxHeader {
  type: string
  offset: number
  /** Tamaño total de la caja, cabecera incluida. */
  size: number
}

/**
 * Por si el archivo está dañado: no se leen más cabeceras que estas. Una grabación de
 * MediaRecorder en Chrome tiene un par de cajas (moof + mdat) cada pocas décimas de segundo.
 */
const MAX_BOXES = 200_000

export async function listTopLevelBoxes(source: ByteSource, maxBoxes = MAX_BOXES): Promise<BoxHeader[]> {
  const boxes: BoxHeader[] = []
  let offset = 0
  while (offset + 8 <= source.size && boxes.length < maxBoxes) {
    const view = new DataView(await source.read(offset, Math.min(16, source.size - offset)))
    let size = view.getUint32(0)
    const type = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7))
    if (size === 1) {
      // Tamaño de 64 bits a continuación del tipo.
      if (view.byteLength < 16) break
      size = Number(view.getBigUint64(8))
    } else if (size === 0) {
      // La caja llega hasta el final del archivo.
      size = source.size - offset
    }
    if (size < 8) break
    boxes.push({ type, offset, size })
    offset += size
  }
  return boxes
}

/** true si el archivo es un MP4 fragmentado (tiene cajas moof). */
export function isFragmented(boxes: readonly BoxHeader[]): boolean {
  return boxes.some((box) => box.type === 'moof')
}
