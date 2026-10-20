// Copia los WASM de MediaPipe a public/ para servirlos desde nuestro dominio
// (sin CDN: privacidad y uso sin conexión). Se ejecuta antes de `dev` y `build`.
// La copia no se sube al repositorio: sale siempre de node_modules, así coincide
// con la versión instalada de @mediapipe/tasks-vision.
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe/wasm'

mkdirSync(to, { recursive: true })
let copied = 0
for (const name of readdirSync(from)) {
  const source = join(from, name)
  const target = join(to, name)
  let upToDate = false
  try {
    const a = statSync(source)
    const b = statSync(target)
    upToDate = a.size === b.size && a.mtimeMs <= b.mtimeMs
  } catch {
    // El destino no existe todavía.
  }
  if (!upToDate) {
    copyFileSync(source, target)
    copied++
  }
}
console.log(`MediaPipe WASM: ${copied} archivo(s) copiado(s) a ${to}`)
