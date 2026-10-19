import { Diagnostics } from './ui/Diagnostics.tsx'

function App() {
  return (
    <main>
      <header>
        <h1>Fotocélula virtual</h1>
        <p className="subtitle">Diagnóstico del dispositivo</p>
      </header>
      <Diagnostics />
      <footer>Versión {__APP_VERSION__}</footer>
    </main>
  )
}

export default App
