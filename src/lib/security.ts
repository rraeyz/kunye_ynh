import crypto from 'crypto'

// İstemci IP'si. Nginx X-Real-IP'yi $remote_addr ile set ediyor, önce ona güveniyoruz.
export function getClientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0].trim()
  return forwardedFor || '127.0.0.1'
}

// Ham IP saklanmaz (KVKK/GDPR): JWT_SECRET ile tuzlanmış kısa bir hash tutulur.
// JWT_SECRET açılışta her zaman ayarlanır (bkz. loadPersistentSecret); 'linktree' yalnızca son çare.
export function hashIp(ip: string): string {
  const salt = process.env.JWT_SECRET || 'linktree'
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').substring(0, 16)
}

export function isPrivateIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  )
}

type Bucket = { count: number; resetAt: number }
const globalForRateLimit = globalThis as unknown as { rateLimitBuckets?: Map<string, Bucket> }
const buckets = (globalForRateLimit.rateLimitBuckets ??= new Map<string, Bucket>())

// Basit bellek içi rate limit (tek container için yeterli).
// true dönerse istek sınırı aşmıştır.
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()

  if (buckets.size > 10_000) {
    buckets.forEach((bucket, bucketKey) => {
      if (bucket.resetAt <= now) buckets.delete(bucketKey)
    })
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  bucket.count++
  return bucket.count > limit
}

// Sayaç artırmadan sınırın aşılıp aşılmadığına bakar (ör. sadece hatalı girişleri saymak için)
export function isRateLimitExceeded(key: string, limit: number): boolean {
  const bucket = buckets.get(key)
  return !!bucket && bucket.resetAt > Date.now() && bucket.count >= limit
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)
}

// Sadece http(s), mailto ve tel linklerine izin ver (javascript: vb. engellenir)
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false
  try {
    const parsed = new URL(url.trim())
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

// İzin verilen alanları seçer; gövdeyi doğrudan Prisma'ya vermemek için
export function pick<T extends Record<string, any>>(source: T, keys: readonly string[]): Partial<T> {
  const result: Record<string, any> = {}
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key]
  }
  return result as Partial<T>
}
