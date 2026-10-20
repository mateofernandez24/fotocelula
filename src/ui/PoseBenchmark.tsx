import { useState, type ChangeEvent } from 'react'
import type { PoseBenchmarkResult } from '../pose/benchmark.ts'
import type { BenchmarkRequest, BenchmarkResponse } from '../pose/benchmark.worker.ts'
import type { PoseDelegate, PoseModel } from '../pose/landmarker.ts'
import { blobByteSource, demuxVideo, VideoFormatError } from '../video/demux.ts'
import { FrameSource } from '../video/frameSource.ts'
import { drawRotatedFrame } from './drawFrame.ts'
import { formatInteger, formatMs } from './format.ts'

const FRAME_COUNT = 20
/** Lado mayor de la imagen que recibe el modelo. */
const MAX_SIDE = 960
const WORKER_TIMEOUT_MS = 120_000

interface Config {
  label: string
  inWorker: boolean
  delegate: PoseDelegate
}

const CONFIGS: Config[] = [
  { label: 'Hilo principal · GPU', inWorker: false, delegate: 'GPU' },
  { label: 'Hilo principal · CPU', inWorker: false, delegate: 'CPU' },
  { label: 'Worker · GPU', inWorker: true, delegate: 'GPU' },
  { label: 'Worker · CPU', inWorker: true, delegate: 'CPU' },
]

type Row =
  | { status: 'pending' | 'running' }
  | { status: 'done'; result: PoseBenchmarkResult; note: string | null }
  | { status: 'error'; error: string }

interface PreparedFrames {
  images: ImageBitmap[]
  timestampsMs: number[]
  size: string
  rotateMs: number
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

/** Decodifica FRAME_COUNT frames seguidos del centro del vídeo, ya girados y reducidos. */
async function prepareFrames(file: File, onProgress: (done: number) => void): Promise<PreparedFrames> {
  const bytes = blobByteSource(file)
  const video = await demuxVideo(bytes)
  const source = await FrameSource.open(bytes, video)
  try {
    const first = Math.max(0, Math.floor((video.frames.length - FRAME_COUNT) / 2))
    const last = Math.min(video.frames.length, first + FRAME_COUNT)
    const scale = Math.min(1, MAX_SIDE / Math.max(video.displayWidth, video.displayHeight))
    const canvas = new OffscreenCanvas(
      Math.round(video.displayWidth * scale),
      Math.round(video.displayHeight * scale),
    )
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se ha podido crear un canvas 2D.')

    const images: ImageBitmap[] = []
    const timestampsMs: number[] = []
    const rotateTimes: number[] = []
    for (let i = first; i < last; i++) {
      const frame = await source.getFrame(i)
      const start = performance.now()
      drawRotatedFrame(ctx, frame, video.rotation)
      // Leer un píxel obliga a terminar el dibujo (si no, la GPU lo deja pendiente y
      // el tiempo medido no es real).
      ctx.getImageData(0, 0, 1, 1)
      rotateTimes.push(performance.now() - start)
      frame.close()
      images.push(await createImageBitmap(canvas))
      timestampsMs.push((video.frames[i]?.timestampS ?? 0) * 1000)
      onProgress(images.length)
    }
    return { images, timestampsMs, size: `${canvas.width} × ${canvas.height}`, rotateMs: median(rotateTimes) }
  } finally {
    source.close()
  }
}

async function runInWorker(
  frames: PreparedFrames,
  model: PoseModel,
  delegate: PoseDelegate,
): Promise<BenchmarkResponse> {
  // Copias: las imágenes se transfieren al Worker y dejan de estar disponibles aquí.
  const images = await Promise.all(frames.images.map((image) => createImageBitmap(image)))
  const worker = new Worker(new URL('../pose/benchmark.worker.ts', import.meta.url), {
    type: 'module',
  })
  try {
    return await new Promise<BenchmarkResponse>((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, error: 'El Worker no ha respondido en 2 minutos.' }),
        WORKER_TIMEOUT_MS,
      )
      worker.onmessage = (event: MessageEvent<BenchmarkResponse>) => {
        clearTimeout(timer)
        resolve(event.data)
      }
      worker.onerror = (event) => {
        clearTimeout(timer)
        resolve({ ok: false, error: event.message || 'Error al cargar el Worker.' })
      }
      const request: BenchmarkRequest = { images, timestampsMs: frames.timestampsMs, model, delegate }
      worker.postMessage(request, images)
    })
  } finally {
    worker.terminate()
  }
}

export function PoseBenchmark() {
  const [model, setModel] = useState<PoseModel>('lite')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [frames, setFrames] = useState<Omit<PreparedFrames, 'images' | 'timestampsMs'> | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  async function run(file: File) {
    setRunning(true)
    setError(null)
    setFrames(null)
    setRows(CONFIGS.map(() => ({ status: 'pending' })))
    let prepared: PreparedFrames | null = null
    try {
      prepared = await prepareFrames(file, (done) => setStatus(`Preparando frames: ${done} de ${FRAME_COUNT}…`))
      setFrames({ size: prepared.size, rotateMs: prepared.rotateMs })

      for (const [index, config] of CONFIGS.entries()) {
        const update = (row: Row) => setRows((current) => current.map((r, i) => (i === index ? row : r)))
        setStatus(`Probando ${config.label}…`)
        update({ status: 'running' })
        try {
          if (config.inWorker) {
            const response = await runInWorker(prepared, model, config.delegate)
            update(
              response.ok
                ? { status: 'done', result: response.result, note: response.moduleWasm ? null : 'WASM normal (no module)' }
                : { status: 'error', error: response.error },
            )
          } else {
            // MediaPipe pesa ~160 KB: se carga solo al usarlo.
            const { benchmarkPose } = await import('../pose/benchmark.ts')
            const result = await benchmarkPose(prepared.images, prepared.timestampsMs, { model, delegate: config.delegate })
            update({ status: 'done', result, note: null })
          }
        } catch (err) {
          update({ status: 'error', error: errorText(err) })
        }
      }
      setStatus(null)
    } catch (err) {
      setStatus(null)
      setError(err instanceof VideoFormatError ? err.message : errorText(err))
    } finally {
      for (const image of prepared?.images ?? []) image.close()
      setRunning(false)
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void run(file)
  }

  return (
    <section className="card">
      <h2>Prueba de detección de pose</h2>
      <p className="note">
        Elige un vídeo en el que salga una persona. Se analizan {FRAME_COUNT} frames seguidos con
        cada configuración para ver cuál funciona y cuál es más rápida en este dispositivo.
      </p>
      <div className="buttons">
        <select
          value={model}
          onChange={(event) => setModel(event.target.value as PoseModel)}
          disabled={running}
          aria-label="Modelo"
        >
          <option value="lite">Modelo lite</option>
          <option value="full">Modelo full</option>
        </select>
        <label className={running ? 'button disabled' : 'button'}>
          Elegir vídeo y probar
          <input type="file" accept="video/*" className="visually-hidden" onChange={onFileChange} disabled={running} />
        </label>
      </div>
      {status && <p className="note">{status}</p>}
      {error && <p className="error">{error}</p>}
      {frames && (
        <p className="note">
          Imagen para el modelo: {frames.size}. Girar y reducir cada frame: {formatMs(frames.rotateMs / 1000)}.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="bench">
          {CONFIGS.map((config, i) => (
            <li key={config.label}>
              <strong>{config.label}</strong>
              <BenchRow row={rows[i]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function BenchRow({ row }: { row: Row | undefined }) {
  if (!row) return null
  switch (row.status) {
    case 'pending':
      return <span className="muted">En espera</span>
    case 'running':
      return <span className="muted">Probando…</span>
    case 'error':
      return <span className="error">✗ {row.error}</span>
    case 'done':
      return <BenchResult result={row.result} note={row.note} />
  }
}

function BenchResult({ result, note }: { result: PoseBenchmarkResult; note: string | null }) {
  const fps = 1000 / result.medianDetectMs
  const allUpright = result.uprightFrames === result.frameCount
  return (
    <span>
      Carga {formatMs(result.createMs / 1000, 0)} · 1.er frame {formatMs(result.firstDetectMs / 1000, 0)} ·
      por frame <b>{formatMs(result.medianDetectMs / 1000, 0)}</b> (≈ {formatInteger(fps)} fps)
      <br />
      <span className={allUpright ? 'ok' : 'error'}>
        Pose detectada {result.detectedFrames}/{result.frameCount} · coherente {result.uprightFrames}/
        {result.frameCount}
      </span>
      {note && <span className="muted"> · {note}</span>}
    </span>
  )
}
