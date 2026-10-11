import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// "Bana yaz" formundan gelen mesajlar (en yeni önce)
// ?unread=1 → yalnızca okunmamış sayısı (menüdeki rozet için)
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (request.nextUrl.searchParams.get('unread')) {
    return NextResponse.json({ unread: await prisma.contactMessage.count({ where: { read: false } }) })
  }
  const messages = await prisma.contactMessage.findMany({ orderBy: { id: 'desc' }, take: 500 })
  return NextResponse.json(messages)
}
