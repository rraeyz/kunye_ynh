'use client'

import { useEffect, useState } from 'react'
import { FaInbox, FaTrash, FaReply, FaEnvelopeOpen, FaEnvelope } from 'react-icons/fa'
import AutoEmailSettings from './AutoEmailSettings'

// Admin → Mesajlar: "Bana yaz" formundan gelen mesajlar. SMTP ayarlı olmasa da burada birikir.

interface ContactMessage {
  id: number
  createdAt: string
  name: string
  email: string
  message: string
  read: boolean
  emailed: boolean
  replies: Array<{ id: number; createdAt: string; body: string }>
}

const formatDate = (value: string) => new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

export default function MessagesPanel({ onChange }: { onChange?: () => void }) {
  const [messages, setMessages] = useState<ContactMessage[] | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [smtpReady, setSmtpReady] = useState(true)

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((profile) => {
      if (profile) setSmtpReady(!!(profile.smtpHost && profile.smtpUser && profile.hasSmtpPassword))
    }).catch(() => {})
    fetch('/api/admin/messages')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setMessages)
      .catch(() => setError('Mesajlar yüklenemedi'))
  }, [])

  const setRead = async (message: ContactMessage, read: boolean) => {
    if (message.read === read) return
    setMessages((list) => list?.map((item) => (item.id === message.id ? { ...item, read } : item)) || null)
    await fetch(`/api/admin/messages/${message.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read }),
    }).catch(() => {})
    onChange?.()
  }

  const open = (message: ContactMessage) => {
    setOpenId(openId === message.id ? null : message.id)
    setDraft('')
    setSendResult(null)
    setRead(message, true)
  }

  const sendReply = async (message: ContactMessage) => {
    if (!draft.trim()) return
    setSending(true)
    setSendResult(null)
    try {
      const response = await fetch(`/api/admin/messages/${message.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Gönderilemedi')
      setMessages((list) => list?.map((item) => (item.id === message.id ? { ...item, read: true, replies: [...item.replies, data] } : item)) || null)
      setDraft('')
      setSendResult({ ok: true, text: `Yanıt ${message.email} adresine gönderildi` })
    } catch (err) {
      setSendResult({ ok: false, text: err instanceof Error ? err.message : 'Gönderilemedi' })
    } finally {
      setSending(false)
    }
  }

  const remove = async (message: ContactMessage) => {
    if (!confirm(`${message.name} adlı kişinin mesajı silinsin mi?`)) return
    const response = await fetch(`/api/admin/messages/${message.id}`, { method: 'DELETE' })
    if (response.ok) {
      setMessages((list) => list?.filter((item) => item.id !== message.id) || null)
      onChange?.()
    }
  }

  if (error) return <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl p-4 text-sm">{error}</div>
  if (!messages) return <div className="text-gray-400 text-sm">Yükleniyor...</div>

  const unread = messages.filter((message) => !message.read).length

  return (
    <div className="space-y-4">
      <AutoEmailSettings
        title="Otomatik yanıt"
        description="Bana yaz formundan yazan kişiye anında bu e-posta gider. Ziyaretçinin yazdıkları yanıta eklenmez."
        bodyKey="contactAutoReply"
        bodyPlaceholder="Merhaba, mesajını aldım. En geç 2 gün içinde dönüş yapacağım."
      />

      <p className="text-sm text-gray-400">
        Ziyaretçilerin &quot;Bana yaz&quot; formundan gönderdiği mesajlar. {unread > 0 ? `${unread} okunmamış mesaj var.` : 'Okunmamış mesaj yok.'}
      </p>

      {messages.length === 0 ? (
        <div className="bg-dark-card border border-gray-800 rounded-2xl p-10 text-center">
          <FaInbox className="w-8 h-8 text-gray-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-300">Henüz mesaj yok.</p>
          <p className="text-sm text-gray-500 mt-1">Profil → İletişim e-postasını girdiğinde sitede &quot;Bana yaz&quot; butonu görünür.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {messages.map((message) => {
            const expanded = openId === message.id
            return (
              <li key={message.id} className={`bg-dark-card border rounded-2xl ${message.read ? 'border-gray-800' : 'border-purple-500/40'}`}>
                <button type="button" onClick={() => open(message)} aria-expanded={expanded} className="w-full text-left px-4 sm:px-5 py-4 flex items-start gap-3">
                  {!message.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-purple-400 shrink-0" aria-label="Okunmadı" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={`truncate ${message.read ? 'text-gray-200' : 'text-white font-semibold'}`}>{message.name}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(message.createdAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                    <div className="text-xs text-gray-400 truncate">{message.email}</div>
                    {!expanded && <p className="text-sm text-gray-400 mt-1 line-clamp-1 break-words">{message.message}</p>}
                    {!expanded && message.replies.length > 0 && <p className="text-xs text-purple-300 mt-1">{message.replies.length} yanıt gönderildi</p>}
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 sm:px-5 pb-4">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap break-words bg-dark-bg border border-gray-800 rounded-xl p-4">{message.message}</p>

                    {/* Konuşma geçmişi: panelden gönderilen yanıtlar */}
                    {message.replies.map((reply) => (
                      <div key={reply.id} className="mt-2 ml-6 sm:ml-12">
                        <div className="text-xs text-gray-500 mb-1">Sen · {formatDate(reply.createdAt)}</div>
                        <p className="text-sm text-gray-100 whitespace-pre-wrap break-words bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">{reply.body}</p>
                      </div>
                    ))}

                    {smtpReady ? (
                      <div className="mt-3">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={3}
                          aria-label={`${message.name} adlı kişiye yanıt`}
                          placeholder={`${message.name} adlı kişiye yanıt yaz... (asıl mesajı altına alıntılanır)`}
                          className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white text-sm resize-y focus:outline-none focus:border-purple-500"
                        />
                        {sendResult && <p role="status" className={`text-sm mt-1 ${sendResult.ok ? 'text-green-400' : 'text-red-400'}`}>{sendResult.text}</p>}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-400 mt-3">Panelden yanıt göndermek için Ayarlar → SMTP&apos;yi doldur. Şimdilik e-posta programında yanıtlayabilirsin.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {smtpReady ? (
                        <button
                          type="button"
                          onClick={() => sendReply(message)}
                          disabled={sending || !draft.trim()}
                          className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm disabled:opacity-50"
                        >
                          <FaReply className="w-3.5 h-3.5" aria-hidden="true" />{sending ? 'Gönderiliyor...' : 'Yanıtı gönder'}
                        </button>
                      ) : (
                        <a
                          href={`mailto:${message.email}?subject=${encodeURIComponent('Re: mesajınız')}`}
                          className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-purple-500/15 border border-purple-500/40 text-purple-100 text-sm"
                        >
                          <FaReply className="w-3.5 h-3.5" aria-hidden="true" />E-posta programında yanıtla
                        </a>
                      )}
                      <button type="button" onClick={() => setRead(message, false)} className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-gray-700 text-gray-300 text-sm">
                        <FaEnvelope className="w-3.5 h-3.5" aria-hidden="true" />Okunmadı yap
                      </button>
                      <button type="button" onClick={() => remove(message)} className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                        <FaTrash className="w-3.5 h-3.5" aria-hidden="true" />Sil
                      </button>
                      <span className="text-xs text-gray-500 inline-flex items-center gap-1.5 ml-auto">
                        <FaEnvelopeOpen aria-hidden="true" />{message.emailed ? 'E-postana da gönderildi' : 'Yalnızca burada (e-posta gönderilmedi)'}
                      </span>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
