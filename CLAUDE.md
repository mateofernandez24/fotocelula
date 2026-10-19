# CLAUDE.md — Fotocélula virtual (web app / PWA)

## Qué es
Web app (PWA) que mide el tiempo y la velocidad de un deportista (corredor, jugador, etc.) entre dos o más "puertas virtuales" marcadas sobre un vídeo, sustituyendo a una fotocélula. El vídeo se graba desde la propia web o se importa desde la galería.

Cálculo base: el usuario marca dos líneas en la imagen e introduce la distancia real entre ellas (metros). La app detecta el instante en que el torso del deportista cruza cada línea. Velocidad = distancia / (t2 - t1).

## Restricción principal: coste cero
- Sin cuentas de pago, sin App Store, sin servidores de pago.
- Todo el procesamiento se hace **en el dispositivo del usuario** (navegador). No hay backend.
- Hosting estático gratuito (GitHub Pages o Cloudflare Pages), con HTTPS (necesario para la cámara).

## Entorno
- Desarrollo en **Windows**. Dispositivo principal de pruebas: **iPhone con Safari**. Debe funcionar también en Android/Chrome y escritorio.
- Pruebas en el iPhone durante el desarrollo: servidor de Vite accesible por la red local con HTTPS (`@vitejs/plugin-basic-ssl`), o despliegue de previsualización.
- Safari en iOS es el navegador objetivo más restrictivo: comprobar siempre la compatibilidad de cualquier API con Safari iOS antes de usarla.

## Stack
- Vite + TypeScript estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). UI con **React** (decidido en la fase 1). Lint con oxlint.
- Identificadores del código en inglés; comentarios y textos de la interfaz en español.
- Comandos: `npm run dev` (HTTPS en la red local), `npm test`, `npm run lint`, `npm run build`.
- Despliegue: `.github/workflows/deploy.yml` publica en GitHub Pages en cada push a `main`. La ruta base la da `BASE_PATH` (salida de `actions/configure-pages`); en local es `/`.
- Estimación de pose: **MediaPipe Tasks Vision (Pose Landmarker)**, ejecutándose en el navegador. Modelo servido como fichero estático propio.
- Lectura de vídeo frame a frame:
  - Preferente: **WebCodecs (VideoDecoder) + mp4box.js** para obtener cada frame con su timestamp real.
  - Alternativa: `requestVideoFrameCallback` (usar `metadata.mediaTime`).
- Grabación: `getUserMedia` + `MediaRecorder`, pidiendo la mayor tasa de fps disponible (normalmente 30–60 fps en iOS).
- Almacenamiento local: IndexedDB para historial y sesiones.
- PWA: manifest + service worker para instalar en la pantalla de inicio y funcionar sin conexión.

## Arquitectura
- `src/video/`: decodificación del vídeo; produce una lista de frames con **timestamp real** (segundos).
- `src/pose/`: ejecuta Pose Landmarker sobre cada frame y devuelve hombros y caderas por frame. Procesar en un Web Worker si es viable para no bloquear la interfaz.
- `src/timing/` (TypeScript puro, sin dependencias del navegador):
  - Punto del torso (media de hombros y caderas).
  - Detección del cruce de cada puerta con **interpolación subfotograma** entre los dos frames que la rodean.
  - Tiempos, parciales y velocidad.
  - **Cubierto por tests unitarios (Vitest)**.
- `src/ui/`: importar/grabar vídeo, marcar puertas sobre el vídeo, introducir distancia, resultados, ajuste manual, historial.

## Reglas
- **Usar siempre el timestamp real de cada frame. Nunca asumir fps constante.**
- El cruce se determina por el **torso**, no por manos, pies ni cabeza.
- Diseñar para **N puertas** (parciales), aunque el MVP use dos.
- El usuario debe poder **ajustar manualmente** el frame de cruce detectado (avanzar/retroceder frame a frame).
- Mostrar al usuario la tasa de fps real del vídeo y una estimación del margen de error.
- Vídeos a cámara lenta del iPhone: pueden llegar al navegador ya re-temporizados (ralentizados). Detectarlo si es posible y advertir al usuario; recomendar grabar en vídeo normal a 60 fps.
- Sin peticiones a servicios externos con los vídeos del usuario: la privacidad es parte del producto.
- Textos de la interfaz en español. Tareas pequeñas; plan antes de cualquier funcionalidad grande.

## Datos de prueba
- `test-data/`: vídeos de referencia y un JSON por vídeo con los tiempos de cruce contados a mano.
- Guardar como JSON las salidas de pose de esos vídeos para probar `src/timing/` con Vitest sin procesar el vídeo cada vez.

## Hoja de ruta
1. Proyecto Vite + TypeScript, despliegue en GitHub Pages y prueba en el iPhone por HTTPS.
2. Importar vídeo y extraer frames con timestamps reales; mostrar fps detectados.
3. Pose Landmarker por frame; dibujar el punto del torso sobre el vídeo.
4. Marcar dos puertas + distancia; cálculo en `src/timing/`; resultados y ajuste manual.
5. Grabación desde la web.
6. PWA instalable, historial, parciales, salida por sonido.
