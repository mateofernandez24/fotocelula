import { useState } from 'react'
import { Diagnostics } from './ui/Diagnostics.tsx'
import { VideoAnalyzer } from './ui/VideoAnalyzer.tsx'

type View = 'video' | 'diagnostics'

const VIEWS: { id: View; label: string }[] = [
  { id: 'video', label: 'Vídeo' },
  { id: 'diagnostics', label: 'Diagnóstico' },
]

function App() {
  const [view, setView] = useState<View>('video')

  return (
    <main>
      <header>
        <h1>Fotocélula virtual</h1>
        <nav className="tabs" aria-label="Secciones">
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      {/* El analizador se oculta en vez de desmontarse para no perder el vídeo cargado. */}
      <div hidden={view !== 'video'}>
        <VideoAnalyzer />
      </div>
      {view === 'diagnostics' && <Diagnostics />}
      <footer>Versión {__APP_VERSION__}</footer>
    </main>
  )
}

export default App
