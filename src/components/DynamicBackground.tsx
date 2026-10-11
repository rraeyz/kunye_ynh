'use client'

import { m as motion } from 'framer-motion' // hafif mod: bkz. MotionProvider

// Sabit tohumlu sözde rastgele sayı: her çizimde aynı yıldız haritası (hidrasyon uyuşmazlığı olmaz)
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const STARS = (() => {
  const random = seeded(20261010)
  return Array.from({ length: 90 }, () => ({
    x: +(random() * 100).toFixed(2),
    y: +(random() * 100).toFixed(2),
    r: +(0.5 + random() * 1.1).toFixed(2),
    twinkle: random() < 0.15,
    delay: +(random() * 4).toFixed(2),
  }))
})()

interface DynamicBackgroundProps {
  type: string
  backgroundColor: string
  primaryColor: string
  accentColor: string
  imageUrl?: string
  opacity?: number
}

export default function DynamicBackground({ 
  type, 
  backgroundColor, 
  primaryColor, 
  accentColor, 
  imageUrl,
  opacity = 100 
}: DynamicBackgroundProps) {
  
  // Solid - Düz renk
  // Not: backgroundColor yerine CSS değişkeni (--color-background) kullanılıyor,
  // böylece ThemeToggle (açık/koyu mod) ile senkron çalışır.
  if (type === 'solid') {
    return (
      <div 
        className="fixed inset-0 -z-10" 
        style={{ backgroundColor: 'var(--color-background)' }}
      />
    )
  }

  // Yıldızlı gece: konumlar sabit (sunucu ve tarayıcı aynı çizer), birkaç yıldız hafifçe parıldar
  if (type === 'stars') {
    return (
      <div className="fixed inset-0 -z-10 stars-bg" style={{ backgroundColor: 'var(--color-background)' }} aria-hidden="true">
        <div
          className="absolute inset-x-0 top-0 h-[70vh] opacity-40"
          style={{ background: `radial-gradient(ellipse 60% 50% at 70% 0%, ${primaryColor}33, transparent 70%)` }}
        />
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {STARS.map((star, index) => (
            <circle
              key={index}
              cx={`${star.x}%`}
              cy={`${star.y}%`}
              r={star.r}
              className={star.twinkle ? 'star star-twinkle' : 'star'}
              style={star.twinkle ? { animationDelay: `${star.delay}s` } : undefined}
            />
          ))}
        </svg>
      </div>
    )
  }

  // Image - Özel görsel
  if (type === 'image' && imageUrl) {
    return (
      <div className="fixed inset-0 -z-10">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ 
            backgroundImage: `url(${imageUrl})`,
            opacity: opacity / 100,
          }}
        />
        <div 
          className="absolute inset-0"
          style={{ backgroundColor: 'var(--color-background)', opacity: 0.5 }}
        />
      </div>
    )
  }

  // Mesh Gradient - Karışık gradient mesh
  if (type === 'mesh-gradient') {
    return (
      <div className="fixed inset-0 -z-10" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="absolute inset-0 opacity-30">
          <div 
            className="absolute top-0 left-0 w-full h-full"
            style={{
              background: `
                radial-gradient(circle at 20% 50%, ${primaryColor}40 0%, transparent 50%),
                radial-gradient(circle at 80% 80%, ${accentColor}40 0%, transparent 50%),
                radial-gradient(circle at 40% 20%, ${primaryColor}30 0%, transparent 50%),
                radial-gradient(circle at 90% 30%, ${accentColor}30 0%, transparent 50%),
                radial-gradient(circle at 10% 80%, ${primaryColor}30 0%, transparent 50%)
              `
            }}
          />
        </div>
      </div>
    )
  }

  // Particles - Yüzen noktalar
  if (type === 'particles') {
    return (
      <div className="fixed inset-0 -z-10" style={{ backgroundColor: 'var(--color-background)' }}>
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              backgroundColor: i % 2 === 0 ? primaryColor : accentColor,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>
    )
  }

  // Gradient Blur (default) - Animasyonlu bulanık gradientler
  return (
    <div className="fixed inset-0 -z-10" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full mix-blend-screen filter blur-3xl opacity-10"
          style={{ background: primaryColor }}
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full mix-blend-screen filter blur-3xl opacity-10"
          style={{ background: accentColor }}
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 left-1/3 w-96 h-96 rounded-full mix-blend-screen filter blur-3xl opacity-10"
          style={{ background: primaryColor }}
          animate={{
            x: [0, 50, 0],
            y: [0, -50, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    </div>
  )
}
