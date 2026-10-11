'use client'

import { useState, useEffect } from 'react'
import { FaSun, FaMoon } from 'react-icons/fa'
import { m as motion } from 'framer-motion' // hafif mod: bkz. MotionProvider

// Açık/koyu mod sadece <html> üzerindeki 'light' / 'dark' sınıfıyla yönetilir.
// Renkler ThemeProvider'ın CSS değişkenlerinden gelir; burada renk yazılmaz,
// böylece admin panelinde seçilen tema renkleri korunur.
function applyTheme(isDark: boolean) {
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.classList.toggle('light', !isDark)
  try {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  } catch {
    // Gizli sekme vb. durumlarda localStorage kullanılamayabilir
  }
}

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // ThemeScript ile aynı mantık: kayıtlı tercih, yoksa sistem teması
    let saved: string | null = null
    try {
      saved = localStorage.getItem('theme')
    } catch {}
    const isDark = saved ? saved === 'dark' : !window.matchMedia('(prefers-color-scheme: light)').matches
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.classList.toggle('light', !isDark)
    setDarkMode(isDark)
    setMounted(true)

    // Admin paneline client-side geçişte açık mod sınıfı taşınmasın
    return () => {
      document.documentElement.classList.remove('light', 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const newMode = !darkMode
    setDarkMode(newMode)
    applyTheme(newMode)
  }

  if (!mounted) return null

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      onClick={toggleTheme}
      className="fixed top-6 right-6 z-50 p-3 rounded-full bg-dynamic-card border-2 border-dynamic hover:border-dynamic-primary transition-all duration-300 shadow-lg hover:shadow-xl group"
      aria-label="Toggle theme"
      title={darkMode ? 'Açık moda geç' : 'Koyu moda geç'}
    >
      <motion.div
        initial={false}
        animate={{ rotate: darkMode ? 0 : 180 }}
        transition={{ duration: 0.3 }}
      >
        {darkMode ? (
          <FaSun className="w-5 h-5 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
        ) : (
          <FaMoon className="w-5 h-5 text-dynamic-primary transition-colors" />
        )}
      </motion.div>
    </motion.button>
  )
}
