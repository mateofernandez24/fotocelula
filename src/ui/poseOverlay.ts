import type { PoseFrame, TorsoPoint } from '../timing/torso.ts'

const TRAJECTORY_COLOR = 'rgba(60, 207, 149, 0.9)'
const BODY_COLOR = 'rgba(255, 255, 255, 0.85)'
const TORSO_COLOR = '#ff4d4d'

/**
 * Dibuja sobre el frame: la trayectoria del torso en todo el vídeo, los hombros y caderas
 * del frame actual y su punto del torso. Las coordenadas son normalizadas (0–1) sobre la
 * imagen derecha, que tiene la misma proporción que el canvas.
 */
export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  torso: readonly (TorsoPoint | null | undefined)[],
  pose: PoseFrame | undefined,
  index: number,
  showTrajectory: boolean,
): void {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  // Grosor proporcional al canvas, para que se vea igual en cualquier resolución.
  const unit = Math.max(1, width / 240)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (showTrajectory) {
    ctx.strokeStyle = TRAJECTORY_COLOR
    ctx.lineWidth = unit * 1.5
    ctx.beginPath()
    let drawing = false
    for (let i = 0; i < torso.length; i++) {
      const point = torso[i]
      // Los frames sin torso cortan la línea en vez de unir puntos lejanos.
      if (!point) {
        drawing = false
        continue
      }
      const x = point.x * width
      const y = point.y * height
      if (drawing) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
      drawing = true
    }
    ctx.stroke()
  }

  const body = pose?.torso
  if (body) {
    const at = (p: { x: number; y: number }) => [p.x * width, p.y * height] as const
    ctx.strokeStyle = BODY_COLOR
    ctx.lineWidth = unit
    ctx.beginPath()
    for (const [a, b] of [
      [body.leftShoulder, body.rightShoulder],
      [body.leftHip, body.rightHip],
      [body.leftShoulder, body.leftHip],
      [body.rightShoulder, body.rightHip],
    ] as const) {
      ctx.moveTo(...at(a))
      ctx.lineTo(...at(b))
    }
    ctx.stroke()
  }

  const current = torso[index]
  if (current) {
    ctx.beginPath()
    ctx.arc(current.x * width, current.y * height, unit * 4, 0, Math.PI * 2)
    ctx.lineWidth = unit * 1.5
    ctx.strokeStyle = '#fff'
    // Relleno si se ven los dos lados; hueco si sale de un solo lado (menos preciso).
    if (current.source === 'both') {
      ctx.fillStyle = TORSO_COLOR
      ctx.fill()
    } else {
      ctx.strokeStyle = TORSO_COLOR
    }
    ctx.stroke()
  }
}
