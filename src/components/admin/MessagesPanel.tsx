'use client'

import { useEffect, useState } from 'react'
import { FaInbox, FaTrash, FaReply, FaEnvelopeOpen, FaEnvelope } from 'react-icons/fa'

// Admin → Mesajlar: "Bana yaz" formundan gelen mesajlar. SMTP ayarlı olmasa da burada birikir.

interface ContactMessage {
  id: number
  createdAt: string
  name: string
  email: string
  message: string
  read: boolean
  emailed: boolean
}

export default function MessagesPanel({ onChange }: { onChange?: () => void }) {
  const [messages, setMessages] = useState<ContactMessage[] | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
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
    setRead(message, true)
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
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 sm:px-5 pb-4">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap break-words bg-dark-bg border border-gray-800 rounded-xl p-4">{message.message}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <a
                        href={`mailto:${message.email}?subject=${encodeURIComponent('Re: mesajınız')}`}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-purple-500/15 border border-purple-500/40 text-purple-100 text-sm"
                      >
                        <FaReply className="w-3.5 h-3.5" aria-hidden="true" />Yanıtla
                      </a>
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
