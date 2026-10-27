import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { cookies, headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { getState, setState } from '@/lib/appState'
import { hashRecoveryCode, verifyTotp } from '@/lib/totp'

export const AUTH_COOKIE = 'auth-token'
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7 // 7 gün

// Eski kurulumlarda .env'e yazılmış "henüz ayarlanmadı" değerleri
const PLACEHOLDER_VALUES = new Set([
  '',
  'admin123',
  'change-this-password',
  'auto-generated-on-first-setup',
  'set-during-initial-setup',
  'SETUP_REQUIRED',
])

const globalForAuth = globalThis as unknown as { fallbackJwtSecret?: string }

// JWT_SECRET her çağrıda okunur: setup sihirbazı process.env'i runtime'da günceller.
// Secret yoksa sabit bir değere DÜŞMEYİZ; process'e özel rastgele bir secret üretilir
// (restart sonrası oturumlar düşer ama kimse token taklit edemez).
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret && !PLACEHOLDER_VALUES.has(secret)) return secret
  if (!globalForAuth.fallbackJwtSecret) {
    globalForAuth.fallbackJwtSecret = crypto.randomBytes(32).toString('base64')
  }
  return globalForAuth.fallbackJwtSecret
}

// Açılışta bir kez çağrılır (src/instrumentation.ts). .env'de geçerli bir JWT_SECRET varsa veritabanına da
// yazılır; yoksa (ör. Docker'da .env dosyası yazılamadıysa) veritabanındaki anahtar kullanılır, o da yoksa
// üretilip saklanır. Böylece yeniden başlatmada oturumlar, IP özetleri ve e-postalardaki
// "abonelikten çık" linkleri geçersiz olmaz.
export async function loadPersistentSecret(): Promise<void> {
  const key = 'jwtSecret'
  try {
    const fromEnv = process.env.JWT_SECRET
    const stored = await prisma.appState.findUnique({ where: { key } })
    if (fromEnv && !PLACEHOLDER_VALUES.has(fromEnv)) {
      if (stored?.value !== fromEnv) {
        await prisma.appState.upsert({ where: { key }, update: { value: fromEnv }, create: { key, value: fromEnv } })
      }
      return
    }
    const secret = stored?.value || crypto.randomBytes(32).toString('base64')
    if (!stored) await prisma.appState.create({ data: { key, value: secret } })
    process.env.JWT_SECRET = secret
  } catch (error) {
    console.error('Kalıcı gizli anahtar yüklenemedi, bu çalışma için geçici anahtar kullanılacak:', error)
  }
}

export function signToken(payload: object): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, getJwtSecret())
  } catch (error) {
    return null
  }
}

export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(AUTH_COOKIE)?.value || null
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken()
  if (!token) return false

  const payload = verifyToken(token)
  if (!payload) return false

  // Token, verildiği andaki oturum sürümünü taşır; şifre değişince sürüm artar ve eski token reddedilir
  const admin = await prisma.admin.findFirst({ select: { sessionVersion: true } })
  if (!admin) return false
  return (payload.sv ?? 0) === admin.sessionVersion
}

// Tüm oturumları (bu cihaz dahil) geçersiz kılar
export async function revokeAllSessions() {
  await prisma.admin.updateMany({ data: { sessionVersion: { increment: 1 } } })
  const cookieStore = await cookies()
  cookieStore.delete(AUTH_COOKIE)
}

export async function setAuthCookie(username: string) {
  const admin = await prisma.admin.findFirst({ select: { sessionVersion: true } })
  const token = signToken({ userId: 1, username, sv: admin?.sessionVersion ?? 0 })
  const cookieStore = await cookies()
  // Secure bayrağı isteğin gerçek protokolüne göre: HTTPS (YunoHost/nginx) → secure,
  // doğrudan http://sunucu:3000 erişimi → secure değil (yoksa tarayıcı cookie'yi kaydetmez, giriş yapılamaz)
  const proto = headers().get('x-forwarded-proto')?.split(',')[0].trim()
  const isHttps = proto ? proto === 'https' : false
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE,
  })
}

// Eski sürümler admin şifresini düz metin olarak .env'de tutuyordu
function getLegacyEnvPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD
  if (!password || PLACEHOLDER_VALUES.has(password)) return null
  return password
}

function safeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest()
  const hashB = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

// Dış uygulamaların (ör. blog) bülten planlaması için API anahtarı (Ayarlar → Güvenlik).
// Anahtarın kendisi saklanmaz, yalnızca SHA-256 özeti AppState'te durur
export const API_TOKEN_STATE = 'apiTokenHash'
export const hashApiToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export async function hasValidApiToken(requestHeaders: Headers): Promise<boolean> {
  const token = requestHeaders.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return false
  const stored = await getState(API_TOKEN_STATE)
  return !!stored && safeEqual(hashApiToken(token), stored)
}

export async function isSetupComplete(): Promise<boolean> {
  try {
    const adminCount = await prisma.admin.count()
    if (adminCount > 0) return true
  } catch (error) {
    // Database henüz hazır değil
  }
  return getLegacyEnvPassword() !== null
}

// Admin bilgilerini doğrular. Tek kaynak Admin tablosudur (bcrypt hash).
// Tablo boşsa eski .env şifresi kabul edilir ve ilk başarılı girişte tabloya taşınır.
export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const admin = await prisma.admin.findFirst()

  if (admin) {
    const passwordOk = await bcrypt.compare(password, admin.passwordHash)
    return passwordOk && safeEqual(username, admin.username)
  }

  const legacyPassword = getLegacyEnvPassword()
  if (!legacyPassword) return false

  const legacyUsername = process.env.ADMIN_USERNAME || 'admin'
  if (!safeEqual(username, legacyUsername) || !safeEqual(password, legacyPassword)) {
    return false
  }

  await prisma.admin.create({
    data: {
      id: 1,
      username: legacyUsername,
      passwordHash: await bcrypt.hash(password, 12),
    },
  })
  return true
}

// Şifre doğrulandıktan sonra ikinci adım. 'off': 2FA kapalı, 'required': kod gönderilmedi,
// 'ok' / 'recovery': geçerli kod ya da kurtarma kodu (kurtarma kodu kullanılınca silinir), 'invalid': hatalı.
export async function verifySecondFactor(code: unknown): Promise<'off' | 'required' | 'ok' | 'recovery' | 'invalid'> {
  const admin = await prisma.admin.findFirst({ select: { id: true, totpSecret: true, totpRecovery: true } })
  if (!admin?.totpSecret) return 'off'
  const given = typeof code === 'string' ? code.trim() : ''
  if (!given) return 'required'

  const counter = verifyTotp(admin.totpSecret, given)
  if (counter !== null) {
    // Aynı kod (30 sn içinde) ikinci kez kullanılamaz
    const last = Number(await getState('totpLastCounter'))
    if (Number.isFinite(last) && counter <= last) return 'invalid'
    await setState('totpLastCounter', String(counter))
    return 'ok'
  }

  let hashes: string[] = []
  try {
    hashes = JSON.parse(admin.totpRecovery || '[]')
  } catch {}
  const hash = hashRecoveryCode(given)
  if (given.length >= 10 && hashes.includes(hash)) {
    await prisma.admin.update({ where: { id: admin.id }, data: { totpRecovery: JSON.stringify(hashes.filter((h) => h !== hash)) } })
    return 'recovery'
  }
  return 'invalid'
}
