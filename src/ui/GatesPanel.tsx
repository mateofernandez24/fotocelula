import { Fragment } from 'react'
import type { Gate } from '../timing/geometry.ts'
import { formatMeters } from './format.ts'

/** Más puertas no caben con comodidad en la pantalla del móvil. */
export const MAX_GATES = 6
/** Distancia medida mayor que esto por la referencia: avisar de que el error se multiplica. */
const EXTRAPOLATION_WARNING = 3

interface GatesPanelProps {
  gates: readonly Gate[]
  /** Distancia entre cada par de puertas consecutivas, calculada con la referencia. */
  distances: readonly (number | null)[]
  /** Distancia total medida / distancia de la referencia (null si no se sabe). */
  extrapolation: number | null
  onAdd: () => void
  onRemove: (index: number) => void
  /** Pone las dos puertas justo sobre las barras de la referencia. */
  onUseReference: () => void
}

export function GatesPanel({ gates, distances, extrapolation, onAdd, onRemove, onUseReference }: GatesPanelProps) {
  return (
    <section className="card">
      <h2>Puertas</h2>
      <p className="note">
        Arrastra las líneas amarillas al inicio y al final del tramo que quieres medir (y a los puntos
        intermedios, si añades más). La distancia entre ellas se calcula con la referencia. Mueve los
        extremos para inclinarlas si la cámara está torcida.
      </p>
      <ol className="gate-list">
        {gates.map((_, index) => {
          const distance = distances[index]
          return (
            <Fragment key={index}>
              <li className="gate-row">
                <span className="gate-badge">{index + 1}</span>
                <span>Puerta {index + 1}</span>
                {gates.length > 2 && (
                  <button type="button" className="secondary small" onClick={() => onRemove(index)}>
                    Quitar
                  </button>
                )}
              </li>
              {index < gates.length - 1 && (
                <li className="distance-row">
                  <span>
                    De la {index + 1} a la {index + 2}
                  </span>
                  {distance == null ? (
                    <span className="error">Puertas demasiado juntas</span>
                  ) : (
                    <strong>{formatMeters(distance)}</strong>
                  )}
                </li>
              )}
            </Fragment>
          )
        })}
      </ol>
      {extrapolation !== null && extrapolation > EXTRAPOLATION_WARNING && (
        <p className="warning-text">
          Las puertas abarcan {Math.round(extrapolation)} veces la referencia: un pequeño error al colocar las
          barras azules se multiplica por {Math.round(extrapolation)}. Si puedes, usa una referencia más larga.
        </p>
      )}
      <div className="buttons">
        {gates.length < MAX_GATES && (
          <button type="button" className="secondary" onClick={onAdd}>
            Añadir puerta
          </button>
        )}
        <button type="button" className="secondary" onClick={onUseReference}>
          Puertas sobre la referencia
        </button>
      </div>
    </section>
  )
}
