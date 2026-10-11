import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { hasTag, normalizeTags, splitTags } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const authenticated = await isAuthenticated()
    
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const subscribers = await prisma.subscriber.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(subscribers)
  } catch (error) {
    console.error('Fetch subscribers error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Seçilen abonelere etiket ekle / kaldır: { ids, addTag?, removeTag? }
export async function PATCH(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : []
  const addTag = normalizeTags(typeof body.addTag === 'string' ? body.addTag : '')
  const removeTag = typeof body.removeTag === 'string' ? body.removeTag.trim() : ''
  if (ids.length === 0 || (!addTag && !removeTag)) {
    return NextResponse.json({ error: 'Abone ve etiket seç' }, { status: 400 })
  }
  const subscribers = await prisma.subscriber.findMany({ where: { id: { in: ids } }, select: { id: true, tags: true } })
  for (const subscriber of subscribers) {
    const kept = splitTags(subscriber.tags).filter((tag) => !removeTag || !hasTag(tag, removeTag))
    const tags = normalizeTags([...kept, ...splitTags(addTag)])
    if (tags !== subscriber.tags) await prisma.subscriber.update({ where: { id: subscriber.id }, data: { tags } })
  }
  return NextResponse.json({ updated: subscribers.length })
}
