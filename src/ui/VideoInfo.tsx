import type { DemuxedVideo } from '../video/demux.ts'
import { codecLabel } from '../video/frameSource.ts'
import { formatFps, formatInteger, formatMs, formatSeconds } from './format.ts'
import { videoWarnings } from './videoWarnings.ts'

interface VideoInfoProps {
  fileName: string
  video: DemuxedVideo
}

export function VideoInfo({ fileName, video }: VideoInfoProps) {
  const { timing, device } = video
  const warnings = videoWarnings(video)
  const nominal = timing.nominalFps === null ? '' : ` (≈ ${formatInteger(Math.round(timing.nominalFps))})`
  const deviceName = [device.make, device.model].filter(Boolean).join(' ')

  return (
    <section className="card">
      <h2>{fileName}</h2>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((warning) => (
            <li key={warning.text} className={warning.severity}>
              {warning.text}
            </li>
          ))}
        </ul>
      )}
      <dl className="stats">
        <dt>fps detectados</dt>
        <dd>
          {formatFps(timing.fps)}
          {nominal}
        </dd>
        <dt>Margen de error por puerta</dt>
        <dd>± {formatMs(timing.gateErrorS)}</dd>
        <dt>Intervalo entre frames</dt>
        <dd>
          {timing.minIntervalS === timing.maxIntervalS
            ? formatMs(timing.minIntervalS)
            : `${formatMs(timing.minIntervalS)} – ${formatMs(timing.maxIntervalS)}`}
        </dd>
        <dt>Frames</dt>
        <dd>{formatInteger(timing.frameCount)}</dd>
        <dt>Duración</dt>
        <dd>{formatSeconds(timing.spanS + timing.medianIntervalS, 2)}</dd>
        <dt>Resolución</dt>
        <dd>
          {video.displayWidth} × {video.displayHeight}
        </dd>
        <dt>Formato</dt>
        <dd>{codecLabel(video.codec)}</dd>
        {deviceName && (
          <>
            <dt>Grabado con</dt>
            <dd>{deviceName}</dd>
          </>
        )}
      </dl>
      <p className="note">
        El margen es de medio frame en cada puerta; entre dos puertas puede llegar a ±{' '}
        {formatMs(timing.gateErrorS * 2)}. Al detectar el cruce se reducirá interpolando entre
        frames.
      </p>
    </section>
  )
}
