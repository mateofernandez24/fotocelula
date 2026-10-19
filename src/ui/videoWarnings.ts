import type { DemuxedVideo, SlowMotionHint } from '../video/demux.ts'
import { formatFps, formatInteger } from './format.ts'

/** Por debajo de estos fps el margen de error empieza a ser grande para medir sprints. */
const MIN_RECOMMENDED_FPS = 50
/** Lado mayor a partir del cual el vídeo es más que Full HD. */
const FULL_HD = 1920

const SLOW_MOTION_REASONS: Record<SlowMotionHint, string> = {
  'high-frame-rate': 'está grabado a más de 100 fps',
  'playback-intent': 'el iPhone lo ha marcado como cámara lenta',
  'edit-rate': 'cambia de velocidad durante la reproducción',
}

export interface VideoWarning {
  severity: 'error' | 'warning' | 'info'
  text: string
}

/** Avisos sobre el vídeo importado, de más a menos graves. */
export function videoWarnings(
  video: Pick<
    DemuxedVideo,
    'timing' | 'slowMotionHints' | 'displayWidth' | 'displayHeight' | 'multipleEditSegments'
  >,
): VideoWarning[] {
  const warnings: VideoWarning[] = []
  const { timing } = video

  if (video.slowMotionHints.length > 0) {
    const reasons = video.slowMotionHints.map((hint) => SLOW_MOTION_REASONS[hint]).join(' y ')
    warnings.push({
      severity: 'error',
      text:
        `Parece un vídeo a cámara lenta: ${reasons}. Los tiempos medidos pueden no ser reales. ` +
        'Graba en modo Vídeo normal a 60 fps.',
    })
  }
  if (video.multipleEditSegments) {
    warnings.push({
      severity: 'warning',
      text: 'El vídeo está editado en varios tramos; solo se usa el primero.',
    })
  }
  if (timing.fps < MIN_RECOMMENDED_FPS) {
    warnings.push({
      severity: 'warning',
      text: `Con ${formatFps(timing.fps)} el margen de error es mayor. Para medir con precisión graba a 60 fps.`,
    })
  }
  if (timing.droppedFrames > 0) {
    const n = timing.droppedFrames
    warnings.push({
      severity: 'warning',
      text:
        `${n === 1 ? 'Falta 1 frame' : `Faltan ${formatInteger(n)} frames`} en el vídeo. ` +
        'Si coincide con un cruce de puerta, ese tiempo será menos preciso.',
    })
  } else if (timing.isVariable) {
    warnings.push({
      severity: 'info',
      text:
        'Los frames no llegan a intervalos constantes (el iPhone baja los fps con poca luz). ' +
        'Los tiempos siguen siendo reales: se usa el instante exacto de cada frame.',
    })
  }
  if (Math.max(video.displayWidth, video.displayHeight) > FULL_HD) {
    warnings.push({
      severity: 'info',
      text: 'Vídeo de más resolución que Full HD: se procesa más despacio. Para esta app basta 1080p a 60 fps.',
    })
  }
  return warnings
}
