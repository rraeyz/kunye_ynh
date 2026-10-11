'use client'

import { useState, useEffect, useRef } from 'react'
import { FaEnvelope, FaTrash, FaDownload, FaSearch, FaUserPlus, FaPaperPlane, FaUpload, FaTag, FaTimes } from 'react-icons/fa'
import RichTextEditor from './RichTextEditor'
import { CSV_BOM, csvRow } from '@/lib/csv'
import AutoEmailSettings from './AutoEmailSettings'
import SelectMenu from './SelectMenu'

const splitTags = (tags?: string) => (tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [])
// lib/newsletter.ts tagKey ile aynı kural (ı/i aynı sayılır)
const tagKey = (tag: string) => tag.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')
const sameTag = (a: string, b: string) => tagKey(a) === tagKey(b)

export default function SubscriberManagement() {
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sending, setSending] = useState(false)
  // E-posta onayı (double opt-in): açıksa yeni aboneler e-postadaki linke tıklayana kadar "onay bekliyor" kalır
  const [doubleOptIn, setDoubleOptIn] = useState(false)
  const [smtpReady, setSmtpReady] = useState(true)
  const [optInMessage, setOptInMessage] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  // CSV içe aktarma: dosya seçilince önce özet + etiket alanı gösterilir, onaylanınca gönderilir
  const [importFile, setImportFile] = useState<{ name: string; text: string } | null>(null)
  const [importTags, setImportTags] = useState('')
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchSubscribers()
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((profile) => {
      if (!profile) return
      setDoubleOptIn(!!profile.newsletterDoubleOptIn)
      setSmtpReady(!!(profile.smtpHost && profile.smtpUser && profile.hasSmtpPassword))
    }).catch(() => {})
  }, [])

  const toggleDoubleOptIn = async () => {
    const value = !doubleOptIn
    setDoubleOptIn(value)
    setOptInMessage('')
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsletterDoubleOptIn: value }),
    }).catch(() => null)
    if (!response?.ok) {
      setDoubleOptIn(!value)
      setOptInMessage('Kaydedilemedi')
    }
  }

  const confirmedCount = subscribers.filter((s) => s.confirmed !== false).length
  const pendingCount = subscribers.length - confirmedCount

  const fetchSubscribers = async () => {
    try {
      const response = await fetch('/api/subscribers')
      const data = await response.json()
      setSubscribers(data)
    } catch (error) {
      console.error('Fetch subscribers error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Bu aboneyi silmek istediğinize emin misiniz?')) return

    try {
      const response = await fetch(`/api/subscribers/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setSubscribers(subscribers.filter(s => s.id !== id))
      }
    } catch (error) {
      console.error('Delete subscriber error:', error)
    }
  }

  const handleExportCSV = () => {
    const csv = CSV_BOM + [
      csvRow(['Email', 'İsim', 'Kayıt Tarihi', 'Durum', 'Etiketler']),
      ...subscribers.map(s => csvRow([
        s.email,
        s.name || '-',
        new Date(s.createdAt).toLocaleDateString('tr-TR'),
        s.confirmed === false ? 'Onay bekliyor' : 'Onaylı',
        s.tags || ''
      ]))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `subscribers_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const chooseImportFile = async (file?: File) => {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    if (file.size > 2_000_000) {
      setNotice({ ok: false, text: 'Dosya çok büyük (en fazla 2 MB)' })
      return
    }
    setNotice(null)
    setImportTags('')
    setImportFile({ name: file.name, text: await file.text() })
  }

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    try {
      const response = await fetch('/api/subscribers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importFile.text, tags: importTags }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ ok: false, text: data.error || 'İçe aktarılamadı' })
        return
      }
      setImportFile(null)
      setNotice({ ok: true, text: `${data.added} yeni abone eklendi${data.updated ? `, ${data.updated} abone güncellendi` : ''}${data.skipped ? `, e-postası olmayan ${data.skipped} satır atlandı` : ''}` })
      fetchSubscribers()
    } catch {
      setNotice({ ok: false, text: 'İçe aktarılamadı' })
    } finally {
      setImporting(false)
    }
  }

  // Etiket ekle (seçilenlere) / kaldır (tek abonenin etiket rozetindeki ×)
  const updateTags = async (ids: number[], change: { addTag?: string; removeTag?: string }) => {
    const response = await fetch('/api/subscribers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, ...change }),
    }).catch(() => null)
    if (!response?.ok) {
      setNotice({ ok: false, text: 'Etiket kaydedilemedi' })
      return
    }
    fetchSubscribers()
  }

  const addTagToSelected = () => {
    const tag = prompt(`Seçili ${selectedIds.length} aboneye eklenecek etiket:`)?.trim()
    if (tag) updateTags(selectedIds, { addTag: tag })
  }

  const handleSendBulkEmail = async () => {
    if (!emailSubject || !emailMessage) {
      alert('Lütfen konu ve mesaj giriniz')
      return
    }

    setSending(true)
    try {
      const response = await fetch('/api/subscribers/bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: emailSubject,
          message: emailMessage,
          subscriberIds: selectedIds.length > 0 ? selectedIds : undefined
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        alert(`${data.success} e-posta başarıyla gönderildi!`)
        setShowEmailModal(false)
        setEmailSubject('')
        setEmailMessage('')
        setSelectedIds([])
      } else {
        alert(`Hata: ${data.error}`)
      }
    } catch (error) {
      alert('E-posta gönderimi başarısız')
    } finally {
      setSending(false)
    }
  }

  const toggleSelection = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredSubscribers.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredSubscribers.map(s => s.id))
    }
  }

  const allTags = Array.from(new Map(subscribers.flatMap((s) => splitTags(s.tags)).map((t) => [tagKey(t), t] as const)).values())
    .sort((a, b) => a.localeCompare(b, 'tr'))

  const filteredSubscribers = subscribers.filter(s =>
    (!tagFilter || splitTags(s.tags).some((t) => sameTag(t, tagFilter))) && (
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      splitTags(s.tags).some((t) => tagKey(t).includes(tagKey(searchTerm)))
    )
  )

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
    <div className="bg-dark-card border border-gray-800 rounded-2xl p-5 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <FaEnvelope className="text-purple-400" />
            Abone Yönetimi
          </h2>
          <p className="text-gray-400 mt-1">
            Toplam {confirmedCount} abone
            {pendingCount > 0 && ` • ${pendingCount} onay bekliyor`}
            {selectedIds.length > 0 && ` • ${selectedIds.length} seçili`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowEmailModal(true)}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaPaperPlane className="w-4 h-4" />
            <span>E-posta Gönder {selectedIds.length > 0 && `(${selectedIds.length})`}</span>
          </button>
          
          <button
            onClick={addTagToSelected}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaTag className="w-4 h-4" />
            <span>Etiket ekle</span>
          </button>

          <button
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 text-gray-300 rounded-lg transition-colors"
          >
            <FaUpload className="w-4 h-4" />
            <span>CSV Yükle</span>
          </button>
          <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" aria-label="CSV dosyası" onChange={(e) => chooseImportFile(e.target.files?.[0])} />

          <button
            onClick={handleExportCSV}
            disabled={subscribers.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaDownload className="w-4 h-4" />
            <span>CSV İndir</span>
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" className={`mb-6 px-4 py-3 rounded-xl text-sm ${notice.ok ? 'bg-green-500/10 border border-green-500/50 text-green-400' : 'bg-red-500/10 border border-red-500/50 text-red-400'}`}>
          {notice.text}
        </div>
      )}

      {importFile && (
        <div className="mb-6 p-4 bg-dark-bg rounded-xl border border-purple-500/50 space-y-3">
          <div className="text-sm text-white font-medium break-all">İçe aktar: {importFile.name}</div>
          <p className="text-sm text-gray-400">
            E-posta sütunu otomatik bulunur; başlık satırında &quot;İsim&quot; ve &quot;Etiketler&quot; varsa onlar da alınır. Zaten kayıtlı adresler
            tekrar eklenmez, etiketleri birleştirilir. İçe aktarılanlar onaylı sayılır: yalnızca bülten almayı kabul etmiş kişileri ekle.
          </p>
          <label className="block">
            <span className="block text-sm text-gray-300 mb-1">Hepsine etiket ekle (isteğe bağlı)</span>
            <input
              type="text"
              value={importTags}
              onChange={(e) => setImportTags(e.target.value)}
              maxLength={200}
              placeholder="ör. müşteri, etkinlik-2026"
              className="w-full px-4 py-2.5 bg-dark-card border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={handleImport} disabled={importing} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {importing ? 'Aktarılıyor...' : 'İçe aktar'}
            </button>
            <button type="button" onClick={() => setImportFile(null)} disabled={importing} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm disabled:opacity-50">
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* E-posta onayı ayarı */}
      <div className="mb-6 flex items-start gap-4 p-4 bg-dark-bg rounded-xl border border-gray-700">
        <button
          type="button"
          role="switch"
          aria-checked={doubleOptIn}
          aria-label="E-posta onayı"
          onClick={toggleDoubleOptIn}
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${doubleOptIn ? 'bg-purple-500' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${doubleOptIn ? 'translate-x-5' : ''}`} />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">E-posta onayı (çift onay)</div>
          <p className="text-sm text-gray-400 mt-0.5">
            Açıkken yeni abone, e-postasına gelen linke tıklayana kadar listeye girmez ve bülten almaz. Başkasının adresiyle yapılan kayıtları önler.
            Onaylanmayan kayıtlar 7 gün sonra silinir.
          </p>
          {doubleOptIn && !smtpReady && (
            <p className="text-sm text-amber-400 mt-1">SMTP ayarlı olmadığı için onay e-postası gidemez; aboneler şimdilik onaysız eklenir. Ayarlar → SMTP&apos;yi doldur.</p>
          )}
          {optInMessage && <p className="text-sm text-red-400 mt-1">{optInMessage}</p>}
        </div>
      </div>

      <div className="mb-6">
        <AutoEmailSettings
          title="Hoş geldin e-postası"
          description="Yeni abone listeye girdiği anda (e-posta onayı açıksa onayladıktan sonra) bu e-posta gider. Abonelikten çıkma linki otomatik eklenir."
          bodyKey="welcomeEmailBody"
          subjectKey="welcomeEmailSubject"
          subjectPlaceholder="Konu: Bültene hoş geldin!"
          bodyPlaceholder="Merhaba! Abone olduğun için teşekkürler. Ayda bir yeni projelerimi paylaşacağım."
        />
      </div>

      {/* Search */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[14rem]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FaSearch className="text-gray-500" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="Email, isim veya etiket ara..."
          />
        </div>
        {allTags.length > 0 && (
          <SelectMenu
            ariaLabel="Etikete göre süz"
            value={tagFilter}
            onChange={(value) => { setTagFilter(value); setSelectedIds([]) }}
            options={[{ value: '', label: 'Tüm etiketler' }, ...allTags.map((t) => ({ value: t, label: t }))]}
            className="px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white w-[12rem] max-w-full"
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-dark-bg rounded-xl border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Toplam Abone</p>
          <p className="text-2xl font-bold text-white">{confirmedCount}</p>
        </div>
        <div className="p-4 bg-dark-bg rounded-xl border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Bu Hafta</p>
          <p className="text-2xl font-bold text-white">
            {subscribers.filter(s => {
              const weekAgo = new Date()
              weekAgo.setDate(weekAgo.getDate() - 7)
              return new Date(s.createdAt) > weekAgo
            }).length}
          </p>
        </div>
        <div className="p-4 bg-dark-bg rounded-xl border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Bu Ay</p>
          <p className="text-2xl font-bold text-white">
            {subscribers.filter(s => {
              const monthAgo = new Date()
              monthAgo.setMonth(monthAgo.getMonth() - 1)
              return new Date(s.createdAt) > monthAgo
            }).length}
          </p>
        </div>
      </div>

      {/* Table */}
      {filteredSubscribers.length === 0 ? (
        <div className="text-center py-12">
          <FaUserPlus className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">
            {searchTerm ? 'Arama sonucu bulunamadı' : 'Henüz abone yok'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredSubscribers.length && filteredSubscribers.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-600 bg-dark-bg text-purple-500 focus:ring-purple-500"
                  />
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Email</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">İsim</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Etiketler</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Kayıt Tarihi</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscribers.map(subscriber => (
                <tr key={subscriber.id} className="border-b border-gray-800 hover:bg-dark-bg transition-colors">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(subscriber.id)}
                      onChange={() => toggleSelection(subscriber.id)}
                      className="w-4 h-4 rounded border-gray-600 bg-dark-bg text-purple-500 focus:ring-purple-500"
                    />
                  </td>
                  <td className="py-3 px-4 text-white">
                    {subscriber.email}
                    {subscriber.confirmed === false && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs whitespace-nowrap">Onay bekliyor</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-400">{subscriber.name || '-'}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {splitTags(subscriber.tags).map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-xs whitespace-nowrap">
                          {tag}
                          <button type="button" aria-label={`${tag} etiketini kaldır`} onClick={() => updateTags([subscriber.id], { removeTag: tag })} className="p-0.5 rounded-full hover:bg-blue-500/30">
                            <FaTimes className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-400">
                    {new Date(subscriber.createdAt).toLocaleDateString('tr-TR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(subscriber.id)}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    >
                      <FaTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-gray-700 rounded-2xl p-6 max-w-2xl w-full">
            <h3 className="text-xl font-bold text-white mb-4">
              Toplu E-posta Gönder
            </h3>
            <p className="text-gray-400 mb-6">
              {selectedIds.length > 0 
                ? `${subscribers.filter((s) => selectedIds.includes(s.id) && s.confirmed !== false).length} aboneye e-posta gönderilecek`
                : `Tüm ${confirmedCount} aboneye e-posta gönderilecek`
              }
              {pendingCount > 0 && ' (onay bekleyenlere gönderilmez)'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Konu
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="E-posta konusu..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mesaj
                </label>
                <RichTextEditor
                  value={emailMessage}
                  onChange={setEmailMessage}
                  placeholder="E-posta içeriği..."
                  minHeight={250}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSendBulkEmail}
                disabled={sending || !emailSubject || !emailMessage}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaPaperPlane className="w-4 h-4" />
                <span>{sending ? 'Gönderiliyor...' : 'Gönder'}</span>
              </button>
              
              <button
                onClick={() => {
                  setShowEmailModal(false)
                  setEmailSubject('')
                  setEmailMessage('')
                }}
                disabled={sending}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors disabled:opacity-50"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
