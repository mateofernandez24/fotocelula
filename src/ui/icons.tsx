// Iconos de trazo (24 × 24), dibujados aquí para no depender de ninguna librería externa.
import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function StopwatchIcon() {
  return (
    <Icon>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.5-1.5" />
    </Icon>
  )
}

export function FlagIcon() {
  return (
    <Icon>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </Icon>
  )
}

export function HistoryIcon() {
  return (
    <Icon>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4h4M12 8v4.5l3 2" />
    </Icon>
  )
}

export function SettingsIcon() {
  return (
    <Icon>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Icon>
  )
}

/** Logotipo: dos puertas y el recorrido entre ellas. */
export function LogoIcon() {
  return (
    <Icon>
      <path d="M6 4v16M18 4v16" />
      <path d="M3 12h18" strokeDasharray="2 2.5" />
    </Icon>
  )
}
