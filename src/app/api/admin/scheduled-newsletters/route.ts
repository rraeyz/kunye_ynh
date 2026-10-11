import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { getBaseUrl } from '@/lib/url'
import { isSmtpConfigured, loadMailProfile } from '@/lib/mailer'
import { normalizeTags, sendDueNewsletters } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'

const MAX_AHEAD = 366 * 24 * 60 * 60 * 1000
const MAX_PENDING = 50

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// Planlanmış bültenler: bekleyenler ve son gönderilenler
export async function GET() {
  if (!(await isAuthenticated())) return unauthorized()
  return NextResponse.json(await prisma.scheduledNewsletter.findMany({ orderBy: { sendAt: 'desc' }, take: 50 }))
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) return unauthorized()
  const body = await request.json().catch(() => ({}))
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 300) : ''
  const message = typeof body.message === 'string' ? body.message : ''
  const sendAt = new Date(typeof body.sendAt === 'string' ? body.sendAt : NaN)
  if (!subject || !message.trim()) return NextResponse.json({ error: 'Konu ve mesaj gerekli' }, { status: 400 })
  if (message.length > 200_000) return NextResponse.json({ error: 'Mesaj çok uzun' }, { status: 400 })
  if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Gelecekte bir tarih ve saat seç' }, { status: 400 })
  }
  if (sendAt.getTime() - Date.now() > MAX_AHEAD) return NextResponse.json({ error: 'En fazla bir yıl sonrası planlanabilir' }, { status: 400 })
  // Zamanı gelince hata vermesin diye SMTP şimdiden ayarlı olmalı
  if (!isSmtpConfigured(await loadMailProfile())) {
    return NextResponse.json({ error: 'SMTP ayarlı değil; önce Ayarlar → SMTP\'yi doldur' }, { status: 400 })
  }
  if ((await prisma.scheduledNewsletter.count({ where: { status: 'pending' } })) >= MAX_PENDING) {
    return NextResponse.json({ error: `En fazla ${MAX_PENDING} bekleyen bülten olabilir` }, { status: 400 })
  }
  // Etiket tek bir değer: normalizeTags temizler, virgüllü girilirse ilki alınır
  const tag = normalizeTags(typeof body.tag === 'string' ? body.tag : '').split(',')[0].trim()
  const item = await prisma.scheduledNewsletter.create({
    data: { subject, message, sendAt, tag, baseUrl: getBaseUrl(request.headers) },
  })
  return NextResponse.json(item)
}

// Bekleyen bülteni hemen gönder
export async function PATCH(request: NextRequest) {
  if (!(await isAuthenticated())) return unauthorized()
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!Number.isInteger(id) || body.sendNow !== true) return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  const updated = await prisma.scheduledNewsletter.updateMany({ where: { id, status: 'pending' }, data: { sendAt: new Date() } })
  if (updated.count === 0) return NextResponse.json({ error: 'Bekleyen bülten bulunamadı' }, { status: 404 })
  await sendDueNewsletters()
  return NextResponse.json(await prisma.scheduledNewsletter.findUnique({ where: { id } }))
}

// Bekleyeni iptal et ya da gönderilmişi listeden kaldır. Gönderilmekte olana dokunulmaz; bir saattir
// "sending" kalan (sunucu gönderim sırasında kapanmış) kayıt kaldırılabilir
export async function DELETE(request: NextRequest) {
  if (!(await isAuthenticated())) return unauthorized()
  const id = Number(request.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  const deleted = await prisma.scheduledNewsletter.deleteMany({ where: { id, OR: [{ status: { not: 'sending' } }, { sendAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }] } })
  if (deleted.count === 0) return NextResponse.json({ error: 'Bulunamadı ya da şu an gönderiliyor' }, { status: 404 })
  return NextResponse.json({ success: true })
}
