// Repetición del resultado: el vídeo frame a frame con el torso, la trayectoria y las
// puertas dibujados encima, cámara lenta al cruzar cada puerta y un marcador con el
// cronómetro, la velocidad instantánea y el tiempo y la velocidad de cada tramo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CourseResult } from '../timing/course.ts'
import type { Gate } from '../timing/geometry.ts'
import { gatePassages, hudAt, type GatePassage } from '../timing/hud.ts'
import { playbackRate, playbackTimeline } from '../timing/playback.ts'
import type { PoseFrame, TorsoPoint } from '../timing/torso.ts'
import { drawRotatedFrame } from '../video/drawFrame.ts'
import type { FrameSource } from '../video/frameSource.ts'
import { formatInteger, formatSeconds } from './format.ts'
import { drawReplayOverlay } from './replayOverlay.ts'

/** Lado mayor del canvas: suficiente para verlo bien sin gastar memoria con vídeos 4K. */
const MAX_CANVAS_SIDE = 1280
/** Tiempo de vídeo (s) que se ve el cartel de una puerta después de cruzarla. */
const BADGE_S = 0.6
/** Tiempo de vídeo (s) que brilla una puerta al cruzarla. */
const FLASH_S = 0.35

const decimal = (digits: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const oneDecimal = decimal(1)
const twoDecimals = decimal(2)

interface ReplayPlayerProps {
  source: FrameSource
  /** Pose de cada frame (undefined si no se ha analizado). */
  poses: readonly (PoseFrame | undefined)[]
  /** Punto del torso de cada frame (null sin torso, undefined sin analizar). */
  torso: readonly (TorsoPoint | null | undefined)[]
  gates: readonly Gate[]
  course: CourseResult
  /** Velocidad instantánea aproximada de cada frame (m/s), o null. */
  speeds: readonly (number | null)[]
  /** Frame que se muestra (lo controla quien usa el reproductor). */
  index: number
  onIndexChange: (index: number) => void
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

export function ReplayPlayer({ source, poses, torso, gates, course, speeds, index, onIndexChange }: ReplayPlayerProps) {
  const { video } = source
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const [playing, setPlaying] = useState(false)
  const [slowMotion, setSlowMotion] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastIndex = video.frames.length - 1

  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(video.displayWidth, video.displayHeight))
  const canvasWidth = Math.round(video.displayWidth * scale)
  const canvasHeight = Math.round(video.displayHeight * scale)

  const timestamps = useMemo(() => video.frames.map((f) => f.timestampS), [video])
  const passages = useMemo(() => gatePassages(course), [course])
  const crossingTimes = useMemo(() => passages.map((p) => p.timeS), [passages])
  // Instante de la repetición de cada frame, con y sin cámara lenta.
  const timeline = useMemo(
    () => playbackTimeline(timestamps, slowMotion ? crossingTimes : []),
    [timestamps, crossingTimes, slowMotion],
  )

  /** Capa de dibujo del frame `i` (puertas, trayectoria y torso). */
  const drawOverlay = useCallback(
    (i: number) => {
      const ctx = overlayRef.current?.getContext('2d')
      if (!ctx) return
      const t = timestamps[i] ?? 0
      const crossed = new Set(passages.filter((p) => p.timeS <= t).map((p) => p.gateIndex))
      const recent = passages.findLast((p) => p.timeS <= t)
      const since = recent ? t - recent.timeS : Infinity
      drawReplayOverlay(ctx, {
        torso,
        pose: poses[i],
        index: i,
        gates,
        crossed,
        flash: recent && since < FLASH_S ? { gateIndex: recent.gateIndex, strength: 1 - since / FLASH_S } : null,
      })
    },
    [timestamps, passages, torso, poses, gates],
  )

  // En pausa: decodifica y dibuja el frame pedido (al reproducir lo hace el bucle).
  useEffect(() => {
    if (playing) return
    const controller = new AbortController()
    source.getFrame(index, controller.signal).then(
      (frame) => {
        if (!controller.signal.aborted) {
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) drawRotatedFrame(ctx, frame, video.rotation)
          drawOverlay(index)
        }
        frame.close()
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => controller.abort()
  }, [source, index, playing, video.rotation, drawOverlay])

  // Al salir, se para la reproducción.
  useEffect(() => () => controllerRef.current?.abort(), [])

  function pause() {
    controllerRef.current?.abort()
    controllerRef.current = null
    setPlaying(false)
  }

  async function play(from: number = index >= lastIndex ? 0 : index) {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setPlaying(true)
    setError(null)
    const startWall = performance.now()
    const startTimeline = timeline[from] ?? 0
    try {
      await source.forEachFrame(
        async (frame, entry) => {
          // Cada frame se muestra cuando le toca según el calendario (con cámara lenta en los
          // cruces). Si decodificar va más lento, se muestra en cuanto llega: la repetición
          // va más despacio, pero nunca se salta frames.
          const due = startWall + ((timeline[entry.index] ?? 0) - startTimeline) * 1000
          const wait = due - performance.now()
          if (wait > 2) await sleep(wait, controller.signal)
          if (controller.signal.aborted) return
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) drawRotatedFrame(ctx, frame, video.rotation)
          drawOverlay(entry.index)
          onIndexChange(entry.index)
        },
        { from, signal: controller.signal },
      )
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setPlaying(false)
      }
    }
  }

  function goTo(target: number) {
    pause()
    onIndexChange(Math.min(lastIndex, Math.max(0, target)))
  }

  const t = timestamps[index] ?? 0
  const hud = hudAt(t, passages)
  const speed = speeds[index] ?? null
  const slow = playing && slowMotion && playbackRate(t, crossingTimes) < 1
  const passage = hud.lastPassage
  const showBadge = passage !== null && (hud.finished || (hud.sinceLastS ?? Infinity) <= BADGE_S)

  return (
    <section className="card replay">
      <div className="replay-stage">
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} aria-label={`Repetición, frame ${index + 1}`} />
        <canvas ref={overlayRef} width={canvasWidth} height={canvasHeight} className="overlay" aria-hidden="true" />
        <div className="hud" aria-live="off">
          <div className="hud-top">
            <span className={`hud-clock${hud.finished ? ' finished' : ''}`}>
              {formatSeconds(hud.elapsedS ?? 0, hud.finished ? 3 : 2)}
            </span>
            {speed !== null && <span className="hud-speed">≈ {oneDecimal.format(speed)} m/s</span>}
          </div>
          {slow && <span className="hud-slow">Cámara lenta</span>}
          {showBadge && passage && <PassageBadge passage={passage} count={passages.length} />}
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <input
        type="range"
        className="scrubber"
        min={0}
        max={lastIndex}
        step={1}
        value={index}
        onChange={(event) => goTo(Number(event.target.value))}
        aria-label="Posición en la repetición"
      />
      <div className="replay-controls">
        <button type="button" className="secondary" onClick={() => void play(0)} aria-label="Desde el principio">
          ↺
        </button>
        <button type="button" className="secondary" onClick={() => goTo(index - 1)} disabled={playing || index === 0} aria-label="Frame anterior">
          ◀
        </button>
        <button type="button" className="play-button" onClick={() => (playing ? pause() : void play())}>
          {playing ? '❚❚ Pausa' : '▶ Reproducir'}
        </button>
        <button type="button" className="secondary" onClick={() => goTo(index + 1)} disabled={playing || index === lastIndex} aria-label="Frame siguiente">
          ▶
        </button>
      </div>
      <div className="replay-options">
        <label className="toggle">
          <input
            type="checkbox"
            checked={slowMotion}
            onChange={(event) => {
              setSlowMotion(event.target.checked)
              if (playing) pause()
            }}
          />
          Cámara lenta en las puertas
        </label>
        <span className="muted">
          Frame {formatInteger(index + 1)} / {formatInteger(lastIndex + 1)}
        </span>
      </div>
    </section>
  )
}

/** Cartel de una puerta recién cruzada: salida, parcial o meta. */
function PassageBadge({ passage, count }: { passage: GatePassage; count: number }) {
  const isStart = passage.passageIndex === 0
  const isFinish = passage.total !== null && passage.passageIndex === count - 1
  const result = isFinish ? passage.total : passage.segment
  const title = isStart ? 'Salida' : isFinish ? 'Meta' : `Parcial ${passage.passageIndex}`
  return (
    <div className={`hud-badge${isFinish ? ' finish' : ''}`}>
      <span className="hud-badge-title">
        {title} · puerta {passage.gateIndex + 1}
      </span>
      {isStart ? (
        <span className="hud-badge-main">¡En marcha!</span>
      ) : result ? (
        <>
          <span className="hud-badge-main">{twoDecimals.format(result.speedMs)} m/s</span>
          <span className="hud-badge-sub">
            {twoDecimals.format(result.speedKmh)} km/h · {formatSeconds(isFinish ? result.timeS : passage.elapsedS, 3)}
          </span>
        </>
      ) : (
        <span className="hud-badge-main">{formatSeconds(passage.elapsedS, 3)}</span>
      )}
    </div>
  )
}
