'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FaPaperPlane, FaUser, FaUsers, FaFlask, FaTrashAlt, FaExclamationTriangle, FaClock } from 'react-icons/fa'
import RichTextEditor from './RichTextEditor'
import SelectMenu from './SelectMenu'
import type { AdminTab } from './adminNav'

type Audience = 'people' | 'subscribers'
type Result = { ok: boolean; text: string; details?: string[] }

const DRAFT_KEY = 'emailDraft'
const MAX_RECIPIENTS = 20

// Sunucudaki parseRecipients ile aynı kural: virgül, noktalı virgül veya satır sonu ile ayrılmış, tekrarsız
const splitRecipients = (value: string) => {
  const seen = new Set<string>()
  return value.split(/[,;\n]+/).map((part) => part.trim()).filter((email) => {
    if (!email || seen.has(email.toLowerCase())) return false
    seen.add(email.toLowerCase())
    return true
  })
}

// Hazır şablonlar: konu ve mesaj iskeleti, köşeli parantezli yerler doldurulur
const TEMPLATES: Array<{ label: string; subject: string; message: string }> = [
  {
    label: 'Bülten',
    subject: '[Ay] bülteni: neler yaptım, neler geliyor',
    message: 'Merhaba,\n\nBu ay neler oldu, kısaca paylaşmak istedim.\n\n**Bu ay**\n• [Tamamlanan iş ya da proje]\n• [Öne çıkan gelişme]\n\n**Yakında**\n• [Gelecek iş ya da duyuru]\n\n[Detaylar için tıkla](https://)\n\nGörüşmek üzere!',
  },
  {
    label: 'Duyuru',
    subject: 'Duyuru: [başlık]',
    message: 'Merhaba,\n\n[Duyurunun kendisi; bir iki cümle.]\n\n**Ne zaman:** [tarih]\n**Nerede:** [yer ya da link]\n\n[Daha fazla bilgi](https://)',
  },
  {
    label: 'Etkinlik daveti',
    subject: '[Etkinlik adı] için davetlisin',
    message: 'Merhaba,\n\n[Etkinlik adı] etkinliğine seni de bekliyorum.\n\n**Tarih:** [gün, saat]\n**Yer:** [adres ya da çevrim içi link]\n**Ne yapacağız:** [kısa açıklama]\n\n[Kayıt ol](https://)\n\nGörüşmek üzere!',
  },
  {
    label: 'Yeni proje / ürün',
    subject: 'Yeni: [proje ya da ürün adı]',
    message: 'Merhaba,\n\nUzun zamandır üzerinde çalıştığım [proje ya da ürün adı] artık hazır!\n\n**Ne işe yarar:** [bir cümle]\n**Öne çıkanlar:**\n• [özellik]\n• [özellik]\n\n[İncele](https://)\n\nGeri bildirimini çok isterim.',
  },
  {
    label: 'Teşekkür',
    subject: 'Teşekkürler!',
    message: 'Merhaba,\n\n[Neye teşekkür ettiğin; ör. bu yıl desteğin için] çok teşekkür ederim.\n\n[Kısa bir not ya da sonraki adım]\n\nSevgiyle,',
  },
]

// lib/newsletter.ts tagKey ile aynı kural (ı/i aynı sayılır)
const tagKey = (value: string) => value.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')

// datetime-local alanı için yerel saatle "YYYY-MM-DDTHH:mm"
const localInputValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

type Scheduled = { id: number; sendAt: string; subject: string; tag: string; status: string; result: string }
const STATUS_LABEL: Record<string, string> = { pending: 'Bekliyor', sending: 'Gönderiliyor', sent: 'Gönderildi', failed: 'Gönderilemedi' }

const inputClass = 'w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors'

export default function CustomEmailPanel({ onNavigate }: { onNavigate?: (tab: AdminTab) => void }) {
  const [audience, setAudience] = useState<Audience>('people')
  const [recipients, setRecipients] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState<'' | 'send' | 'test'>('')
  const [result, setResult] = useState<Result | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [smtpReady, setSmtpReady] = useState<boolean | null>(null)
  const [selfAddress, setSelfAddress] = useState('')
  const [subscribers, setSubscribers] = useState<Array<{ id: number; email: string; name: string; tags?: string }>>([])
  const [tag, setTag] = useState('')
  const [scheduleOn, setScheduleOn] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduled, setScheduled] = useState<Scheduled[]>([])
  const [history, setHistory] = useState<Array<{ id: number; createdAt: string; subject: string; recipients: number; sent: number; failed: number }>>([])
  const draftLoaded = useRef(false)

  // Bülten gönderim geçmişi (yalnızca "Tüm abonelere" gönderimler)
  const loadHistory = () => {
    fetch('/api/admin/newsletter-history').then((r) => (r.ok ? r.json() : [])).then((list) => {
      if (Array.isArray(list)) setHistory(list)
    }).catch(() => {})
  }

  const loadScheduled = () => {
    fetch('/api/admin/scheduled-newsletters').then((r) => (r.ok ? r.json() : [])).then((list) => {
      if (Array.isArray(list)) setScheduled(list)
    }).catch(() => {})
  }

  const scheduledAction = async (item: Scheduled, action: 'send' | 'delete') => {
    if (action === 'send' && !confirm(`"${item.subject}" şimdi gönderilsin mi?`)) return
    if (action === 'delete' && item.status === 'pending' && !confirm(`"${item.subject}" planı iptal edilsin mi?`)) return
    const response = action === 'send'
      ? await fetch('/api/admin/scheduled-newsletters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, sendNow: true }) }).catch(() => null)
      : await fetch(`/api/admin/scheduled-newsletters?id=${item.id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) {
      const data = await response?.json().catch(() => ({}))
      setResult({ ok: false, text: data?.error || 'İşlem yapılamadı' })
    }
    loadScheduled()
    loadHistory()
  }

  // Profil (kendime test adresi) ve aboneler (öneri listesi + sayı)
  useEffect(() => {
    loadScheduled()
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((profile) => {
      if (profile) setSelfAddress(profile.contactEmail || profile.smtpFrom || profile.smtpUser || '')
    }).catch(() => {})
    loadHistory()
    fetch('/api/subscribers').then((r) => (r.ok ? r.json() : [])).then((list) => {
      // Onay bekleyen abonelere bülten gitmez
      if (Array.isArray(list)) setSubscribers(list.filter((item) => item.confirmed !== false))
    }).catch(() => {})
  }, [])

  // Taslak: sayfadan çıkınca yazılanlar kaybolmasın
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (saved && typeof saved === 'object') {
        if (saved.audience === 'subscribers' || saved.audience === 'people') setAudience(saved.audience)
        setRecipients(String(saved.recipients || ''))
        setSubject(String(saved.subject || ''))
        setMessage(String(saved.message || ''))
      }
    } catch {}
    draftLoaded.current = true
  }, [])

  useEffect(() => {
    if (!draftLoaded.current) return
    const timer = setTimeout(() => {
      try {
        if (recipients || subject || message) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ audience, recipients, subject, message }))
        } else {
          localStorage.removeItem(DRAFT_KEY)
        }
      } catch {}
    }, 400)
    return () => clearTimeout(timer)
  }, [audience, recipients, subject, message])

  // Canlı önizleme (yazmayı bıraktıktan kısa süre sonra yenilenir)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/admin/email-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, message, audience }),
        })
        if (!response.ok) return
        const data = await response.json()
        setPreviewHtml(data.html || '')
        setFromAddress(data.from || '')
        setSmtpReady(!!data.smtpConfigured)
      } catch {}
    }, 500)
    return () => clearTimeout(timer)
  }, [subject, message, audience])

  const recipientList = useMemo(() => splitRecipients(recipients), [recipients])
  const allTags = useMemo(() => Array.from(new Map(subscribers.flatMap((s) => (s.tags || '').split(',')).filter((t) => t.trim()).map((t) => [tagKey(t), t.trim()] as const)).values())
    .sort((a, b) => a.localeCompare(b, 'tr')), [subscribers])
  const audienceCount = tag ? subscribers.filter((s) => (s.tags || '').split(',').some((t) => tagKey(t) === tagKey(tag))).length : subscribers.length
  const scheduling = audience === 'subscribers' && scheduleOn

  const applyTemplate = (label: string) => {
    const template = TEMPLATES.find((item) => item.label === label)
    if (!template) return
    if ((subject.trim() || message.trim()) && !confirm('Yazdıkların şablonla değiştirilsin mi?')) return
    setSubject(template.subject)
    setMessage(template.message)
  }
  const tooMany = recipientList.length > MAX_RECIPIENTS

  const clearDraft = () => {
    setRecipients('')
    setSubject('')
    setMessage('')
    setResult(null)
    try { localStorage.removeItem(DRAFT_KEY) } catch {}
  }

  const send = async (mode: 'send' | 'test') => {
    setResult(null)
    if (!subject.trim() || !message.trim()) {
      setResult({ ok: false, text: 'Konu ve mesaj gerekli' })
      return
    }
    const toSubscribers = mode === 'send' && audience === 'subscribers'
    if (toSubscribers && scheduleOn) {
      const sendAt = new Date(scheduleAt)
      if (!scheduleAt || Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
        setResult({ ok: false, text: 'Gelecekte bir tarih ve saat seç' })
        return
      }
      setSending('send')
      try {
        const response = await fetch('/api/admin/scheduled-newsletters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, message, tag, sendAt: sendAt.toISOString() }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          setResult({ ok: false, text: data.error || 'Planlanamadı' })
          return
        }
        clearDraft()
        setScheduleOn(false)
        loadScheduled()
        setResult({ ok: true, text: `Planlandı: ${sendAt.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}` })
      } catch {
        setResult({ ok: false, text: 'Bir hata oluştu' })
      } finally {
        setSending('')
      }
      return
    }
    if (mode === 'send' && !toSubscribers && recipientList.length === 0) {
      setResult({ ok: false, text: 'En az bir alıcı gir' })
      return
    }
    if (toSubscribers) {
      if (audienceCount === 0) {
        setResult({ ok: false, text: tag ? 'Bu etikette onaylı abone yok' : 'Henüz abone yok' })
        return
      }
      if (!confirm(`Bu e-posta ${audienceCount} aboneye gönderilecek. Devam edilsin mi?`)) return
    }

    setSending(mode)
    try {
      const response = toSubscribers
        ? await fetch('/api/subscribers/bulk-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, message, tag: tag || undefined }),
          })
        : await fetch('/api/admin/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: mode === 'test' ? selfAddress : recipients,
              subject: mode === 'test' ? `[Test] ${subject}` : subject,
              message,
            }),
          })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setResult({ ok: false, text: data.error || 'Gönderim başarısız', details: data.details ? [String(data.details)] : undefined })
        return
      }
      const details: string[] | undefined = Array.isArray(data.errors) ? data.errors : undefined
      if (mode === 'test') {
        setResult({ ok: true, text: `Test e-postası ${selfAddress} adresine gönderildi`, details })
      } else if (details?.length) {
        // Bir kısmı gönderilemedi: taslak duruyor, hatalar listeleniyor
        setResult({ ok: false, text: data.message || 'Bazı adreslere gönderilemedi', details })
      } else {
        // Gönderilen taslak temizlenir (test gönderimi taslağa dokunmaz)
        clearDraft()
        if (toSubscribers) loadHistory()
        setResult({ ok: true, text: data.message || 'Gönderildi' })
      }
    } catch {
      setResult({ ok: false, text: 'Bir hata oluştu' })
    } finally {
      setSending('')
    }
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <div className="bg-dark-card border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white">E-posta yaz</h2>
          {(recipients || subject || message) && (
            <button type="button" onClick={clearDraft} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <FaTrashAlt className="w-3.5 h-3.5" /> Taslağı temizle
            </button>
          )}
        </div>

        {smtpReady === false && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm">
            <FaExclamationTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              SMTP ayarlı değil; önizleme çalışır ama gönderim yapılamaz.{' '}
              {onNavigate && <button type="button" onClick={() => onNavigate('settings')} className="underline font-medium">Ayarlar → SMTP</button>}
            </span>
          </div>
        )}

        {/* Kime */}
        <div>
          <span className="block text-sm font-medium text-gray-300 mb-2">Kime</span>
          <div role="group" aria-label="Alıcılar" className="grid grid-cols-2 gap-2 mb-3">
            {([['people', 'Kişilere', FaUser], ['subscribers', `Tüm abonelere (${subscribers.length})`, FaUsers]] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={audience === value}
                onClick={() => setAudience(value)}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${audience === value ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-700 text-gray-300 hover:border-gray-600'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {audience === 'people' ? (
            <>
              <label htmlFor="email-to" className="sr-only">Alıcı adresleri</label>
              <textarea
                id="email-to"
                rows={2}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="ornek@mail.com, ikinci@mail.com"
                className={`${inputClass} resize-y`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <span className={`text-xs ${tooMany ? 'text-red-400' : 'text-gray-500'}`}>
                  {recipientList.length} alıcı{tooMany ? ` · en fazla ${MAX_RECIPIENTS}` : ''} · her kişiye ayrı e-posta gider, adresler birbirini görmez
                </span>
                {subscribers.length > 0 && (
                  <SelectMenu
                    ariaLabel="Abonelerden ekle"
                    value=""
                    placeholder="Abonelerden ekle…"
                    onChange={(email) => {
                      if (email) setRecipients(recipients.trim() ? `${recipients.trim().replace(/[,;]$/, '')}, ${email}` : email)
                    }}
                    options={subscribers
                      .filter((s) => !recipientList.some((r) => r.toLowerCase() === s.email.toLowerCase()))
                      .map((s) => ({ value: s.email, label: s.name ? `${s.name} <${s.email}>` : s.email }))}
                    className="text-xs bg-dark-bg border border-gray-700 rounded-lg text-gray-300 px-2 py-1.5 w-[14rem] max-w-full"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {allTags.length > 0 && (
                <SelectMenu
                  ariaLabel="Etiket"
                  value={tag}
                  onChange={setTag}
                  options={[{ value: '', label: 'Tüm aboneler' }, ...allTags.map((t) => ({ value: t, label: `Etiket: ${t}` }))]}
                  className={inputClass}
                />
              )}
              <p className="text-sm text-gray-400 px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl">
                {tag ? `"${tag}" etiketli ${audienceCount} aboneye` : 'Her aboneye'} kendi adına &quot;Abonelikten çık&quot; linkiyle ayrı ayrı gönderilir. Belirli abonelere göndermek için Aboneler bölümünü kullan.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleOn}
                    onChange={(e) => {
                      setScheduleOn(e.target.checked)
                      if (e.target.checked && !scheduleAt) setScheduleAt(localInputValue(new Date(Date.now() + 60 * 60 * 1000)))
                    }}
                    className="w-4 h-4 rounded border-gray-600 bg-dark-bg text-purple-500 focus:ring-purple-500"
                  />
                  <FaClock className="w-3.5 h-3.5" /> İleri bir tarihe planla
                </label>
                {scheduleOn && (
                  <input
                    type="datetime-local"
                    aria-label="Gönderim zamanı"
                    value={scheduleAt}
                    min={localInputValue(new Date())}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="px-3 py-2 bg-dark-bg border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500 [color-scheme:dark]"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label htmlFor="email-subject" className="block text-sm font-medium text-gray-300">Konu</label>
            <SelectMenu
              ariaLabel="Hazır şablon"
              value=""
              placeholder="Hazır şablon…"
              onChange={applyTemplate}
              options={TEMPLATES.map((item) => ({ value: item.label, label: item.label }))}
              className="text-xs bg-dark-bg border border-gray-700 rounded-lg text-gray-300 px-2 py-1.5 w-[11rem] max-w-full"
            />
          </div>
          <input id="email-subject" type="text" maxLength={300} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="E-posta konusu" className={inputClass} />
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-300 mb-2">Mesaj</span>
          <RichTextEditor value={message} onChange={setMessage} placeholder="E-posta mesajınızı buraya yazın..." minHeight={260} />
        </div>

        {result && (
          <div className={`px-4 py-3 rounded-xl text-sm ${result.ok ? 'bg-green-500/10 border border-green-500/50 text-green-400' : 'bg-red-500/10 border border-red-500/50 text-red-400'}`} role="status">
            {result.text}
            {result.details && result.details.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs opacity-90 space-y-0.5">
                {result.details.slice(0, 10).map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => send('send')}
            disabled={!!sending || (audience === 'people' && tooMany)}
            className="flex-1 min-w-[12rem] flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {scheduling ? <FaClock className="w-4 h-4" /> : <FaPaperPlane className="w-4 h-4" />}
            {sending === 'send' ? (scheduling ? 'Planlanıyor...' : 'Gönderiliyor...') : scheduling ? 'Planla' : audience === 'subscribers' ? `${audienceCount} aboneye gönder` : recipientList.length > 1 ? `${recipientList.length} kişiye gönder` : 'Gönder'}
          </button>
          <button
            type="button"
            onClick={() => send('test')}
            disabled={!!sending || !selfAddress}
            title={selfAddress ? `${selfAddress} adresine "[Test]" konusuyla gönderir` : 'Profil → İletişim e-postası veya SMTP gönderen adresi gerekli'}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-700 text-gray-200 hover:border-gray-600 disabled:opacity-50"
          >
            <FaFlask className="w-3.5 h-3.5" />
            {sending === 'test' ? 'Gönderiliyor...' : 'Kendime test gönder'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          İmza otomatik eklenir: profil fotoğrafı, şirket adı ve adresi (Ayarlar → E-posta İmzası) ve sosyal medya ikonları (Profil → Sosyal medya hesapları).
        </p>

        {scheduled.length > 0 && (
          <div className="pt-5 border-t border-gray-800">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Planlanmış bültenler</h3>
            <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl text-sm">
              {scheduled.slice(0, 20).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-gray-200 break-words">{item.subject}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(item.sendAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
                      {item.tag ? ` · etiket: ${item.tag}` : ' · tüm aboneler'}
                      {' · '}
                      <span className={item.status === 'failed' ? 'text-red-400' : item.status === 'sent' ? 'text-green-400' : 'text-amber-300'}>{STATUS_LABEL[item.status] || item.status}</span>
                      {item.result && ` · ${item.result}`}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {item.status === 'pending' && (
                      <button type="button" onClick={() => scheduledAction(item, 'send')} className="text-xs text-purple-300 hover:text-white">Şimdi gönder</button>
                    )}
                    {(item.status !== 'sending' || Date.now() - Date.parse(item.sendAt) > 60 * 60 * 1000) && (
                      <button type="button" onClick={() => scheduledAction(item, 'delete')} className="text-xs text-gray-400 hover:text-red-400">
                        {item.status === 'pending' ? 'İptal et' : 'Listeden kaldır'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {history.length > 0 && (
          <div className="pt-5 border-t border-gray-800">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Bülten geçmişi</h3>
            <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl text-sm">
              {history.slice(0, 10).map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5">
                  <span className="text-gray-200 min-w-0 break-words">{item.subject}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(item.createdAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} · {item.sent}/{item.recipients} gönderildi
                    {item.failed > 0 && <span className="text-red-400"> · {item.failed} hata</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Önizleme: gönderilecek e-postanın aynısı */}
      <div className="bg-dark-card border border-gray-800 rounded-2xl overflow-hidden 2xl:sticky 2xl:top-24">
        <div className="px-5 py-3 border-b border-gray-800 text-sm">
          <div className="text-white font-medium">Önizleme</div>
          <div className="text-gray-400 text-xs mt-0.5 truncate">
            {fromAddress ? `Kimden: ${fromAddress}` : 'Kimden: (SMTP ayarlanınca görünür)'} · Konu: {subject || '(konu yok)'}
          </div>
        </div>
        {previewHtml ? (
          <iframe title="E-posta önizlemesi" sandbox="" srcDoc={previewHtml} className="w-full h-[640px] bg-white border-0" />
        ) : (
          <div className="h-[640px] flex items-center justify-center text-sm text-gray-500">Önizleme hazırlanıyor…</div>
        )}
      </div>
    </div>
  )
}
