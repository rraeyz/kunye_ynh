import { NextResponse } from 'next/server'
import { withRevision } from '@/lib/revisions'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { buildLinkData, isUrlRequired } from '@/lib/links'

export const dynamic = 'force-dynamic'

// Tüm linkler (kapalı, zamanlanmış, şifreli olanlar dahil) sadece admin içindir.
// Herkese açık sayfa linkleri sunucu tarafında filtreleyerek okur.
export async function GET() {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const links = await prisma.link.findMany({
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(links)
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const type = String(body.type || 'link')
    if (!body.title) {
      return NextResponse.json({ error: 'Başlık gerekli' }, { status: 400 })
    }
    if (isUrlRequired(type) && !body.url) {
      return NextResponse.json({ error: 'URL gerekli' }, { status: 400 })
    }

    const result = await buildLinkData({ type: 'link', ...body, order: undefined, enabled: undefined })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const link = await withRevision(`"${result.data.title}" eklendi`, async () => {
      // En yüksek order değerini bul
      const maxOrderLink = await prisma.link.findFirst({
        orderBy: { order: 'desc' },
      })

      return prisma.link.create({
        data: {
          icon: 'FaLink',
          ...result.data,
          title: result.data.title,
          url: result.data.url ?? '',
          order: (maxOrderLink?.order || 0) + 1,
        },
      })
    })

    return NextResponse.json(link)
  } catch (error) {
    console.error('Link creation error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
