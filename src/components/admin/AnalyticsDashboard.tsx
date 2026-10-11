'use client'

import { useState, useEffect } from 'react'
import { FaChartLine, FaMousePointer, FaLink, FaCrown, FaGlobe, FaDesktop, FaCalendar, FaInfoCircle, FaEye, FaUsers, FaPercent, FaBullhorn, FaClock } from 'react-icons/fa'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import SelectMenu from './SelectMenu'

interface AnalyticsProps {
  links: any[]
}

const COLORS = ['#a855f7', '#ec4899', '#8b5cf6', '#d946ef', '#c026d3', '#9333ea', '#a21caf', '#7c3aed']

// Önceki aynı uzunluktaki döneme göre değişim; yön renkle birlikte metinle de yazılır
function changeText(current: number, previous: number | null | undefined, days: number) {
  if (previous === null || previous === undefined) return ''
  if (previous === 0) return current === 0 ? '' : 'Önceki dönemde veri yok'
  const percent = Math.round(((current - previous) / previous) * 100)
  if (percent === 0) return `Önceki ${days} günle aynı`
  return `Önceki ${days} güne göre %${Math.abs(percent)} ${percent > 0 ? 'artış' : 'düşüş'}`
}

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

// Haftanın günü × saat ısı haritası. Sunucu UTC sayar; burada tarayıcının saat dilimine kaydırılır.
// shortcut: tek bir kaydırma kullanılır (yaz saati değişimi öncesi kayıtlar 1 saat kayabilir); gerekirse sunucuda saat dilimiyle hesapla
function Heatmap({ data }: { data: number[][] }) {
  const offsetHours = Math.round(-new Date().getTimezoneOffset() / 60)
  const local = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  data.forEach((hours, utcDay) => hours.forEach((count, utcHour) => {
    const total = utcDay * 24 + utcHour + offsetHours
    const shifted = ((total % 168) + 168) % 168
    // JS'de pazar 0; tabloda pazartesi ilk satır
    local[(Math.floor(shifted / 24) + 6) % 7][shifted % 24] += count
  }))
  const max = Math.max(1, ...local.flat())
  const busiest = local.flatMap((hours, day) => hours.map((count, hour) => ({ day, hour, count }))).sort((a, b) => b.count - a.count)[0]

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[10px] text-gray-500" aria-label="Gün ve saate göre görüntülenme">
          <thead>
            <tr>
              <th />
              {Array.from({ length: 24 }, (_, hour) => (
                <th key={hour} scope="col" className="font-normal w-5">{hour % 3 === 0 ? hour : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {local.map((hours, day) => (
              <tr key={day}>
                <th scope="row" className="font-normal pr-1 text-right">{WEEKDAYS[day]}</th>
                {hours.map((count, hour) => (
                  <td
                    key={hour}
                    title={`${WEEKDAYS[day]} ${String(hour).padStart(2, '0')}:00 · ${count} görüntülenme`}
                    className="w-5 h-5 rounded-[4px]"
                    style={{ backgroundColor: count ? `rgba(168, 85, 247, ${0.15 + 0.85 * (count / max)})` : 'rgba(255,255,255,0.04)' }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {busiest && busiest.count > 0 && (
        <p className="text-sm text-gray-400 mt-3">
          En yoğun zaman: <span className="text-white">{WEEKDAYS[busiest.day]} {String(busiest.hour).padStart(2, '0')}:00–{String((busiest.hour + 1) % 24).padStart(2, '0')}:00</span>. Paylaşımlarını bu saatlere denk getirebilirsin.
        </p>
      )}
    </div>
  )
}

export default function AnalyticsDashboard({ links }: AnalyticsProps) {
  const [timeRange, setTimeRange] = useState('7d') // 7d, 30d, all
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // Link detayı: seçiliyse tıklama verileri yalnızca o link için
  const [linkId, setLinkId] = useState('')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange, linkId])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/analytics?range=${timeRange}${linkId ? `&linkId=${linkId}` : ''}`)
      const data = await response.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Analytics fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Toplam istatistikler
  const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0)
  const activeLinks = links.filter(l => l.enabled).length
  const passwordProtected = links.filter(l => l.password).length
  const scheduledLinks = links.filter(l => l.startDate || l.endDate).length

  // Fallback function for demo data - önce tanımla
  const getLast7Days = () => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dayName = date.toLocaleDateString('tr-TR', { weekday: 'short' })
      days.push({
        day: dayName,
        clicks: 0
      })
    }
    return days
  }

  // Link başına tıklama verileri (En popüler 10)
  const topLinks = [...links]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10)
    .map(link => ({
      name: link.title.length > 20 ? link.title.substring(0, 20) + '...' : link.title,
      clicks: link.clicks
    }))

  // Son 7 gün trend - API'den gelen veriyi dönüştür
  const trendData = analytics?.dailyClicks 
    ? analytics.dailyClicks.map((item: any) => ({
        day: new Date(item.date).toLocaleDateString('tr-TR', { 
          month: 'short', 
          day: 'numeric' 
        }),
        clicks: item.count,
        views: item.views || 0
      }))
    : getLast7Days()

  // Profil görüntülenme istatistikleri (seçili zaman aralığı için)
  const views = analytics?.views || 0
  const uniqueVisitors = analytics?.uniqueVisitors || 0
  const engagedVisitors = analytics?.engagedVisitors || 0
  const engagementRate = uniqueVisitors > 0 ? Math.round((engagedVisitors / uniqueVisitors) * 1000) / 10 : 0
  const campaigns: { name: string; views: number; clicks: number }[] = analytics?.campaigns || []
  const previous: { views: number; uniqueVisitors: number; clicks: number } | null = analytics?.previous || null
  const rangeDays = timeRange === '30d' ? 30 : 7
  const rangeClicks = analytics?.rangeClicks || 0
  const selectedLink = links.find((link) => String(link.id) === linkId)

  // Grafik başlığı
  const getTrendTitle = () => {
    if (timeRange === '7d') return 'Son 7 Gün Trend'
    if (timeRange === '30d') return 'Son 30 Gün Trend'
    return 'Tüm Zamanlar Trend'
  }

  // Cihaz ve tarayıcı istatistikleri - API'den gelen object'i array'e çevir
  const deviceStats = analytics?.devices 
    ? Object.entries(analytics.devices).map(([name, value]) => ({ name, value }))
    : []
  const browserStats = analytics?.browsers
    ? Object.entries(analytics.browsers).map(([name, value]) => ({ name, value }))
    : []
  const countryStats = analytics?.countries
    ? Object.entries(analytics.countries).map(([name, value]) => ({ name, value }))
    : []
  const referrerStats = analytics?.referrers
    ? Object.entries(analytics.referrers).slice(0, 10).map(([name, value]) => ({ name, value }))
    : []

  // Eğer gerçek veri yoksa uyarı göster
  const hasRealData = analytics && analytics.dailyClicks && analytics.dailyClicks.length > 0

  // Kategori dağılımı
  const categoryData = links.reduce((acc: any[], link) => {
    const category = link.category || 'Diğer'
    const existing = acc.find(c => c.name === category)
    if (existing) {
      existing.value += link.clicks
    } else {
      acc.push({ name: category, value: link.clicks })
    }
    return acc
  }, []).filter(c => c.value > 0)

  if (loading) {
    return (
      <div className="bg-dark-card border border-gray-800 rounded-2xl p-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Yükleniyor...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Veri Uyarısı */}
      {!hasRealData && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <FaInfoCircle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h4 className="text-yellow-400 font-semibold mb-1">Analitik Verisi Bulunamadı</h4>
              <p className="text-sm text-gray-300">
                Henüz detaylı analytics verisi toplanmamış. Linklere tıklanmaya başlandıkça konum, cihaz ve tarayıcı bilgileri burada görünecek.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                💡 İpucu: Analytics toplamak için linkteki bir butona tıklayın veya kısa link kullanın.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <FaChartLine className="text-purple-400" />
            Link Performansı
          </h2>
          <p className="text-gray-400 mt-1">Tıklamalar, ziyaretçiler ve trafik kaynakları</p>
        </div>
        
        {/* Time Range Selector */}
        <div className="flex flex-wrap gap-2">
          <div className="w-full sm:w-56">
            <SelectMenu
              ariaLabel="Link"
              value={linkId}
              onChange={setLinkId}
              options={[{ value: '', label: 'Tüm linkler' }, ...links.map((link) => ({ value: String(link.id), label: link.title }))]}
              className="w-full px-3 py-2 bg-dark-card border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          {[
            { value: '7d', label: 'Son 7 Gün' },
            { value: '30d', label: 'Son 30 Gün' },
            { value: 'all', label: 'Tüm Zamanlar' }
          ].map(range => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range.value
                  ? 'bg-purple-500 text-white'
                  : 'bg-dark-card text-gray-400 hover:bg-gray-700'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {selectedLink && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-purple-500/10 border border-purple-500/30 rounded-xl px-4 py-3 text-sm">
          <span className="text-purple-100">
            <strong>{selectedLink.title}</strong> linkinin detayı: tıklama, cihaz, ülke ve kaynak verileri yalnızca bu link için. Görüntülenmeler profil geneli.
          </span>
          <button type="button" onClick={() => setLinkId('')} className="text-purple-300 hover:text-purple-200 underline">Tüm linklere dön</button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Toplam Tıklama</p>
              <p className="text-3xl font-bold text-white">{totalClicks.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-purple-500/20 rounded-xl">
              <FaMousePointer className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Aktif Linkler</p>
              <p className="text-3xl font-bold text-white">{activeLinks}</p>
            </div>
            <div className="p-4 bg-blue-500/20 rounded-xl">
              <FaLink className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">VIP Linkler</p>
              <p className="text-3xl font-bold text-white">{passwordProtected}</p>
            </div>
            <div className="p-4 bg-amber-500/20 rounded-xl">
              <FaCrown className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Zamanlanmış</p>
              <p className="text-3xl font-bold text-white">{scheduledLinks}</p>
            </div>
            <div className="p-4 bg-green-500/20 rounded-xl">
              <FaCalendar className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Görüntülenme istatistikleri */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Profil Görüntülenme</p>
              <p className="text-3xl font-bold text-white">{views.toLocaleString('tr-TR')}</p>
              {changeText(views, previous?.views, rangeDays) && <p className="text-xs text-gray-500 mt-1">{changeText(views, previous?.views, rangeDays)}</p>}
            </div>
            <div className="p-4 bg-sky-500/20 rounded-xl">
              <FaEye className="w-6 h-6 text-sky-400" />
            </div>
          </div>
        </div>
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Tekil Ziyaretçi</p>
              <p className="text-3xl font-bold text-white">{uniqueVisitors.toLocaleString('tr-TR')}</p>
              {changeText(uniqueVisitors, previous?.uniqueVisitors, rangeDays) && <p className="text-xs text-gray-500 mt-1">{changeText(uniqueVisitors, previous?.uniqueVisitors, rangeDays)}</p>}
            </div>
            <div className="p-4 bg-indigo-500/20 rounded-xl">
              <FaUsers className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
        </div>
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">{selectedLink ? 'Bu linkin tıklaması' : 'Dönemdeki Tıklama'}</p>
              <p className="text-3xl font-bold text-white">{rangeClicks.toLocaleString('tr-TR')}</p>
              {changeText(rangeClicks, previous?.clicks, rangeDays) && <p className="text-xs text-gray-500 mt-1">{changeText(rangeClicks, previous?.clicks, rangeDays)}</p>}
            </div>
            <div className="p-4 bg-purple-500/20 rounded-xl">
              <FaMousePointer className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Etkileşim Oranı</p>
              <p className="text-3xl font-bold text-white">%{engagementRate.toLocaleString('tr-TR')}</p>
              <p className="text-xs text-gray-500 mt-1">{uniqueVisitors} ziyaretçiden {engagedVisitors} kişi en az bir linke tıkladı</p>
            </div>
            <div className="p-4 bg-emerald-500/20 rounded-xl">
              <FaPercent className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">{getTrendTitle()}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="day" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend wrapperStyle={{ color: '#9ca3af' }} />
              <Line type="monotone" dataKey="views" name="Görüntülenme" stroke="#38bdf8" strokeWidth={2} dot={{ fill: '#38bdf8', r: 3 }} />
              <Line type="monotone" dataKey="clicks" name="Tıklama" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Kategori Dağılımı</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Links Table */}
      <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">En Popüler Linkler</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={topLinks} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" stroke="#9ca3af" />
            <YAxis dataKey="name" type="category" width={150} stroke="#9ca3af" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
            />
            <Bar dataKey="clicks" fill="#a855f7" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Advanced Analytics - Device, Browser, Country */}
      {hasRealData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Device Stats */}
            <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <FaDesktop className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Cihaz Dağılımı</h3>
              </div>
              {deviceStats.length > 0 ? (
                <div className="space-y-3">
                  {deviceStats.map((stat: any, index: number) => (
                    <div key={index} className="flex items-center justify-between bg-dark-bg border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <span className="text-gray-300 text-sm capitalize">{stat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-700 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full" 
                            style={{ 
                              width: `${(stat.value / deviceStats.reduce((sum: number, s: any) => sum + s.value, 0)) * 100}%`,
                              backgroundColor: COLORS[index % COLORS.length]
                            }}
                          ></div>
                        </div>
                        <span className="text-purple-400 font-semibold text-sm w-8 text-right">{stat.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Veri yok</p>
              )}
            </div>

            {/* Browser Stats */}
            <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <FaGlobe className="w-5 h-5 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Tarayıcı Dağılımı</h3>
              </div>
              {browserStats.length > 0 ? (
                <div className="space-y-3">
                  {browserStats.map((stat: any, index: number) => (
                    <div key={index} className="flex items-center justify-between bg-dark-bg border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <span className="text-gray-300 text-sm">{stat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-700 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full" 
                            style={{ 
                              width: `${(stat.value / browserStats.reduce((sum: number, s: any) => sum + s.value, 0)) * 100}%`,
                              backgroundColor: COLORS[index % COLORS.length]
                            }}
                          ></div>
                        </div>
                        <span className="text-purple-400 font-semibold text-sm w-8 text-right">{stat.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Veri yok</p>
              )}
            </div>

            {/* Country Stats */}
            <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <FaGlobe className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Ülke Dağılımı</h3>
              </div>
              {countryStats.length > 0 ? (
                <div className="space-y-2">
                  {countryStats.slice(0, 5).map((stat: any, index: number) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-gray-300 text-sm">{stat.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500" 
                            style={{ 
                              width: `${(stat.value / Math.max(...countryStats.map((s: any) => s.value))) * 100}%` 
                            }}
                          />
                        </div>
                        <span className="text-white font-semibold text-sm w-8 text-right">{stat.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Veri yok</p>
              )}
            </div>
          </div>

          {/* Referrer Stats */}
          {referrerStats.length > 0 && (
            <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Trafik Kaynakları</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {referrerStats.map((stat: any, index: number) => (
                  <div key={index} className="bg-dark-bg border border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 text-sm truncate flex-1">
                        {stat.name === 'direct' ? '🔗 Direkt Erişim' : `🌐 ${stat.name}`}
                      </span>
                      <span className="text-purple-400 font-semibold ml-2">{stat.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Gün × saat ısı haritası */}
      {analytics?.heatmap && views > 0 && (
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <FaClock className="text-purple-400" /> Ziyaretçiler ne zaman geliyor?
          </h3>
          <p className="text-sm text-gray-400 mb-4">Profil görüntülenmelerinin haftanın günü ve saate göre dağılımı (senin saat diliminde).</p>
          <Heatmap data={analytics.heatmap} />
        </div>
      )}

      {/* UTM kampanyaları */}
      <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <FaBullhorn className="text-purple-400" /> Kampanyalar (UTM)
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Paylaştığınız linke <code className="text-purple-300 break-all">?utm_source=instagram&amp;utm_campaign=ekim</code> gibi parametreler eklerseniz hangi kampanyanın ne kadar ziyaret ve tıklama getirdiğini burada görürsünüz.
        </p>
        {campaigns.length === 0 ? (
          <p className="text-sm text-gray-500">Bu aralıkta UTM parametreli ziyaret yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-2 pr-4 font-medium">Kaynak / Ortam / Kampanya</th>
                  <th className="py-2 pr-4 font-medium text-right">Görüntülenme</th>
                  <th className="py-2 font-medium text-right">Tıklama</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 20).map((campaign) => (
                  <tr key={campaign.name} className="border-b border-gray-800/50 text-gray-300">
                    <td className="py-2 pr-4 break-all">{campaign.name}</td>
                    <td className="py-2 pr-4 text-right">{campaign.views}</td>
                    <td className="py-2 text-right">{campaign.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Analytics Button */}
      {hasRealData && (
        <div className="bg-dark-card border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Veri Dışa Aktarma</h3>
              <p className="text-gray-400 text-sm">
                Tüm analytics verilerini CSV formatında indir (Excel&apos;de açılabilir)
              </p>
            </div>
            <a
              href="/api/admin/export-analytics"
              download
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-xl transition-all"
            >
              <FaInfoCircle className="w-4 h-4" />
              <span>CSV İndir</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
