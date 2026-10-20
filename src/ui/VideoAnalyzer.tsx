import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { torsoPoint } from '../timing/torso.ts'
import { blobByteSource, demuxVideo, VideoFormatError, type DemuxedVideo } from '../video/demux.ts'
import { FrameSource } from '../video/frameSource.ts'
import { FrameViewer } from './FrameViewer.tsx'
import { PoseAnalysisPanel } from './PoseAnalysisPanel.tsx'
import { usePoseAnalysis } from './usePoseAnalysis.ts'
import { VideoInfo } from './VideoInfo.tsx'

type State =
  | { status: 'empty' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; fileName: string; message: string }
  | {
      status: 'ready'
      id: number
      file: File
      fileName: string
      video: DemuxedVideo
      /** null si el navegador no puede decodificar este vídeo. */
      frames: FrameSource | null
      decodeError: string | null
    }

function errorMessage(error: unknown): string {
  if (error instanceof VideoFormatError) return error.message
  const detail = error instanceof Error ? ` (${error.message})` : ''
  return `No se ha podido leer el vídeo${detail}.`
}

export function VideoAnalyzer() {
  const [state, setState] = useState<State>({ status: 'empty' })
  const loadId = useRef(0)

  // Libera el decodificador al cambiar de vídeo o salir de la pantalla.
  const frames = state.status === 'ready' ? state.frames : null
  useEffect(() => () => frames?.close(), [frames])

  async function load(file: File) {
    const id = ++loadId.current
    setState({ status: 'loading', fileName: file.name })
    try {
      // El vídeo se lee directamente del archivo local: nunca se sube a ningún sitio.
      const bytes = blobByteSource(file)
      const video = await demuxVideo(bytes)
      let frameSource: FrameSource | null = null
      let decodeError: string | null = null
      try {
        frameSource = await FrameSource.open(bytes, video)
      } catch (error) {
        decodeError = errorMessage(error)
      }
      if (id !== loadId.current) {
        frameSource?.close()
        return
      }
      setState({ status: 'ready', id, file, fileName: file.name, video, frames: frameSource, decodeError })
    } catch (error) {
      if (id !== loadId.current) return
      setState({ status: 'error', fileName: file.name, message: errorMessage(error) })
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Permite volver a elegir el mismo archivo.
    event.target.value = ''
    if (file) void load(file)
  }

  return (
    <>
      <section className="card">
        <h2>Vídeo</h2>
        <p className="note">
          Importa un vídeo de la galería o grábalo con la cámara. Se analiza en tu dispositivo: no
          se sube a ningún sitio.
        </p>
        <label className="button">
          {state.status === 'empty' ? 'Importar vídeo' : 'Importar otro vídeo'}
          <input type="file" accept="video/*" className="visually-hidden" onChange={onFileChange} />
        </label>
        {state.status === 'loading' && <p className="note">Leyendo {state.fileName}…</p>}
        {state.status === 'error' && (
          <p className="error">
            {state.fileName}: {state.message}
          </p>
        )}
      </section>

      {state.status === 'ready' && (
        <>
          <VideoInfo fileName={state.fileName} video={state.video} />
          {state.frames ? (
            <LoadedVideo key={state.id} file={state.file} video={state.video} frames={state.frames} />
          ) : (
            <section className="card">
              <h2>Frames</h2>
              <p className="error">{state.decodeError}</p>
            </section>
          )}
        </>
      )}
    </>
  )
}

interface LoadedVideoProps {
  file: File
  video: DemuxedVideo
  frames: FrameSource
}

/** Análisis de movimiento y visor de un vídeo ya cargado (uno por vídeo: se reinicia al cambiar). */
function LoadedVideo({ file, video, frames }: LoadedVideoProps) {
  const analysis = usePoseAnalysis(file, video.frames.length)
  // null: sin torso en ese frame; undefined: aún sin analizar.
  const torso = useMemo(
    () => Array.from(analysis.poses, (pose) => (pose ? (pose.torso ? torsoPoint(pose.torso) : null) : undefined)),
    [analysis.poses],
  )
  return (
    <>
      <PoseAnalysisPanel
        fileName={file.name}
        video={video}
        state={analysis.state}
        torso={torso}
        onStart={analysis.start}
        onCancel={analysis.cancel}
      />
      <FrameViewer source={frames} poses={analysis.poses} torso={torso} />
    </>
  )
}
