import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { databaseDir } from '@/lib/backup'
import { isBrokenStatus } from '@/lib/linkHealth'
import pkg from '../../../../../package.json'

export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000

// Günlere bölme /api/analytics ile aynı: UTC takvim günü
const dayKey = (date: Date) => date.toISOString().split('T')[0]

function lastDays(count: number): string[] {
  const days: string[] = []
  for (let i = count - 1; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * DAY)))
  return days
}

// db-backup.js ve otomatik yedek her başarılı yedekte veritabanının yanına .last-backup yazar
function readLastBackup(): string | null {
  try {
    const raw = fs.readFileSync(path.join(databaseDir(), '.last-backup'), 'utf8')
    const at = new Date(JSON.parse(raw).at)
    return isNaN(at.getTime()) ? null : at.toISOString()
  } catch {
    return null
  }
}

// Admin "Genel Bakış" ekranı: seçilen dönemin özeti, bir önceki dönemle karşılaştırma ve site durumu
export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const range = new URL(request.url).searchParams.get('range') === '30d' ? 30 : 7
    const now = new Date()
    const start = new Date(now.getTime() - range * DAY)
    const prevStart = new Date(now.getTime() - 2 * range * DAY)
    const inRange = { gte: start }
    const inPrev = { gte: prevStart, lt: start }

    const [views, clicks, subscribers, prevViews, prevClicks, prevSubscribers, prevVisitors, totalSubscribers, topGroups, profile, links, unreadMessages] =
      await Promise.all([
        prisma.pageView.findMany({ where: { timestamp: inRange }, select: { timestamp: true, ipHash: true } }),
        prisma.analytics.findMany({ where: { timestamp: inRange }, select: { timestamp: true, ipHash: true } }),
        prisma.subscriber.findMany({ where: { createdAt: inRange, confirmed: true }, select: { createdAt: true } }),
        prisma.pageView.count({ where: { timestamp: inPrev } }),
        prisma.analytics.count({ where: { timestamp: inPrev } }),
        prisma.subscriber.count({ where: { createdAt: inPrev, confirmed: true } }),
        prisma.pageView.findMany({ where: { timestamp: inPrev }, select: { ipHash: true }, distinct: ['ipHash'] }),
        prisma.subscriber.count({ where: { confirmed: true } }),
        prisma.analytics.groupBy({
          by: ['linkId'],
          where: { timestamp: inRange },
          _count: { linkId: true },
          orderBy: { _count: { linkId: 'desc' } },
          take: 5,
        }),
        prisma.profile.findUnique({ where: { id: 1 }, select: { smtpHost: true, smtpUser: true, smtpPassword: true, maintenanceMode: true } }),
        prisma.link.findMany({ select: { id: true, title: true, enabled: true, startDate: true, endDate: true, healthStatus: true } }),
        prisma.contactMessage.count({ where: { read: false } }),
      ])

    // Günlük seriler (kartlardaki küçük grafikler)
    const days = lastDays(range)
    const series = (dates: Date[]) => {
      const counts: Record<string, number> = {}
      for (const date of dates) counts[dayKey(date)] = (counts[dayKey(date)] || 0) + 1
      return days.map((day) => counts[day] || 0)
    }
    const uniquePerDay: Record<string, Set<string>> = {}
    for (const view of views) (uniquePerDay[dayKey(view.timestamp)] ??= new Set()).add(view.ipHash)

    const visitors = new Set(views.map((v) => v.ipHash))
    const clickers = new Set(clicks.map((c) => c.ipHash))
    let engaged = 0
    visitors.forEach((hash) => { if (clickers.has(hash)) engaged++ })

    const titles = new Map(links.map((link) => [link.id, link.title]))
    const topLinks = topGroups.map((group) => ({
      id: group.linkId,
      title: titles.get(group.linkId) || 'Silinmiş link',
      clicks: group._count?.linkId ?? 0,
    }))

    // Henüz yayına girmemiş zamanlanmış linkler (en yakını önce)
    const upcoming = links
      .filter((link) => link.enabled && link.startDate && link.startDate > now)
      .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())
    // Süresi dolduğu için sitede görünmeyen ama hâlâ açık linkler
    const expired = links.filter((link) => link.enabled && link.endDate && link.endDate < now)
    // Son link kontrolünde açılmayan linkler
    const broken = links.filter((link) => link.enabled && isBrokenStatus(link.healthStatus))

    return NextResponse.json({
      range,
      days,
      kpis: {
        views: { value: views.length, previous: prevViews, series: series(views.map((v) => v.timestamp)) },
        visitors: { value: visitors.size, previous: prevVisitors.length, series: days.map((day) => uniquePerDay[day]?.size || 0) },
        clicks: { value: clicks.length, previous: prevClicks, series: series(clicks.map((c) => c.timestamp)) },
        subscribers: { value: subscribers.length, previous: prevSubscribers, series: series(subscribers.map((s) => s.createdAt)), total: totalSubscribers },
      },
      engagementRate: visitors.size ? Math.round((engaged / visitors.size) * 100) : null,
      topLinks,
      status: {
        smtpConfigured: !!(profile?.smtpHost && profile.smtpUser && profile.smtpPassword),
        lastBackup: readLastBackup(),
        upcoming: upcoming.length,
        nextUpcoming: upcoming[0] ? { title: upcoming[0].title, startDate: upcoming[0].startDate } : null,
        expired: expired.length,
        broken: broken.map((link) => link.title),
        unreadMessages,
        maintenance: !!profile?.maintenanceMode,
        version: pkg.version,
      },
    })
  } catch (error) {
    console.error('Overview error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
