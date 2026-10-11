'use client'

import { useEffect, useState } from 'react'
import { FaPlus, FaCheckCircle, FaExclamationTriangle, FaClock, FaInfoCircle, FaArrowRight } from 'react-icons/fa'
import type { AdminTab } from './adminNav'

interface Kpi {
  value: number
  previous: number
  series: number[]
  total?: number
}

interface Overview {
  range: number
  kpis: { views: Kpi; visitors: Kpi; clicks: Kpi; subscribers: Kpi }
  engagementRate: number | null
  topLinks: Array<{ id: number; title: string; clicks: number }>
  status: {
    smtpConfigured: boolean
    lastBackup: string | null
    upcoming: number
    nextUpcoming: { title: string; startDate: string } | null
    expired: number
    broken: string[]
    unreadMessages: number
    maintenance: boolean
    version: string
  }
}

interface OverviewPanelProps {
  name: string
  onNavigate: (tab: AdminTab) => void
  onAddLink: () => void
}

const formatNumber = (value: number) => value.toLocaleString('tr-TR')

function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'Günaydın'
  if (hour >= 12 && hour < 18) return 'İyi günler'
  if (hour >= 18 && hour < 23) return 'İyi akşamlar'
  return 'İyi geceler'
}

function relativeTime(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })
  const minutes = Math.round(diff / 60_000)
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(hours / 24), 'day')
}

// Önceki döneme göre değişim; renk tek başına anlam taşımasın diye yön metinle de yazılır
function changeText(kpi: Kpi, range: number) {
  if (kpi.previous === 0) return kpi.value === 0 ? 'Bu dönemde veri yok' : 'Önceki dönemde veri yok'
  const percent = Math.round(((kpi.value - kpi.previous) / kpi.previous) * 100)
  if (percent === 0) return `Önceki ${range} günle aynı`
  return `Önceki ${range} güne göre %${Math.abs(percent)} ${percent > 0 ? 'artış' : 'düşüş'}`
}

function Sparkline({ values }: { values: number[] }) {
  const width = 120
  const height = 32
  const max = Math.max(...values, 1)
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - 2 - (value / max) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-8" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function KpiCard({ label, kpi, range, note }: { label: string; kpi: Kpi; range: number; note?: string }) {
  return (
    <div className="bg-dark-card border border-gray-800 rounded-2xl px-5 pt-4 pb-3 flex flex-col gap-1 min-w-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-3xl font-semibold text-white tabular-nums">{formatNumber(kpi.value)}</span>
      <span className="text-xs text-gray-400">{note || changeText(kpi, range)}</span>
      <div className="mt-1"><Sparkline values={kpi.series} /></div>
    </div>
  )
}

function StatusRow({ tone, title, detail, action }: { tone: 'ok' | 'warn' | 'info' | 'wait'; title: string; detail?: string; action?: { label: string; onClick: () => void } }) {
  const icon = {
    ok: <FaCheckCircle className="w-4 h-4 text-green-400" aria-label="Tamam" />,
    warn: <FaExclamationTriangle className="w-4 h-4 text-amber-400" aria-label="Dikkat" />,
    info: <FaInfoCircle className="w-4 h-4 text-gray-400" aria-label="Bilgi" />,
    wait: <FaClock className="w-4 h-4 text-gray-400" aria-label="Bekliyor" />,
  }[tone]
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white">{title}</div>
        {detail && <div className="text-xs text-gray-400 mt-0.5">{detail}</div>}
      </div>
      {action && (
        <button type="button" onClick={action.onClick} className="text-sm text-purple-300 hover:text-purple-200 whitespace-nowrap">
          {action.label}
        </button>
      )}
    </div>
  )
}

export default function OverviewPanel({ name, onNavigate, onAddLink }: OverviewPanelProps) {
  const [range, setRange] = useState<'7d' | '30d'>('7d')
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [hello, setHello] = useState('')

  // Saat tarayıcıda hesaplanır (sunucuyla saat dilimi farkı hidrasyon uyarısı vermesin)
  useEffect(() => setHello(greeting(new Date().getHours())), [])

  useEffect(() => {
    let cancelled = false
    setError('')
    fetch(`/api/admin/overview?range=${range}`)
      .then(async (response) => {
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Özet alınamadı')
        if (!cancelled) setData(json)
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Özet alınamadı') })
    return () => { cancelled = true }
  }, [range])

  const firstName = (name || '').trim().split(/\s+/)[0]
  const days = range === '30d' ? 30 : 7
  const loading = !data || data.range !== days
  const maxClicks = Math.max(1, ...(data?.topLinks.map((link) => link.clicks) || []))

  const backupAgeDays = data?.status.lastBackup ? (Date.now() - new Date(data.status.lastBackup).getTime()) / 86_400_000 : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold text-white">{hello ? `${hello}${firstName ? `, ${firstName}` : ''}` : ' '}</p>
          <p className="text-sm text-gray-400 mt-1">Sayfanın son {days} günü.</p>
        </div>
        <div role="group" aria-label="Zaman aralığı" className="flex bg-dark-card border border-gray-800 rounded-lg p-1">
          {(['7d', '30d'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${range === value ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {value === '7d' ? '7 gün' : '30 gün'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 text-sm">{error}</p>}

      <div className={`grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 transition-opacity ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
        {data ? (
          <>
            <KpiCard label="Görüntülenme" kpi={data.kpis.views} range={days} />
            <KpiCard label="Tekil ziyaretçi" kpi={data.kpis.visitors} range={days} />
            <KpiCard
              label="Link tıklaması"
              kpi={data.kpis.clicks}
              range={days}
              note={data.engagementRate !== null ? `Etkileşim oranı %${data.engagementRate}` : undefined}
            />
            <KpiCard label="Yeni abone" kpi={data.kpis.subscribers} range={days} note={`Toplam ${formatNumber(data.kpis.subscribers.total || 0)} abone`} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <div key={i} className="h-[136px] bg-dark-card border border-gray-800 rounded-2xl animate-pulse" />)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <section className="lg:col-span-3 bg-dark-card border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">En çok tıklananlar</h2>
            <button type="button" onClick={() => onNavigate('analytics')} className="text-sm text-purple-300 hover:text-purple-200">Tüm analitik</button>
          </div>
          {data && data.topLinks.length === 0 && <p className="text-sm text-gray-400">Bu dönemde henüz tıklama yok.</p>}
          <ol className="space-y-3">
            {data?.topLinks.map((link) => (
              <li key={link.id}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-100 truncate">{link.title}</span>
                  <span className="text-gray-400 tabular-nums">{formatNumber(link.clicks)}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded mt-1.5">
                  <div className="h-1.5 rounded bg-purple-400" style={{ width: `${Math.max(2, (link.clicks / maxClicks) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="lg:col-span-2 bg-dark-card border border-gray-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Site durumu</h2>
          {data && (
            <>
              {data.status.lastBackup ? (
                <StatusRow
                  tone={backupAgeDays !== null && backupAgeDays > 2 ? 'warn' : 'ok'}
                  title={`Son yedek ${relativeTime(data.status.lastBackup)}`}
                  detail={new Date(data.status.lastBackup).toLocaleString('tr-TR')}
                />
              ) : (
                <StatusRow
                  tone="info"
                  title="Yedek kaydı yok"
                  detail="YunoHost kurulumunda her gece yedek alınır. Ayarlar → Otomatik işler'den otomatik yedeği de açabilirsin."
                  action={{ label: 'Ayarlar', onClick: () => onNavigate('settings') }}
                />
              )}
              {data.status.maintenance && (
                <StatusRow
                  tone="warn"
                  title="Bakım modu açık"
                  detail="Ziyaretçiler siteyi değil, bakım mesajını görüyor."
                  action={{ label: 'Kapat', onClick: () => onNavigate('settings') }}
                />
              )}
              {data.status.unreadMessages > 0 && (
                <StatusRow
                  tone="warn"
                  title={`${data.status.unreadMessages} okunmamış mesaj`}
                  action={{ label: 'Oku', onClick: () => onNavigate('messages') }}
                />
              )}
              {data.status.broken.length > 0 && (
                <StatusRow
                  tone="warn"
                  title={`${data.status.broken.length} linke ulaşılamıyor`}
                  detail={data.status.broken.slice(0, 3).map((title) => `"${title}"`).join(', ') + (data.status.broken.length > 3 ? '...' : '')}
                  action={{ label: 'Göster', onClick: () => onNavigate('links') }}
                />
              )}
              {data.status.smtpConfigured ? (
                <StatusRow tone="ok" title="E-posta gönderimi ayarlı" />
              ) : (
                <StatusRow
                  tone="warn"
                  title="E-posta ayarlı değil"
                  detail="Bülten gönderilemez; iletişim mesajları yalnızca panelde (Mesajlar) birikir."
                  action={{ label: 'Ayarla', onClick: () => onNavigate('settings') }}
                />
              )}
              {data.status.nextUpcoming && (
                <StatusRow
                  tone="wait"
                  title={`${data.status.upcoming} zamanlanmış link bekliyor`}
                  detail={`"${data.status.nextUpcoming.title}" ${new Date(data.status.nextUpcoming.startDate).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} tarihinde yayına girer.`}
                />
              )}
              {data.status.expired > 0 && (
                <StatusRow
                  tone="warn"
                  title={`${data.status.expired} linkin süresi doldu`}
                  detail="Sitede görünmüyorlar. Kaldırabilir ya da tarihini uzatabilirsin."
                  action={{ label: 'Göster', onClick: () => onNavigate('links') }}
                />
              )}
              <StatusRow tone="info" title={`Sürüm ${data.status.version}`} />
            </>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAddLink} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium">
          <FaPlus className="w-3.5 h-3.5" /> Link ekle
        </button>
        {([['profile', 'Profili düzenle'], ['theme', 'Görünümü değiştir'], ['qr', 'QR kodu al']] as const).map(([tab, label]) => (
          <button key={tab} type="button" onClick={() => onNavigate(tab)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-card border border-gray-800 hover:border-gray-700 text-gray-200 text-sm font-medium">
            {label} <FaArrowRight className="w-3 h-3 text-gray-500" />
          </button>
        ))}
      </div>
    </div>
  )
}
