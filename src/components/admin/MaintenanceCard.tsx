'use client'

import { useEffect, useState } from 'react'
import { FaTools } from 'react-icons/fa'

// Ayarlar → Bakım modu: açıkken ziyaretçiler yalnızca bakım mesajını görür, admin siteyi normal görür
export default function MaintenanceCard() {
  const [enabled, setEnabled] = useState(false)
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((profile) => {
      if (!profile) return
      setEnabled(!!profile.maintenanceMode)
      setText(profile.maintenanceMessage || '')
    }).catch(() => {})
  }, [])

  const save = async (next: { maintenanceMode?: boolean; maintenanceMessage?: string }, okText: string) => {
    setMessage(null)
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => null)
    if (!response?.ok) {
      setMessage({ ok: false, text: 'Kaydedilemedi' })
      return false
    }
    setMessage({ ok: true, text: okText })
    return true
  }

  const toggle = async () => {
    const value = !enabled
    if (value && !confirm('Bakım modu açılsın mı? Ziyaretçiler siteyi göremez, yalnızca bakım mesajını görür.')) return
    setEnabled(value)
    if (!(await save({ maintenanceMode: value, maintenanceMessage: text }, value ? 'Bakım modu açıldı' : 'Bakım modu kapatıldı; site herkese açık'))) setEnabled(!value)
  }

  return (
    <div className={`bg-dark-card border rounded-2xl p-5 sm:p-8 ${enabled ? 'border-amber-500/60' : 'border-gray-800'}`}>
      <div className="flex items-start gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Bakım modu"
          onClick={toggle}
          className={`relative w-11 h-6 mt-1 rounded-full shrink-0 transition-colors ${enabled ? 'bg-amber-500' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><FaTools className="w-4 h-4 text-amber-400" aria-hidden="true" />Bakım modu</h2>
          <p className="text-sm text-gray-400 mt-1">
            {enabled ? 'Açık: ziyaretçiler yalnızca aşağıdaki mesajı görüyor. Sen admin olduğun için siteyi normal görürsün.' : 'Kapalı. Açınca ziyaretçiler siteyi değil, yalnızca bakım mesajını görür (büyük değişiklik yaparken işine yarar).'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              aria-label="Bakım mesajı"
              placeholder="Sayfa kısa bir süreliğine bakımda. Birazdan tekrar uğrayın."
              className="flex-1 min-w-0 px-4 py-2.5 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
            />
            <button type="button" onClick={() => save({ maintenanceMessage: text }, 'Mesaj kaydedildi')} className="px-4 py-2.5 rounded-xl border border-gray-700 text-gray-200 text-sm hover:border-gray-600">
              Mesajı kaydet
            </button>
          </div>
          {message && <p className={`text-sm mt-2 ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>}
        </div>
      </div>
    </div>
  )
}
