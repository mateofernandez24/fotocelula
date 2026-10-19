/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Commit corto que se muestra en el pie de la app, para saber qué versión
// tiene cargada el iPhone.
function shortCommit(): string {
  const sha = process.env.GITHUB_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'local'
  }
}

// https://vite.dev/config/
export default defineConfig({
  // En GitHub Actions, BASE_PATH viene de actions/configure-pages (p. ej. "/fotocelula").
  base: `${process.env.BASE_PATH ?? ''}/`,
  // Certificado HTTPS autofirmado: la cámara (getUserMedia) exige HTTPS fuera de localhost.
  plugins: [react(), basicSsl()],
  // host: true expone el servidor en la red local para abrirlo desde el iPhone.
  server: { host: true },
  preview: { host: true },
  define: {
    __APP_VERSION__: JSON.stringify(shortCommit()),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
