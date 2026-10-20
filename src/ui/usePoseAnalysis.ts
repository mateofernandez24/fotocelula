import { useCallback, useEffect, useRef, useState } from 'react'
import type { PoseAnalysis } from '../pose/analyzePose.ts'
import { PoseAnalysisError, startPoseAnalysis, type PoseAnalysisJob } from '../pose/poseAnalysisClient.ts'
import type { PoseFrame } from '../timing/torso.ts'

export type PoseAnalysisState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number; engine: string | null; elapsedMs: number }
  | { status: 'done'; analysis: PoseAnalysis; engine: string }
  | { status: 'cancelled'; done: number; total: number }
  | { status: 'error'; message: string }

function engineLabel(delegate: string, inWorker: boolean): string {
  return `${delegate} · ${inWorker ? 'en segundo plano' : 'hilo principal'}`
}

/**
 * Estado del análisis de pose de un vídeo. `poses[i]` es la pose del frame i (undefined
 * si aún no se ha analizado). Se va rellenando mientras avanza el análisis.
 */
export function usePoseAnalysis(file: File, frameCount: number) {
  const [state, setState] = useState<PoseAnalysisState>({ status: 'idle' })
  const [poses, setPoses] = useState<(PoseFrame | undefined)[]>(() => new Array<PoseFrame | undefined>(frameCount))
  const job = useRef<PoseAnalysisJob | null>(null)

  // Si se cambia de vídeo o se sale, se cancela el análisis en curso.
  useEffect(() => () => job.current?.cancel(), [])

  const start = useCallback(() => {
    job.current?.cancel()
    setPoses(new Array<PoseFrame | undefined>(frameCount))
    const startedAt = performance.now()
    setState({ status: 'running', done: 0, total: frameCount, engine: null, elapsedMs: 0 })
    let engine: string | null = null
    let done = 0

    const current = startPoseAnalysis(
      file,
      { model: 'full', delegate: 'GPU' },
      {
        onStarted: (info) => {
          engine = engineLabel(info.delegate, info.inWorker)
          setState((s) => (s.status === 'running' ? { ...s, engine } : s))
        },
        onProgress: (doneNow, total, batch) => {
          done = doneNow
          setPoses((previous) => {
            const next = previous.slice()
            for (const pose of batch) next[pose.frameIndex] = pose
            return next
          })
          const elapsedMs = performance.now() - startedAt
          setState((s) => (s.status === 'running' ? { ...s, done: doneNow, total, elapsedMs } : s))
        },
      },
    )
    job.current = current
    current.result.then(
      (analysis) => {
        if (job.current !== current) return
        job.current = null
        setState({ status: 'done', analysis, engine: engine ?? analysis.delegate })
      },
      (error: unknown) => {
        if (job.current !== current) return
        job.current = null
        if (error instanceof PoseAnalysisError && error.kind === 'cancelled') {
          setState({ status: 'cancelled', done, total: frameCount })
        } else {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      },
    )
  }, [file, frameCount])

  const cancel = useCallback(() => job.current?.cancel(), [])

  return { state, poses, start, cancel }
}
