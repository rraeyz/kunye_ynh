// Panelden yapılan başarılı her kayıt (POST/PUT/PATCH/DELETE /api/...) için 'admin:saved' olayı yayınlanır.
// Canlı önizleme, geri al düğmeleri ve mesaj rozeti bunu dinler. fetch yalnızca bir kez sarılır.
export const ADMIN_SAVED_EVENT = 'admin:saved'

export function installAdminSaveEvents(): () => void {
  const originalFetch = window.fetch
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args)
    try {
      const [input, init] = args
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (method !== 'GET' && response.ok && url.includes('/api/') && !url.includes('/api/auth/')) {
        window.dispatchEvent(new CustomEvent(ADMIN_SAVED_EVENT, { detail: { url, method } }))
      }
    } catch {
      // Olay yayınlanamasa da asıl istek etkilenmez
    }
    return response
  }
  return () => {
    window.fetch = originalFetch
  }
}
