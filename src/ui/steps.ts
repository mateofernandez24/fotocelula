// Pasos de «Medir» y a cuáles se puede ir.

export type StepId = 'video' | 'motion' | 'reference' | 'gates'

export const STEPS: readonly { id: StepId; label: string }[] = [
  { id: 'video', label: 'Vídeo' },
  { id: 'motion', label: 'Movimiento' },
  { id: 'reference', label: 'Referencia' },
  { id: 'gates', label: 'Puertas' },
]

export function stepIndex(step: StepId): number {
  return STEPS.findIndex((s) => s.id === step)
}

/** El paso `step` si se puede ir a él; si no, el último al que se puede ir. */
export function clampStep(step: StepId, reachable: StepId): StepId {
  return stepIndex(step) <= stepIndex(reachable) ? step : reachable
}
