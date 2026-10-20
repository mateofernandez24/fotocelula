import type { Rotation } from '../video/frameTable.ts'

/**
 * Dibuja un frame decodificado ocupando todo el canvas y aplicando el giro de la pista.
 * El canvas debe tener ya la proporción del vídeo girado (displayWidth × displayHeight).
 */
export function drawRotatedFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: CanvasImageSource,
  rotation: Rotation,
): void {
  const { width, height } = ctx.canvas
  const sideways = rotation === 90 || rotation === 270
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  // Tras girar 90°/270°, el ancho del frame ocupa el alto del canvas.
  const drawWidth = sideways ? height : width
  const drawHeight = sideways ? width : height
  ctx.drawImage(frame, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()
}
