import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Abonelere gönderilen son bültenler
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await prisma.newsletterSend.findMany({ orderBy: { id: 'desc' }, take: 50 }))
}
