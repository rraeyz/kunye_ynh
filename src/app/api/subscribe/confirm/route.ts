import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidConfirmToken } from '@/lib/unsubscribe'
import { notifyAdmin } from '@/lib/notify'
import { inBackground, sendWelcomeEmail } from '@/lib/autoMail'
import { getBaseUrl } from '@/lib/url'

export const dynamic = 'force-dynamic'

// /subscribe/confirm sayfasındaki "Aboneliği onayla" butonu buraya gelir
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = typeof body.token === 'string' ? body.token : ''

  if (!email || !isValidConfirmToken(email, token)) {
    return NextResponse.json({ error: 'Geçersiz onay linki' }, { status: 400 })
  }

  const subscriber = await prisma.subscriber.findUnique({ where: { email } })
  if (!subscriber) {
    return NextResponse.json({ error: 'Kayıt bulunamadı; süresi dolmuş olabilir. Lütfen yeniden abone olun.' }, { status: 404 })
  }
  if (!subscriber.confirmed) {
    await prisma.subscriber.update({ where: { email }, data: { confirmed: true } })
    notifyAdmin('Yeni bülten abonesi', [subscriber.name, email].filter(Boolean).join(' · '))
    inBackground(sendWelcomeEmail(email, getBaseUrl(request.headers)), 'Hoş geldin e-postası')
  }
  return NextResponse.json({ success: true })
}
