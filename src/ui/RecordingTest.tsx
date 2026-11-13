// Prueba de grabación (fase 5, tarea 1): graba unos segundos con MediaRecorder y comprueba
// si el lector de vídeo de la app sabe abrir el archivo: contenedor, códec, fps reales y
// si se puede decodificar. Todo en el dispositivo; el vídeo solo sale si el usuario lo guarda.
import { useEffect, useRef, useState } from 'react'
import { isFragmented, listTopLevelBoxes } from '../video/boxes.ts'
import { blobByteSource, demuxVideo } from '../video/demux.ts'
import { codecLabel, FrameSource } from '../video/frameSource.ts'
import { createRecorder, pickRecorderMimeType, recordingExtension } from './camera.ts'
import { formatFps, formatInteger, formatMs, formatSeconds } from './format.ts'

const DURATION_S = 5
/** Si se leen menos segundos que esta fracción de lo grabado, la lectura está incompleta. */
const PARTIAL_READ = 0.9

interface Report {
  mimeType: string
  sizeBytes: number
  recordedS: number
  boxes: string
  fragmented: boolean
  demux:
    | {
        ok: true
        codec: string
        resolution: string
        frames: number
        spanS: number
        fps: number
        intervals: string
        isVariable: boolean
        droppedFrames: number
        decodes: string
      }
    | { ok: false; error: string }
}

type State =
  | { status: 'idle' }
  | { status: 'recording'; secondsLeft: number }
  | { status: 'checking' }
  | { status: 'done'; blob: Blob; report: Report }
  | { status: 'error'; message: string }

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function checkRecording(blob: Blob, mimeType: string, recordedS: number): Promise<Report> {
  const bytes = blobByteSource(blob)
  const boxes = await listTopLevelBoxes(bytes).catch(() => [])
  // Resumen compacto: "ftyp moov (moof mdat)×150".
  const types = boxes.map((b) => b.type)
  const fragments = types.filter((t) => t === 'moof').length
  const head = types.slice(0, 4).join(' ')
  const summary = fragments > 0 ? `${head}… (${fragments} moof)` : types.join(' ') || 'no es MP4'

  let demux: Report['demux']
  try {
    const video = await demuxVideo(bytes)
    let decodes: string
    try {
      const source = await FrameSource.open(bytes, video)
      try {
        const frame = await source.getFrame(Math.floor(video.frames.length / 2))
        decodes = `Sí (${frame.displayWidth} × ${frame.displayHeight})`
        frame.close()
      } finally {
        source.close()
      }
    } catch (error) {
      decodes = `No: ${errorText(error)}`
    }
    const t = video.timing
    demux = {
      ok: true,
      codec: codecLabel(video.codec),
      resolution: `${video.displayWidth} × ${video.displayHeight}`,
      frames: t.frameCount,
      spanS: t.spanS,
      fps: t.fps,
      intervals: `${formatMs(t.minIntervalS)} – ${formatMs(t.maxIntervalS)}`,
      isVariable: t.isVariable,
      droppedFrames: t.droppedFrames,
      decodes,
    }
  } catch (error) {
    demux = { ok: false, error: errorText(error) }
  }
  return {
    mimeType: blob.type || mimeType || '(sin tipo)',
    sizeBytes: blob.size,
    recordedS,
    boxes: summary,
    fragmented: isFragmented(boxes),
    demux,
  }
}

export function RecordingTest({ stream }: { stream: MediaStream }) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const recorderRef = useRef<MediaRecorder | null>(null)

  // Si se apaga la cámara a media grabación, se para el grabador.
  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    },
    [stream],
  )

  function record() {
    const mimeType = pickRecorderMimeType()
    if (mimeType === null) {
      setState({ status: 'error', message: 'Este navegador no tiene MediaRecorder.' })
      return
    }
    let recorder: MediaRecorder
    try {
      recorder = createRecorder(stream, mimeType)
    } catch (error) {
      setState({ status: 'error', message: `No se pudo crear el grabador: ${errorText(error)}` })
      return
    }
    recorderRef.current = recorder
    const chunks: Blob[] = []
    let startedAt = 0
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = (event) => {
      setState({ status: 'error', message: `Error al grabar: ${errorText((event as ErrorEvent).error ?? event)}` })
    }
    recorder.onstop = () => {
      const recordedS = (performance.now() - startedAt) / 1000
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
      setState({ status: 'checking' })
      checkRecording(blob, recorder.mimeType || mimeType, recordedS).then(
        (report) => setState({ status: 'done', blob, report }),
        (error: unknown) => setState({ status: 'error', message: errorText(error) }),
      )
    }

    // Sin timeslice: un único bloque al parar (así el archivo sale como lo genera el navegador).
    recorder.start()
    startedAt = performance.now()
    setState({ status: 'recording', secondsLeft: DURATION_S })
    let left = DURATION_S
    const timer = setInterval(() => {
      left -= 1
      if (left <= 0 || recorder.state !== 'recording') {
        clearInterval(timer)
        if (recorder.state === 'recording') recorder.stop()
      } else {
        setState({ status: 'recording', secondsLeft: left })
      }
    }, 1000)
  }

  return (
    <div className="recording-test">
      <h3>Prueba de grabación</h3>
      <p className="note">
        Graba {DURATION_S} s y comprueba si la app puede leer el vídeo grabado desde la web (formato,
        fps reales y decodificación).
      </p>
      <button
        type="button"
        onClick={record}
        disabled={state.status === 'recording' || state.status === 'checking'}
      >
        {state.status === 'recording'
          ? `Grabando… ${state.secondsLeft} s`
          : state.status === 'checking'
            ? 'Comprobando…'
            : `Grabar ${DURATION_S} s`}
      </button>
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'done' && <RecordingReport blob={state.blob} report={state.report} />}
    </div>
  )
}

function RecordingReport({ blob, report }: { blob: Blob; report: Report }) {
  const { demux } = report
  return (
    <>
      <dl className="stats">
        <dt>Formato</dt>
        <dd>{report.mimeType}</dd>
        <dt>Tamaño</dt>
        <dd>{(report.sizeBytes / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB</dd>
        <dt>Duración grabada</dt>
        <dd>{formatSeconds(report.recordedS, 1)}</dd>
        <dt>Cajas</dt>
        <dd>{report.boxes}</dd>
        <dt>MP4 fragmentado</dt>
        <dd>{report.fragmented ? 'Sí' : 'No'}</dd>
        {demux.ok ? (
          <>
            <dt>Códec</dt>
            <dd>{demux.codec}</dd>
            <dt>Resolución</dt>
            <dd>{demux.resolution}</dd>
            <dt>Frames</dt>
            <dd>
              {formatInteger(demux.frames)} en {formatSeconds(demux.spanS, 2)}
            </dd>
            <dt>fps reales</dt>
            <dd>{formatFps(demux.fps)}</dd>
            <dt>Intervalo entre frames</dt>
            <dd>{demux.intervals}</dd>
            <dt>fps variables</dt>
            <dd>{demux.isVariable ? 'Sí' : 'No'}</dd>
            <dt>Frames perdidos</dt>
            <dd>{formatInteger(demux.droppedFrames)}</dd>
            <dt>Se decodifica</dt>
            <dd>{demux.decodes}</dd>
          </>
        ) : (
          <>
            <dt>Lectura</dt>
            <dd className="error">{demux.error}</dd>
          </>
        )}
      </dl>
      {!demux.ok ? (
        <p className="error">La app aún no puede leer esta grabación.</p>
      ) : demux.spanS < report.recordedS * PARTIAL_READ ? (
        <p className="error">
          La app solo lee {formatSeconds(demux.spanS, 1)} de los {formatSeconds(report.recordedS, 1)} grabados.
        </p>
      ) : (
        <p className="ok-text">La app puede leer esta grabación.</p>
      )}
      <SaveButton blob={blob} />
    </>
  )
}

/** Guarda la grabación en el dispositivo (hoja de compartir en el iPhone, descarga en el PC). */
function SaveButton({ blob }: { blob: Blob }) {
  async function save() {
    const extension = recordingExtension(blob.type)
    const name = `prueba-grabacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`
    const file = new File([blob], name, { type: blob.type })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return
      } catch (error) {
        // El usuario cerró la hoja de compartir: no es un error.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <button type="button" className="secondary" onClick={() => void save()}>
      Guardar vídeo
    </button>
  )
}
