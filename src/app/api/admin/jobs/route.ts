import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getState, setState } from '@/lib/appState'
import { AUTO_BACKUP_KEEP, listAutoBackups, writeAutoBackup } from '@/lib/backup'
import { checkLinkHealth } from '@/lib/jobs'
import { sendWeeklyReport } from '@/lib/weeklyReport'
import { sendNotification } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// Ayarlar → Otomatik işler: son çalışma zamanları ve sunucudaki otomatik yedekler
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const keys = ['job.autoBackup', 'job.linkHealth', 'job.weeklyReport', 'job.cleanup']
  const lastRuns = Object.fromEntries(await Promise.all(keys.map(async (key) => [key.slice(4), await getState(key)])))
  return NextResponse.json({ lastRuns, autoBackups: await listAutoBackups(), keep: AUTO_BACKUP_KEEP })
}

// { job: 'auto-backup' | 'link-health' | 'weekly-report' | 'test-notification' } → şimdi çalıştır
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { job } = await request.json().catch(() => ({}))
  const now = () => new Date().toISOString()
  try {
    switch (job) {
      case 'auto-backup': {
        const name = await writeAutoBackup()
        await setState('job.autoBackup', now())
        return NextResponse.json({ message: `Yedek alındı: ${name}` })
      }
      case 'link-health': {
        const checked = await checkLinkHealth()
        await setState('job.linkHealth', now())
        return NextResponse.json({ message: `${checked} link kontrol edildi` })
      }
      case 'weekly-report': {
        const to = await sendWeeklyReport()
        return NextResponse.json({ message: `Haftalık özet ${to} adresine gönderildi` })
      }
      case 'test-notification': {
        const profile = await prisma.profile.findUnique({ where: { id: 1 }, select: { name: true } })
        const sent = await sendNotification('Künye test bildirimi', `${profile?.name || 'Siten'}: bildirimler çalışıyor.`)
        if (sent === 0) return NextResponse.json({ error: 'Önce ntfy adresini ya da Telegram bilgilerini kaydet' }, { status: 400 })
        return NextResponse.json({ message: 'Test bildirimi gönderildi' })
      }
      default:
        return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })
    }
  } catch (error) {
    console.error(`Job ${job} error:`, error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'İşlem başarısız' }, { status: 500 })
  }
}
