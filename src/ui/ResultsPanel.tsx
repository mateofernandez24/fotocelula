import type { CourseResult } from '../timing/course.ts'
import type { Gate } from '../timing/geometry.ts'
import type { SegmentResult } from '../timing/results.ts'
import { formatFps, formatInteger, formatMs, formatSeconds } from './format.ts'

interface ResultsPanelProps {
  /** null mientras no se haya analizado el movimiento. */
  course: CourseResult | null
  gates: readonly Gate[]
  distances: readonly (number | null)[]
  fps: number
  /** Frame que se ve ahora en el visor (índice desde 0). */
  currentFrame: number
  onGoToFrame: (frame: number) => void
  /** Marca a mano que el torso cruza la puerta entre el frame anterior al actual y el actual. */
  onMarkHere: (gateIndex: number) => void
  onAutomatic: (gateIndex: number) => void
}

const ms = (seconds: number) => formatMs(seconds, 0)
const number2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ResultsPanel(props: ResultsPanelProps) {
  const { course, gates, distances, fps } = props
  if (!course) {
    return (
      <section className="card">
        <h2>Resultado</h2>
        <p className="note">Pulsa «Analizar movimiento» para detectar cuándo se cruza cada puerta.</p>
      </section>
    )
  }

  const problem = describeProblem(course, distances)
  return (
    <section className="card">
      <h2>Resultado</h2>
      {course.total ? <MainResult total={course.total} gates={gates} /> : <p className="error">{problem}</p>}

      {gates.length > 2 && course.segments.some(Boolean) && (
        <ul className="splits">
          {course.segments.map((segment, i) =>
            segment ? (
              <li key={i}>
                <span>
                  Tramo {segment.fromGate + 1} → {segment.toGate + 1}
                </span>
                <span>
                  {formatSeconds(segment.timeS)} · {number2.format(segment.speedMs)} m/s
                </span>
              </li>
            ) : null,
          )}
        </ul>
      )}

      <h3>Cruces</h3>
      <p className="note">
        Para corregir un cruce: avanza en el visor hasta el <strong>primer frame en que el torso ya ha
        pasado la línea</strong> y pulsa «Marcar aquí». Los cruces «poco fiables» (por ejemplo, una puerta
        en el borde de la imagen, donde el deportista aparece o desaparece) conviene revisarlos.
      </p>
      <ul className="crossings">
        {course.gates.map(({ crossing, manual }, index) => (
          <li key={index}>
            <div className="crossing-head">
              <span className="gate-badge">{index + 1}</span>
              {crossing ? (
                <span>
                  {formatSeconds(crossing.timeS)} <span className="muted">± {ms(crossing.uncertaintyS)}</span>
                  <br />
                  <small className="muted">
                    entre los frames {formatInteger(crossing.beforeFrame + 1)} y {formatInteger(crossing.afterFrame + 1)}
                  </small>
                </span>
              ) : (
                <span className="error">No se ha detectado el cruce</span>
              )}
              {manual && <span className="tag">a mano</span>}
              {crossing && !manual && (crossing.atTrackEdge || crossing.uncertaintyS > 1 / fps / 2) && (
                <span className="tag warn">poco fiable</span>
              )}
            </div>
            <div className="buttons crossing-actions">
              {crossing && (
                <button type="button" className="secondary small" onClick={() => props.onGoToFrame(crossing.beforeFrame)}>
                  Ver
                </button>
              )}
              <button
                type="button"
                className="secondary small"
                disabled={props.currentFrame === 0}
                onClick={() => props.onMarkHere(index)}
              >
                Marcar aquí (frame {formatInteger(props.currentFrame + 1)})
              </button>
              {manual && (
                <button type="button" className="secondary small" onClick={() => props.onAutomatic(index)}>
                  Automático
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="note">
        Vídeo a {formatFps(fps)}. El margen tiene en cuenta los frames y el temblor del punto del torso;
        no incluye errores por perspectiva ni por colocar mal la referencia o las puertas.
      </p>
    </section>
  )
}

function MainResult({ total, gates }: { total: SegmentResult; gates: readonly Gate[] }) {
  const from = gates[total.fromGate]
  const to = gates[total.toGate]
  const midX = (gate: Gate | undefined) => (gate ? (gate.a.x + gate.b.x) / 2 : 0)
  const direction = midX(from) > midX(to) ? 'de derecha a izquierda' : 'de izquierda a derecha'
  return (
    <>
      <div className="result-main">
        <div>
          <span className="muted">Tiempo</span>
          <strong>{formatSeconds(total.timeS)}</strong>
          <small className="muted">± {ms(total.uncertaintyS)}</small>
        </div>
        <div>
          <span className="muted">Velocidad</span>
          <strong>{number2.format(total.speedMs)} m/s</strong>
          <small className="muted">
            {number2.format(total.speedKmh)} km/h · ±{' '}
            {total.speedUncertaintyMs < 0.005 ? '< 0,01' : number2.format(total.speedUncertaintyMs)} m/s
          </small>
        </div>
      </div>
      <p className="note">
        {number2.format(total.distanceM)} m, de la puerta {total.fromGate + 1} a la {total.toGate + 1} ({direction}).
      </p>
    </>
  )
}

/** Qué falta para poder dar un resultado, en palabras del usuario. */
function describeProblem(course: CourseResult, distances: readonly (number | null)[]): string {
  const missing = course.gates.findIndex((g) => !g.crossing)
  if (missing >= 0) {
    return `No se ha detectado el cruce de la puerta ${missing + 1}. Comprueba que está en el recorrido o márcalo a mano.`
  }
  if (course.order === null) {
    return 'Los cruces no siguen el orden de las puertas. Revisa dónde están las puertas o ajusta los cruces a mano.'
  }
  if (distances.some((d) => d === null)) {
    return 'Hay puertas demasiado juntas para calcular la distancia entre ellas: sepáralas.'
  }
  return 'No se puede calcular el resultado con estos cruces.'
}
