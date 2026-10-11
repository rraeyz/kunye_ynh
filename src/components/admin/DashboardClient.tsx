'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { FaMobileAlt, FaSignOutAlt, FaSearch, FaExternalLinkAlt, FaPlus, FaEllipsisH, FaCopy, FaCheck, FaTimes, FaHome, FaLink, FaChartLine } from 'react-icons/fa'
import ProfileEditor from './ProfileEditor'
import LinksEditor from './LinksEditor'
import QRCodeGenerator from './QRCodeGenerator'
import ThemeEditor from './ThemeEditor'
import SubscriberManagement from './SubscriberManagement'
import SettingsPanel from './SettingsPanel'
import CustomEmailPanel from './CustomEmailPanel'
import LivePreview from './LivePreview'
import OverviewPanel from './OverviewPanel'
import MessagesPanel from './MessagesPanel'
import UndoControls from './UndoControls'
import { ADMIN_SAVED_EVENT, installAdminSaveEvents } from './adminEvents'
import CommandPalette, { type PaletteCommand } from './CommandPalette'
import { ADMIN_NAV, NAV_GROUPS, isAdminTab, navItem, type AdminTab } from './adminNav'

// Grafik kütüphanesi (recharts) büyük: yalnızca Analitik bölümü açılınca indirilir
const AnalyticsDashboard = dynamic(() => import('./AnalyticsDashboard'), {
  ssr: false,
  loading: () => <div className="text-gray-400 text-sm py-12 text-center">Yükleniyor...</div>,
})

interface DashboardClientProps {
  initialProfile: any
  initialLinks: any[]
}

const TAB_STORAGE_KEY = 'adminTab'
const PREVIEW_STORAGE_KEY = 'dashboardPreview'
// Önizleme yan panel olarak bu genişlikten itibaren açılır; daha darında tam ekran katman olur
const WIDE_SCREEN = '(min-width: 1280px)'

function Avatar({ src, name, size }: { src?: string; name: string; size: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR') || '?'
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <span className="rounded-full bg-purple-500/20 text-purple-200 font-semibold flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  )
}

export default function DashboardClient({ initialProfile, initialLinks }: DashboardClientProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [showPreview, setShowPreview] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [addLinkRequested, setAddLinkRequested] = useState(false)
  const [host, setHost] = useState('')
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const [shortcut, setShortcut] = useState('Ctrl K')
  const [unread, setUnread] = useState(0)
  const router = useRouter()

  const name: string = initialProfile?.name || ''
  const current = navItem(activeTab)

  // Açılışta: adres çubuğundaki #bölüm, yoksa son açık bölüm
  useEffect(() => {
    setHost(window.location.host)
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘K')
    try {
      const fromHash = window.location.hash.slice(1)
      const stored = localStorage.getItem(TAB_STORAGE_KEY)
      if (isAdminTab(fromHash)) setActiveTab(fromHash)
      else if (isAdminTab(stored)) setActiveTab(stored)
      if (localStorage.getItem(PREVIEW_STORAGE_KEY) === '1' && window.matchMedia(WIDE_SCREEN).matches) {
        setShowPreview(true)
      }
    } catch {
      // localStorage kullanılamıyor
    }
  }, [])

  const goTo = useCallback((tab: AdminTab) => {
    setActiveTab(tab)
    setMoreOpen(false)
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab)
      window.history.replaceState(null, '', `#${tab}`)
    } catch {}
    window.scrollTo({ top: 0 })
  }, [])

  const togglePreview = useCallback((open: boolean) => {
    setShowPreview(open)
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, open ? '1' : '0')
    } catch {}
  }, [])

  const addLink = useCallback(() => {
    setAddLinkRequested(true)
    goTo('links')
  }, [goTo])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/`)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    setTimeout(() => setCopied(''), 2000)
  }, [])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }, [router])

  // Panelden yapılan kayıtlar 'admin:saved' olayı yayınlar (önizleme, geri al, mesaj rozeti dinler)
  useEffect(() => installAdminSaveEvents(), [])

  // Okunmamış mesaj sayısı (menüdeki rozet)
  const loadUnread = useCallback(() => {
    fetch('/api/admin/messages?unread=1')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setUnread(data.unread))
      .catch(() => {})
  }, [])
  useEffect(() => {
    loadUnread()
    window.addEventListener(ADMIN_SAVED_EVENT, loadUnread)
    return () => window.removeEventListener(ADMIN_SAVED_EVENT, loadUnread)
  }, [loadUnread])

  // Ctrl/⌘+K: komut paleti. Esc: açık alt menüyü kapat
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      } else if (event.key === 'Escape') {
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const commands = useMemo<PaletteCommand[]>(() => [
    ...ADMIN_NAV.map((item) => ({
      id: `go-${item.id}`,
      label: item.label,
      hint: 'Bölüm',
      keywords: item.keywords,
      icon: item.icon,
      run: () => goTo(item.id),
    })),
    { id: 'add-link', label: 'Yeni link veya blok ekle', hint: 'İşlem', keywords: 'ekle yeni', icon: FaPlus, run: addLink },
    { id: 'preview', label: showPreview ? 'Önizlemeyi kapat' : 'Önizlemeyi aç', hint: 'İşlem', keywords: 'telefon canlı', icon: FaMobileAlt, run: () => togglePreview(!showPreview) },
    { id: 'copy', label: 'Site linkini kopyala', hint: 'İşlem', keywords: 'paylaş adres', icon: FaCopy, run: copyLink },
    { id: 'open-site', label: 'Siteyi yeni sekmede aç', hint: 'İşlem', keywords: 'görüntüle', icon: FaExternalLinkAlt, run: () => window.open('/', '_blank', 'noopener') },
    { id: 'logout', label: 'Çıkış yap', hint: 'İşlem', keywords: 'oturum kapat', icon: FaSignOutAlt, run: handleLogout },
  ], [goTo, addLink, showPreview, togglePreview, copyLink, handleLogout])

  const navButtonClass = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-purple-500/15 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
    }`

  const renderNavButton = (item: (typeof ADMIN_NAV)[number]) => {
    const Icon = item.icon
    const active = activeTab === item.id
    return (
      <button key={item.id} type="button" onClick={() => goTo(item.id)} aria-current={active ? 'page' : undefined} className={navButtonClass(active)}>
        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-purple-300' : ''}`} aria-hidden="true" />
        <span>{item.label}</span>
        {item.id === 'messages' && unread > 0 && (
          // Sayı Mesajlar bölümünde ve Genel Bakış'ta da yazılı; düğmenin adı "Mesajlar" kalsın
          <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-purple-500 text-white text-[11px] font-semibold flex items-center justify-center" aria-hidden="true">
            {unread}
          </span>
        )}
      </button>
    )
  }

  // Telefondaki alt menü: en sık kullanılanlar + "Daha fazla"
  const mobileTabs: Array<{ id: AdminTab; label: string; icon: typeof FaHome }> = [
    { id: 'overview', label: 'Özet', icon: FaHome },
    { id: 'links', label: 'Linkler', icon: FaLink },
  ]
  const mobileTabsRight: Array<{ id: AdminTab; label: string; icon: typeof FaHome }> = [
    { id: 'analytics', label: 'Analitik', icon: FaChartLine },
  ]
  const inMore = !['overview', 'links', 'analytics'].includes(activeTab)

  const renderMobileTab = (tab: { id: AdminTab; label: string; icon: typeof FaHome }) => {
    const Icon = tab.icon
    const active = activeTab === tab.id
    return (
      <button key={tab.id} type="button" onClick={() => goTo(tab.id)} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 text-[11px] font-medium ${active ? 'text-white' : 'text-gray-400'}`}>
        <Icon className={`w-5 h-5 ${active ? 'text-purple-400' : ''}`} aria-hidden="true" />
        {tab.label}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-dark-bg text-gray-100 lg:flex">
      {/* Sol menü (geniş ekran) */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-[#0f0f11] border-r border-gray-800/80 px-3 py-5 overflow-y-auto">
        <div className="flex items-center gap-3 px-2 pb-5">
          <Avatar src={initialProfile?.imageUrl} name={name} size={40} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{name || 'Profil'}</div>
            <a href="/" target="_blank" rel="noopener noreferrer" className="block text-xs text-gray-400 hover:text-purple-300 truncate">{host || ' '}</a>
          </div>
        </div>

        <button type="button" onClick={() => setPaletteOpen(true)} className="flex items-center justify-between gap-2 px-3 h-9 mb-4 rounded-lg border border-gray-800 bg-dark-card text-sm text-gray-400 hover:text-white hover:border-gray-700">
          <span className="flex items-center gap-2"><FaSearch className="w-3.5 h-3.5" aria-hidden="true" />Ara</span>
          <kbd className="text-[11px] border border-gray-700 rounded px-1.5">{shortcut}</kbd>
        </button>

        <nav aria-label="Admin menüsü" className="space-y-1">
          {ADMIN_NAV.filter((item) => !item.group).map(renderNavButton)}
          {NAV_GROUPS.map((group) => (
            <div key={group} className="pt-4">
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{group}</div>
              <div className="space-y-1">{ADMIN_NAV.filter((item) => item.group === group).map(renderNavButton)}</div>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-6 space-y-1">
          <a href="/" target="_blank" rel="noopener noreferrer" className={navButtonClass(false)}>
            <FaExternalLinkAlt className="w-4 h-4" aria-hidden="true" />Siteyi aç
          </a>
          <button type="button" onClick={handleLogout} className={`${navButtonClass(false)} hover:!text-red-300`}>
            <FaSignOutAlt className="w-4 h-4" aria-hidden="true" />Çıkış yap
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 bg-dark-bg/90 backdrop-blur border-b border-gray-800/80">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 h-16">
            <h1 className="text-lg sm:text-xl font-semibold text-white truncate">{current.label}</h1>
            <div className="flex items-center gap-2">
              <UndoControls />
              <button type="button" onClick={() => setPaletteOpen(true)} className="lg:hidden p-2.5 rounded-lg text-gray-300 hover:bg-white/5" aria-label="Ara">
                <FaSearch className="w-4 h-4" />
              </button>
              <button type="button" onClick={copyLink} className="hidden sm:inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-gray-800 bg-dark-card text-sm text-gray-200 hover:border-gray-700" aria-live="polite">
                {copied === 'ok' ? <FaCheck className="w-3.5 h-3.5 text-green-400" /> : <FaCopy className="w-3.5 h-3.5" />}
                {copied === 'ok' ? 'Kopyalandı' : copied === 'fail' ? 'Kopyalanamadı' : 'Linki kopyala'}
              </button>
              <button
                type="button"
                onClick={() => togglePreview(!showPreview)}
                aria-pressed={showPreview}
                aria-label="Önizleme"
                className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border text-sm transition-colors ${showPreview ? 'bg-purple-500/15 border-purple-500/40 text-purple-100' : 'border-gray-800 bg-dark-card text-gray-200 hover:border-gray-700'}`}
              >
                <FaMobileAlt className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Önizleme</span>
              </button>
            </div>
          </div>
        </header>

        <main className={`flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-10 ${showPreview ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_375px] xl:gap-8 xl:items-start' : ''}`}>
          <div className="min-w-0">
            {activeTab === 'overview' && <OverviewPanel name={name} onNavigate={goTo} onAddLink={addLink} />}
            {activeTab === 'profile' && <ProfileEditor initialProfile={initialProfile} />}
            {activeTab === 'links' && (
              <LinksEditor initialLinks={initialLinks} autoAdd={addLinkRequested} onAutoAddHandled={() => setAddLinkRequested(false)} />
            )}
            {activeTab === 'theme' && <ThemeEditor initialProfile={initialProfile} />}
            {activeTab === 'analytics' && <AnalyticsDashboard links={initialLinks} />}
            {activeTab === 'messages' && <MessagesPanel onChange={loadUnread} />}
            {activeTab === 'subscribers' && <SubscriberManagement />}
            {activeTab === 'custom-email' && <CustomEmailPanel onNavigate={goTo} />}
            {activeTab === 'qr' && (
              <QRCodeGenerator url={host ? `${window.location.origin}` : ''} title="Link Tree QR Kod" />
            )}
            {activeTab === 'settings' && <SettingsPanel />}
          </div>
          {showPreview && <LivePreview onClose={() => togglePreview(false)} />}
        </main>
      </div>

      {/* Alt menü (telefon / tablet) */}
      <nav aria-label="Alt menü" className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0f0f11]/95 backdrop-blur border-t border-gray-800 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {mobileTabs.map(renderMobileTab)}
          <button type="button" onClick={addLink} aria-label="Yeni ekle" className="w-12 h-12 -mt-5 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-900/40">
            <FaPlus className="w-5 h-5" />
          </button>
          {mobileTabsRight.map(renderMobileTab)}
          <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 text-[11px] font-medium ${inMore ? 'text-white' : 'text-gray-400'}`}>
            <FaEllipsisH className={`w-5 h-5 ${inMore ? 'text-purple-400' : ''}`} aria-hidden="true" />
            Daha fazla
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[65] bg-black/60" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tüm bölümler"
            className="absolute bottom-0 inset-x-0 bg-[#141416] border-t border-gray-800 rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={initialProfile?.imageUrl} name={name} size={36} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{name || 'Profil'}</div>
                  <div className="text-xs text-gray-400 truncate">{host}</div>
                </div>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} className="p-2.5 rounded-lg text-gray-400 hover:text-white" aria-label="Kapat">
                <FaTimes className="w-4 h-4" />
              </button>
            </div>
            {NAV_GROUPS.map((group) => (
              <div key={group} className="mt-3">
                <div className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{group}</div>
                <div className="grid grid-cols-3 gap-2">
                  {ADMIN_NAV.filter((item) => item.group === group).map((item) => {
                    const Icon = item.icon
                    const active = activeTab === item.id
                    return (
                      <button key={item.id} type="button" onClick={() => goTo(item.id)} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-2 p-3 min-h-[76px] rounded-xl border text-xs font-medium text-center ${active ? 'border-purple-500/50 bg-purple-500/10 text-white' : 'border-gray-800 bg-dark-card text-gray-300'}`}>
                        <Icon className="w-5 h-5" aria-hidden="true" />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button type="button" onClick={copyLink} className="flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-800 bg-dark-card text-sm text-gray-200">
                {copied === 'ok' ? <FaCheck className="w-3.5 h-3.5 text-green-400" /> : <FaCopy className="w-3.5 h-3.5" />}
                {copied === 'ok' ? 'Kopyalandı' : 'Linki kopyala'}
              </button>
              <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-800 bg-dark-card text-sm text-gray-200">
                <FaExternalLinkAlt className="w-3.5 h-3.5" />Siteyi aç
              </a>
            </div>
            <button type="button" onClick={handleLogout} className="w-full mt-2 flex items-center justify-center gap-2 h-11 rounded-xl bg-red-500/10 text-sm text-red-300">
              <FaSignOutAlt className="w-3.5 h-3.5" />Çıkış yap
            </button>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  )
}
