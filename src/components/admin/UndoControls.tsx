'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FaUndo, FaRedo } from 'react-icons/fa'
import { ADMIN_SAVED_EVENT } from './adminEvents'

// Üst çubuktaki Geri al / İleri al. Sayfa içeriğine (profil, görünüm, bloklar) yapılan değişiklikleri
// adım adım geri alır. Panel bölümleri kendi verilerini tuttuğu için işlemden sonra sayfa yenilenir.

type Step = { label: string; createdAt: string } | null

export default function UndoControls() {
  const [status, setStatus] = useState<{ undo: Step; redo: Step }>({ undo: null, redo: null })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const load = useCallback(() => {
    fetch('/api/admin/revisions')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setStatus(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const onSaved = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(load, 500)
    }
    window.addEventListener(ADMIN_SAVED_EVENT, onSaved)
    return () => {
      window.removeEventListener(ADMIN_SAVED_EVENT, onSaved)
      clearTimeout(timer.current)
    }
  }, [load])

  const step = async (direction: 'undo' | 'redo') => {
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/admin/revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'İşlem başarısız')
      setNotice(`${direction === 'undo' ? 'Geri alındı' : 'Yeniden uygulandı'}: ${data.label}`)
      setTimeout(() => window.location.reload(), 700)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'İşlem başarısız')
      setBusy(false)
      load()
    }
  }

  const buttonClass = 'p-2.5 rounded-lg border border-gray-800 bg-dark-card text-gray-200 hover:border-gray-700 disabled:opacity-35 disabled:hover:border-gray-800'

  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only" aria-live="polite">{notice}</span>
      {notice && <span className="hidden md:inline text-xs text-gray-400 max-w-[220px] truncate" title={notice}>{notice}</span>}
      <button
        type="button"
        onClick={() => step('undo')}
        disabled={busy || !status.undo}
        className={buttonClass}
        aria-label={status.undo ? `Geri al: ${status.undo.label}` : 'Geri alınacak değişiklik yok'}
        title={status.undo ? `Geri al: ${status.undo.label}` : 'Geri alınacak değişiklik yok'}
      >
        <FaUndo className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => step('redo')}
        disabled={busy || !status.redo}
        className={buttonClass}
        aria-label={status.redo ? `İleri al: ${status.redo.label}` : 'İleri alınacak değişiklik yok'}
        title={status.redo ? `İleri al: ${status.redo.label}` : 'İleri alınacak değişiklik yok'}
      >
        <FaRedo className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
