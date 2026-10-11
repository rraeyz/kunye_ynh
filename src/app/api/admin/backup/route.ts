import { NextRequest, NextResponse } from 'next/server'
import { withRevision } from '@/lib/revisions'
import { isAuthenticated } from '@/lib/auth'
import { createBackup, readAutoBackup, restoreBackup } from '@/lib/backup'
import { BACKUP_KINDS, BackupKind } from '@/lib/backupFormat'

export const dynamic = 'force-dynamic'

// GET /api/admin/backup?kind=full|settings|profile → yedek dosyası (JSON) indirilir
// GET /api/admin/backup?auto=kunye-full-YYYY-MM-DD.json → sunucudaki otomatik yedek indirilir
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const autoName = request.nextUrl.searchParams.get('auto')
  if (autoName) {
    const data = await readAutoBackup(autoName)
    if (!data) return NextResponse.json({ error: 'Yedek bulunamadı' }, { status: 404 })
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${autoName}"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  const kind = request.nextUrl.searchParams.get('kind') || 'full'
  if (!(BACKUP_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'Geçersiz yedek türü' }, { status: 400 })
  }

  try {
    const backup = await createBackup(kind as BackupKind)
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(JSON.stringify(backup), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="kunye-${kind}-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Backup error:', error)
    return NextResponse.json({ error: 'Yedek alınamadı' }, { status: 500 })
  }
}

// POST /api/admin/backup → yedekten geri yükler. Türü dosyanın kendisinden anlaşılır (eski
// "Ayarları dışa aktar" dosyaları da). Admin hesabı değişmez.
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let backup: unknown
  try {
    backup = await request.json()
  } catch {
    return NextResponse.json({ error: 'Dosya okunamadı (geçerli bir JSON değil)' }, { status: 400 })
  }

  try {
    // Geri yükleme de geri alınabilir (sayfa içeriği için; aboneler ve analitik geri gelmez)
    const result = await withRevision('Yedekten geri yükleme', () => restoreBackup(backup))
    if ('error' in result) return NextResponse.json(result, { status: 400 })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Restore error:', error)
    return NextResponse.json({ error: 'Geri yükleme başarısız; sayfa verileri değiştirilmedi' }, { status: 500 })
  }
}
