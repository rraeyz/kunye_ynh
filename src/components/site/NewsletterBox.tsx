'use client'

import { useState } from 'react'

// Bülten abonelik kutusu (admin: Profil → Profil kartı → "Bülten kutusu")
export default function NewsletterBox() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  // E-posta onayı açıksa kayıt, gelen e-postadaki linke tıklanınca tamamlanır
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Abonelik başarısız')
      setPending(!!data.pending)
      setState('done')
      setEmail('')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Bir hata oluştu, lütfen tekrar deneyin.')
    }
  }

  return (
    <form onSubmit={submit} className="site-card p-5 flex flex-col gap-3">
      <label htmlFor="newsletter-email" className="font-semibold text-dynamic-text">Yeni içeriklerden haberdar ol</label>
      {state === 'done' ? (
        <p className="text-sm text-dynamic-text opacity-80" role="status">{pending ? 'Neredeyse tamam: e-postana gelen linke tıklayıp aboneliğini onayla.' : 'Abone oldun, teşekkürler!'}</p>
      ) : (
        <div className="flex gap-2">
          <input
            id="newsletter-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-posta adresin"
            className="flex-1 min-w-0 h-11 px-3 rounded-dynamic bg-dynamic-input border border-dynamic text-dynamic-text placeholder:opacity-60 focus:outline-none focus:border-dynamic-primary"
          />
          <button type="submit" disabled={state === 'sending'} className="h-11 px-4 rounded-dynamic bg-dynamic-primary text-white font-semibold disabled:opacity-60 hover:opacity-90">
            {state === 'sending' ? '...' : 'Abone ol'}
          </button>
        </div>
      )}
      {state === 'error' && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </form>
  )
}
