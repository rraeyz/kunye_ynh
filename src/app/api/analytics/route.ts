import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { referrerHost } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000
const dayKey = (date: Date) => date.toISOString().split('T')[0]

type Counted<K extends string> = Array<Record<K, string> & { _count: { _all: number } }>
const toCounts = <K extends string>(rows: Counted<K>, key: K, fallback = 'unknown') => {
  const result: Record<string, number> = {}
  for (const row of rows) {
    const name = row[key] || fallback
    result[name] = (result[name] || 0) + row._count._all
  }
  return result
}

// Analitik sayfası. Sayımlar veritabanında (groupBy) yapılır; satırların hepsi belleğe alınmaz.
// Gün ve saat dağılımı için yalnızca zaman damgaları okunur.
// ?range=7d|30d|all  ?linkId=N → tıklama verileri yalnızca o link için (görüntülenmeler profil geneli)
export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Otomatik temizlik: Ayarlara göre eski verileri sil (ayrıca günlük otomatik işte de çalışır)
    const profile = await prisma.profile.findUnique({
      where: { id: 1 },
      select: { analyticsRetentionDays: true }
    })
    if (profile && profile.analyticsRetentionDays > 0) {
      const cutoffDate = new Date(Date.now() - profile.analyticsRetentionDays * DAY)
      await prisma.analytics.deleteMany({ where: { timestamp: { lt: cutoffDate } } })
      await prisma.pageView.deleteMany({ where: { timestamp: { lt: cutoffDate } } })
    }

    const { searchParams } = request.nextUrl
    const range = searchParams.get('range') || '7d'
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 0
    const now = Date.now()
    const startDate = days ? new Date(now - days * DAY) : new Date(0)
    // Karşılaştırma: bir önceki aynı uzunluktaki dönem ("tüm zamanlar"da yok)
    const prevRange = days ? { gte: new Date(now - 2 * days * DAY), lt: startDate } : null
    const linkId = parseInt(searchParams.get('linkId') || '')
    const linkFilter = Number.isInteger(linkId) ? { linkId } : {}

    const clickWhere = { timestamp: { gte: startDate }, ...linkFilter }
    const viewWhere = { timestamp: { gte: startDate } }

    const [
      clickTimes, viewTimes, devices, browsers, countries, referrers, clickCampaigns, viewCampaigns,
      visitorRows, clickerRows, prevViews, prevVisitorRows, prevClicks,
    ] = await Promise.all([
      prisma.analytics.findMany({ where: clickWhere, select: { timestamp: true } }),
      prisma.pageView.findMany({ where: viewWhere, select: { timestamp: true } }),
      prisma.analytics.groupBy({ by: ['device'], where: clickWhere, _count: { _all: true } }),
      prisma.analytics.groupBy({ by: ['browser'], where: clickWhere, _count: { _all: true } }),
      prisma.analytics.groupBy({ by: ['country'], where: clickWhere, _count: { _all: true }, orderBy: { _count: { country: 'desc' } } }),
      prisma.analytics.groupBy({ by: ['referrer'], where: clickWhere, _count: { _all: true } }),
      prisma.analytics.groupBy({ by: ['utmSource', 'utmMedium', 'utmCampaign'], where: clickWhere, _count: { _all: true } }),
      prisma.pageView.groupBy({ by: ['utmSource', 'utmMedium', 'utmCampaign'], where: viewWhere, _count: { _all: true } }),
      prisma.pageView.groupBy({ by: ['ipHash'], where: viewWhere }),
      prisma.analytics.groupBy({ by: ['ipHash'], where: clickWhere }),
      prevRange ? prisma.pageView.count({ where: { timestamp: prevRange } }) : null,
      prevRange ? prisma.pageView.groupBy({ by: ['ipHash'], where: { timestamp: prevRange } }) : null,
      prevRange ? prisma.analytics.count({ where: { timestamp: prevRange, ...linkFilter } }) : null,
    ])

    // Etkileşim: sayfayı görüntüleyen tekil ziyaretçilerden kaçı en az bir linke tıkladı.
    // (Kısa link /go/... tıklamalarında sayfa görüntülenmediği için tıklama/görüntülenme oranı %100'ü aşabilir)
    const clickers = new Set(clickerRows.map((row) => row.ipHash))
    const engagedVisitors = visitorRows.filter((row) => clickers.has(row.ipHash)).length
    const viewStats = { views: viewTimes.length, uniqueVisitors: visitorRows.length, engagedVisitors }

    const viewsByDay: Record<string, number> = {}
    for (const view of viewTimes) viewsByDay[dayKey(view.timestamp)] = (viewsByDay[dayKey(view.timestamp)] || 0) + 1
    const clicksByDay: Record<string, number> = {}
    for (const click of clickTimes) clicksByDay[dayKey(click.timestamp)] = (clicksByDay[dayKey(click.timestamp)] || 0) + 1

    // Günlük seri: 7/30 günde son X gün; tüm zamanlarda en eski kayıttan bugüne
    const dayList: string[] = []
    if (days) {
      for (let i = days - 1; i >= 0; i--) dayList.push(dayKey(new Date(now - i * DAY)))
    } else if (clickTimes.length > 0 || viewTimes.length > 0) {
      // reduce: çok sayıda kayıtta Math.min(...dizi) yığın taşmasına yol açar
      const oldest = [...clickTimes, ...viewTimes].reduce((min, item) => Math.min(min, item.timestamp.getTime()), now)
      for (let d = new Date(dayKey(new Date(oldest))); d.getTime() <= now; d = new Date(d.getTime() + DAY)) dayList.push(dayKey(d))
    }
    const dailyClicks = dayList.map((date) => ({ date, count: clicksByDay[date] || 0, views: viewsByDay[date] || 0 }))

    // Haftanın günü × saat (UTC) görüntülenme sayısı. Tarayıcı kendi saat dilimine kaydırır.
    const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
    for (const view of viewTimes) heatmap[view.timestamp.getUTCDay()][view.timestamp.getUTCHours()]++

    const campaigns: Record<string, { views: number; clicks: number }> = {}
    const campaignKey = (item: { utmSource: string; utmMedium: string; utmCampaign: string }) =>
      [item.utmSource, item.utmMedium, item.utmCampaign].filter(Boolean).join(' / ')
    for (const row of viewCampaigns) {
      const key = campaignKey(row)
      if (key) (campaigns[key] ??= { views: 0, clicks: 0 }).views += row._count._all
    }
    for (const row of clickCampaigns) {
      const key = campaignKey(row)
      if (key) (campaigns[key] ??= { views: 0, clicks: 0 }).clicks += row._count._all
    }

    // Referrer alan adına indirgenir (https://www.instagram.com/x → instagram.com); en çok gelen önce
    const referrerStats: Record<string, number> = {}
    for (const row of referrers) {
      const host = referrerHost(row.referrer) || 'direct'
      referrerStats[host] = (referrerStats[host] || 0) + row._count._all
    }
    const sortedReferrers = Object.fromEntries(Object.entries(referrerStats).sort((a, b) => b[1] - a[1]))

    // Hiç ayrıntılı tıklama kaydı yoksa toplam, linklerin sayaçlarından gelir (eski sürümlerden kalan veriler)
    const total = clickTimes.length > 0 || Number.isInteger(linkId)
      ? clickTimes.length
      : (await prisma.link.aggregate({ _sum: { clicks: true } }))._sum.clicks || 0

    return NextResponse.json({
      total,
      devices: toCounts(devices, 'device'),
      browsers: toCounts(browsers, 'browser'),
      countries: toCounts(countries, 'country'),
      referrers: sortedReferrers,
      dailyClicks,
      ...viewStats,
      rangeClicks: clickTimes.length,
      previous: prevRange ? { views: prevViews, uniqueVisitors: prevVisitorRows?.length ?? 0, clicks: prevClicks } : null,
      heatmap,
      campaigns: Object.entries(campaigns)
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks)),
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
