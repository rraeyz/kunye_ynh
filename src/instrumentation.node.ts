import { loadPersistentSecret } from '@/lib/auth'
import { startScheduler } from '@/lib/jobs'

// Kalıcı gizli anahtarı yükler, günlük otomatik işleri (temizlik, otomatik yedek, link kontrolü,
// haftalık özet) başlatır
export async function registerNode() {
  await loadPersistentSecret()
  startScheduler()
}
