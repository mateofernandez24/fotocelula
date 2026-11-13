// Guardar un archivo en el dispositivo sin subirlo a ningún sitio: en el iPhone abre la hoja
// de compartir («Guardar en Archivos», «Guardar vídeo»…); en el ordenador, lo descarga.

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

export async function saveFile(file: File): Promise<SaveResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (error) {
      // El usuario cerró la hoja de compartir: no es un error.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Cualquier otro fallo de la hoja de compartir: se descarga.
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
