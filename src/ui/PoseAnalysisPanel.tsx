import { buildPoseDataFile, poseFileName } from '../pose/poseExport.ts'
import type { TorsoPoint } from '../timing/torso.ts'
import type { DemuxedVideo } from '../video/demux.ts'
import { formatInteger, formatSeconds } from './format.ts'
import type { PoseAnalysisState } from './usePoseAnalysis.ts'

interface PoseAnalysisPanelProps {
  fileName: string
  video: DemuxedVideo
  state: PoseAnalysisState
  /** Punto del torso por frame: null sin torso, undefined aún sin analizar. */
  torso: readonly (TorsoPoint | null | undefined)[]
  onStart: () => void
  onCancel: () => void
}

function downloadJson(fileName: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Safari necesita que la URL siga viva un momento después del clic.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function PoseAnalysisPanel({ fileName, video, state, torso, onStart, onCancel }: PoseAnalysisPanelProps) {
  return (
    <section className="card">
      <h2>Movimiento</h2>
      {state.status === 'idle' && (
        <>
          <p className="note">
            Detecta la posición del torso en cada frame. Tarda unos segundos y todo se hace en este
            dispositivo.
          </p>
          <button type="button" onClick={onStart}>
            Analizar movimiento
          </button>
        </>
      )}

      {state.status === 'running' && <Running state={state} onCancel={onCancel} />}

      {state.status === 'done' && (
        <>
          <Summary torso={torso} />
          <p className="note">
            Analizado en {formatSeconds(state.analysis.elapsedMs / 1000, 1)} · {state.engine}
            {state.analysis.decoderRestarts > 0 &&
              ` · el decodificador falló y se reanudó ${formatInteger(state.analysis.decoderRestarts)} ${
                state.analysis.decoderRestarts === 1 ? 'vez' : 'veces'
              }`}
          </p>
          <div className="buttons">
            <button
              type="button"
              className="secondary"
              onClick={() => downloadJson(poseFileName(fileName), buildPoseDataFile(fileName, video, state.analysis))}
            >
              Descargar datos (JSON)
            </button>
            <button type="button" className="secondary" onClick={onStart}>
              Volver a analizar
            </button>
          </div>
        </>
      )}

      {state.status === 'cancelled' && (
        <>
          <p className="note">
            Análisis cancelado en el frame {formatInteger(state.done)} de {formatInteger(state.total)}.
          </p>
          <button type="button" onClick={onStart}>
            Analizar de nuevo
          </button>
        </>
      )}

      {state.status === 'error' && (
        <>
          <p className="error">{state.message}</p>
          <button type="button" onClick={onStart}>
            Reintentar
          </button>
        </>
      )}
    </section>
  )
}

function Running({
  state,
  onCancel,
}: {
  state: Extract<PoseAnalysisState, { status: 'running' }>
  onCancel: () => void
}) {
  const fraction = state.total > 0 ? state.done / state.total : 0
  const elapsedS = state.elapsedMs / 1000
  const remainingS = state.done > 0 ? (elapsedS / state.done) * (state.total - state.done) : null
  return (
    <>
      <progress className="progress" value={state.done} max={state.total} />
      <p className="note">
        {state.engine === null
          ? 'Cargando el modelo…'
          : `Analizando: ${formatInteger(state.done)} de ${formatInteger(state.total)} frames (${formatInteger(fraction * 100)} %)`}
        {remainingS !== null && state.done < state.total && ` · quedan unos ${formatInteger(Math.ceil(remainingS))} s`}
      </p>
      <button type="button" className="secondary" onClick={onCancel}>
        Cancelar
      </button>
    </>
  )
}

function Summary({ torso }: { torso: readonly (TorsoPoint | null | undefined)[] }) {
  const total = torso.length
  const detected = torso.filter(Boolean).length
  const oneSide = torso.filter((point) => point && point.source !== 'both').length
  return (
    <>
      <p className={detected === total ? 'ok-text' : undefined}>
        Torso detectado en {formatInteger(detected)} de {formatInteger(total)} frames.
      </p>
      {oneSide > 0 && (
        <p className="note">
          En {formatInteger(oneSide)} frames solo se ve un lado del cuerpo: ahí el punto es menos preciso.
        </p>
      )}
      {detected < total && (
        <p className="note">
          En los frames sin torso no hay persona o el cuerpo no se ve bien (tapado, borroso o fuera
          de la imagen).
        </p>
      )}
    </>
  )
}
