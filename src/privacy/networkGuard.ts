// La app no necesita ningún servicio externo. MediaPipe, en cambio, envía telemetría de
// uso a odml.pa.googleapis.com cada vez que se crea una tarea y no tiene opción para
// desactivarla. Este guardia rechaza cualquier fetch a otro origen. Se instala en código
// (y no con una CSP en el HTML) porque así también protege dentro de los Web Workers.

interface FetchScope {
  fetch: typeof fetch
  location: { origin: string; href: string }
}

const guarded = new WeakSet<object>()

/** Hace que `scope.fetch` rechace las peticiones a otros orígenes. Idempotente. */
export function blockCrossOriginFetch(scope: FetchScope = globalThis): void {
  if (guarded.has(scope)) return
  guarded.add(scope)
  const originalFetch = scope.fetch.bind(scope)
  const { origin, href } = scope.location

  scope.fetch = (input, init) => {
    const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : input
    const url = new URL(raw, href)
    // blob: hereda el origen de quien lo creó; data: no sale a la red.
    if (url.protocol !== 'data:' && url.origin !== origin) {
      return Promise.reject(
        new TypeError(`Petición bloqueada a ${url.host}: la app no envía datos a terceros.`),
      )
    }
    return originalFetch(input, init)
  }
}
