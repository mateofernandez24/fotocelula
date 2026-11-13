import type { ReactNode } from 'react'

/** Pantalla vacía de una pestaña: icono, título, explicación y, si hace falta, una acción. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="card empty-state">
      {icon}
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  )
}
