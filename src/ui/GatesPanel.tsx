import { Fragment, useState } from 'react'
import type { Gate } from '../timing/geometry.ts'
import { parseDistance } from './gates.ts'

/** Más puertas no caben con comodidad en la pantalla del móvil. */
export const MAX_GATES = 6

interface GatesPanelProps {
  gates: readonly Gate[]
  /** Distancia entre cada par de puertas consecutivas (null si aún no se ha escrito). */
  distances: readonly (number | null)[]
  onAdd: () => void
  onRemove: (index: number) => void
  onDistanceChange: (index: number, value: number | null) => void
}

export function GatesPanel({ gates, distances, onAdd, onRemove, onDistanceChange }: GatesPanelProps) {
  return (
    <section className="card">
      <h2>Puertas</h2>
      <p className="note">
        Arrastra las líneas amarillas sobre el vídeo. Marca cada puerta <strong>en el plano por el que
        pasa el deportista</strong> (conos o marcas en su recorrido), no en el fondo: si no, la
        perspectiva falsea la distancia. Mueve los extremos para inclinarla si la cámara está torcida.
      </p>
      <ol className="gate-list">
        {gates.map((_, index) => (
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
              <DistanceInput
                // Se reinicia si la distancia cambia desde fuera (al quitar una puerta del medio).
                key={`${index}-${gates.length}-${distances[index] ?? ''}`}
                label={`Distancia de la ${index + 1} a la ${index + 2}`}
                value={distances[index] ?? null}
                onChange={(value) => onDistanceChange(index, value)}
              />
            )}
          </Fragment>
        ))}
      </ol>
      {gates.length < MAX_GATES && (
        <button type="button" className="secondary" onClick={onAdd}>
          Añadir puerta
        </button>
      )}
    </section>
  )
}

function DistanceInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','))
  const invalid = text.trim() !== '' && parseDistance(text) === null
  return (
    <li className="distance-row">
      <label>
        <span>{label}</span>
        <span className="distance-input">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={text}
            aria-invalid={invalid}
            onChange={(event) => {
              setText(event.target.value)
              onChange(parseDistance(event.target.value))
            }}
          />
          m
        </span>
      </label>
      {invalid && <span className="error">Escribe un número mayor que 0, por ejemplo 2,5.</span>}
    </li>
  )
}
