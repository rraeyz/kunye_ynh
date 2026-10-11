import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { escapeHtml, getClientIp, isRateLimited, isValidEmail } from '@/lib/security'
import { buildEmailHtml, buildEmailText, createMailTransport, isSmtpConfigured, loadMailProfile, senderAddress } from '@/lib/mailer'
import { confirmUrl } from '@/lib/unsubscribe'
import { getBaseUrl } from '@/lib/url'
import { notifyAdmin } from '@/lib/notify'
import { inBackground, sendWelcomeEmail } from '@/lib/autoMail'

const SUBSCRIBED = 'Bültene başarıyla abone oldunuz!'
const PENDING = 'Neredeyse tamam! E-postanıza gelen linke tıklayarak aboneliğinizi onaylayın.'

export async function POST(request: NextRequest) {
  try {
    // Spam koruması: IP başına saatte 10 abonelik
    if (isRateLimited(`subscribe:${getClientIp(request.headers)}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.' },
        { status: 429 }
      )
    }

    const { email, name } = await request.json()

    // E-posta validasyonu
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Geçerli bir e-posta adresi girin' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const safeName = typeof name === 'string' ? name.trim().slice(0, 100) : ''

    // Zaten onaylı abone: hiçbir şey değişmez (başkası bu adresle tekrar kaydolarak adı değiştiremez).
    // Yanıt aynı olduğu için bir adresin listede olup olmadığı da anlaşılmaz.
    const existing = await prisma.subscriber.findUnique({ where: { email: normalizedEmail } })
    if (existing?.confirmed) {
      return NextResponse.json({ success: true, message: SUBSCRIBED })
    }

    // E-posta onayı (Ayarlar → Bülten) açıksa ve e-posta gönderilebiliyorsa abone onaylayana kadar bekler.
    // SMTP ayarlı değilse onay e-postası gidemeyeceği için abone doğrudan eklenir.
    const settings = await prisma.profile.findUnique({ where: { id: 1 }, select: { newsletterDoubleOptIn: true } })
    const mail = settings?.newsletterDoubleOptIn ? await loadMailProfile() : null
    const needsConfirm = isSmtpConfigured(mail)

    await prisma.subscriber.upsert({
      where: { email: normalizedEmail },
      update: { name: safeName, confirmed: !needsConfirm },
      create: { email: normalizedEmail, name: safeName, confirmed: !needsConfirm },
    })

    if (needsConfirm && mail) {
      const baseUrl = getBaseUrl(request.headers)
      const link = confirmUrl(baseUrl, normalizedEmail)
      const content = {
        subject: 'Aboneliğinizi onaylayın',
        message: `Merhaba${safeName ? ` ${escapeHtml(safeName)}` : ''},\n\nBültene abone olmak için aşağıdaki bağlantıya tıklayın:\n\n[Aboneliğimi onayla](${link})\n\nBu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; onaylanmayan kayıt 7 gün içinde silinir.`,
        baseUrl,
      }
      await createMailTransport(mail).sendMail({
        from: senderAddress(mail),
        to: normalizedEmail,
        subject: content.subject,
        html: buildEmailHtml(mail, content),
        text: buildEmailText(mail, content),
      })
      return NextResponse.json({ success: true, pending: true, message: PENDING })
    }

    notifyAdmin('Yeni bülten abonesi', [safeName, normalizedEmail].filter(Boolean).join(' · '))
    inBackground(sendWelcomeEmail(normalizedEmail, getBaseUrl(request.headers)), 'Hoş geldin e-postası')
    return NextResponse.json({ success: true, message: SUBSCRIBED })
  } catch (error) {
    console.error('Subscribe error:', error)
    return NextResponse.json(
      { error: 'Abonelik işlemi başarısız' },
      { status: 500 }
    )
  }
}
