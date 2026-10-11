import type { BlockItem } from '@/lib/links'

// Zaman çizelgesi (kariyer, eğitim): solda dikey çizgi, her satırda tarih + başlık + açıklama
export default function TimelineBlock({ title, items }: { title: string; items: BlockItem[] }) {
  return (
    <section className="site-card px-5 py-5 text-dynamic-text">
      {title && <h3 className="kicker mb-4">{title}</h3>}
      <ol className="relative border-l border-[color:var(--color-border)] ml-1.5 space-y-5">
        {items.map((item, index) => (
          <li key={index} className="pl-5 relative">
            <span aria-hidden="true" className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[color:var(--color-primary)]" />
            {item.date && <div className="text-xs font-semibold text-dynamic-primary">{item.date}</div>}
            {item.title && <div className="font-semibold leading-snug break-words">{item.title}</div>}
            {item.text && <p className="text-sm opacity-75 mt-0.5 whitespace-pre-line break-words">{item.text}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}
