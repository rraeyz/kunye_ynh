import type { BlockItem } from '@/lib/links'

// Sıkça sorulan sorular: tarayıcının kendi açılır/kapanır öğesi (<details>), JavaScript gerekmez
export default function FaqBlock({ title, items }: { title: string; items: BlockItem[] }) {
  return (
    <section className="site-card px-5 py-4 text-dynamic-text">
      {title && <h3 className="kicker mb-2">{title}</h3>}
      <div className="divide-y divide-[color:var(--color-border)]">
        {items.map((item, index) => (
          <details key={index} className="group py-3">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-medium break-words [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden="true" className="shrink-0 text-dynamic-primary transition-transform group-open:rotate-45 text-xl leading-none">+</span>
            </summary>
            {item.a && <p className="mt-2 opacity-80 leading-relaxed whitespace-pre-line break-words">{item.a}</p>}
          </details>
        ))}
      </div>
    </section>
  )
}
