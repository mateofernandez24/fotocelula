import { useEffect, useRef, useState } from 'react'
import type { FrameSource } from '../video/frameSource.ts'
import { drawRotatedFrame } from './drawFrame.ts'
import { formatInteger, formatSeconds } from './format.ts'

/** Lado mayor del canvas: suficiente para ver detalle sin gastar memoria con vídeos 4K. */
const MAX_CANVAS_SIDE = 1280
const BIG_STEP = 10

interface FrameViewerProps {
  source: FrameSource
}

export function FrameViewer({ source }: FrameViewerProps) {
  const { video } = source
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [index, setIndex] = useState(0)
  const [shownIndex, setShownIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastIndex = video.frames.length - 1

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

  return (
    <section className="card">
      <h2>Frames</h2>
      <div className="viewer">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className={shownIndex === index ? undefined : 'loading'}
          aria-label={`Frame ${index + 1} del vídeo`}
        />
      </div>
      {error && <p className="error">{error}</p>}
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
