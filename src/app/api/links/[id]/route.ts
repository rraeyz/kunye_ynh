import { NextResponse } from 'next/server'
import { withRevision } from '@/lib/revisions'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { buildLinkData } from '@/lib/links'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const linkId = parseInt(params.id)
    const existing = await prisma.link.findUnique({ where: { id: linkId } })
    if (!existing) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    const body = await request.json()
    // Doğrulama birleşik kayıt üzerinden yapılır: tip gönderilmediyse mevcut tip, URL gönderilmediyse
    // mevcut URL kullanılır (yalnızca tipi değiştirerek doğrulanmamış bir URL yayına alınamasın)
    const result = await buildLinkData({ url: existing.url, ...body, type: body.type ?? existing.type }, existing.password)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    if (body.type === undefined) delete result.data.type
    // Adres değiştiyse eski kontrol sonucu (ör. "açılmıyor" uyarısı) geçersiz
    const data: Record<string, any> = { ...result.data }
    if (data.url !== undefined && data.url !== existing.url) {
      data.healthStatus = 0
      data.healthCheckedAt = null
    }

    // Etiket: yalnızca sıra değiştiyse art arda gelen sıralama istekleri tek adım olsun
    const keys = Object.keys(body)
    const label = keys.length === 1 && keys[0] === 'order' ? 'Sıralama'
      : keys.length === 1 && keys[0] === 'enabled' ? `"${existing.title}" ${body.enabled ? 'açıldı' : 'kapatıldı'}`
      : `"${existing.title}" düzenlendi`
    const link = await withRevision(label, () => prisma.link.update({
      where: { id: linkId },
      data,
    }))

    return NextResponse.json(link)
  } catch (error) {
    console.error('Link update error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = parseInt(params.id)
    const existing = await prisma.link.findUnique({ where: { id }, select: { title: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }
    await withRevision(`"${existing.title}" silindi`, () => prisma.link.delete({ where: { id } }))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Link deletion error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
