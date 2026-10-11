import bcrypt from 'bcryptjs'
import { isSafeUrl } from '@/lib/security'

// Desteklenen blok tipleri
export const LINK_TYPES = [
  'link', 'contact', 'donation',
  'embed-youtube', 'embed-twitter', 'embed-instagram',
  'text', 'gallery', 'spotify', 'countdown', 'portfolio',
  'heading', 'skills', 'coupon', 'testimonials', 'faq', 'timeline',
] as const

// Liste bloklarının satır alanları (Link.items, JSON dizi). Panel formu ve sayfa da buradan okur.
export const ITEM_FIELDS: Record<string, readonly string[]> = {
  skills: ['label'],
  testimonials: ['quote', 'name', 'role'],
  faq: ['q', 'a'],
  timeline: ['date', 'title', 'text'],
}
const MAX_ITEMS = 50

export type BlockItem = Record<string, string>

// Kayıtlı JSON'dan güvenli satırlar: yalnızca bilinen alanlar, metin, boş satırlar atılır
export function parseItems(type: string, value: unknown): BlockItem[] {
  const fields = ITEM_FIELDS[type]
  if (!fields) return []
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value || '[]')
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => Object.fromEntries(fields.map((field) => [field, String((item as any)[field] ?? '').trim().slice(0, 2000)])))
    .filter((item) => Object.values(item).some(Boolean))
    .slice(0, MAX_ITEMS)
}

// URL'si zorunlu ve gerçekten açılan tipler (contact'ta url alanı sadece başlıktır)
const URL_REQUIRED_TYPES = new Set(['link', 'donation', 'embed-youtube', 'embed-twitter', 'embed-instagram', 'spotify'])
// URL'si isteğe bağlı ama verilirse güvenli olması gereken tipler
const URL_OPTIONAL_TYPES = new Set(['portfolio', 'countdown', 'coupon'])

export function requiresSafeUrl(type: string | undefined): boolean {
  return URL_REQUIRED_TYPES.has(type || 'link')
}

export function isUrlRequired(type: string | undefined): boolean {
  return URL_REQUIRED_TYPES.has(type || 'link')
}

// Spotify paylaşım linkini (open.spotify.com/track/ID?si=...) embed adresine çevirir
export function spotifyEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'open.spotify.com') return null
    const match = parsed.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/)
    return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}` : null
  } catch {
    return null
  }
}

// Görsel adresi: sadece yüklenen dosyalar (/media/...) veya http(s)
export function isImageUrl(value: unknown): value is string {
  return typeof value === 'string' && (/^\/media\/[a-z]+-[0-9a-f-]{36}\.(webp|png|jpg)$/.test(value) || isSafeUrl(value))
}

export function parseImages(value: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter(isImageUrl) : []
  } catch {
    return []
  }
}

export function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = new Date(value as string)
  return isNaN(date.getTime()) ? null : date
}

export function normalizeSlug(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)
}

const isBcryptHash = (value: string) => /^\$2[aby]\$\d{2}\$/.test(value)

// Admin panelinden gelen link verisini doğrular ve Prisma için hazırlar.
// existingPasswordHash: düzenlemede panel mevcut hash'i geri gönderirse dokunulmaz.
export async function buildLinkData(
  body: Record<string, any>,
  existingPasswordHash?: string
): Promise<{ data: Record<string, any> } | { error: string }> {
  const data: Record<string, any> = {}
  const type = String(body.type || 'link')

  if (body.type !== undefined) {
    if (!(LINK_TYPES as readonly string[]).includes(type)) return { error: 'Geçersiz blok tipi' }
    data.type = type
  }

  if (body.title !== undefined) data.title = String(body.title).slice(0, 200)
  if (body.icon !== undefined) data.icon = String(body.icon || 'FaLink').slice(0, 500)
  if (body.category !== undefined) data.category = String(body.category || '').slice(0, 100)
  if (body.passwordHint !== undefined) data.passwordHint = String(body.passwordHint || '').slice(0, 200)
  if (body.enabled !== undefined) data.enabled = !!body.enabled
  if (body.featured !== undefined) data.featured = !!body.featured
  if (body.order !== undefined) data.order = parseInt(body.order) || 0
  if (body.slug !== undefined) data.slug = normalizeSlug(body.slug)
  if (body.description !== undefined) data.description = String(body.description || '').slice(0, 5000)

  if (body.thumbnail !== undefined) {
    const thumbnail = String(body.thumbnail || '').trim()
    if (thumbnail && !isImageUrl(thumbnail)) return { error: 'Geçersiz görsel adresi' }
    data.thumbnail = thumbnail
  }

  if (body.items !== undefined) {
    const items = parseItems(type, body.items)
    if (Array.isArray(body.items) && body.items.length > MAX_ITEMS) return { error: `En fazla ${MAX_ITEMS} satır eklenebilir` }
    data.items = items.length ? JSON.stringify(items) : ''
  }

  if (body.images !== undefined) {
    const images = Array.isArray(body.images) ? body.images : []
    if (images.length > 24) return { error: 'Galeride en fazla 24 görsel olabilir' }
    if (!images.every(isImageUrl)) return { error: 'Galeride geçersiz görsel adresi var' }
    data.images = JSON.stringify(images)
  }

  const startDate = parseDate(body.startDate)
  if (startDate !== undefined) data.startDate = startDate
  const endDate = parseDate(body.endDate)
  if (endDate !== undefined) data.endDate = endDate
  const targetDate = parseDate(body.targetDate)
  if (targetDate !== undefined) data.targetDate = targetDate

  if (body.url !== undefined) {
    const url = String(body.url).trim()
    if (requiresSafeUrl(type) && !isSafeUrl(url)) {
      return { error: 'Geçersiz URL. Sadece http(s), mailto ve tel linkleri kabul edilir.' }
    }
    if (URL_OPTIONAL_TYPES.has(type) && url && !isSafeUrl(url)) {
      return { error: 'Geçersiz URL. Sadece http(s), mailto ve tel linkleri kabul edilir.' }
    }
    if (type === 'spotify' && !spotifyEmbedUrl(url)) {
      return { error: 'Geçerli bir Spotify linki girin (open.spotify.com/track/..., /album/..., /playlist/...)' }
    }
    data.url = url
  }

  if (body.password !== undefined) {
    const password = String(body.password || '')
    if (!password) {
      data.password = ''
    } else if (password === existingPasswordHash && isBcryptHash(password)) {
      // Değişmedi
    } else {
      data.password = await bcrypt.hash(password, 10)
    }
  }

  return { data }
}
