import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { gateMidpoint, type Gate, type Point } from '../timing/geometry.ts'

interface GateLayerProps {
  /** Puertas (o barras de la referencia) en coordenadas normalizadas. */
  gates: readonly Gate[]
  /** Sin `onChange`, la capa solo se ve (más tenue) y no capta el dedo. */
  onChange?: ((gates: Gate[]) => void) | undefined
  /** Puertas en amarillo o barras de la referencia en azul. */
  variant?: 'gate' | 'reference'
  /** Etiqueta de cada barra (por defecto, su número). */
  labels?: readonly string[]
  /** Texto entre cada par de barras consecutivas (p. ej. la distancia), o null para no unirlas. */
  spanLabels?: readonly (string | null)[]
  label: string
}

type Part = 'a' | 'b' | 'line'

interface Drag {
  index: number
  part: Part
  pointerId: number
  start: Point
  original: Gate
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const pct = (v: number) => `${v * 100}%`

/**
 * Puertas (o barras de la referencia) sobre el frame: cada una se mueve arrastrando sus extremos (para inclinarla o
 * alargarla) o la propia línea (para desplazarla entera). Coordenadas normalizadas.
 * Solo las puertas captan el dedo: en el resto de la imagen se puede desplazar la página.
 */
export function GateLayer({ gates, onChange, variant = 'gate', labels, spanLabels, label }: GateLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)

  function toPoint(event: ReactPointerEvent): Point | null {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }

  function startDrag(event: ReactPointerEvent, index: number, part: Part) {
    const point = toPoint(event)
    const gate = gates[index]
    if (!point || !gate || !onChange) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { index, part, pointerId: event.pointerId, start: point, original: gate }
  }

  function moveDrag(event: ReactPointerEvent) {
    const current = drag.current
    const point = current && current.pointerId === event.pointerId ? toPoint(event) : null
    if (!current || !point || !onChange) return
    const { original } = current
    let gate: Gate
    if (current.part === 'line') {
      // Desplazar la puerta entera sin que ningún extremo salga de la imagen.
      const minX = Math.min(original.a.x, original.b.x)
      const maxX = Math.max(original.a.x, original.b.x)
      const minY = Math.min(original.a.y, original.b.y)
      const maxY = Math.max(original.a.y, original.b.y)
      const dx = Math.min(1 - maxX, Math.max(-minX, point.x - current.start.x))
      const dy = Math.min(1 - maxY, Math.max(-minY, point.y - current.start.y))
      gate = {
        a: { x: original.a.x + dx, y: original.a.y + dy },
        b: { x: original.b.x + dx, y: original.b.y + dy },
      }
    } else {
      gate = { ...original, [current.part]: { x: clamp01(point.x), y: clamp01(point.y) } }
    }
    onChange(gates.map((g, i) => (i === current.index ? gate : g)))
  }

  function endDrag(event: ReactPointerEvent) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const interactive = Boolean(onChange)
  return (
    <svg
      ref={svgRef}
      className={`gate-layer ${variant}${interactive ? '' : ' passive'}`}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label={label}
    >
      {/* Unión entre barras consecutivas, con su texto (la distancia) en el centro. */}
      {spanLabels?.map((text, index) => {
        const from = gates[index]
        const to = gates[index + 1]
        if (text === null || !from || !to) return null
        const p = gateMidpoint(from)
        const q = gateMidpoint(to)
        return (
          <g key={`span-${index}`}>
            <line x1={pct(p.x)} y1={pct(p.y)} x2={pct(q.x)} y2={pct(q.y)} className="gate-span" />
            <text x={pct((p.x + q.x) / 2)} y={pct((p.y + q.y) / 2)} dy={-8} className="gate-span-label">
              {text}
            </text>
          </g>
        )
      })}
      {gates.map((gate, index) => {
        // La etiqueta va junto al extremo de arriba.
        const top = gate.a.y <= gate.b.y ? gate.a : gate.b
        return (
          <g key={index} className="gate">
            <line x1={pct(gate.a.x)} y1={pct(gate.a.y)} x2={pct(gate.b.x)} y2={pct(gate.b.y)} className="gate-line" />
            {interactive && (
              // Zona ancha e invisible para coger la línea con el dedo.
              <line
                x1={pct(gate.a.x)}
                y1={pct(gate.a.y)}
                x2={pct(gate.b.x)}
                y2={pct(gate.b.y)}
                className="gate-hit"
                onPointerDown={(event) => startDrag(event, index, 'line')}
              />
            )}
            {(['a', 'b'] as const).map((end) => (
              <g key={end}>
                <circle cx={pct(gate[end].x)} cy={pct(gate[end].y)} r={interactive ? 7 : 4} className="gate-handle" />
                {interactive && (
                  <circle
                    cx={pct(gate[end].x)}
                    cy={pct(gate[end].y)}
                    r={22}
                    className="gate-hit"
                    onPointerDown={(event) => startDrag(event, index, end)}
                  />
                )}
              </g>
            ))}
            <text x={pct(top.x)} y={pct(top.y)} dy={-14} className="gate-label">
              {labels?.[index] ?? index + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
