// Formato de números para la interfaz (en español: coma decimal).

const formatters = new Map<number, Intl.NumberFormat>()

function formatNumber(value: number, decimals: number): string {
  let formatter = formatters.get(decimals)
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    formatters.set(decimals, formatter)
  }
  return formatter.format(value)
}

/** 2,050 s */
export function formatSeconds(seconds: number, decimals = 3): string {
  return `${formatNumber(seconds, decimals)} s`
}

/** 16,7 ms */
export function formatMs(seconds: number, decimals = 1): string {
  return `${formatNumber(seconds * 1000, decimals)} ms`
}

/** 59,94 fps */
export function formatFps(fps: number): string {
  return `${formatNumber(fps, 2)} fps`
}

export function formatInteger(value: number): string {
  return formatNumber(value, 0)
}
