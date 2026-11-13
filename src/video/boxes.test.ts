import { describe, expect, it } from 'vitest'
import { isFragmented, listTopLevelBoxes } from './boxes.ts'
import type { ByteSource } from './demux.ts'

function box(type: string, payload: number): Uint8Array {
  const bytes = new Uint8Array(8 + payload)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set([...type].map((c) => c.charCodeAt(0)), 4)
  return bytes
}

function source(...parts: Uint8Array[]): ByteSource {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    all.set(p, at)
    at += p.length
  }
  return { size: all.length, read: async (offset, length) => all.slice(offset, offset + length).buffer }
}

describe('listTopLevelBoxes', () => {
  it('MP4 normal: ftyp, moov, mdat', async () => {
    const boxes = await listTopLevelBoxes(source(box('ftyp', 12), box('moov', 100), box('mdat', 50)))
    expect(boxes).toEqual([
      { type: 'ftyp', offset: 0, size: 20 },
      { type: 'moov', offset: 20, size: 108 },
      { type: 'mdat', offset: 128, size: 58 },
    ])
    expect(isFragmented(boxes)).toBe(false)
  })

  it('MP4 fragmentado: moof + mdat repetidos', async () => {
    const boxes = await listTopLevelBoxes(
      source(box('ftyp', 4), box('moov', 20), box('moof', 10), box('mdat', 30), box('moof', 10), box('mdat', 30)),
    )
    expect(boxes.map((b) => b.type)).toEqual(['ftyp', 'moov', 'moof', 'mdat', 'moof', 'mdat'])
    expect(isFragmented(boxes)).toBe(true)
  })

  it('tamaño de 64 bits y caja hasta el final del archivo', async () => {
    const large = new Uint8Array(16 + 4)
    const view = new DataView(large.buffer)
    view.setUint32(0, 1)
    large.set([...'mdat'].map((c) => c.charCodeAt(0)), 4)
    view.setBigUint64(8, 20n)
    const toEnd = box('free', 6)
    new DataView(toEnd.buffer).setUint32(0, 0)
    const boxes = await listTopLevelBoxes(source(box('ftyp', 0), large, toEnd))
    expect(boxes).toEqual([
      { type: 'ftyp', offset: 0, size: 8 },
      { type: 'mdat', offset: 8, size: 20 },
      { type: 'free', offset: 28, size: 14 },
    ])
  })

  it('se detiene ante una cabecera no válida', async () => {
    const broken = box('junk', 0)
    new DataView(broken.buffer).setUint32(0, 3)
    expect(await listTopLevelBoxes(source(box('ftyp', 0), broken))).toEqual([{ type: 'ftyp', offset: 0, size: 8 }])
  })
})
