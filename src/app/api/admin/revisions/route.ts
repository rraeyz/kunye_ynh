import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { revisionStatus, stepRevision } from '@/lib/revisions'

export const dynamic = 'force-dynamic'

// Geri al / ileri al durumu: sıradaki adımların etiketleri
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await revisionStatus())
}

// { direction: 'undo' | 'redo' }
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { direction } = await request.json().catch(() => ({}))
  if (direction !== 'undo' && direction !== 'redo') {
    return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })
  }
  try {
    const label = await stepRevision(direction)
    if (!label) return NextResponse.json({ error: direction === 'undo' ? 'Geri alınacak değişiklik yok' : 'İleri alınacak değişiklik yok' }, { status: 409 })
    return NextResponse.json({ success: true, label, ...(await revisionStatus()) })
  } catch (error) {
    console.error('Revision error:', error)
    return NextResponse.json({ error: 'İşlem başarısız; sayfa değiştirilmedi' }, { status: 500 })
  }
}
