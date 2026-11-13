import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { computeCourse, type ManualPair } from '../timing/course.ts'
import type { Gate } from '../timing/geometry.ts'
import { extrapolationFactor, gateDistances, metersPerUnit, type ScaleReference } from '../timing/scale.ts'
import { torsoPoint, torsoTrack } from '../timing/torso.ts'
import { blobByteSource, demuxVideo, VideoFormatError, type DemuxedVideo } from '../video/demux.ts'
import { FrameSource } from '../video/frameSource.ts'
import { FrameViewer } from './FrameViewer.tsx'
import { formatMeters } from './format.ts'
import { GateLayer } from './GateLayer.tsx'
import { addGate, defaultGates, defaultReferenceBars, removeGate } from './gates.ts'
import { GatesPanel } from './GatesPanel.tsx'
import { Recorder } from './Recorder.tsx'
import { saveFile } from './saveFile.ts'
import { ReferencePanel } from './ReferencePanel.tsx'
import { PoseAnalysisPanel } from './PoseAnalysisPanel.tsx'
import { ResultsPanel } from './ResultsPanel.tsx'
import { clampStep, type StepId } from './steps.ts'
import { StepNav, Stepper } from './Stepper.tsx'
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
      /** Grabado desde la web (solo existe en la memoria de la página hasta que se guarda). */
      recorded: boolean
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
  const [recording, setRecording] = useState(false)
  // Paso de «Medir» y último paso al que se puede ir (lo decide el vídeo cargado).
  const [step, setStep] = useState<StepId>('video')
  const [reachable, setReachable] = useState<StepId>('video')
  // Grabación que aún no se ha guardado en el dispositivo: se perdería al cargar otro vídeo.
  const [unsaved, setUnsaved] = useState<File | null>(null)
  const loadId = useRef(0)

  // Libera el decodificador al cambiar de vídeo o salir de la pantalla.
  const frames = state.status === 'ready' ? state.frames : null
  useEffect(() => () => frames?.close(), [frames])

  // Al cerrar o recargar la página con una grabación sin guardar, el navegador pregunta antes.
  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [unsaved])

  /** true si no hay grabación sin guardar o el usuario acepta descartarla. */
  function confirmDiscard(): boolean {
    return (
      !unsaved ||
      window.confirm(`La grabación «${unsaved.name}» no se ha guardado y se perderá. ¿Quieres continuar?`)
    )
  }

  async function load(file: File, recorded = false) {
    const id = ++loadId.current
    setUnsaved(recorded ? file : null)
    setState({ status: 'loading', fileName: file.name })
    setStep('video')
    setReachable('video')
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
      setState({ status: 'ready', id, file, fileName: file.name, recorded, video, frames: frameSource, decodeError })
    } catch (error) {
      if (id !== loadId.current) return
      setState({ status: 'error', fileName: file.name, message: errorMessage(error) })
    }
  }

  const ready = state.status === 'ready' && state.frames !== null
  const current = ready ? clampStep(step, reachable) : 'video'

  function goTo(next: StepId) {
    setStep(next)
    window.scrollTo({ top: 0 })
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Permite volver a elegir el mismo archivo.
    event.target.value = ''
    if (file) void load(file)
  }

  return (
    <>
      <Stepper current={current} reachable={ready ? reachable : 'video'} disabled={recording} onSelect={goTo} />

      {current === 'video' && (
        <section className="card">
          <h2>Vídeo</h2>
          <p className="note">
            Importa un vídeo de la galería o grábalo con la cámara. Se analiza en tu dispositivo: no
            se sube a ningún sitio.
          </p>
          <div className="buttons">
            <label
              className={`button${recording ? ' disabled' : ''}`}
              onClick={(event) => {
                // El clic en la etiqueta se reenvía al input y vuelve a llegar aquí: solo se pregunta una vez.
                if (event.target !== event.currentTarget) return
                if (!confirmDiscard()) event.preventDefault()
              }}
            >
              {state.status === 'empty' ? 'Importar vídeo' : 'Importar otro vídeo'}
              <input type="file" accept="video/*" className="visually-hidden" onChange={onFileChange} />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => confirmDiscard() && setRecording(true)}
              disabled={recording}
            >
              Grabar vídeo
            </button>
          </div>
          {state.status === 'loading' && <p className="note">Leyendo {state.fileName}…</p>}
          {state.status === 'error' && (
            <p className="error">
              {state.fileName}: {state.message}
            </p>
          )}
        </section>
      )}

      {recording && (
        <Recorder
          onRecorded={(file) => {
            setRecording(false)
            void load(file, true)
          }}
          onClose={() => setRecording(false)}
        />
      )}

      {/* Mientras se graba, el vídeo anterior se oculta pero no se pierde (por si se cancela). */}
      {state.status === 'ready' && (
        <div hidden={recording}>
          {current === 'video' && (
            <VideoInfo fileName={state.fileName} video={state.video}>
              {state.recorded && (
                <RecordingSave file={state.file} saved={unsaved !== state.file} onSaved={() => setUnsaved(null)} />
              )}
            </VideoInfo>
          )}
          {state.frames ? (
            <LoadedVideo
              key={state.id}
              file={state.file}
              video={state.video}
              frames={state.frames}
              step={current}
              reachable={reachable}
              onReachableChange={setReachable}
              onStepChange={goTo}
            />
          ) : (
            <section className="card">
              <h2>Frames</h2>
              <p className="error">{state.decodeError}</p>
            </section>
          )}
        </div>
      )}
    </>
  )
}

/** Guardar en el dispositivo un vídeo grabado desde la web. */
function RecordingSave({ file, saved, onSaved }: { file: File; saved: boolean; onSaved: () => void }) {
  async function save() {
    if ((await saveFile(file)) !== 'cancelled') onSaved()
  }

  return (
    <div className="recording-save">
      <p className="note">
        {saved
          ? 'Grabación guardada.'
          : 'Esta grabación solo está en la página: si no la guardas, se pierde al cerrarla o al cargar otro vídeo.'}{' '}
        En el iPhone, «Guardar en Archivos» la conserva tal cual; para analizarla otra vez, impórtala desde
        Archivos (desde Fotos, iOS puede convertirla a 30 fps).
      </p>
      <button type="button" className={saved ? 'secondary' : undefined} onClick={() => void save()}>
        Guardar vídeo
      </button>
    </div>
  )
}

interface LoadedVideoProps {
  file: File
  video: DemuxedVideo
  frames: FrameSource
  step: StepId
  reachable: StepId
  onReachableChange: (step: StepId) => void
  onStepChange: (step: StepId) => void
}

/** Análisis de movimiento y visor de un vídeo ya cargado (uno por vídeo: se reinicia al cambiar). */
function LoadedVideo({ file, video, frames, step, reachable, onReachableChange, onStepChange }: LoadedVideoProps) {
  const analysis = usePoseAnalysis(file, video.frames.length)
  // null: sin torso en ese frame; undefined: aún sin analizar.
  const torso = useMemo(
    () => Array.from(analysis.poses, (pose) => (pose ? (pose.torso ? torsoPoint(pose.torso) : null) : undefined)),
    [analysis.poses],
  )
  const [frameIndex, setFrameIndex] = useState(0)
  const [reference, setReference] = useState<ScaleReference>(() => ({
    bars: defaultReferenceBars(),
    distanceM: null,
  }))
  const [gates, setGates] = useState<Gate[]>(defaultGates)
  // Cruces marcados a mano, por índice de puerta.
  const [manual, setManual] = useState<ReadonlyMap<number, ManualPair>>(() => new Map())

  const aspect = video.displayWidth / video.displayHeight
  // La distancia entre puertas no se escribe: sale de la escala que da la referencia.
  const scale = useMemo(() => metersPerUnit(reference, aspect), [reference, aspect])
  const distances = useMemo(() => gateDistances(gates, scale, aspect), [gates, scale, aspect])
  const placingGates = step === 'gates' && scale !== null

  // Hasta dónde se puede avanzar: la referencia se puede colocar mientras se analiza el
  // movimiento; las puertas, cuando la referencia da una escala.
  const analysisStarted = analysis.state.status === 'running' || analysis.state.status === 'done'
  const canReach: StepId = !analysisStarted ? 'motion' : scale === null ? 'reference' : 'gates'
  useEffect(() => onReachableChange(canReach), [canReach, onReachableChange])
  const blockedReason =
    step === 'motion'
      ? 'Analiza el movimiento para continuar.'
      : step === 'reference'
        ? reference.distanceM === null
          ? 'Escribe la distancia de la referencia para continuar.'
          : 'Separa las barras de la referencia para continuar.'
        : null

  // Los cruces se calculan con el análisis completo (no a medias) y se recalculan al mover
  // las puertas o la referencia, o al marcar cruces a mano.
  const done = analysis.state.status === 'done' ? analysis.state.analysis : null
  const track = useMemo(() => (done ? torsoTrack(done.frames) : null), [done])
  const course = useMemo(
    () => (track && placingGates ? computeCourse(track, gates, distances, manual, { aspect }) : null),
    [track, placingGates, gates, distances, manual, aspect],
  )

  // Aviso en el visor si en este frame (o justo después) se cruza una puerta.
  const frameNote =
    course?.gates
      .map(({ crossing }, i) =>
        crossing && (frameIndex === crossing.beforeFrame || frameIndex === crossing.afterFrame)
          ? `Puerta ${i + 1}: el torso la cruza entre los frames ${crossing.beforeFrame + 1} y ${crossing.afterFrame + 1}.`
          : null,
      )
      .filter(Boolean)
      .join(' ') || null

  // Al añadir o quitar puertas cambian los índices: los cruces manuales dejan de valer.
  function changeGateCount(next: Gate[]) {
    setGates(next)
    setManual(new Map())
  }

  function moveReferenceBars(bars: Gate[]) {
    setReference((r) => ({ ...r, bars: [bars[0] ?? r.bars[0], bars[1] ?? r.bars[1]] }))
  }

  const overlay = (
    <>
      {(step === 'reference' || placingGates) && (
        <GateLayer
          label="Referencia"
          variant="reference"
          gates={reference.bars}
          labels={['A', 'B']}
          spanLabels={[reference.distanceM === null ? '? m' : formatMeters(reference.distanceM)]}
          onChange={placingGates ? undefined : moveReferenceBars}
        />
      )}
      {placingGates && (
        <GateLayer
          label="Puertas"
          gates={gates}
          spanLabels={distances.map((d) => (d === null ? null : formatMeters(d)))}
          onChange={setGates}
        />
      )}
    </>
  )

  function setManualPair(gateIndex: number, pair: ManualPair | null) {
    setManual((previous) => {
      const next = new Map(previous)
      if (pair) next.set(gateIndex, pair)
      else next.delete(gateIndex)
      return next
    })
  }

  return (
    <>
      <FrameViewer
        source={frames}
        index={frameIndex}
        onIndexChange={setFrameIndex}
        frameNote={frameNote}
        poses={analysis.poses}
        torso={torso}
        overlay={overlay}
      />
      {step === 'motion' && (
        <PoseAnalysisPanel
          fileName={file.name}
          video={video}
          state={analysis.state}
          torso={torso}
          onStart={analysis.start}
          onCancel={analysis.cancel}
        />
      )}
      {step === 'reference' && (
        <ReferencePanel
          reference={reference}
          scale={scale}
          onDistanceChange={(distanceM) => setReference((r) => ({ ...r, distanceM }))}
        />
      )}
      {placingGates && (
        <GatesPanel
          gates={gates}
          distances={distances}
          extrapolation={extrapolationFactor(distances, reference)}
          onAdd={() => changeGateCount(addGate(gates))}
          onRemove={(index) => changeGateCount(removeGate(gates, index))}
          onUseReference={() => changeGateCount(reference.bars.map((bar) => ({ a: { ...bar.a }, b: { ...bar.b } })))}
        />
      )}
      {placingGates && (
        <ResultsPanel
          course={course}
          gates={gates}
          distances={distances}
          fps={video.timing.fps}
          currentFrame={frameIndex}
          onGoToFrame={(frame) => {
            setFrameIndex(frame)
            document.querySelector('.viewer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
          onMarkHere={(gateIndex) => setManualPair(gateIndex, { beforeFrame: frameIndex - 1, afterFrame: frameIndex })}
          onAutomatic={(gateIndex) => setManualPair(gateIndex, null)}
        />
      )}
      <StepNav current={step} reachable={reachable} onSelect={onStepChange} blockedReason={blockedReason} />
    </>
  )
}
