'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { m as motion, AnimatePresence } from 'framer-motion' // hafif mod: bkz. MotionProvider
import { FaLock, FaTimes, FaUnlock, FaInfoCircle } from 'react-icons/fa'

interface PasswordModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (url: string) => void
  linkTitle: string
  passwordHint?: string
  linkId: number
}

export default function PasswordModal({
  isOpen,
  onClose,
  onSuccess,
  linkTitle,
  passwordHint,
  linkId
}: PasswordModalProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

  // Modal body'ye portal ile basılır; animasyonlu (transform'lu) üst öğeler fixed konumu bozmasın
  useEffect(() => setMounted(true), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/links/${linkId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (response.ok && data.success && data.url) {
        onSuccess(data.url)
        setPassword('')
        onClose()
      } else {
        setError(data.error || 'Yanlış şifre')
      }
    } catch (err) {
      setError('Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-dynamic-card border border-dynamic rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-500/10 rounded-xl">
                    <FaLock className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-dynamic-text">Korumalı Link</h3>
                    <p className="text-sm text-gray-400">{linkTitle}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover-dynamic rounded-lg transition-colors"
                >
                  <FaTimes className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Password Hint */}
              {passwordHint && (
                <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
                  <FaInfoCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-400 mb-1">İpucu:</p>
                    <p className="text-sm text-dynamic-text opacity-80">{passwordHint}</p>
                  </div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dynamic-text opacity-80 mb-2">
                    Şifre
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError('')
                    }}
                    className="w-full px-4 py-3 bg-dynamic-input border border-dynamic rounded-xl text-dynamic-text focus:outline-none focus:border-dynamic-primary transition-colors"
                    placeholder="Şifreyi girin"
                    autoFocus
                  />
                  {error && (
                    <p className="text-sm text-red-400 mt-2 flex items-center gap-1">
                      <FaTimes className="w-3 h-3" />
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-3 bg-dynamic-input border border-dynamic hover-dynamic text-dynamic-text rounded-xl transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !password}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <span>Kontrol ediliyor...</span>
                    ) : (
                      <>
                        <FaUnlock className="w-4 h-4" />
                        <span>Kilidi Aç</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
