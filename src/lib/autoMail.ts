import { prisma } from '@/lib/prisma'
import { buildEmailHtml, buildEmailText, createMailTransport, isSmtpConfigured, loadMailProfile, senderAddress } from '@/lib/mailer'
import { unsubscribeUrl } from '@/lib/unsubscribe'

// Otomatik e-postalar: iletişim formuna otomatik yanıt ve yeni aboneye hoş geldin e-postası.
// Metinler admin panelinden gelir (boşsa gönderilmez). Gönderilemese de asıl işlem etkilenmez.

async function load() {
  const [mail, texts] = await Promise.all([
    loadMailProfile(),
    prisma.profile.findUnique({ where: { id: 1 }, select: { contactAutoReply: true, welcomeEmailSubject: true, welcomeEmailBody: true } }),
  ])
  return { mail: isSmtpConfigured(mail) ? mail : null, texts }
}

// Ziyaretçinin yazdığı hiçbir şey yanıta konmaz: form başkasının adresiyle doldurulsa bile
// o adrese yalnızca admin'in sabit metni gider (spam aracı olarak kullanılamaz)
export async function sendContactAutoReply(to: string, baseUrl: string): Promise<boolean> {
  const { mail, texts } = await load()
  if (!mail || !texts?.contactAutoReply) return false
  const content = { subject: 'Mesajınızı aldım', message: texts.contactAutoReply, baseUrl }
  await createMailTransport(mail).sendMail({
    from: senderAddress(mail),
    to,
    subject: content.subject,
    html: buildEmailHtml(mail, content),
    text: buildEmailText(mail, content),
  })
  return true
}

export async function sendWelcomeEmail(to: string, baseUrl: string): Promise<boolean> {
  const { mail, texts } = await load()
  if (!mail || !texts?.welcomeEmailBody) return false
  const content = {
    subject: texts.welcomeEmailSubject || 'Bültene hoş geldiniz',
    message: texts.welcomeEmailBody,
    baseUrl,
    unsubscribeUrl: unsubscribeUrl(baseUrl, to),
  }
  await createMailTransport(mail).sendMail({
    from: senderAddress(mail),
    to,
    subject: content.subject,
    html: buildEmailHtml(mail, content),
    text: buildEmailText(mail, content),
    list: { unsubscribe: { url: unsubscribeUrl(baseUrl, to, '/api/unsubscribe'), comment: 'Abonelikten çık' } },
    headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  })
  return true
}

// İstekleri bekletmeden arka planda gönderir
export function inBackground(task: Promise<unknown>, what: string) {
  task.catch((error) => console.warn(`${what} gönderilemedi:`, error instanceof Error ? error.message : error))
}
