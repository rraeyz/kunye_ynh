'use client'

import { useCallback, useEffect, useState } from 'react'
import { FaRobot, FaBell, FaDownload } from 'react-icons/fa'

// Ayarlar → Otomatik işler ve bildirimler. İşler günde bir kez sunucuda kendiliğinden çalışır;
// "Şimdi" düğmeleri beklemeden çalıştırır.

type Toggle = 'autoBackupEnabled' | 'linkHealthEnabled' | 'weeklyReportEnabled'
type Job = 'auto-backup' | 'link-health' | 'weekly-report' | 'test-notification' | 'cleanup-uploads' | 'restore-trash'

interface JobsInfo {
  lastRuns: Record<string, string | null>
  autoBackups: Array<{ name: string; size: number; createdAt: string }>
  keep: number
  unusedUploads: string[]
  trashedUploads: number
}

const inputClass = 'w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors'
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : 'henüz çalışmadı')
const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? 'bg-purple-500' : 'bg-gray-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export default function AutomationPanel() {
  const [settings, setSettings] = useState<Record<Toggle, boolean>>({ autoBackupEnabled: false, linkHealthEnabled: true, weeklyReportEnabled: false })
  const [jobs, setJobs] = useState<JobsInfo | null>(null)
  const [ntfyUrl, setNtfyUrl] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [hasTelegramToken, setHasTelegramToken] = useState(false)
  const [telegramChatId, setTelegramChatId] = useState('')
  const [running, setRunning] = useState<Job | ''>('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadJobs = useCallback(() => {
    fetch('/api/admin/jobs').then((r) => (r.ok ? r.json() : null)).then((data) => data && setJobs(data)).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((profile) => {
      if (!profile) return
      setSettings({
        autoBackupEnabled: !!profile.autoBackupEnabled,
        linkHealthEnabled: profile.linkHealthEnabled !== false,
        weeklyReportEnabled: !!profile.weeklyReportEnabled,
      })
      setNtfyUrl(profile.notifyNtfyUrl || '')
      setTelegramChatId(profile.notifyTelegramChatId || '')
      setHasTelegramToken(!!profile.hasTelegramToken)
    }).catch(() => {})
    loadJobs()
  }, [loadJobs])

  const save = async (data: Record<string, unknown>, okText: string) => {
    setMessage(null)
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage({ ok: false, text: result.error || 'Kaydedilemedi' })
      return null
    }
    setMessage({ ok: true, text: okText })
    return result
  }

  const toggle = async (key: Toggle, value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }))
    if (!(await save({ [key]: value }, value ? 'Açıldı' : 'Kapatıldı'))) setSettings((current) => ({ ...current, [key]: !value }))
  }

  const saveNotifications = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await save({ notifyNtfyUrl: ntfyUrl, notifyTelegramChatId: telegramChatId, notifyTelegramToken: telegramToken }, 'Bildirim ayarları kaydedildi')
    if (result) {
      setTelegramToken('')
      setHasTelegramToken(!!result.hasTelegramToken)
    }
  }

  const run = async (job: Job) => {
    setRunning(job)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job }),
      })
      const data = await response.json().catch(() => ({}))
      setMessage({ ok: response.ok, text: data.message || data.error || 'İşlem başarısız' })
      loadJobs()
    } catch {
      setMessage({ ok: false, text: 'İşlem başarısız' })
    } finally {
      setRunning('')
    }
  }

  const runButton = (job: Job, label: string) => (
    <button type="button" onClick={() => run(job)} disabled={!!running} className="px-3 h-9 rounded-lg border border-gray-700 text-gray-200 text-sm hover:border-gray-600 disabled:opacity-50 whitespace-nowrap">
      {running === job ? 'Çalışıyor...' : label}
    </button>
  )

  const rows: Array<{ key: Toggle; title: string; detail: string; job: Job; jobLabel: string; last: string }> = [
    {
      key: 'autoBackupEnabled',
      title: 'Otomatik yedek',
      detail: `Her gün tam yedeği sunucuya kaydeder, son ${jobs?.keep ?? 7} günü tutar. Aşağıdan indirip "Yedekten yükle" ile geri yükleyebilirsin.`,
      job: 'auto-backup', jobLabel: 'Şimdi yedekle', last: 'autoBackup',
    },
    {
      key: 'linkHealthEnabled',
      title: 'Link kontrolü',
      detail: 'Her gün açık linklerin adreslerini dener; açılmayanlar Linkler ve Genel Bakış\'ta uyarıyla gösterilir.',
      job: 'link-health', jobLabel: 'Şimdi kontrol et', last: 'linkHealth',
    },
    {
      key: 'weeklyReportEnabled',
      title: 'Haftalık özet e-postası',
      detail: 'Pazartesi günleri son 7 günün özetini (ziyaret, tıklama, abone, mesaj) iletişim e-postana gönderir. SMTP ayarlı olmalı.',
      job: 'weekly-report', jobLabel: 'Şimdi gönder', last: 'weeklyReport',
    },
  ]

  return (
    <div className="bg-dark-card border border-gray-800 rounded-2xl p-5 sm:p-8 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-6">
          <FaRobot className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Otomatik işler</h2>
        </div>
        <div className="space-y-5">
          {rows.map((row) => (
            <div key={row.key} className="flex items-start gap-4">
              <Switch checked={settings[row.key]} onChange={(value) => toggle(row.key, value)} label={row.title} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{row.title}</div>
                <p className="text-sm text-gray-400 mt-0.5">{row.detail}</p>
                <p className="text-xs text-gray-500 mt-1">Son çalışma: {formatDate(jobs?.lastRuns[row.last])}</p>
              </div>
              {runButton(row.job, row.jobLabel)}
            </div>
          ))}
        </div>

        {jobs && jobs.autoBackups.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Sunucudaki otomatik yedekler</h3>
            <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl">
              {jobs.autoBackups.map((backup) => (
                <li key={backup.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-gray-300 truncate">{formatDate(backup.createdAt)} <span className="text-gray-500">· {formatSize(backup.size)}</span></span>
                  <a href={`/api/admin/backup?auto=${encodeURIComponent(backup.name)}`} download className="inline-flex items-center gap-1.5 text-purple-300 hover:text-purple-200 whitespace-nowrap">
                    <FaDownload className="w-3.5 h-3.5" aria-hidden="true" />İndir
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Görsel temizliği: kendiliğinden çalışmaz, yalnızca bu düğmeyle */}
      <div className="pt-8 border-t border-gray-800">
        <h3 className="text-sm font-medium text-white">Kullanılmayan görseller</h3>
        <p className="text-sm text-gray-400 mt-0.5">
          Profilde ya da herhangi bir blokta (kapalı olanlar dahil) kullanılmayan, en az bir gün önce yüklenmiş görseller.
          Kendiliğinden silinmez; düğmeyle çöp klasörüne taşınır, 30 gün içinde geri getirilebilir.
        </p>
        {jobs && (
          <>
            {jobs.unusedUploads.length > 0 ? (
              <details className="mt-2 text-xs text-gray-400">
                <summary className="cursor-pointer">{jobs.unusedUploads.length} görsel kullanılmıyor (listeyi gör)</summary>
                <ul className="mt-1 space-y-0.5 font-mono break-all">
                  {jobs.unusedUploads.map((name) => (
                    <li key={name}><a href={`/media/${name}`} target="_blank" rel="noopener noreferrer" className="hover:text-purple-300">{name}</a></li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Kullanılmayan görsel yok.</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                disabled={!!running || jobs.unusedUploads.length === 0}
                onClick={() => confirm(`${jobs.unusedUploads.length} görsel çöp klasörüne taşınsın mı? 30 gün içinde geri getirebilirsin.`) && run('cleanup-uploads')}
                className="px-3 h-9 rounded-lg border border-gray-700 text-gray-200 text-sm hover:border-gray-600 disabled:opacity-50"
              >
                {running === 'cleanup-uploads' ? 'Taşınıyor...' : `Çöpe taşı (${jobs.unusedUploads.length})`}
              </button>
              {jobs.trashedUploads > 0 && (
                <button type="button" disabled={!!running} onClick={() => run('restore-trash')} className="px-3 h-9 rounded-lg border border-gray-700 text-gray-200 text-sm hover:border-gray-600 disabled:opacity-50">
                  {running === 'restore-trash' ? 'Geri getiriliyor...' : `Çöpten geri getir (${jobs.trashedUploads})`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <form onSubmit={saveNotifications} className="pt-8 border-t border-gray-800 space-y-4">
        <div className="flex items-center gap-3">
          <FaBell className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Anlık bildirimler</h2>
        </div>
        <p className="text-sm text-gray-400">
          Yeni abone ve yeni iletişim mesajı geldiğinde telefonuna bildirim gönderir. İkisinden birini ya da ikisini doldur; boş bırakırsan bildirim gitmez.
        </p>
        <div>
          <label htmlFor="ntfy-url" className="block text-sm font-medium text-gray-300 mb-2">ntfy adresi</label>
          <input id="ntfy-url" type="url" value={ntfyUrl} onChange={(e) => setNtfyUrl(e.target.value)} placeholder="https://ntfy.sh/benim-gizli-konum" className={inputClass} />
          <p className="text-xs text-gray-500 mt-1">ntfy uygulamasında bu konuya abone ol. Konu adı tahmin edilemeyecek kadar uzun olsun.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tg-token" className="block text-sm font-medium text-gray-300 mb-2">Telegram bot anahtarı</label>
            <input id="tg-token" type="password" autoComplete="off" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} placeholder={hasTelegramToken ? 'Kayıtlı — değiştirmek için yenisini gir' : '123456:ABC-DEF...'} className={inputClass} />
          </div>
          <div>
            <label htmlFor="tg-chat" className="block text-sm font-medium text-gray-300 mb-2">Telegram sohbet kimliği</label>
            <input id="tg-chat" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="123456789" className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Telegram: @BotFather ile bot oluştur, anahtarı buraya yapıştır. Bota bir mesaj at, sonra @userinfobot&apos;tan sohbet kimliğini öğren. Telegram&apos;ı kapatmak için sohbet kimliğini boşalt.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium">Kaydet</button>
          {runButton('test-notification', 'Test bildirimi gönder')}
        </div>
      </form>

      {message && (
        <div role="status" className={`px-4 py-3 rounded-xl text-sm ${message.ok ? 'bg-green-500/10 border border-green-500/50 text-green-400' : 'bg-red-500/10 border border-red-500/50 text-red-400'}`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
