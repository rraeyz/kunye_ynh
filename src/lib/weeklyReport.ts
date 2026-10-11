import { prisma } from '@/lib/prisma'
import { getState } from '@/lib/appState'
import { escapeHtml } from '@/lib/security'
import { isBrokenStatus } from '@/lib/linkHealth'
import { buildEmailHtml, buildEmailText, createMailTransport, isSmtpConfigured, loadMailProfile, senderAddress } from '@/lib/mailer'

const DAY = 24 * 60 * 60 * 1000

// Zamanlanmış işlerde istek olmadığı için sitenin adresi .env'den ya da son admin girişinden alınır
export async function siteBaseUrl(): Promise<string> {
  return (process.env.NEXT_PUBLIC_BASE_URL || (await getState('baseUrl')) || '').replace(/\/+$/, '')
}

function change(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '' : ' (önceki hafta 0)'
  const percent = Math.round(((current - previous) / previous) * 100)
  return percent === 0 ? ' (değişmedi)' : ` (önceki haftaya göre %${Math.abs(percent)} ${percent > 0 ? 'artış' : 'düşüş'})`
}

// Son 7 günün özeti; Ayarlar'da "Haftalık özet" açıksa pazartesileri, ya da "Şimdi gönder" ile.
// Alıcı: iletişim e-postası, yoksa gönderen adres.
export async function sendWeeklyReport(): Promise<string> {
  const mail = await loadMailProfile()
  if (!isSmtpConfigured(mail)) throw new Error('SMTP ayarlı değil')
  const extra = await prisma.profile.findUnique({ where: { id: 1 }, select: { contactEmail: true, name: true } })
  const to = extra?.contactEmail || mail.smtpFrom || mail.smtpUser
  if (!to) throw new Error('Alıcı adresi yok: Profil → iletişim e-postasını girin')

  const now = Date.now()
  const week = { gte: new Date(now - 7 * DAY) }
  const prevWeek = { gte: new Date(now - 14 * DAY), lt: new Date(now - 7 * DAY) }
  const [views, prevViews, visitors, prevVisitors, clicks, prevClicks, subscribers, prevSubscribers, messages, top, links] = await Promise.all([
    prisma.pageView.count({ where: { timestamp: week } }),
    prisma.pageView.count({ where: { timestamp: prevWeek } }),
    prisma.pageView.groupBy({ by: ['ipHash'], where: { timestamp: week } }).then((rows) => rows.length),
    prisma.pageView.groupBy({ by: ['ipHash'], where: { timestamp: prevWeek } }).then((rows) => rows.length),
    prisma.analytics.count({ where: { timestamp: week } }),
    prisma.analytics.count({ where: { timestamp: prevWeek } }),
    prisma.subscriber.count({ where: { createdAt: week, confirmed: true } }),
    prisma.subscriber.count({ where: { createdAt: prevWeek, confirmed: true } }),
    prisma.contactMessage.count({ where: { createdAt: week } }),
    prisma.analytics.groupBy({ by: ['linkId'], where: { timestamp: week }, _count: { linkId: true }, orderBy: { _count: { linkId: 'desc' } }, take: 5 }),
    prisma.link.findMany({ select: { id: true, title: true, enabled: true, healthStatus: true } }),
  ])
  const titles = new Map(links.map((link) => [link.id, link.title]))
  const broken = links.filter((link) => link.enabled && isBrokenStatus(link.healthStatus))
  const baseUrl = await siteBaseUrl()

  const lines = [
    `Merhaba${extra?.name ? ` ${escapeHtml(extra.name.split(' ')[0])}` : ''}, sitenin son 7 günü:`,
    [
      `**Görüntülenme:** ${views}${change(views, prevViews)}`,
      `**Tekil ziyaretçi:** ${visitors}${change(visitors, prevVisitors)}`,
      `**Link tıklaması:** ${clicks}${change(clicks, prevClicks)}`,
      `**Yeni abone:** ${subscribers}${change(subscribers, prevSubscribers)}`,
      `**İletişim mesajı:** ${messages}`,
    ].join('\n'),
  ]
  if (top.length) {
    lines.push(`**En çok tıklananlar**\n${top.map((row, i) => `${i + 1}. ${escapeHtml(titles.get(row.linkId) || 'Silinmiş link')}: ${row._count?.linkId ?? 0}`).join('\n')}`)
  }
  if (broken.length) {
    lines.push(`**Dikkat:** ${broken.length} linke ulaşılamıyor: ${broken.map((link) => escapeHtml(link.title)).join(', ')}`)
  }
  if (baseUrl) lines.push(`[Admin paneline git](${baseUrl}/admin)`)

  const subject = 'Haftalık özet'
  const content = { subject, message: lines.join('\n\n'), baseUrl }
  await createMailTransport(mail).sendMail({
    from: senderAddress(mail),
    to,
    subject,
    html: buildEmailHtml(mail, content),
    text: buildEmailText(mail, content),
  })
  return to
}
