import { useState, type ReactNode } from 'react'
import { Diagnostics } from './ui/Diagnostics.tsx'
import { FlagIcon, HistoryIcon, LogoIcon, SettingsIcon, StopwatchIcon } from './ui/icons.tsx'
import { VideoAnalyzer } from './ui/VideoAnalyzer.tsx'

type View = 'measure' | 'result' | 'history' | 'settings'

const VIEWS: { id: View; label: string; icon: ReactNode }[] = [
  { id: 'measure', label: 'Medir', icon: <StopwatchIcon /> },
  { id: 'result', label: 'Resultado', icon: <FlagIcon /> },
  { id: 'history', label: 'Historial', icon: <HistoryIcon /> },
  { id: 'settings', label: 'Ajustes', icon: <SettingsIcon /> },
]

function App() {
  const [view, setView] = useState<View>('measure')

  return (
    <>
      <main>
        <header className="app-header">
          <span className="app-logo">
            <LogoIcon />
          </span>
          <div>
            <h1>Fotocélula</h1>
            <p>Tiempo y velocidad con la cámara del móvil</p>
          </div>
        </header>
        {/* Medir se oculta en vez de desmontarse para no perder el vídeo cargado. */}
        <div hidden={view !== 'measure'}>
          <VideoAnalyzer />
        </div>
        {view === 'result' && (
          <EmptyState icon={<FlagIcon />} title="Resultado">
            Aquí verás la repetición con la velocidad en cada puerta. De momento, el resultado aparece en el
            último paso de <strong>Medir</strong> (Puertas).
          </EmptyState>
        )}
        {view === 'history' && (
          <EmptyState icon={<HistoryIcon />} title="Historial">
            Aún no hay mediciones guardadas. Pronto podrás guardar cada medición y compararlas.
          </EmptyState>
        )}
        {view === 'settings' && (
          <>
            <Diagnostics />
            <footer>Versión {__APP_VERSION__}</footer>
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="Secciones">
        <div className="tabbar-inner">
          {VIEWS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => {
                setView(id)
                window.scrollTo({ top: 0 })
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card empty-state">
      {icon}
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  )
}

export default App
