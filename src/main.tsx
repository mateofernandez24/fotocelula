import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { blockCrossOriginFetch } from './privacy/networkGuard.ts'

// Privacidad: ninguna petición sale de la app hacia terceros.
blockCrossOriginFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
