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
  const [showGrid, setShowGrid] = useState(true)
  // Tamaño de la imagen de la cámara: cambia si se gira el móvil.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // Orientación al empezar a grabar (null si no se graba) y si ha cambiado después.
  const recordingPortrait = useRef<boolean | null>(null)
  const [rotatedWhileRecording, setRotatedWhileRecording] = useState(false)
  const measuredFps = useMeasuredFps(videoRef, stream)
  useStreamPreview(videoRef, stream, setError)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onResize = () => {
      if (!video.videoWidth || !video.videoHeight) return
      setSize({ width: video.videoWidth, height: video.videoHeight })
      const portrait = video.videoHeight > video.videoWidth
      if (recordingPortrait.current !== null && portrait !== recordingPortrait.current) {
        setRotatedWhileRecording(true)
      }
    }
    video.addEventListener('resize', onResize)
    video.addEventListener('loadedmetadata', onResize)
    return () => {
      video.removeEventListener('resize', onResize)
      video.removeEventListener('loadedmetadata', onResize)
    }
  }, [])

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
    recordingPortrait.current = size ? size.height > size.width : null
    setRotatedWhileRecording(false)
    // Sin timeslice: el navegador entrega el vídeo entero al parar (en el iPhone, un MP4 con
    // un solo fragmento).
    recorder.start()
    setError(null)
    setElapsedS(0)
    setPhase('recording')
  }

  function stop() {
    recordingPortrait.current = null
    if (recorderRef.current?.state === 'recording') {
      setPhase('finishing')
      recorderRef.current.stop()
    }
  }

  const settings = stream?.getVideoTracks()[0]?.getSettings()
  const configuredFps = settings?.frameRate
  const width = size?.width ?? settings?.width
  const height = size?.height ?? settings?.height
  const lowFps = (configuredFps !== undefined && configuredFps < LOW_FPS) || (measuredFps !== undefined && measuredFps < LOW_FPS)

  return (
    <section className="card recorder">
      <h2>Grabar vídeo</h2>
      <div className="recorder-stage" hidden={!stream}>
        <video ref={videoRef} className="preview" autoPlay playsInline muted />
        {showGrid && <div className="camera-grid" aria-hidden="true" />}
        {phase === 'recording' && (
          <span className="recording-badge" role="status">
            ● {formatClock(elapsedS)}
          </span>
        )}
      </div>
      {phase === 'starting' && !error && <p className="note">Abriendo la cámara…</p>}
      {error && <p className="error">{error}</p>}
      {settings && (
        <div className="recorder-info">
          <span className="note">
            {width ?? '?'} × {height ?? '?'} ·{' '}
            {configuredFps === undefined ? '? fps' : `${Math.round(configuredFps)} fps`}
            {measuredFps !== undefined && ` (llegan ${Math.round(measuredFps)})`}
          </span>
          <label className="toggle">
            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            Cuadrícula
          </label>
        </div>
      )}
      {rotatedWhileRecording && (
        <p className="warning-text">
          Has girado el móvil durante la grabación: el vídeo puede salir girado o cortado. Vuelve a grabar sin
          girarlo.
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
      {phase !== 'recording' && phase !== 'finishing' && <RecordingTips />}
    </section>
  )
}

function RecordingTips() {
  return (
    <details className="tips" open>
      <summary>Consejos para grabar</summary>
      <ul>
        <li>
          <strong>Móvil quieto</strong> (trípode o bien apoyado): si la cámara se mueve, las puertas dejan de
          estar en su sitio.
        </li>
        <li>
          <strong>Perpendicular al recorrido</strong> y a la altura de la cintura del deportista. La cuadrícula
          ayuda a dejar el suelo recto.
        </li>
        <li>
          <strong>Deportista grande en la imagen</strong>: al menos un cuarto del alto. Si se ve muy pequeño, la
          app no detecta su cuerpo; acércate.
        </li>
        <li>
          Si el tramo es largo, pon el móvil <strong>en horizontal antes de empezar</strong>. No lo gires
          mientras grabas.
        </li>
        <li>
          Que se vean la <strong>referencia</strong> (cinta, conos) y las puertas, en el plano por el que pasa el
          deportista, y que se le vea entero antes y después de cada puerta.
        </li>
        <li>
          Empieza a grabar antes de que entre en la imagen y para cuando haya salido. Con{' '}
          <strong>buena luz</strong> la cámara mantiene los 60 fps y el cuerpo no sale movido.
        </li>
      </ul>
    </details>
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
