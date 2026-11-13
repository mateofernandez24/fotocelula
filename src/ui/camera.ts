// Cámara y grabación: lo que comparten la pantalla de grabación y la prueba de Diagnóstico.
import { useEffect, useState, type RefObject } from 'react'

/** Cámara trasera a la mayor tasa de fps posible (60 en el iPhone) y en 1080p. */
export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'environment',
      frameRate: { ideal: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  })
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

export function describeCameraError(error: unknown): string {
  if (!window.isSecureContext) {
    return 'La cámara solo funciona en una conexión segura (HTTPS).'
  }
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'Permiso de cámara denegado. Actívalo en los ajustes del navegador y vuelve a intentarlo.'
      case 'NotFoundError':
        return 'No se ha encontrado ninguna cámara.'
      case 'NotReadableError':
        return 'La cámara está en uso por otra aplicación.'
      default:
        return `${error.name}: ${error.message}`
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/** Formatos de grabación por orden de preferencia: la app lee MP4/MOV; WebM, como último recurso. */
const RECORDER_MIME_TYPES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
]

/** Bitrate alto para no perder detalle (el deportista puede verse pequeño). */
export const RECORDER_BITS_PER_SECOND = 16_000_000

/**
 * Formato que usará MediaRecorder: '' si el navegador no admite ninguno de la lista (usará
 * el suyo por defecto) y null si no hay MediaRecorder.
 */
export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export function createRecorder(stream: MediaStream, mimeType: string): MediaRecorder {
  return new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: RECORDER_BITS_PER_SECOND,
  })
}

/** Extensión del archivo según el formato que generó MediaRecorder. */
export function recordingExtension(mimeType: string): 'mp4' | 'webm' {
  return mimeType.includes('webm') ? 'webm' : 'mp4'
}

/**
 * Muestra el stream en el <video> y apaga la cámara al cambiar de stream o desmontar.
 * Safari iOS no siempre respeta autoPlay con srcObject: hay que llamar a play().
 * `onError` debe ser estable (p. ej. un setState), o la cámara se reiniciaría.
 */
export function useStreamPreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  onError: (message: string) => void,
): void {
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    // React no refleja `muted` como atributo, así que se fija aquí también.
    video.muted = true
    video.play().catch((err: unknown) => {
      // AbortError: se detuvo la cámara antes de empezar a reproducir.
      if (err instanceof DOMException && err.name === 'AbortError') return
      onError(`No se pudo mostrar la cámara: ${err instanceof Error ? err.message : String(err)}`)
    })
    return () => {
      video.srcObject = null
      stopStream(stream)
    }
  }, [videoRef, stream, onError])
}

/** fps que llegan realmente a la vista previa, medidos en ventanas de ~1 s. */
export function useMeasuredFps(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
): number | undefined {
  const [fps, setFps] = useState<number | undefined>(undefined)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream || !('requestVideoFrameCallback' in video)) return
    let handle = 0
    let windowStart: { time: number; frames: number } | null = null
    const onFrame = (now: number, metadata: VideoFrameCallbackMetadata) => {
      if (windowStart === null) {
        windowStart = { time: now, frames: metadata.presentedFrames }
      } else if (now - windowStart.time >= 1000) {
        const frames = metadata.presentedFrames - windowStart.frames
        setFps((frames * 1000) / (now - windowStart.time))
        windowStart = { time: now, frames: metadata.presentedFrames }
      }
      handle = video.requestVideoFrameCallback(onFrame)
    }
    handle = video.requestVideoFrameCallback(onFrame)
    return () => {
      video.cancelVideoFrameCallback(handle)
      setFps(undefined)
    }
  }, [videoRef, stream])
  return fps
}
