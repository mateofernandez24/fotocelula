// Dibujo de la repetición sobre cada frame: puertas, trayectoria del torso hasta ese
// instante, líneas del torso (hombros y caderas) y su punto. Coordenadas normalizadas (0–1)
// sobre la imagen derecha, que tiene la misma proporción que el canvas.
import type { Gate } from '../timing/geometry.ts'
import type { PoseFrame, TorsoPoint } from '../timing/torso.ts'

const NEON = '#2bff88'
const GATE = '#ffd60a'
const BODY = 'rgba(255, 255, 255, 0.92)'
const SHADOW = 'rgba(0, 0, 0, 0.75)'

export interface ReplayOverlayInput {
  /** Punto del torso de cada frame (null sin torso, undefined sin analizar). */
  torso: readonly (TorsoPoint | null | undefined)[]
  /** Pose del frame actual. */
  pose: PoseFrame | undefined
  /** Frame actual. */
  index: number
  gates: readonly Gate[]
  /** Puertas ya cruzadas en este instante (se dibujan en verde). */
  crossed: ReadonlySet<number>
  /** Puerta recién cruzada y cuánto brilla (1 justo al cruzarla, 0 ya apagada). */
  flash: { gateIndex: number; strength: number } | null
}

export function drawReplayOverlay(ctx: CanvasRenderingContext2D, input: ReplayOverlayInput): void {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  // Grosor proporcional al lado menor, para que se vea igual en vertical y en horizontal.
  const unit = Math.max(1, Math.min(width, height) / 150)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const at = (p: { x: number; y: number }) => [p.x * width, p.y * height] as const

  drawGates(ctx, input, unit, at)
  drawTrajectory(ctx, input, unit, at)
  drawBody(ctx, input, unit, at)
}

type ToCanvas = (p: { x: number; y: number }) => readonly [number, number]

function drawGates(ctx: CanvasRenderingContext2D, input: ReplayOverlayInput, unit: number, at: ToCanvas) {
  input.gates.forEach((gate, index) => {
    const crossed = input.crossed.has(index)
    const glow = input.flash?.gateIndex === index ? input.flash.strength : 0
    const color = crossed ? NEON : GATE
    ctx.save()
    ctx.shadowColor = glow > 0 ? color : SHADOW
    ctx.shadowBlur = glow > 0 ? unit * 12 * glow : unit * 1.5
    ctx.strokeStyle = color
    ctx.lineWidth = unit * (1.4 + 1.6 * glow)
    ctx.beginPath()
    ctx.moveTo(...at(gate.a))
    ctx.lineTo(...at(gate.b))
    ctx.stroke()
    ctx.restore()

    // Número de la puerta junto a su extremo de arriba.
    const top = gate.a.y <= gate.b.y ? gate.a : gate.b
    const [x, y] = at(top)
    ctx.save()
    ctx.font = `800 ${Math.round(unit * 9)}px -apple-system, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineWidth = unit * 1.6
    ctx.strokeStyle = SHADOW
    ctx.strokeText(String(index + 1), x, y - unit * 3)
    ctx.fillStyle = color
    ctx.fillText(String(index + 1), x, y - unit * 3)
    ctx.restore()
  })
}

/** Trayectoria del torso desde el principio hasta el frame actual. */
function drawTrajectory(ctx: CanvasRenderingContext2D, input: ReplayOverlayInput, unit: number, at: ToCanvas) {
  ctx.save()
  ctx.strokeStyle = NEON
  ctx.lineWidth = unit * 1.3
  ctx.shadowColor = SHADOW
  ctx.shadowBlur = unit
  ctx.beginPath()
  let drawing = false
  const last = Math.min(input.index, input.torso.length - 1)
  for (let i = 0; i <= last; i++) {
    const point = input.torso[i]
    // Los frames sin torso cortan la línea en vez de unir puntos lejanos.
    if (!point) {
      drawing = false
      continue
    }
    if (drawing) ctx.lineTo(...at(point))
    else ctx.moveTo(...at(point))
    drawing = true
  }
  ctx.stroke()
  ctx.restore()
}

/** Líneas del torso (hombros, caderas, costados y columna) y el punto del torso. */
function drawBody(ctx: CanvasRenderingContext2D, input: ReplayOverlayInput, unit: number, at: ToCanvas) {
  const body = input.pose?.torso
  const point = input.torso[input.index]
  ctx.save()
  ctx.shadowColor = SHADOW
  ctx.shadowBlur = unit * 1.5
  if (body) {
    const { leftShoulder, rightShoulder, leftHip, rightHip } = body
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    ctx.strokeStyle = BODY
    ctx.lineWidth = unit * 1.2
    ctx.beginPath()
    for (const [a, b] of [
      [leftShoulder, rightShoulder],
      [leftHip, rightHip],
      [leftShoulder, leftHip],
      [rightShoulder, rightHip],
      [mid(leftShoulder, rightShoulder), mid(leftHip, rightHip)],
    ] as const) {
      ctx.moveTo(...at(a))
      ctx.lineTo(...at(b))
    }
    ctx.stroke()
    // Articulaciones.
    ctx.fillStyle = BODY
    for (const joint of [leftShoulder, rightShoulder, leftHip, rightHip]) {
      ctx.beginPath()
      ctx.arc(...at(joint), unit * 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (point) {
    ctx.beginPath()
    ctx.arc(...at(point), unit * 3.2, 0, Math.PI * 2)
    ctx.fillStyle = NEON
    ctx.fill()
    ctx.lineWidth = unit
    ctx.strokeStyle = '#fff'
    ctx.stroke()
  }
  ctx.restore()
}
