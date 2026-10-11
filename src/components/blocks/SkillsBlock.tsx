import type { BlockItem } from '@/lib/links'

// Beceri / araç rozetleri: kısa etiketlerden oluşan bulut
export default function SkillsBlock({ title, items }: { title: string; items: BlockItem[] }) {
  return (
    <section className="site-card px-5 py-5 text-dynamic-text">
      {title && <h3 className="kicker mb-3">{title}</h3>}
      <ul className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <li key={index} className="profile-chip break-words">{item.label}</li>
        ))}
      </ul>
    </section>
  )
}
