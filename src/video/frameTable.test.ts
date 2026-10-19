import { describe, expect, it } from 'vitest'
import {
  buildFrameTable,
  rotationFromMatrix,
  summarizeEditList,
  type ContainerSample,
} from './frameTable.ts'

const NO_EDIT = { offsetS: 0, startS: 0, endS: Infinity }

/** Muestras en orden de decodificación; cts y dts en ticks, duración fija. */
function samples(list: { cts: number; dts: number; sync?: boolean }[], duration = 10): ContainerSample[] {
  return list.map((s, i) => ({
    cts: s.cts,
    dts: s.dts,
    duration,
    isSync: s.sync ?? false,
    offset: 1000 + i * 100,
    size: 100,
  }))
}

describe('summarizeEditList', () => {
  it('sin edit list: sin desfase ni recorte', () => {
    expect(summarizeEditList([], 600, 600)).toEqual({
      offsetS: 0,
      startS: 0,
      endS: Infinity,
      rateChanged: false,
      multipleSegments: false,
    })
  })

  it('tramo único que empieza en el primer frame (como el iPhone)', () => {
    const edit = summarizeEditList([{ segmentDuration: 2821, mediaTime: 0, mediaRate: 1 }], 600, 600)
    expect(edit.offsetS).toBe(0)
    expect(edit.startS).toBe(0)
    expect(edit.endS).toBeCloseTo(2821 / 600, 10)
  })

  it('media_time > 0: los primeros frames no se muestran', () => {
    const edit = summarizeEditList([{ segmentDuration: 600, mediaTime: 1200, mediaRate: 1 }], 600, 1000)
    expect(edit.offsetS).toBeCloseTo(-2, 10)
    expect(edit.startS).toBe(0)
  })

  it('tramo vacío inicial: retrasa el vídeo', () => {
    const edit = summarizeEditList(
      [
        { segmentDuration: 500, mediaTime: -1, mediaRate: 1 },
        { segmentDuration: 1000, mediaTime: 0, mediaRate: 1 },
      ],
      600,
      1000,
    )
    expect(edit.offsetS).toBeCloseTo(0.5, 10)
    expect(edit.startS).toBeCloseTo(0.5, 10)
    expect(edit.endS).toBeCloseTo(1.5, 10)
  })

  it('segment_duration 0: hasta el final de la pista', () => {
    expect(summarizeEditList([{ segmentDuration: 0, mediaTime: 0, mediaRate: 1 }], 600, 600).endS).toBe(
      Infinity,
    )
  })

  it('detecta cambios de velocidad y varios tramos', () => {
    const edit = summarizeEditList(
      [
        { segmentDuration: 600, mediaTime: 0, mediaRate: 1 },
        { segmentDuration: 2400, mediaTime: 600, mediaRate: 0.25 },
      ],
      600,
      600,
    )
    expect(edit.rateChanged).toBe(true)
    expect(edit.multipleSegments).toBe(true)
  })
})

describe('buildFrameTable', () => {
  it('ordena por presentación cuando hay frames B', () => {
    // Orden de decodificación I P B B → presentación I B B P.
    const table = buildFrameTable(
      samples([
        { cts: 10, dts: 0, sync: true },
        { cts: 40, dts: 10 },
        { cts: 20, dts: 20 },
        { cts: 30, dts: 30 },
      ]),
      600,
      NO_EDIT,
    )
    expect(table.frames.map((f) => f.sampleIndex)).toEqual([0, 2, 3, 1])
    expect(table.frames.map((f) => f.timestampS)).toEqual([10 / 600, 20 / 600, 30 / 600, 40 / 600])
    expect(table.frames.map((f) => f.index)).toEqual([0, 1, 2, 3])
    expect(table.samples.map((s) => s.frameIndex)).toEqual([0, 3, 1, 2])
    expect(table.frames[0]?.isKeyframe).toBe(true)
  })

  it('timestamps en µs enteros para el decodificador', () => {
    const table = buildFrameTable(samples([{ cts: 1, dts: 0, sync: true }, { cts: 2, dts: 1 }]), 600, NO_EDIT)
    expect(table.samples.map((s) => s.timestampUs)).toEqual([1667, 3333])
    expect(table.samples.every((s) => Number.isInteger(s.durationUs))).toBe(true)
  })

  it('aplica la edit list: descarta lo que no se muestra y desplaza los tiempos', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({ cts: i * 10, dts: i * 10, sync: i === 0 }))
    // Se muestran los ticks [20, 70): frames 2 a 6, que empiezan en t = 0.
    const edit = summarizeEditList([{ segmentDuration: 50, mediaTime: 20, mediaRate: 1 }], 600, 600)
    const table = buildFrameTable(samples(list), 600, edit)
    expect(table.frames.map((f) => f.sampleIndex)).toEqual([2, 3, 4, 5, 6])
    expect(table.frames[0]?.timestampS).toBeCloseTo(0, 10)
    expect(table.frames[4]?.timestampS).toBeCloseTo(40 / 600, 10)
    // Las muestras ocultas siguen ahí (pueden hacer falta para decodificar) pero sin frame.
    expect(table.samples).toHaveLength(10)
    expect(table.samples[0]?.frameIndex).toBeNull()
    expect(table.samples[9]?.frameIndex).toBeNull()
    expect(table.samples[0]?.timestampUs).toBe(Math.round((-20 / 600) * 1e6))
  })
})

describe('rotationFromMatrix', () => {
  const F = 0x10000
  it.each([
    [[F, 0, 0, 0, F, 0, 0, 0, 0x40000000], 0],
    // Matriz real de un vídeo vertical del iPhone.
    [[0, F, 0, -F, 0, 0, 141557760, 0, 0x40000000], 90],
    [[-F, 0, 0, 0, -F, 0, 0, 0, 0x40000000], 180],
    [[0, -F, 0, F, 0, 0, 0, 0, 0x40000000], 270],
  ])('%j → %i°', (matrix, expected) => {
    expect(rotationFromMatrix(matrix)).toBe(expected)
  })

  it('sin matriz: 0°', () => {
    expect(rotationFromMatrix([])).toBe(0)
  })
})
