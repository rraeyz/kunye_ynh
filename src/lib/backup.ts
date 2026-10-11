import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { PROFILE_EDITABLE_FIELDS, PROFILE_SETTINGS_FIELDS, normalizeProfileCard, normalizeSettings } from '@/lib/profile'
import { LINK_TYPES, isImageUrl, normalizeSlug, parseDate, parseImages, parseItems } from '@/lib/links'
import { isSafeUrl, isValidEmail } from '@/lib/security'
import { FILE_NAME_PATTERN, UPLOAD_DIR } from '@/lib/uploads'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BackupKind, summarizeBackup } from '@/lib/backupFormat'
import pkg from '../../package.json'

// Yedek alma ve yedekten geri yükleme (Ayarlar → Yedekleme).
// Admin hesabı hiçbir yedeğe girmez ve geri yüklemede değişmez: yüklemeyi yapan kişi kendini kilitleyemez.

// "Yalnızca profil ve görünüm" yedeğine SMTP, bildirim ve diğer ayarlar girmez
const PROFILE_ONLY_FIELDS = PROFILE_EDITABLE_FIELDS.filter((field) => !PROFILE_SETTINGS_FIELDS.has(field))
const profileFieldsFor = (kind: BackupKind): readonly string[] => (kind === 'profile' ? PROFILE_ONLY_FIELDS : PROFILE_EDITABLE_FIELDS)

const PROFILE_INT_FIELDS = new Set(['backgroundOpacity', 'analyticsRetentionDays', 'smtpPort'])
const PROFILE_BOOLEAN_FIELDS = new Set([
  'showContactButton', 'showShareButton', 'showNewsletter', 'showCategoryTabs',
  'showVCard', 'darkMode', 'verified', 'smtpSecure', 'showSocialIcons',
  'newsletterDoubleOptIn', 'autoBackupEnabled', 'weeklyReportEnabled', 'linkHealthEnabled',
])
const PROFILE_IMAGE_FIELDS = new Set(['imageUrl', 'faviconUrl', 'ogImageUrl', 'backgroundImage', 'coverImage'])
const PROFILE_LINK_FIELDS = new Set(['linkedinUrl', 'twitterUrl', 'discordUrl', 'youtubeUrl', 'instagramUrl', 'githubUrl'])

const MEDIA_REFERENCE = /\/media\/([a-z]+-[0-9a-f-]{36}\.(?:webp|png|jpg))/g
const isBcryptHash = (value: unknown) => typeof value === 'string' && /^\$2[aby]\$\d{2}\$.{53}$/.test(value)
const str = (value: unknown, max: number) => String(value ?? '').slice(0, max)
const int = (value: unknown, fallback = 0) => {
  const parsed = parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

// ---------------------------------------------------------------- yedek alma

export async function createBackup(kind: BackupKind) {
  const profile = await prisma.profile.findFirst()
  const backup: Record<string, any> = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    kind,
    createdAt: new Date().toISOString(),
    appVersion: pkg.version,
    profile: Object.fromEntries(profileFieldsFor(kind).map((field) => [field, (profile as any)?.[field]])),
  }

  if (kind !== 'profile') {
    const links = await prisma.link.findMany({ orderBy: { order: 'asc' } })
    backup.links = links.map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      icon: link.icon,
      order: link.order,
      enabled: link.enabled,
      type: link.type,
      passwordHint: link.passwordHint,
      startDate: link.startDate,
      endDate: link.endDate,
      slug: link.slug,
      category: link.category,
      featured: link.featured,
      thumbnail: link.thumbnail,
      description: link.description,
      images: link.images,
      targetDate: link.targetDate,
      items: link.items,
      price: link.price,
      // Şifre (bcrypt hash) ve tıklama sayısı yalnızca tam yedekte
      ...(kind === 'full' ? { password: link.password, clicks: link.clicks, createdAt: link.createdAt } : { hasPassword: !!link.password }),
    }))
  }

  if (kind === 'full') {
    backup.subscribers = await prisma.subscriber.findMany({ orderBy: { id: 'asc' } })
    backup.contactMessages = await prisma.contactMessage.findMany({ orderBy: { id: 'asc' } })
    backup.analytics = await prisma.analytics.findMany({ orderBy: { id: 'asc' } })
    backup.pageViews = await prisma.pageView.findMany({ orderBy: { id: 'asc' } })
  }

  // Görseller: tam yedekte hepsi, diğerlerinde yalnızca yedekteki verinin kullandıkları
  let fileNames: string[]
  if (kind === 'full') {
    fileNames = (await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])).filter((name) => FILE_NAME_PATTERN.test(name))
  } else {
    const text = JSON.stringify(backup)
    fileNames = Array.from(new Set(Array.from(text.matchAll(MEDIA_REFERENCE), (match) => match[1])))
  }
  const files: Record<string, string> = {}
  for (const name of fileNames) {
    const data = await fs.readFile(path.join(UPLOAD_DIR, name)).catch(() => null)
    if (data) files[name] = data.toString('base64')
  }
  backup.files = files

  return backup
}

// ---------------------------------------------------------------- geri yükleme

function profileFromBackup(raw: Record<string, any>, kind: BackupKind): { data: Record<string, any> } | { error: string } {
  const data: Record<string, any> = {}
  for (const field of profileFieldsFor(kind)) {
    const value = raw[field]
    if (value === undefined || value === null) continue
    if (PROFILE_INT_FIELDS.has(field)) data[field] = int(value, field === 'smtpPort' ? 587 : 0)
    else if (PROFILE_BOOLEAN_FIELDS.has(field)) data[field] = value === true || value === 'true'
    else data[field] = str(value, 20_000)
  }
  // Adresler denetlenir: görseller yalnızca yüklenen dosya, http(s) ya da data:image; linkler http(s)/mailto/tel
  for (const field of Array.from(PROFILE_IMAGE_FIELDS)) {
    const value = data[field]
    if (value && !isImageUrl(value) && !/^data:image\//.test(value) && value !== '/default-avatar.jpg') data[field] = ''
  }
  for (const field of Array.from(PROFILE_LINK_FIELDS)) {
    if (data[field] && !isSafeUrl(data[field])) data[field] = ''
  }
  if (data.layout !== undefined) data.layout = data.layout === 'grid' ? 'grid' : 'classic'
  // Bildirim ayarları geçersizse yüklemeyi bozmak yerine boş bırakılır
  for (const field of ['notifyNtfyUrl', 'notifyTelegramToken', 'notifyTelegramChatId']) {
    if (data[field] !== undefined && normalizeSettings({ [field]: data[field] })) data[field] = ''
  }
  const invalid = normalizeProfileCard(data)
  return invalid ?? { data }
}

function linkFromBackup(raw: Record<string, any>, kind: BackupKind) {
  const images = parseImages(typeof raw.images === 'string' ? raw.images : JSON.stringify(raw.images || []))
  const id = int(raw.id, NaN)
  return {
    ...(Number.isInteger(id) && id > 0 ? { id } : {}),
    title: str(raw.title, 200),
    url: isSafeUrl(raw.url) ? String(raw.url).trim() : '',
    icon: str(raw.icon || 'FaLink', 500),
    order: int(raw.order),
    enabled: raw.enabled !== false,
    type: (LINK_TYPES as readonly string[]).includes(raw.type) ? raw.type : 'link',
    passwordHint: str(raw.passwordHint, 200),
    startDate: parseDate(raw.startDate) ?? null,
    endDate: parseDate(raw.endDate) ?? null,
    slug: normalizeSlug(raw.slug),
    category: str(raw.category, 100),
    featured: raw.featured === true,
    thumbnail: isImageUrl(raw.thumbnail) ? raw.thumbnail : '',
    description: str(raw.description, 5000),
    images: images.length ? JSON.stringify(images) : '',
    targetDate: parseDate(raw.targetDate) ?? null,
    items: (() => { const items = parseItems(String(raw.type), raw.items); return items.length ? JSON.stringify(items) : '' })(),
    price: str(raw.price, 100),
    // Şifreler yalnızca tam yedekten gelir (geçerli bir bcrypt hash ise)
    password: kind === 'full' && isBcryptHash(raw.password) ? raw.password : '',
    clicks: kind === 'full' ? Math.max(0, int(raw.clicks)) : 0,
  }
}

// Yedekteki görselleri yazar. Yalnızca bizim ürettiğimiz biçimde adı olan ve gerçekten o türde
// görsel olan dosyalar alınır; aynı adla duran dosyaya dokunulmaz.
async function restoreFiles(files: unknown): Promise<number> {
  if (!files || typeof files !== 'object') return 0
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  const expected: Record<string, string> = { webp: 'webp', png: 'png', jpg: 'jpeg' }
  let written = 0
  for (const [name, base64] of Object.entries(files as Record<string, unknown>).slice(0, 5000)) {
    if (!FILE_NAME_PATTERN.test(name) || typeof base64 !== 'string') continue
    const target = path.join(UPLOAD_DIR, name)
    if (await fs.stat(target).then(() => true, () => false)) continue
    const data = Buffer.from(base64, 'base64')
    const format = await sharp(data).metadata().then((meta) => meta.format, () => undefined)
    if (format !== expected[name.split('.').pop() as string]) continue
    await fs.writeFile(target, data)
    written++
  }
  return written
}

export interface RestoreResult {
  kind: BackupKind
  legacy: boolean
  links: number
  subscribers: number
  analytics: number
  pageViews: number
  files: number
}

export async function restoreBackup(backup: any): Promise<RestoreResult | { error: string }> {
  const summary = summarizeBackup(backup)
  if ('error' in summary) return summary
  const { kind, legacy } = summary

  const profileResult = profileFromBackup(backup.profile, kind)
  if ('error' in profileResult) return profileResult
  const profileData = profileResult.data

  const links = kind === 'profile' ? [] : (Array.isArray(backup.links) ? backup.links : []).slice(0, 5000).map((raw: any) => linkFromBackup(raw || {}, kind))
  // Bloklar kimlikleriyle geri yüklenebiliyorsa (yeni biçim) analitik bağlantıları korunur
  const linksHaveIds = links.length > 0 && links.every((link: any) => link.id) && new Set(links.map((link: any) => link.id)).size === links.length

  const files = await restoreFiles(backup.files)

  const result: RestoreResult = { kind, legacy, links: 0, subscribers: 0, analytics: 0, pageViews: 0, files }

  await prisma.$transaction(async (tx) => {
    const existingProfile = await tx.profile.findFirst()
    if (existingProfile) await tx.profile.update({ where: { id: existingProfile.id }, data: profileData })
    else await tx.profile.create({ data: { id: 1, ...profileData } as any })

    if (kind === 'profile') return

    if (kind === 'full') {
      await tx.analytics.deleteMany({})
      await tx.pageView.deleteMany({})
      await tx.subscriber.deleteMany({})
      await tx.contactMessage.deleteMany({})
      await tx.link.deleteMany({})
      for (const link of links) await tx.link.create({ data: linksHaveIds ? link : { ...link, id: undefined } })
      result.links = links.length

      const seenEmails = new Set<string>()
      const subscribers = (Array.isArray(backup.subscribers) ? backup.subscribers : [])
        .filter((s: any) => isValidEmail(s?.email) && !seenEmails.has(s.email.toLowerCase()) && seenEmails.add(s.email.toLowerCase()))
        .map((s: any) => ({ email: String(s.email), name: str(s.name, 200), confirmed: s.confirmed !== false, createdAt: parseDate(s.createdAt) ?? new Date() }))
      if (subscribers.length) await tx.subscriber.createMany({ data: subscribers })
      result.subscribers = subscribers.length

      // İletişim mesajları (1.5.0 öncesi yedeklerde yok)
      const messages = (Array.isArray(backup.contactMessages) ? backup.contactMessages : [])
        .filter((m: any) => m && typeof m === 'object' && m.message)
        .map((m: any) => ({
          createdAt: parseDate(m.createdAt) ?? new Date(),
          name: str(m.name, 200), email: str(m.email, 254), message: str(m.message, 5000),
          read: m.read === true, emailed: m.emailed === true,
        }))
      if (messages.length) await tx.contactMessage.createMany({ data: messages })

      // Analitik kayıtları yalnızca geri yüklenen bloklara bağlıysa alınır
      const linkIds = new Set(linksHaveIds ? links.map((link: any) => link.id) : [])
      const text = (value: unknown) => str(value, 1000)
      const analytics = (Array.isArray(backup.analytics) ? backup.analytics : [])
        .filter((a: any) => a && linkIds.has(int(a.linkId, NaN)))
        .map((a: any) => ({
          linkId: int(a.linkId),
          timestamp: parseDate(a.timestamp) ?? new Date(),
          userAgent: text(a.userAgent), device: text(a.device), browser: text(a.browser), os: text(a.os),
          country: text(a.country), city: text(a.city), region: text(a.region), referrer: text(a.referrer),
          utmSource: text(a.utmSource), utmMedium: text(a.utmMedium), utmCampaign: text(a.utmCampaign),
          utmTerm: text(a.utmTerm), utmContent: text(a.utmContent), ipHash: text(a.ipHash),
        }))
      if (analytics.length) await tx.analytics.createMany({ data: analytics })
      result.analytics = analytics.length

      const pageViews = (Array.isArray(backup.pageViews) ? backup.pageViews : [])
        .filter((v: any) => v && typeof v === 'object')
        .map((v: any) => ({
          timestamp: parseDate(v.timestamp) ?? new Date(),
          device: text(v.device), browser: text(v.browser), os: text(v.os), country: text(v.country),
          referrer: text(v.referrer), utmSource: text(v.utmSource), utmMedium: text(v.utmMedium),
          utmCampaign: text(v.utmCampaign), ipHash: text(v.ipHash),
        }))
      if (pageViews.length) await tx.pageView.createMany({ data: pageViews })
      result.pageViews = pageViews.length
      return
    }

    // "Sayfa ve ayarlar": bloklar yedektekiyle değiştirilir. Kimlikler varsa aynı kimlikli blok güncellenir
    // (tıklama geçmişi ve şifresi korunur), yedekte olmayanlar silinir.
    if (linksHaveIds) {
      const keepIds = links.map((link: any) => link.id)
      await tx.link.deleteMany({ where: { id: { notIn: keepIds } } })
      for (const link of links) {
        const { id, password, clicks, ...fields } = link
        const exists = await tx.link.findUnique({ where: { id }, select: { id: true } })
        if (exists) await tx.link.update({ where: { id }, data: fields })
        else await tx.link.create({ data: { id, ...fields } })
      }
    } else {
      await tx.link.deleteMany({})
      for (const link of links) await tx.link.create({ data: { ...link, id: undefined } })
    }
    result.links = links.length
  }, { timeout: 120_000, maxWait: 10_000 })

  return result
}

// ---------------------------------------------------------------- otomatik yedek

// Veritabanının bulunduğu klasör (Docker: /app/prisma, YunoHost: $data_dir/prisma). Kalıcı volume olduğu için
// otomatik yedekler de burada durur.
export function databaseDir(): string {
  const url = process.env.DATABASE_URL || 'file:/app/prisma/dev.db'
  return path.dirname(path.resolve(url.replace(/^file:/, '')))
}

export const AUTO_BACKUP_KEEP = 7
const AUTO_BACKUP_PATTERN = /^kunye-full-\d{4}-\d{2}-\d{2}\.json$/
const autoBackupDir = () => path.join(databaseDir(), 'auto-backups')

// Ayarlar → Yedekleme → "Otomatik yedek" açıksa günde bir kez çalışır: tam yedeği sunucuya yazar,
// son AUTO_BACKUP_KEEP günü tutar. Panelden indirilip "Yedekten yükle" ile geri yüklenebilir.
export async function writeAutoBackup(): Promise<string> {
  const dir = autoBackupDir()
  await fs.mkdir(dir, { recursive: true })
  const name = `kunye-full-${new Date().toISOString().slice(0, 10)}.json`
  const tmp = path.join(dir, `${name}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(await createBackup('full')))
  await fs.rename(tmp, path.join(dir, name)) // yarım dosya hiç görünmez

  const old = (await listAutoBackups()).slice(AUTO_BACKUP_KEEP)
  for (const backup of old) await fs.unlink(path.join(dir, backup.name)).catch(() => {})
  // Genel Bakış'taki "Son yedek" satırı (db-backup.js ile aynı dosya)
  await fs.writeFile(path.join(databaseDir(), '.last-backup'), JSON.stringify({ at: new Date().toISOString() })).catch(() => {})
  return name
}

// En yeni önce
export async function listAutoBackups(): Promise<Array<{ name: string; size: number; createdAt: string }>> {
  const dir = autoBackupDir()
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((name) => AUTO_BACKUP_PATTERN.test(name))
  const list = await Promise.all(names.map(async (name) => {
    const stat = await fs.stat(path.join(dir, name))
    return { name, size: stat.size, createdAt: stat.mtime.toISOString() }
  }))
  return list.sort((a, b) => b.name.localeCompare(a.name))
}

// Yalnızca bizim adlandırdığımız dosyalar okunur (../ ile klasör dışına çıkılamaz)
export async function readAutoBackup(name: string): Promise<Buffer | null> {
  if (!AUTO_BACKUP_PATTERN.test(name)) return null
  return fs.readFile(path.join(autoBackupDir(), name)).catch(() => null)
}
