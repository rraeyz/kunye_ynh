'use client'

import { useEffect, useState } from 'react'

// Otomatik e-posta ayarı (Mesajlar → otomatik yanıt, Aboneler → hoş geldin e-postası).
// Metin boşsa e-posta gönderilmez. Profil alanlarına kaydedilir.
interface Props {
  title: string
  description: string
  bodyKey: 'contactAutoReply' | 'welcomeEmailBody'
  subjectKey?: 'welcomeEmailSubject'
  bodyPlaceholder: string
  subjectPlaceholder?: string
}

const inputClass = 'w-full px-4 py-2.5 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500'

export default function AutoEmailSettings({ title, description, bodyKey, subjectKey, bodyPlaceholder, subjectPlaceholder }: Props) {
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [smtpReady, setSmtpReady] = useState(true)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((profile) => {
      if (!profile) return
      setBody(profile[bodyKey] || '')
      if (subjectKey) setSubject(profile[subjectKey] || '')
      setSmtpReady(!!(profile.smtpHost && profile.smtpUser && profile.hasSmtpPassword))
    }).catch(() => {})
  }, [bodyKey, subjectKey])

  const save = async () => {
    setMessage(null)
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [bodyKey]: body, ...(subjectKey ? { [subjectKey]: subject } : {}) }),
    }).catch(() => null)
    setMessage(response?.ok ? { ok: true, text: body.trim() ? 'Kaydedildi; artık otomatik gönderilecek.' : 'Kaydedildi; metin boş olduğu için gönderilmeyecek.' } : { ok: false, text: 'Kaydedilemedi' })
  }

  const active = !!body.trim()

  return (
    <div className="bg-dark-card border border-gray-800 rounded-2xl">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left">
        <span>
          <span className="block text-sm font-medium text-white">{title}</span>
          <span className="block text-xs text-gray-400 mt-0.5">{active ? 'Açık' : 'Kapalı (metin boş)'}{active && !smtpReady ? ' · SMTP ayarlı olmadığı için gönderilemiyor' : ''}</span>
        </span>
        <span className="text-sm text-purple-300 whitespace-nowrap">{open ? 'Kapat' : 'Düzenle'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3">
          <p className="text-sm text-gray-400">{description}</p>
          {!smtpReady && <p className="text-sm text-amber-400">SMTP ayarlı değil: Ayarlar → SMTP doldurulmadan e-posta gönderilemez.</p>}
          {subjectKey && (
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} aria-label="Konu" placeholder={subjectPlaceholder} className={inputClass} />
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} aria-label="Metin" placeholder={bodyPlaceholder} className={`${inputClass} resize-y`} />
          <p className="text-xs text-gray-500">**kalın**, *italik* ve [bağlantı metni](https://...) kullanılabilir. İmza (logo, şirket, sosyal ikonlar) otomatik eklenir.</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium">Kaydet</button>
            {message && <span role="status" className={`text-sm ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
