import { useRef, useState } from 'react'
import { PoseBenchmark } from './PoseBenchmark.tsx'
import { RecordingTest } from './RecordingTest.tsx'
import { describeCameraError, openCamera, useMeasuredFps, useStreamPreview } from './camera.ts'

interface Check {
  label: string
  ok: boolean
  detail: string
}

const RECORDER_TYPES = ['video/mp4', 'video/webm']

function runChecks(): Check[] {
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  const hasRecorder = 'MediaRecorder' in window
  const recorderTypes = hasRecorder
    ? RECORDER_TYPES.filter((type) => MediaRecorder.isTypeSupported(type))
    : []

  return [
    {
      label: 'Conexión segura (HTTPS)',
      ok: window.isSecureContext,
      detail: 'Imprescindible para usar la cámara',
    },
    {
      label: 'Cámara (getUserMedia)',
      // mediaDevices no existe fuera de un contexto seguro.
      ok: typeof navigator.mediaDevices?.getUserMedia === 'function',
      detail: 'Grabar desde la web',
    },
    {
      label: 'WebCodecs (VideoDecoder)',
      ok: 'VideoDecoder' in window,
      detail: 'Leer cada frame con su timestamp real',
    },
    {
      label: 'requestVideoFrameCallback',
      ok: 'requestVideoFrameCallback' in video,
      detail: 'Alternativa para leer frames',
    },
    {
      label: 'Grabación (MediaRecorder)',
      ok: hasRecorder,
      detail: recorderTypes.length > 0 ? `Formatos: ${recorderTypes.join(', ')}` : 'Sin formatos',
    },
    {
      label: 'WebAssembly',
      ok: typeof WebAssembly === 'object',
      detail: 'Necesario para MediaPipe',
    },
    {
      label: 'WebGL 2',
      ok: canvas.getContext('webgl2') !== null,
      detail: 'Acelera la detección de pose',
    },
    {
      label: 'Web Workers',
      ok: typeof Worker === 'function',
      detail: 'Procesar sin bloquear la interfaz',
    },
    {
      label: 'OffscreenCanvas',
      ok: typeof OffscreenCanvas === 'function',
      detail: 'Dibujar frames dentro de un worker',
    },
    {
      label: 'IndexedDB',
      ok: 'indexedDB' in window,
      detail: 'Historial local',
    },
    {
      label: 'Service Worker',
      ok: 'serviceWorker' in navigator,
      detail: 'Instalar la app y usarla sin conexión',
    },
  ]
}

function formatFps(fps: number | undefined): string {
  return fps === undefined ? '—' : `${fps.toFixed(1)} fps`
}

function CameraTest() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  const measuredFps = useMeasuredFps(videoRef, stream)
  useStreamPreview(videoRef, stream, setError)

  async function start() {
    setError(null)
    try {
      setStream(await openCamera())
    } catch (err) {
      setError(describeCameraError(err))
    }
  }

  function stop() {
    setStream(null)
  }

  const track = stream?.getVideoTracks()[0]
  const settings = track?.getSettings()
  const capabilities =
    track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : undefined

  return (
    <section className="card">
      <h2>Prueba de cámara</h2>
      <div className="buttons">
        {stream ? (
          <button type="button" onClick={stop}>
            Detener cámara
          </button>
        ) : (
          <button type="button" onClick={() => void start()}>
            Probar cámara
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <video ref={videoRef} className="preview" hidden={!stream} autoPlay playsInline muted />
      {settings && (
        <dl className="stats">
          <dt>Resolución</dt>
          <dd>
            {settings.width ?? '?'} × {settings.height ?? '?'}
          </dd>
          <dt>fps configurados</dt>
          <dd>{formatFps(settings.frameRate)}</dd>
          <dt>fps máximos de la cámara</dt>
          <dd>{formatFps(capabilities?.frameRate?.max)}</dd>
          <dt>fps recibidos (medidos)</dt>
          <dd>{formatFps(measuredFps)}</dd>
        </dl>
      )}
      {stream && <RecordingTest stream={stream} />}
    </section>
  )
}

export function Diagnostics() {
  const [checks] = useState(runChecks)

  return (
    <>
      <section className="card">
        <h2>Compatibilidad del navegador</h2>
        <ul className="checks">
          {checks.map((check) => (
            <li key={check.label}>
              <span className={check.ok ? 'ok' : 'fail'} aria-hidden="true">
                {check.ok ? '✓' : '✗'}
              </span>
              <span>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </span>
              <span className="visually-hidden">{check.ok ? 'disponible' : 'no disponible'}</span>
            </li>
          ))}
        </ul>
        <p className="user-agent">{navigator.userAgent}</p>
      </section>
      <CameraTest />
      <PoseBenchmark />
    </>
  )
}
