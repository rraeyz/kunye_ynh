import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'

// Okundu / okunmadı işareti
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { read } = await request.json().catch(() => ({}))
  const result = await prisma.contactMessage.updateMany({ where: { id: parseInt(params.id) || 0 }, data: { read: read !== false } })
  if (result.count === 0) return NextResponse.json({ error: 'Mesaj bulunamadı' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await prisma.contactMessage.deleteMany({ where: { id: parseInt(params.id) || 0 } })
  return NextResponse.json({ success: true })
}
