import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { getBaseUrl } from '@/lib/url'
import { sendNewsletter } from '@/lib/newsletter'

export async function POST(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated()
    
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { subject, message, subscriberIds, tag } = await request.json()

    if (!subject || !message) {
      return NextResponse.json(
        { error: 'Konu ve mesaj gerekli' },
        { status: 400 }
      )
    }

    // Seçilenler, bir etiket ya da tüm aboneler (e-postasını onaylamamış olanlara bülten gitmez)
    const results = await sendNewsletter({
      subject: String(subject),
      message: String(message),
      baseUrl: getBaseUrl(request.headers),
      subscriberIds: Array.isArray(subscriberIds) ? subscriberIds : undefined,
      tag: typeof tag === 'string' && tag.trim() ? tag : undefined,
    })

    if (results.recipients === 0) {
      return NextResponse.json(
        { error: 'Gönderilecek abone bulunamadı' },
        { status: 404 }
      )
    }

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
