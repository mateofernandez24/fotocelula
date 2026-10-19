# Fotocélula virtual

Web app (PWA) que mide tiempo y velocidad de un deportista entre puertas virtuales marcadas sobre un vídeo. Todo se procesa en el dispositivo; los vídeos nunca salen del navegador.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm install` | Instala las dependencias (una vez, o tras cambiar `package.json`). |
| `npm run dev` | Servidor de desarrollo con HTTPS, accesible desde la red local. |
| `npm test` | Ejecuta los tests (Vitest). `npm run test:watch` para modo continuo. |
| `npm run lint` | Revisa el código con oxlint. |
| `npm run build` | Compila la versión de producción en `dist/`. |

## Probar en el iPhone

1. Conecta el PC y el iPhone a la misma Wi‑Fi (o el PC al punto de acceso personal del iPhone).
2. `npm run dev` y abre en Safari la URL que aparece como `Network:` (`https://<ip-del-pc>:5173/`).
3. Safari avisará de que la conexión no es privada (certificado autofirmado): **Mostrar detalles → visitar este sitio web**.

Si no conecta: la red puede aislar los dispositivos (habitual en redes de universidad o de invitados) o el firewall de Windows puede estar bloqueando Node.js en esa red.

## Despliegue

Cada push a `main` ejecuta `.github/workflows/deploy.yml`: lint, tests, build y publicación en GitHub Pages (`https://<usuario>.github.io/<repositorio>/`).
