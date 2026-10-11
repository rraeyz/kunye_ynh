'use client'

import { useEffect, useRef, useState } from 'react'
import { FaRedo, FaTimes } from 'react-icons/fa'
import { ADMIN_SAVED_EVENT } from './adminEvents'

// Panelde telefon çerçevesinde sitenin canlı önizlemesi.
// Panelden yapılan başarılı her kayıt (POST/PUT/DELETE /api/..., bkz. adminEvents) önizlemeyi otomatik yeniler.
// Önizleme admin oturumuyla açıldığı için ziyaret istatistiklerine yazılmaz (/api/views admin'i saymaz).
export default function LivePreview({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const onSaved = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setVersion((v) => v + 1), 400)
    }
    window.addEventListener(ADMIN_SAVED_EVENT, onSaved)
    return () => {
      window.removeEventListener(ADMIN_SAVED_EVENT, onSaved)
      clearTimeout(timer.current)
    }
  }, [])

  return (
    // Geniş ekranda ızgaranın sağ sütununda yapışkan panel; dar ekranda tam ekran katman
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 xl:sticky xl:top-24 xl:inset-auto xl:z-auto xl:bg-transparent xl:p-0 xl:block xl:self-start">
      <div>
        <div className="flex items-center justify-between mb-3 w-[375px] max-w-full">
          <span className="text-sm font-medium text-gray-300">Canlı önizleme</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setVersion((v) => v + 1)} className="p-2 rounded-lg bg-dark-card text-gray-400 hover:text-white" aria-label="Önizlemeyi yenile" title="Yenile">
              <FaRedo className="w-3 h-3" />
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-lg bg-dark-card text-gray-400 hover:text-white" aria-label="Önizlemeyi kapat" title="Kapat">
              <FaTimes className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="w-[375px] max-w-full h-[min(740px,80vh)] rounded-[2.5rem] border-[10px] border-gray-800 bg-black overflow-hidden shadow-2xl">
          <iframe key={version} src="/" title="Site önizlemesi" className="w-full h-full border-0" />
        </div>
      </div>
    </div>
  )
}
