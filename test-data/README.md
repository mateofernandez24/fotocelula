# Datos de prueba

Vídeos de referencia grabados con el iPhone y, por cada vídeo, un JSON con los tiempos de cruce contados a mano.

- Los **vídeos** (`.mov`, `.mp4`, `.m4v`, `.webm`) **no se suben a GitHub** (ver `.gitignore`): el repositorio es público.
- Los **JSON** sí se suben: tiempos de cruce contados a mano y salidas de pose guardadas para los tests de `src/timing/`.

## Archivos JSON

- `<vídeo>.pose.json` (`format: "fotocelula-pose"`): hombros y caderas de cada frame, generado con el análisis de la app (botón *Descargar datos (JSON)*). Tipo: `PoseDataFile` en `src/pose/poseExport.ts`.
- `<vídeo>.reference.json` (`format: "fotocelula-reference"`): la "verdad" para los tests de cruce.
  - `distanceM`: distancia real entre las puertas.
  - `direction`: `right-to-left` o `left-to-right`.
  - `gates`: cada puerta como un segmento `a`–`b` en coordenadas normalizadas (0–1) de la imagen derecha, en el orden en que se cruzan.
  - `crossings`: para cada puerta, los dos frames entre los que el torso la cruza, **con índices desde 0** (el visor de la app numera desde 1).
  - `notes`: cómo se obtuvo y con qué tolerancia usarla.

| Vídeo | fps | Distancia | Cruces (índices) | Notas |
| --- | --- | --- | --- | --- |
| `IMG_E0936` | 30 | 2,00 m | 36→37, 107→108 | Puertas en los bordes de la imagen; referencia aproximada (±1 frame). |
| `caminar-cinta-2m` | 30 | — | — | La cinta no se ve: solo sirve como datos de pose. |

## Cómo grabar un vídeo de referencia

- Móvil quieto, perpendicular al recorrido y a la altura de la cintura; 1080p a 60 fps.
- Marcas visibles en el suelo **en el plano por el que se camina o corre** (no en el fondo), a una distancia medida.
- Que las marcas queden en la parte central de la imagen (no en los bordes) y que el cuerpo se vea entero antes y después de cada marca.

## Nombres

Usa nombres que describan cómo se grabó el vídeo, por ejemplo:

- `pared-60fps-sdr.mov`
- `pared-60fps-hdr.mov`
- `pared-30fps.mov`
- `pared-camara-lenta.mov`

## Pasar vídeos del iPhone al PC sin modificarlos

- Por cable USB, con *Ajustes → Fotos → Transferir a Mac o PC → Conservar originales* activado en el iPhone.
- O por iCloud.com o Google Drive.
- No por WhatsApp ni Telegram: recomprimen el vídeo y cambian los fps.
