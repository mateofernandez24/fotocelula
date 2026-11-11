import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Gate, Point } from '../timing/geometry.ts'

interface GateLayerProps {
  gates: readonly Gate[]
  onChange: (gates: Gate[]) => void
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
 * Puertas sobre el frame: cada una se mueve arrastrando sus extremos (para inclinarla o
 * alargarla) o la propia línea (para desplazarla entera). Coordenadas normalizadas.
 * Solo las puertas captan el dedo: en el resto de la imagen se puede desplazar la página.
 */
export function GateLayer({ gates, onChange }: GateLayerProps) {
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
    if (!point || !gate) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { index, part, pointerId: event.pointerId, start: point, original: gate }
  }

  function moveDrag(event: ReactPointerEvent) {
    const current = drag.current
    const point = current && current.pointerId === event.pointerId ? toPoint(event) : null
    if (!current || !point) return
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

  return (
    <svg
      ref={svgRef}
      className="gate-layer"
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label="Puertas"
    >
      {gates.map((gate, index) => {
        // La etiqueta va junto al extremo de arriba.
        const top = gate.a.y <= gate.b.y ? gate.a : gate.b
        return (
          <g key={index} className="gate">
            <line x1={pct(gate.a.x)} y1={pct(gate.a.y)} x2={pct(gate.b.x)} y2={pct(gate.b.y)} className="gate-line" />
            {/* Zona ancha e invisible para coger la línea con el dedo. */}
            <line
              x1={pct(gate.a.x)}
              y1={pct(gate.a.y)}
              x2={pct(gate.b.x)}
              y2={pct(gate.b.y)}
              className="gate-hit"
              onPointerDown={(event) => startDrag(event, index, 'line')}
            />
            {(['a', 'b'] as const).map((end) => (
              <g key={end}>
                <circle cx={pct(gate[end].x)} cy={pct(gate[end].y)} r={7} className="gate-handle" />
                <circle
                  cx={pct(gate[end].x)}
                  cy={pct(gate[end].y)}
                  r={22}
                  className="gate-hit"
                  onPointerDown={(event) => startDrag(event, index, end)}
                />
              </g>
            ))}
            <text x={pct(top.x)} y={pct(top.y)} dy={-14} className="gate-label">
              {index + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
