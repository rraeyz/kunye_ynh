'use client'

import { useState } from 'react'
import { FaCopy, FaCheck, FaArrowRight } from 'react-icons/fa'
import { openUrl, trackClick } from '@/lib/clientLinks'

// Kupon / indirim kodu: "Kopyala" ile panoya alınır (kopyalama tıklama olarak sayılır), varsa mağaza linki
export default function CouponBlock({ linkId, title, code, url }: { linkId: number; title: string; code: string; url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      trackClick(linkId)
    } catch {
      // Panoya erişilemiyorsa kod zaten ekranda seçilebilir durumda
    }
  }

  return (
    <section className="site-card h-full px-5 py-4 text-dynamic-text flex flex-col gap-3">
      {title && <h3 className="font-semibold leading-snug break-words">{title}</h3>}
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 px-3 py-2 rounded-dynamic border border-dashed border-dynamic-primary text-center font-mono font-semibold tracking-wider break-all select-all">{code}</code>
        <button type="button" onClick={copy} className="shrink-0 inline-flex items-center gap-2 px-3 rounded-dynamic bg-dynamic-primary text-white text-sm font-medium" aria-live="polite">
          {copied ? <FaCheck className="w-3.5 h-3.5" aria-hidden="true" /> : <FaCopy className="w-3.5 h-3.5" aria-hidden="true" />}
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>
      {url && (
        <a href={url} rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); openUrl(url) }} className="inline-flex items-center gap-2 text-sm font-semibold text-dynamic-primary self-start">
          Kullanmak için mağazaya git <FaArrowRight className="w-3 h-3" aria-hidden="true" />
        </a>
      )}
    </section>
  )
}
