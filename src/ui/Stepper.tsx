// Pasos de «Medir»: indicador de progreso arriba y botones Atrás / Siguiente abajo.
import { STEPS, stepIndex, type StepId } from './steps.ts'

interface StepperProps {
  current: StepId
  /** Último paso al que se puede ir (los anteriores también). */
  reachable: StepId
  disabled?: boolean
  onSelect: (step: StepId) => void
}

export function Stepper({ current, reachable, disabled = false, onSelect }: StepperProps) {
  const currentIndex = stepIndex(current)
  const reachableIndex = stepIndex(reachable)
  return (
    <nav className="stepper-bar" aria-label="Pasos">
      <ol>
        {STEPS.map(({ id, label }, index) => {
          const state = index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'todo'
          return (
            <li key={id} className={`step ${state}`}>
              <button
                type="button"
                disabled={disabled || index > reachableIndex}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => onSelect(id)}
              >
                <span className="step-number" aria-hidden="true">
                  {state === 'done' ? '✓' : index + 1}
                </span>
                <span className="step-label">{label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface StepNavProps {
  current: StepId
  reachable: StepId
  onSelect: (step: StepId) => void
  /** Por qué no se puede seguir todavía (se muestra si «Siguiente» está desactivado). */
  blockedReason?: string | null
  /** Botón del último paso (p. ej. «Ver resultado»). */
  finish?: { label: string; disabled: boolean; onClick: () => void } | undefined
}

/** Atrás / Siguiente, al final del paso. */
export function StepNav({ current, reachable, onSelect, blockedReason = null, finish }: StepNavProps) {
  const index = stepIndex(current)
  const previous = STEPS[index - 1]
  const next = STEPS[index + 1]
  const canGoNext = next !== undefined && stepIndex(next.id) <= stepIndex(reachable)
  return (
    <div className="step-nav">
      {((next && !canGoNext) || (!next && finish?.disabled)) && blockedReason && (
        <p className="step-nav-hint">{blockedReason}</p>
      )}
      <div className="step-nav-buttons">
        <button type="button" className="secondary" disabled={!previous} onClick={() => previous && onSelect(previous.id)}>
          Atrás
        </button>
        {next && (
          <button type="button" disabled={!canGoNext} onClick={() => onSelect(next.id)}>
            Siguiente: {next.label}
          </button>
        )}
        {!next && finish && (
          <button type="button" disabled={finish.disabled} onClick={finish.onClick}>
            {finish.label}
          </button>
        )}
      </div>
    </div>
  )
}
