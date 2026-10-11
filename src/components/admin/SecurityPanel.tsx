'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { FaShieldAlt, FaCheckCircle, FaTimesCircle } from 'react-icons/fa'

// Ayarlar → Güvenlik: iki adımlı doğrulama (TOTP) ve son giriş denemeleri

interface LoginEvent {
  id: number
  timestamp: string
  success: boolean
  reason: string
  ip: string
  userAgent: string
}

const REASONS: Record<string, string> = {
  ok: 'Giriş yapıldı',
  recovery: 'Kurtarma koduyla giriş',
  password: 'Hatalı şifre',
  totp: 'Hatalı doğrulama kodu',
}

const inputClass = 'w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors'

// "Mozilla/5.0 (Windows NT 10.0; ...) Chrome/120" → "Chrome · Windows"
function shortAgent(ua: string) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return [browser, os].filter(Boolean).join(' · ') || ua.slice(0, 40) || '-'
}

export default function SecurityPanel() {
  const [enabled, setEnabled] = useState(false)
  const [recoveryLeft, setRecoveryLeft] = useState(0)
  const [events, setEvents] = useState<LoginEvent[]>([])
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/security')
    if (!response.ok) return
    const data = await response.json()
    setEnabled(data.twoFactor.enabled)
    setRecoveryLeft(data.twoFactor.recoveryLeft)
    setEvents(data.events)
  }, [])

  useEffect(() => { load().catch(() => {}) }, [load])

  const call = async (body: Record<string, unknown>) => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'İşlem başarısız')
      return data
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'İşlem başarısız' })
      return null
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    const data = await call({ action: 'totp-start' })
    if (data) {
      setSetup(data)
      setCode('')
      setCodes([])
    }
  }

  const enable = async (event: React.FormEvent) => {
    event.preventDefault()
    const data = await call({ action: 'totp-enable', code })
    if (data) {
      setSetup(null)
      setCodes(data.recoveryCodes)
      setMessage({ ok: true, text: 'İki adımlı doğrulama açıldı. Kurtarma kodlarını şimdi güvenli bir yere kaydet.' })
      load()
    }
  }

  const disable = async () => {
    if (!password) return setMessage({ ok: false, text: 'Kapatmak için şifreni gir' })
    if (!confirm('İki adımlı doğrulama kapatılsın mı?')) return
    const data = await call({ action: 'totp-disable', password })
    if (data) {
      setPassword('')
      setCodes([])
      setMessage({ ok: true, text: 'İki adımlı doğrulama kapatıldı.' })
      load()
    }
  }

  const regenerate = async () => {
    if (!password) return setMessage({ ok: false, text: 'Yeni kodlar için şifreni gir' })
    const data = await call({ action: 'recovery-regenerate', password })
    if (data) {
      setPassword('')
      setCodes(data.recoveryCodes)
      setMessage({ ok: true, text: 'Yeni kurtarma kodları oluşturuldu; eskiler artık geçersiz.' })
      load()
    }
  }

  const downloadCodes = () => {
    const blob = new Blob([`Künye kurtarma kodları (${window.location.host})\nHer kod bir kez kullanılabilir.\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'kunye-kurtarma-kodlari.txt'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <div className="bg-dark-card border border-gray-800 rounded-2xl p-5 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <FaShieldAlt className="w-5 h-5 text-green-400" />
        <h2 className="text-xl font-bold text-white">Güvenlik</h2>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-1">İki adımlı doğrulama</h3>
          <p className="text-sm text-gray-400 mb-4">
            {enabled
              ? `Açık. Girişte şifreden sonra doğrulama uygulamasındaki kod istenir. Kalan kurtarma kodu: ${recoveryLeft}.`
              : 'Kapalı. Açınca girişte şifreye ek olarak telefonundaki doğrulama uygulamasının (Google Authenticator, Aegis, 1Password...) ürettiği kod istenir.'}
          </p>

          {!enabled && !setup && (
            <button type="button" onClick={start} disabled={busy} className="px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/40 text-green-300 hover:bg-green-500/25 text-sm disabled:opacity-50">
              İki adımlı doğrulamayı kur
            </button>
          )}

          {setup && (
            <form onSubmit={enable} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="bg-white p-3 rounded-xl shrink-0">
                  <QRCodeSVG value={setup.otpauthUrl} size={168} />
                </div>
                <div className="text-sm text-gray-300 space-y-2 min-w-0">
                  <p>1. Doğrulama uygulamasında &quot;hesap ekle&quot; deyip bu QR kodu okut.</p>
                  <p>QR okutamıyorsan bu anahtarı elle gir:</p>
                  <code className="block break-all bg-dark-bg border border-gray-700 rounded-lg px-3 py-2 text-purple-200 select-all">{setup.secret}</code>
                  <p>2. Uygulamanın gösterdiği 6 haneli kodu aşağıya yaz.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  aria-label="Doğrulama kodu"
                  className={`${inputClass} sm:max-w-[200px] tracking-widest`}
                  required
                />
                <button type="submit" disabled={busy} className="px-5 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium disabled:opacity-50">
                  Doğrula ve aç
                </button>
                <button type="button" onClick={() => setSetup(null)} className="px-5 py-3 rounded-xl border border-gray-700 text-gray-300">
                  Vazgeç
                </button>
              </div>
            </form>
          )}

          {codes.length > 0 && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-sm text-amber-300 mb-3">
                Kurtarma kodları yalnızca şimdi gösteriliyor. Telefonunu kaybedersen bu kodlardan biriyle giriş yapabilirsin; her kod bir kez çalışır.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-white mb-3">
                {codes.map((item) => <span key={item} className="bg-dark-bg rounded-lg px-3 py-1.5 text-center">{item}</span>)}
              </div>
              <button type="button" onClick={downloadCodes} className="text-sm text-amber-200 underline">Metin dosyası olarak indir</button>
            </div>
          )}

          {enabled && (
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mevcut şifren"
                aria-label="Mevcut şifre"
                autoComplete="current-password"
                className={`${inputClass} sm:max-w-xs`}
              />
              <button type="button" onClick={regenerate} disabled={busy} className="px-4 py-3 rounded-xl border border-gray-700 text-gray-200 text-sm hover:border-gray-600 disabled:opacity-50">
                Yeni kurtarma kodları
              </button>
              <button type="button" onClick={disable} disabled={busy} className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 text-sm hover:bg-red-500/20 disabled:opacity-50">
                Kapat
              </button>
            </div>
          )}

          {message && (
            <div className={`mt-4 px-4 py-3 rounded-xl text-sm ${message.ok ? 'bg-green-500/10 border border-green-500/50 text-green-400' : 'bg-red-500/10 border border-red-500/50 text-red-400'}`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-gray-800">
          <h3 className="text-sm font-medium text-gray-300 mb-1">Son giriş denemeleri</h3>
          <p className="text-xs text-gray-500 mb-3">Son 30 deneme. Kayıtlar 90 gün sonra silinir. Tanımadığın bir başarılı giriş görürsen şifreni değiştir.</p>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">Henüz kayıt yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="py-2 pr-3 font-medium">Zaman</th>
                    <th className="py-2 pr-3 font-medium">Sonuç</th>
                    <th className="py-2 pr-3 font-medium">IP</th>
                    <th className="py-2 font-medium">Cihaz</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-gray-800/50 text-gray-300">
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(event.timestamp).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex items-center gap-1.5 ${event.success ? 'text-green-400' : 'text-red-400'}`}>
                          {event.success ? <FaCheckCircle aria-hidden="true" /> : <FaTimesCircle aria-hidden="true" />}
                          {REASONS[event.reason] || event.reason}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs break-all">{event.ip}</td>
                      <td className="py-2 text-xs">{shortAgent(event.userAgent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
