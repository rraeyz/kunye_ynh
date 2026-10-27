import { prisma } from '@/lib/prisma'
import { unsubscribeUrl } from '@/lib/unsubscribe'
import { buildEmailHtml, buildEmailText, createMailTransport, isSmtpConfigured, loadMailProfile, senderAddress } from '@/lib/mailer'

// Bülten gönderimi (hemen ya da planlanmış), abone etiketleri

const MAX_TAGS = 10
const MAX_TAG_LENGTH = 30

// Büyük/küçük harf duyarsız karşılaştırma; Türkçe küçültmede I → ı olduğundan ı/i aynı sayılır (VIP = vip)
export const tagKey = (tag: string) => tag.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')

// "Müşteri, etkinlik ,müşteri" → "Müşteri, etkinlik" (tekrarsız, büyük/küçük harf duyarsız)
export function normalizeTags(input: unknown): string {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(',')
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of parts) {
    const tag = String(part ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH)
    if (!tag || seen.has(tagKey(tag))) continue
    seen.add(tagKey(tag))
    tags.push(tag)
  }
  return tags.slice(0, MAX_TAGS).join(', ')
}

export const splitTags = (tags: string) => (tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [])
export const hasTag = (tags: string, tag: string) => splitTags(tags).some((t) => tagKey(t) === tagKey(tag))

type SendOptions = { subject: string; message: string; baseUrl: string; subscriberIds?: number[]; tag?: string; fromName?: string }
export type SendResult = { recipients: number; success: number; failed: number; errors: string[] }

// Onaylı abonelere (seçilenlere ya da bir etikete) ayrı ayrı gönderir, geçmişe yazar.
// SMTP ayarlı değilse hata fırlatır; alıcı yoksa recipients 0 döner.
export async function sendNewsletter({ subject, message, baseUrl, subscriberIds, tag, fromName }: SendOptions): Promise<SendResult> {
  const ids = Array.isArray(subscriberIds) ? subscriberIds.map(Number).filter(Number.isInteger) : []
  let subscribers = await prisma.subscriber.findMany({
    where: { confirmed: true, ...(ids.length > 0 ? { id: { in: ids } } : {}) },
  })
  if (tag) subscribers = subscribers.filter((s) => hasTag(s.tags, tag))
  const results: SendResult = { recipients: subscribers.length, success: 0, failed: 0, errors: [] }
  if (subscribers.length === 0) return results

  const profile = await loadMailProfile()
  if (!isSmtpConfigured(profile)) {
    throw new Error('SMTP ayarları yapılandırılmamış. Ayarlar sayfasından SMTP ayarlarını girin.')
  }
  const transporter = createMailTransport(profile)
  const from = senderAddress(profile, fromName || profile.smtpFromName)

  // Paralel gönderim (her seferinde 5 email)
  const batchSize = 5
  for (let i = 0; i < subscribers.length; i += batchSize) {
    await Promise.all(subscribers.slice(i, i + batchSize).map(async (subscriber) => {
      try {
        // HTML + düz metin; imza ve sosyal ikonlar profilden
        const content = {
          subject,
          message,
          baseUrl,
          unsubscribeUrl: unsubscribeUrl(baseUrl, subscriber.email),
          viewInBrowserUrl: `${baseUrl}/`,
        }
        await transporter.sendMail({
          from,
          to: subscriber.email,
          subject,
          html: buildEmailHtml(profile, content),
          text: buildEmailText(profile, content),
          // Gmail/Outlook'taki "Abonelikten çık" butonu (RFC 8058 tek tıkla çıkış)
          list: {
            unsubscribe: {
              url: unsubscribeUrl(baseUrl, subscriber.email, '/api/unsubscribe'),
              comment: 'Abonelikten çık',
            },
          },
          headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        })
        results.success++
      } catch (error: any) {
        results.failed++
        results.errors.push(`${subscriber.email}: ${error.message}`)
      }
    }))
  }

  // Gönderim geçmişi (E-posta Gönder → Bülten geçmişi)
  await prisma.newsletterSend.create({
    data: { subject: String(subject).slice(0, 300), recipients: subscribers.length, sent: results.success, failed: results.failed },
  }).catch((error) => console.warn('Bülten geçmişi yazılamadı:', error?.message))

  return results
}

// Zamanı gelen planlanmış bültenleri gönderir (lib/jobs.ts dakikada bir çağırır).
// Önce "sending" olarak işaretlenir: aynı bülten iki kez gönderilmez; gönderim sırasında sunucu
// kapanırsa "sending" kalır ve kendiliğinden yeniden denenmez (panelde yarıda kaldı görünür).
export async function sendDueNewsletters(): Promise<number> {
  const due = await prisma.scheduledNewsletter.findMany({
    where: { status: 'pending', sendAt: { lte: new Date() } },
    orderBy: { sendAt: 'asc' },
  })
  for (const item of due) {
    const claimed = await prisma.scheduledNewsletter.updateMany({ where: { id: item.id, status: 'pending' }, data: { status: 'sending' } })
    if (claimed.count === 0) continue
    let status = 'sent'
    let result = ''
    try {
      const sent = await sendNewsletter({ subject: item.subject, message: item.message, baseUrl: item.baseUrl, tag: item.tag || undefined, fromName: item.fromName })
      if (sent.recipients === 0) {
        status = 'failed'
        result = 'Gönderilecek abone yoktu'
      } else {
        result = `${sent.success}/${sent.recipients} gönderildi${sent.failed ? ` · ${sent.failed} hata` : ''}`
        if (sent.success === 0) status = 'failed'
      }
    } catch (error: any) {
      status = 'failed'
      result = String(error?.message || error).slice(0, 300)
    }
    await prisma.scheduledNewsletter.update({ where: { id: item.id }, data: { status, result } })
  }
  return due.length
}
