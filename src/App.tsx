import { useState, type ReactNode } from 'react'
import { Diagnostics } from './ui/Diagnostics.tsx'
import { EmptyState } from './ui/EmptyState.tsx'
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

  function show(next: View) {
    setView(next)
    window.scrollTo({ top: 0 })
  }

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
        {/* Medir y Resultado son dos vistas del mismo vídeo: se oculta en vez de desmontarse
            para no perder el vídeo cargado ni el análisis. */}
        <div hidden={view !== 'measure' && view !== 'result'}>
          <VideoAnalyzer
            view={view === 'result' ? 'result' : 'measure'}
            onShowResult={() => show('result')}
            onShowMeasure={() => show('measure')}
          />
        </div>
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
              onClick={() => show(id)}
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

export default App
