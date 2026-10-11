'use client'

import { LazyMotion, domAnimation } from 'framer-motion'

// Ziyaretçi sayfasının animasyonları framer-motion'ın hafif modunu kullanır: bileşenler `m` ile
// yazılır, yalnızca kullanılan özellikler (animate/initial/exit/transition) yüklenir. `strict`:
// yanlışlıkla tam `motion` bileşeni kullanılırsa geliştirmede hata verir (paket yeniden büyümesin).
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  )
}
