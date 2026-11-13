// Grabación desde la web: vista previa de la cámara trasera a la mayor tasa de fps posible y
// grabación con MediaRecorder. El vídeo se queda en el dispositivo y pasa directamente al
// análisis (así se evita la conversión a 30 fps que hace iOS al importar desde Fotos).
import { useEffect, useRef, useState } from 'react'
import {
  createRecorder,
  describeCameraError,
  openCamera,
  pickRecorderMimeType,
  recordingExtension,
  stopStream,
  useMeasuredFps,
  useStreamPreview,
} from './camera.ts'

/** Límite de duración: a 16 Mbps, un minuto ocupa ~120 MB de memoria. */
const MAX_DURATION_S = 60
/** Por debajo de estos fps el margen de error crece: se avisa al usuario. */
const LOW_FPS = 50

interface RecorderProps {
  onRecorded: (file: File) => void
  onClose: () => void
}

type Phase = 'starting' | 'preview' | 'recording' | 'finishing'

export function Recorder({ onRecorded, onClose }: RecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [elapsedS, setElapsedS] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const measuredFps = useMeasuredFps(videoRef, stream)
  useStreamPreview(videoRef, stream, setError)

  // Abre la cámara al mostrar la pantalla. Si se cierra antes de que conteste, la apaga.
  useEffect(() => {
    let cancelled = false
    openCamera().then(
      (newStream) => {
        if (cancelled) {
          stopStream(newStream)
          return
        }
        setStream(newStream)
        setPhase('preview')
      },
      (err: unknown) => {
        if (!cancelled) setError(describeCameraError(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Al salir a media grabación se descarta lo grabado.
  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.stop()
      }
    },
    [],
  )

  // Cronómetro y parada automática al llegar al límite.
  useEffect(() => {
    if (phase !== 'recording') return
    const startedAt = performance.now()
    const timer = setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000
      setElapsedS(seconds)
      if (seconds >= MAX_DURATION_S && recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
    }, 200)
    return () => clearInterval(timer)
  }, [phase])

  function record() {
    if (!stream) return
    const mimeType = pickRecorderMimeType()
    if (mimeType === null) {
      setError('Este navegador no permite grabar vídeo (no tiene MediaRecorder). Importa un vídeo de la galería.')
      return
    }
    let recorder: MediaRecorder
    try {
      recorder = createRecorder(stream, mimeType)
    } catch (err) {
      setError(`No se pudo empezar a grabar: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => {
      setError('Se ha producido un error al grabar. Vuelve a intentarlo.')
      setPhase('preview')
    }
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'video/mp4'
      const blob = new Blob(chunks, { type })
      if (blob.size === 0) {
        setError('La grabación está vacía. Vuelve a intentarlo.')
        setPhase('preview')
        return
      }
      onRecorded(new File([blob], recordingName(type), { type }))
    }
    recorderRef.current = recorder
    // Sin timeslice: el navegador entrega el vídeo entero al parar (en el iPhone, un MP4 con
    // un solo fragmento).
    recorder.start()
    setError(null)
    setElapsedS(0)
    setPhase('recording')
  }

  function stop() {
    if (recorderRef.current?.state === 'recording') {
      setPhase('finishing')
      recorderRef.current.stop()
    }
  }

  const settings = stream?.getVideoTracks()[0]?.getSettings()
  const configuredFps = settings?.frameRate
  const lowFps = (configuredFps !== undefined && configuredFps < LOW_FPS) || (measuredFps !== undefined && measuredFps < LOW_FPS)

  return (
    <section className="card recorder">
      <h2>Grabar vídeo</h2>
      <div className="recorder-stage">
        <video ref={videoRef} className="preview" hidden={!stream} autoPlay playsInline muted />
        {phase === 'recording' && (
          <span className="recording-badge" role="status">
            ● {formatClock(elapsedS)}
          </span>
        )}
      </div>
      {phase === 'starting' && !error && <p className="note">Abriendo la cámara…</p>}
      {error && <p className="error">{error}</p>}
      {settings && (
        <p className="note recorder-info">
          {settings.width ?? '?'} × {settings.height ?? '?'} ·{' '}
          {configuredFps === undefined ? '? fps' : `${Math.round(configuredFps)} fps`}
          {measuredFps !== undefined && ` (llegan ${Math.round(measuredFps)})`}
        </p>
      )}
      {lowFps && (
        <p className="warning-text">
          La cámara da menos de {LOW_FPS} fps: el margen de error será mayor. Con buena luz suele llegar a 60 fps.
        </p>
      )}
      <div className="buttons">
        {phase === 'recording' || phase === 'finishing' ? (
          <button type="button" className="stop-button" onClick={stop} disabled={phase === 'finishing'}>
            {phase === 'finishing' ? 'Guardando…' : '■ Detener'}
          </button>
        ) : (
          <button type="button" className="record-button" onClick={record} disabled={phase !== 'preview'}>
            ● Grabar
          </button>
        )}
        <button type="button" className="secondary" onClick={onClose} disabled={phase === 'finishing'}>
          Cancelar
        </button>
      </div>
      {phase === 'recording' && (
        <p className="note">Se detiene sola al llegar a {MAX_DURATION_S} s.</p>
      )}
    </section>
  )
}

function formatClock(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** grabacion-2026-11-13-14-05-00.mp4 (hora local). */
function recordingName(mimeType: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  return `grabacion-${stamp}.${recordingExtension(mimeType)}`
}
