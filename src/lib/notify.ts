import { prisma } from '@/lib/prisma'

// Yeni abone / iletişim mesajı gibi olaylarda admin'e anlık bildirim (ntfy ve/veya Telegram).
// Ayarlanmamışsa hiçbir şey yapmaz. Bildirim gönderilemese de asıl işlem (abonelik, mesaj) etkilenmez.

type NotifyTargets = { notifyNtfyUrl: string; notifyTelegramToken: string; notifyTelegramChatId: string }

async function post(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

// Gönderilen kanal sayısını döner; hata olursa fırlatır (Ayarlar'daki "Test bildirimi" hatayı göstersin diye)
export async function sendNotification(title: string, body: string, targets?: NotifyTargets): Promise<number> {
  const config = targets ?? await prisma.profile.findUnique({
    where: { id: 1 },
    select: { notifyNtfyUrl: true, notifyTelegramToken: true, notifyTelegramChatId: true },
  })
  if (!config) return 0
  const text = `${title}\n\n${body}`.slice(0, 3500)
  const jobs: Promise<void>[] = []
  if (config.notifyNtfyUrl) {
    // Başlık HTTP başlığına konmaz: Türkçe karakterler başlıkta geçersiz olur
    jobs.push(post(config.notifyNtfyUrl, { method: 'POST', body: text, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
  }
  if (config.notifyTelegramToken && config.notifyTelegramChatId) {
    jobs.push(post(`https://api.telegram.org/bot${config.notifyTelegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.notifyTelegramChatId, text, disable_web_page_preview: true }),
    }))
  }
  const results = await Promise.allSettled(jobs)
  const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failed.length) throw new Error(failed.map((result) => result.reason?.message || 'gönderilemedi').join(', '))
  return jobs.length
}

// İstekleri bekletmeden arka planda gönderir
export function notifyAdmin(title: string, body: string) {
  sendNotification(title, body).catch((error) => console.warn('Bildirim gönderilemedi:', error instanceof Error ? error.message : error))
}
