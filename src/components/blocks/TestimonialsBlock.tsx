import type { BlockItem } from '@/lib/links'

// Referanslar: alıntı + kişi adı + unvan. Geniş ekranda ikişerli dizilir.
export default function TestimonialsBlock({ title, items }: { title: string; items: BlockItem[] }) {
  return (
    <section className="text-dynamic-text">
      {title && <h3 className="kicker mb-3">{title}</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item, index) => (
          <figure key={index} className="site-card px-5 py-4 flex flex-col gap-3">
            {item.quote && <blockquote className="leading-relaxed whitespace-pre-line break-words opacity-90">“{item.quote}”</blockquote>}
            {(item.name || item.role) && (
              <figcaption className="text-sm mt-auto">
                {item.name && <span className="font-semibold">{item.name}</span>}
                {item.role && <span className="opacity-60">{item.name ? ' · ' : ''}{item.role}</span>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  )
}
