'use client'

import type { IconType } from 'react-icons'
import { FaShoppingBag, FaWallet, FaHeart } from 'react-icons/fa'
import { SiBuymeacoffee, SiKofi, SiPatreon, SiPaypal, SiGithubsponsors } from 'react-icons/si'
import { openUrl, trackClick } from '@/lib/clientLinks'
import { SUPPORT_PLATFORMS } from '@/lib/supportPlatforms'

const ICONS: Record<string, IconType> = {
  shopier: FaShoppingBag, buymeacoffee: SiBuymeacoffee, kofi: SiKofi, patreon: SiPatreon,
  paypal: SiPaypal, githubsponsors: SiGithubsponsors, papara: FaWallet, other: FaHeart,
}

// "Destek Ol": başlık + açıklama + birden fazla bağış/destek platformu düğmesi (her tıklama sayılır)
export default function SupportBlock({ linkId, title, text, items }: { linkId: number; title: string; text: string; items: Array<Record<string, string>> }) {
  return (
    <section className="site-card px-5 py-5 text-dynamic-text">
      {title && <h3 className="font-semibold text-lg leading-snug break-words">{title}</h3>}
      {text && <p className="mt-1 opacity-75 whitespace-pre-line break-words">{text}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
        {items.map((item, index) => {
          const Icon = ICONS[item.platform] || FaHeart
          return (
            <a
              key={index}
              href={item.url}
              rel="noopener noreferrer"
              onClick={(e) => { e.preventDefault(); trackClick(linkId); openUrl(item.url) }}
              className="link-card flex items-center gap-3 px-4 py-3 rounded-dynamic border border-dynamic bg-dynamic-card font-medium"
            >
              <span className="icon-chip !w-9 !h-9"><Icon className="w-4 h-4" aria-hidden="true" /></span>
              {SUPPORT_PLATFORMS[item.platform] || SUPPORT_PLATFORMS.other}
            </a>
          )
        })}
      </div>
    </section>
  )
}
