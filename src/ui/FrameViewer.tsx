import { useEffect, useRef, useState } from 'react'
import type { PoseFrame, TorsoPoint } from '../timing/torso.ts'
import { drawRotatedFrame } from '../video/drawFrame.ts'
import type { FrameSource } from '../video/frameSource.ts'
import { formatInteger, formatSeconds } from './format.ts'
import { drawPoseOverlay } from './poseOverlay.ts'

/** Lado mayor del canvas: suficiente para ver detalle sin gastar memoria con vídeos 4K. */
const MAX_CANVAS_SIDE = 1280
const BIG_STEP = 10
/** Valor por defecto estable (un [] nuevo en cada render redibujaría la capa sin necesidad). */
const NONE: readonly never[] = []

interface FrameViewerProps {
  source: FrameSource
  /** Pose de cada frame (undefined si aún no se ha analizado). */
  poses?: readonly (PoseFrame | undefined)[]
  /** Punto del torso de cada frame (null sin torso, undefined sin analizar). */
  torso?: readonly (TorsoPoint | null | undefined)[]
}

export function FrameViewer({ source, poses = NONE, torso = NONE }: FrameViewerProps) {
  const { video } = source
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [index, setIndex] = useState(0)
  const [shownIndex, setShownIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTrajectory, setShowTrajectory] = useState(true)
  const lastIndex = video.frames.length - 1
  const hasPoses = poses.some(Boolean)

  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(video.displayWidth, video.displayHeight))
  const canvasWidth = Math.round(video.displayWidth * scale)
  const canvasHeight = Math.round(video.displayHeight * scale)

  // Decodifica y dibuja el frame pedido. Si se pide otro antes de terminar, se cancela.
  useEffect(() => {
    const controller = new AbortController()
    source.getFrame(index, controller.signal).then(
      (frame) => {
        if (!controller.signal.aborted) {
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) drawRotatedFrame(ctx, frame, video.rotation)
          setShownIndex(index)
          setError(null)
        }
        frame.close()
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => controller.abort()
  }, [source, index, video.rotation])

  // La capa del torso va en otro canvas: se redibuja sin volver a decodificar el frame.
  useEffect(() => {
    const ctx = overlayRef.current?.getContext('2d')
    if (ctx) drawPoseOverlay(ctx, torso, poses[index], index, showTrajectory)
  }, [torso, poses, index, showTrajectory])

  // Flechas del teclado en escritorio (salvo si el foco está en un control que ya las usa).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const step = event.shiftKey ? BIG_STEP : 1
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - step))
      else if (event.key === 'ArrowRight') setIndex((i) => Math.min(lastIndex, i + step))
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lastIndex])

  const go = (target: number) => setIndex(Math.min(lastIndex, Math.max(0, target)))
  const frame = video.frames[index]
  const currentTorso = torso[index]

  return (
    <section className="card">
      <h2>Frames</h2>
      <div className="viewer">
        <div className="viewer-stage">
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className={shownIndex === index ? undefined : 'loading'}
            aria-label={`Frame ${index + 1} del vídeo`}
          />
          <canvas ref={overlayRef} width={canvasWidth} height={canvasHeight} className="overlay" aria-hidden="true" />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {hasPoses && (
        <div className="pose-status">
          <span className={currentTorso ? undefined : 'muted'}>
            {currentTorso === undefined
              ? 'Frame sin analizar'
              : currentTorso === null
                ? 'Sin torso en este frame'
                : currentTorso.source === 'both'
                  ? 'Torso detectado'
                  : 'Torso de un solo lado (menos preciso)'}
          </span>
          <label className="toggle">
            <input type="checkbox" checked={showTrajectory} onChange={(event) => setShowTrajectory(event.target.checked)} />
            Trayectoria
          </label>
        </div>
      )}
      <p className="frame-position">
        <span>
          Frame {formatInteger(index + 1)} de {formatInteger(video.frames.length)}
        </span>
        <span>t = {frame ? formatSeconds(frame.timestampS) : '—'}</span>
      </p>
      <input
        type="range"
        className="scrubber"
        min={0}
        max={lastIndex}
        step={1}
        value={index}
        onChange={(event) => go(Number(event.target.value))}
        aria-label="Posición en el vídeo"
      />
      <div className="buttons stepper">
        <button type="button" className="secondary" onClick={() => go(index - BIG_STEP)} disabled={index === 0} aria-label={`Retroceder ${BIG_STEP} frames`}>
          −{BIG_STEP}
        </button>
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Frame anterior">
          ◀
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index === lastIndex} aria-label="Frame siguiente">
          ▶
        </button>
        <button type="button" className="secondary" onClick={() => go(index + BIG_STEP)} disabled={index === lastIndex} aria-label={`Avanzar ${BIG_STEP} frames`}>
          +{BIG_STEP}
        </button>
      </div>
    </section>
  )
}
