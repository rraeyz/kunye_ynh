// Sunucu açılırken bir kez çalışır (Next.js instrumentation). Node'a özgü kod ayrı dosyada:
// Edge derlemesine girmesin diye yalnızca nodejs çalışma ortamında yüklenir.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation.node')
    await registerNode()
  }
}
