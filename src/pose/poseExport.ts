// Archivo JSON con los datos de pose de un vídeo. Sirve para guardarlo en test-data/ y
// probar src/timing con Vitest sin volver a procesar el vídeo.
import type { DemuxedVideo } from '../video/demux.ts'
import type { PoseAnalysis } from './analyzePose.ts'

export interface PoseDataFile {
  format: 'fotocelula-pose'
  version: 1
  video: {
    fileName: string
    frameCount: number
    fps: number
    rotation: number
    /** Tamaño ya girado, como se ve el vídeo. */
    displayWidth: number
    displayHeight: number
    device: string | null
  }
  analysis: PoseAnalysis
}

export function buildPoseDataFile(fileName: string, video: DemuxedVideo, analysis: PoseAnalysis): PoseDataFile {
  const device = [video.device.make, video.device.model].filter(Boolean).join(' ')
  return {
    format: 'fotocelula-pose',
    version: 1,
    video: {
      fileName,
      frameCount: video.frames.length,
      fps: Math.round(video.timing.fps * 1000) / 1000,
      rotation: video.rotation,
      displayWidth: video.displayWidth,
      displayHeight: video.displayHeight,
      device: device || null,
    },
    analysis,
  }
}

/** "IMG_0589.MOV" → "IMG_0589.pose.json" */
export function poseFileName(videoFileName: string): string {
  return `${videoFileName.replace(/\.[^.]+$/, '')}.pose.json`
}
