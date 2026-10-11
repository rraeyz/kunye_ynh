// Ziyaretçi sayfasında blokların dizilişi.
// Sıra her zaman admin panelindeki sıradır; sadece art arda gelen benzer bloklar
// (linkler, metin/geri sayım/kupon, proje kartları) geniş ekranda yan yana bir ızgarada toplanır.
// Öne çıkanlar, galeri, Spotify ve gömmeler her zaman tam genişlik kaplar.

export type RunKind = 'links' | 'notes' | 'cards'

export type PageSegment<T> =
  | { kind: 'run'; run: RunKind; items: T[] }
  | { kind: 'wide'; item: T }

interface BlockLike {
  type: string
  featured?: boolean
}

const LINK_LIKE = new Set(['link', 'donation', 'contact'])

export function runKindOf(block: BlockLike): RunKind | null {
  if (block.featured) return null
  if (LINK_LIKE.has(block.type || 'link')) return 'links'
  if (block.type === 'text' || block.type === 'countdown' || block.type === 'coupon') return 'notes'
  if (block.type === 'portfolio' || block.type === 'product') return 'cards'
  return null
}

export function groupBlocks<T extends BlockLike>(blocks: T[]): PageSegment<T>[] {
  const segments: PageSegment<T>[] = []
  for (const block of blocks) {
    const kind = runKindOf(block)
    const last = segments[segments.length - 1]
    if (kind && last?.kind === 'run' && last.run === kind) {
      last.items.push(block)
    } else if (kind) {
      segments.push({ kind: 'run', run: kind, items: [block] })
    } else {
      segments.push({ kind: 'wide', item: block })
    }
  }
  return segments
}

// Sekmelerde gösterilecek kategoriler (ilk görülme sırasıyla, boşlar hariç)
export function blockCategories(blocks: Array<{ category?: string | null }>): string[] {
  const seen: string[] = []
  for (const block of blocks) {
    const category = (block.category || '').trim()
    if (category && !seen.includes(category)) seen.push(category)
  }
  return seen
}
