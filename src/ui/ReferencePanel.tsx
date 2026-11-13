import { useState } from 'react'
import type { ScaleReference } from '../timing/scale.ts'
import { parseDistance } from './gates.ts'

interface ReferencePanelProps {
  reference: ScaleReference
  /** Metros por alto de imagen (null si la referencia aún no vale). */
  scale: number | null
  onDistanceChange: (distanceM: number | null) => void
}

export function ReferencePanel({ reference, scale, onDistanceChange }: ReferencePanelProps) {
  return (
    <section className="card">
      <h2>Referencia</h2>
      <p className="note">
        Arrastra las dos barras azules sobre los extremos de algo cuya longitud conozcas y que esté{' '}
        <strong>en el plano por el que pasa el deportista</strong>: una cinta métrica en su recorrido, dos
        conos, una línea del campo… Si lo que conoces es una altura, gira las barras arrastrando sus
        extremos y ponlas en horizontal, arriba y abajo.
      </p>
      <DistanceInput value={reference.distanceM} onChange={onDistanceChange} />
      {reference.distanceM !== null && scale === null && (
        <p className="error">Las barras están demasiado juntas: sepáralas sobre los extremos de la referencia.</p>
      )}
    </section>
  )
}

function DistanceInput({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','))
  const invalid = text.trim() !== '' && parseDistance(text) === null
  return (
    <div className="reference-field">
      <label>
        <span>Distancia real entre las barras</span>
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
    </div>
  )
}
