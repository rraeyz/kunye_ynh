import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { escapeHtml } from '@/lib/security'
import { getBaseUrl } from '@/lib/url'
import { buildEmailHtml, buildEmailText, createMailTransport, isSmtpConfigured, loadMailProfile, senderAddress } from '@/lib/mailer'

// Mesajlar → yanıt: e-posta ziyaretçiye gider (altında asıl mesajı alıntılanır) ve konuşma geçmişine yazılır
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { body } = await request.json().catch(() => ({}))
    const text = typeof body === 'string' ? body.trim().slice(0, 20_000) : ''
    if (!text) return NextResponse.json({ error: 'Yanıt boş olamaz' }, { status: 400 })

    const message = await prisma.contactMessage.findUnique({ where: { id: parseInt(params.id) || 0 } })
    if (!message) return NextResponse.json({ error: 'Mesaj bulunamadı' }, { status: 404 })

    const mail = await loadMailProfile()
    if (!isSmtpConfigured(mail)) {
      return NextResponse.json({ error: 'SMTP ayarlı değil: Ayarlar → SMTP doldurulmadan panelden yanıt gönderilemez' }, { status: 400 })
    }
    const contact = await prisma.profile.findUnique({ where: { id: 1 }, select: { contactEmail: true } })

    // Ziyaretçinin metni HTML olarak çalışmasın diye kaçışlanır (e-posta şablonu HTML'e izin verir)
    const quote = escapeHtml(message.message).split('\n').map((line) => `> ${line}`).join('\n')
    const date = message.createdAt.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
    const content = {
      subject: 'Re: Mesajınız',
      message: `${text}\n\n${date} tarihli mesajınız:\n${quote}`,
      baseUrl: getBaseUrl(request.headers),
    }
    await createMailTransport(mail).sendMail({
      from: senderAddress(mail),
      to: message.email,
      // Ziyaretçi yanıtlarsa iletişim adresine gelsin (gönderen adres "noreply" olabilir)
      ...(contact?.contactEmail ? { replyTo: contact.contactEmail } : {}),
      subject: content.subject,
      html: buildEmailHtml(mail, content),
      text: buildEmailText(mail, content),
    })

    const reply = await prisma.contactReply.create({ data: { messageId: message.id, body: text } })
    await prisma.contactMessage.update({ where: { id: message.id }, data: { read: true } })
    return NextResponse.json(reply)
  } catch (error) {
    console.error('Message reply error:', error)
    return NextResponse.json({ error: 'Yanıt gönderilemedi: ' + (error instanceof Error ? error.message : 'bilinmeyen hata') }, { status: 500 })
  }
}
