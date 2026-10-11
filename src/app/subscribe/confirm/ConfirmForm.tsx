'use client'

import { useState } from 'react'

export default function ConfirmForm({ email, token }: { email: string; token: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleClick = async () => {
    setState('loading')
    try {
      const response = await fetch('/api/subscribe/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) return setState('done')
      setError(data.error || 'Bir hata oluştu, lütfen tekrar deneyin.')
      setState('error')
    } catch {
      setError('Bir hata oluştu, lütfen tekrar deneyin.')
      setState('error')
    }
  }

  if (state === 'done') {
    return <p className="text-green-400">Teşekkürler! {email} adresi bülten listesine eklendi.</p>
  }

  return (
    <>
      <p className="text-gray-400 mb-6">
        <span className="text-white">{email}</span> adresini bülten listesine eklemek için onaylayın.
      </p>
      <button
        onClick={handleClick}
        disabled={state === 'loading'}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium disabled:opacity-50"
      >
        {state === 'loading' ? 'İşleniyor...' : 'Aboneliği onayla'}
      </button>
      {state === 'error' && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </>
  )
}
