import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { withRevision } from '@/lib/revisions'

// Bloğun kopyası: hemen altına eklenir, başlığa "(kopya)" eklenir. Tıklama sayısı, kısa link (/go/..., tekrar
// etmesin) ve sağlık kontrolü sonucu kopyalanmaz; şifre koruması kopyalanır.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const source = await prisma.link.findUnique({ where: { id: parseInt(params.id) || 0 } })
    if (!source) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

    const { id, clicks, slug, createdAt, updatedAt, healthStatus, healthCheckedAt, ...fields } = source
    const copy = await withRevision(`"${source.title || 'Ayırıcı'}" kopyalandı`, () =>
      prisma.$transaction(async (tx) => {
        await tx.link.updateMany({ where: { order: { gt: source.order } }, data: { order: { increment: 1 } } })
        return tx.link.create({
          data: { ...fields, title: source.title ? `${source.title} (kopya)`.slice(0, 200) : '', order: source.order + 1 },
        })
      })
    )
    return NextResponse.json(copy)
  } catch (error) {
    console.error('Link duplicate error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
