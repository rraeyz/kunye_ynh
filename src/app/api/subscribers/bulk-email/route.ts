import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { getBaseUrl } from '@/lib/url'
import { unsubscribeUrl } from '@/lib/unsubscribe'
import {
  buildEmailHtml,
  buildEmailText,
  createMailTransport,
  isSmtpConfigured,
  loadMailProfile,
  senderAddress,
} from '@/lib/mailer'

// Profil + SMTP ayarlarını database'den al; eksikse hata (aşağıda 500 olarak döner)
const createTransporter = async () => {
  const profile = await loadMailProfile()
  if (!isSmtpConfigured(profile)) {
    throw new Error('SMTP ayarları yapılandırılmamış. Ayarlar sayfasından SMTP ayarlarını girin.')
  }
  return { transporter: createMailTransport(profile), profile }
}

export async function POST(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated()
    
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { subject, message, subscriberIds } = await request.json()

    if (!subject || !message) {
      return NextResponse.json(
        { error: 'Konu ve mesaj gerekli' },
        { status: 400 }
      )
    }

    // Abone listesini al (e-postasını onaylamamış olanlara bülten gitmez)
    let subscribers
    if (Array.isArray(subscriberIds) && subscriberIds.length > 0) {
      // Belirli aboneler seçildiyse
      subscribers = await prisma.subscriber.findMany({
        where: {
          id: { in: subscriberIds.map(Number).filter(Number.isInteger) },
          confirmed: true,
        }
      })
    } else {
      // Tüm aboneler
      subscribers = await prisma.subscriber.findMany({ where: { confirmed: true } })
    }

    if (subscribers.length === 0) {
      return NextResponse.json(
        { error: 'Gönderilecek abone bulunamadı' },
        { status: 404 }
      )
    }

    // Email gönderimi - Transporter oluştur
    const { transporter, profile } = await createTransporter()
    const fromEmail = senderAddress(profile)

    const baseUrl = getBaseUrl(request.headers)
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    }

    // Paralel gönderim (her seferinde 5 email)
    const batchSize = 5
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (subscriber) => {
          try {
            // HTML + düz metin; imza ve sosyal ikonlar profilden
            const content = {
              subject,
              message,
              baseUrl,
              unsubscribeUrl: unsubscribeUrl(baseUrl, subscriber.email),
              viewInBrowserUrl: `${baseUrl}/`,
            }
            const htmlContent = buildEmailHtml(profile, content)
            const textContent = buildEmailText(profile, content)

            await transporter.sendMail({
              from: fromEmail,
              to: subscriber.email,
              subject: subject,
              html: htmlContent,
              text: textContent,
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
        })
      )
    }

    // Gönderim geçmişi (E-posta Gönder → Bülten geçmişi)
    await prisma.newsletterSend.create({
      data: { subject: String(subject).slice(0, 300), recipients: subscribers.length, sent: results.success, failed: results.failed },
    }).catch((error) => console.warn('Bülten geçmişi yazılamadı:', error?.message))

    return NextResponse.json({
      message: `${results.success} e-posta başarıyla gönderildi`,
      success: results.success,
      failed: results.failed,
      errors: results.errors.length > 0 ? results.errors : undefined
    })

  } catch (error: any) {
    console.error('Bulk email error:', error)
    return NextResponse.json(
      { error: 'E-posta gönderimi başarısız', details: error.message },
      { status: 500 }
    )
  }
}
