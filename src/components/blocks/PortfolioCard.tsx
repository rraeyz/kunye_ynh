'use client'

import { FaArrowRight } from 'react-icons/fa'
import { openUrl, trackClick } from '@/lib/clientLinks'

interface PortfolioCardProps {
  linkId: number
  title: string
  description: string
  image: string
  url: string
  featured?: boolean
  // Ürün kartı: fiyat rozeti ve "Satın al" yazısı
  price?: string
  product?: boolean
}

// Portfolyo/proje kartı: görsel + başlık + açıklama; link verilmişse kartın tamamı tıklanır
export default function PortfolioCard({ linkId, title, description, image, url, featured = false, price = '', product = false }: PortfolioCardProps) {
  const clickable = !!url
  const priceTag = price && <span className="inline-block px-2.5 py-1 rounded-full bg-dynamic-primary text-white text-sm font-semibold">{price}</span>
  const content = featured ? (
    // Öne çıkan proje: geniş ekranda solda görsel, sağda metin
    <div className="flex flex-col md:flex-row">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="w-full md:w-1/2 aspect-[16/9] md:aspect-auto md:min-h-[220px] object-cover" loading="lazy" />
      )}
      <div className="flex-1 flex flex-col justify-center gap-2 p-5 md:p-7 text-left text-dynamic-text">
        <span className="kicker text-dynamic-primary !opacity-100">{product ? 'Öne çıkan ürün' : 'Öne çıkan proje'}</span>
        <h3 className="text-xl md:text-2xl font-semibold leading-snug">{title}</h3>
        {priceTag && <div>{priceTag}</div>}
        {description && <p className="opacity-75 leading-relaxed whitespace-pre-line line-clamp-4">{description}</p>}
        {clickable && (
          <span className="inline-flex items-center gap-2 mt-1 font-semibold text-dynamic-primary">{product ? 'Satın al' : 'Projeye git'} <FaArrowRight className="w-3.5 h-3.5" /></span>
        )}
      </div>
    </div>
  ) : (
    <>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="w-full aspect-[16/10] object-cover" loading="lazy" />
      )}
      <div className="px-4 py-3.5 text-left text-dynamic-text">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold leading-snug">{title}</h3>
          {clickable && <FaArrowRight className="w-3.5 h-3.5 shrink-0 opacity-50 -rotate-45 group-hover:opacity-100 group-hover:text-[color:var(--color-primary)] transition-all" />}
        </div>
        {description && <p className="mt-1 text-sm opacity-70 line-clamp-3 whitespace-pre-line">{description}</p>}
        {(priceTag || (product && clickable)) && (
          <div className="flex items-center justify-between gap-3 mt-3">
            {priceTag || <span />}
            {product && clickable && <span className="text-sm font-semibold text-dynamic-primary">Satın al</span>}
          </div>
        )}
      </div>
    </>
  )
  const className = `group link-card relative block w-full h-full overflow-hidden bg-dynamic-card rounded-dynamic border border-dynamic transition-colors ${featured ? 'featured-card' : ''}`

  if (!clickable) return <article className={className}>{content}</article>
  return (
    <a
      href={url}
      rel="noopener noreferrer"
      onClick={(e) => { e.preventDefault(); trackClick(linkId); openUrl(url) }}
      className={className}
    >
      {content}
    </a>
  )
}
