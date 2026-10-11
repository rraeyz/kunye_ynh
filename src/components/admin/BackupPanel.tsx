'use client'

import { useRef, useState } from 'react'
import { FaDatabase, FaDownload, FaUpload, FaCheck, FaExclamationTriangle } from 'react-icons/fa'
import { BACKUP_KINDS, BACKUP_KIND_INFO, BackupKind, BackupSummary, summarizeBackup } from '@/lib/backupFormat'
import SelectMenu from './SelectMenu'

// Ayarlar → Yedekleme: türü seçilerek yedek alınır; yedekten yüklemede dosyanın türü kendiliğinden
// anlaşılır ve yüklemeden önce ne içerdiği / neyin üzerine yazılacağı gösterilir.

const RESTORE_WARNING: Record<BackupKind, string> = {
  full: 'Profil, görünüm, SMTP ayarları, bloklar, aboneler, iletişim mesajları ve analitik tamamen yedektekiyle değiştirilir.',
  settings: 'Profil, görünüm, SMTP ayarları ve bloklar yedektekiyle değiştirilir; yedekte olmayan bloklar silinir. Aboneler ve analitik korunur.',
  profile: 'Yalnızca profil kartı, tema, kapak ve sosyal hesaplar değişir. Bloklara, SMTP ayarlarına ve abonelere dokunulmaz.',
}

const formatDate = (value: string) => {
  const date = new Date(value)
  return isNaN(date.getTime()) ? '' : date.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function BackupPanel() {
  const [kind, setKind] = useState<BackupKind>('full')
  const [downloading, setDownloading] = useState(false)
  const [pending, setPending] = useState<{ name: string; data: unknown; summary: BackupSummary } | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const download = async () => {
    setDownloading(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/backup?kind=${kind}`)
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Yedek alınamadı')
      const blob = await response.blob()
      const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || `kunye-${kind}.json`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setMessage({ tone: 'ok', text: `${BACKUP_KIND_INFO[kind].label} indirildi (${name}).` })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Yedek alınamadı' })
    } finally {
      setDownloading(false)
    }
  }

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // aynı dosya yeniden seçilebilsin
    if (!file) return
    setMessage(null)
    setPending(null)
    try {
      const data = JSON.parse(await file.text())
      const summary = summarizeBackup(data)
      if ('error' in summary) {
        setMessage({ tone: 'error', text: summary.error })
        return
      }
      setPending({ name: file.name, data, summary })
    } catch {
      setMessage({ tone: 'error', text: 'Dosya okunamadı: geçerli bir yedek dosyası (.json) seçin.' })
    }
  }

  const restore = async () => {
    if (!pending) return
    setRestoring(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.data),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Geri yükleme başarısız')
      const parts = [
        result.kind !== 'profile' && `${result.links} blok`,
        result.subscribers > 0 && `${result.subscribers} abone`,
        result.analytics + result.pageViews > 0 && `${result.analytics + result.pageViews} analitik kaydı`,
        result.files > 0 && `${result.files} görsel`,
      ].filter(Boolean)
      setMessage({ tone: 'ok', text: `Yedek yüklendi${parts.length ? `: ${parts.join(', ')}` : ''}. Sayfa yenileniyor...` })
      setPending(null)
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Geri yükleme başarısız' })
    } finally {
      setRestoring(false)
    }
  }

  const summary = pending?.summary
  const contents = summary && [
    'profil ve görünüm',
    summary.kind !== 'profile' && `${summary.counts.links} blok`,
    summary.counts.subscribers > 0 && `${summary.counts.subscribers} abone`,
    summary.counts.analytics + summary.counts.pageViews > 0 && `${summary.counts.analytics + summary.counts.pageViews} analitik kaydı`,
    summary.counts.files > 0 && `${summary.counts.files} görsel`,
  ].filter(Boolean).join(', ')

  return (
    <div className="bg-dark-card border border-gray-800 rounded-2xl p-5 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <FaDatabase className="w-5 h-5 text-purple-400" />
        <h2 className="text-xl font-bold text-white">Yedekleme</h2>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">Yedek al</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 min-w-0">
              <SelectMenu
                ariaLabel="Yedek türü"
                value={kind}
                onChange={(value) => setKind(value as BackupKind)}
                options={BACKUP_KINDS.map((value) => ({ value, label: BACKUP_KIND_INFO[value].label }))}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-colors border border-blue-500/30 disabled:opacity-50"
            >
              <FaDownload className="w-4 h-4" aria-hidden="true" />
              {downloading ? 'Hazırlanıyor...' : 'Yedek al'}
            </button>
          </div>
          <p className="text-sm text-gray-400 mt-2">{BACKUP_KIND_INFO[kind].description}</p>
          {kind === 'full' && (
            <p className="text-xs text-gray-500 mt-1">
              Tam yedek SMTP şifresini ve link şifrelerinin özetlerini de içerir; dosyayı güvenli bir yerde saklayın.
            </p>
          )}
        </div>

        <div className="pt-6 border-t border-gray-700">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Yedekten yükle</h3>
          <p className="text-sm text-gray-400 mb-3">
            Yedek dosyasını seçin; türü (tam yedek, sayfa ve ayarlar, profil) kendiliğinden anlaşılır ve yüklemeden önce
            ne içerdiği gösterilir. Eski &quot;Ayarları dışa aktar&quot; dosyaları da yüklenebilir. Admin hesabınız değişmez.
          </p>
          <input ref={fileInput} type="file" accept=".json,application/json" onChange={chooseFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={restoring}
            className="flex items-center gap-2 px-5 py-3 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl transition-colors border border-green-500/30 disabled:opacity-50"
          >
            <FaUpload className="w-4 h-4" aria-hidden="true" />
            Yedekten yükle
          </button>

          {pending && summary && (
            <div role="region" aria-label="Yüklenecek yedek" className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
              <div className="min-w-0">
                <div className="text-white font-semibold">
                  {BACKUP_KIND_INFO[summary.kind].label}
                  {summary.legacy && <span className="ml-2 text-xs font-normal text-gray-400">(eski biçim)</span>}
                </div>
                <div className="text-xs text-gray-400 break-all">
                  {pending.name}
                  {formatDate(summary.createdAt) && ` · ${formatDate(summary.createdAt)}`}
                  {summary.appVersion && ` · sürüm ${summary.appVersion}`}
                </div>
              </div>
              <p className="text-sm text-gray-300">İçerik: {contents}</p>
              <p className="flex gap-2 text-sm text-yellow-300">
                <FaExclamationTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {RESTORE_WARNING[summary.kind]}
                  {summary.legacy && ' Eski biçimde bloklar yeniden oluşturulur: tıklama geçmişleri silinir, link şifrelerini yeniden girmeniz gerekir. Bu dosyada görseller yok: profil fotoğrafı, kapak, galeri ve favicon gibi yüklediğiniz görselleri yeniden yüklemeniz gerekir.'}
                  {!summary.legacy && summary.counts.files === 0 && ' Bu yedekte hiç görsel yok; yüklenmiş görselleri kullanan alanlar boş görünebilir.'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={restore}
                  disabled={restoring}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium disabled:opacity-50"
                >
                  {restoring ? 'Yükleniyor...' : 'Geri yükle'}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={restoring}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </div>

        {message && (
          <div
            role="status"
            className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm ${message.tone === 'ok' ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}
          >
            {message.tone === 'ok' ? <FaCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <FaExclamationTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span className="min-w-0 break-words">{message.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}
