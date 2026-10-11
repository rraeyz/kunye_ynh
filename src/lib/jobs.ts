import fs from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getState, setState } from '@/lib/appState'
import { writeAutoBackup } from '@/lib/backup'
import { FILE_NAME_PATTERN, UPLOAD_DIR } from '@/lib/uploads'
import { checkUrlStatus } from '@/lib/linkPreview'
import { isSafeUrl } from '@/lib/security'
import { sendWeeklyReport } from '@/lib/weeklyReport'

// Günlük otomatik işler. src/instrumentation.ts açılışta başlatır; saatte bir bakılır, her iş kendi
// son çalışma zamanını AppState'te tutar (yeniden başlatmalarda iki kez çalışmaz).

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const MEDIA_REFERENCE = /\/media\/([a-z]+-[0-9a-f-]{36}\.(?:webp|png|jpg))/g
// Görsel temizliği yalnızca admin düğmesiyle çalışır (Ayarlar → Otomatik işler), kendiliğinden çalışmaz.
// Son bir gün içinde yüklenen görsellere dokunulmaz (yüklenip henüz kaydedilmemiş olabilir).
const ORPHAN_GRACE = DAY
// Çöp klasöründeki dosyalar bu süreden sonra kalıcı silinir; o zamana kadar "Çöpten geri getir" ile döner
const TRASH_KEEP = 30 * DAY
const TRASH_DIR = () => path.join(UPLOAD_DIR, '.trash')

async function runOnce(key: string, interval: number, task: () => Promise<unknown>) {
  const last = await getState(key)
  if (last && Date.now() - Date.parse(last) < interval) return
  try {
    await task()
  } catch (error) {
    console.error(`Otomatik iş başarısız (${key}):`, error)
  }
  // Başarısız olsa da zaman yazılır: sürekli hata veren bir iş her saat tekrar denenmesin
  await setState(key, new Date().toISOString())
}

// Hiçbir profil alanında, blokta (kapalı olanlar dahil) ya da geri al adımında kullanılmayan görseller
export async function findUnusedUploads(): Promise<string[]> {
  const files = (await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])).filter((name) => FILE_NAME_PATTERN.test(name))
  if (files.length === 0) return []
  const [profile, links, revisions] = await Promise.all([
    prisma.profile.findFirst(),
    prisma.link.findMany(),
    prisma.revision.findMany({ select: { data: true } }),
  ])
  const text = JSON.stringify([profile, links]) + revisions.map((revision) => revision.data).join('')
  const used = new Set(Array.from(text.matchAll(MEDIA_REFERENCE), (match) => match[1]))
  const unused: string[] = []
  for (const name of files) {
    if (used.has(name)) continue
    const stat = await fs.stat(path.join(UPLOAD_DIR, name)).catch(() => null)
    if (stat && Date.now() - stat.mtimeMs >= ORPHAN_GRACE) unused.push(name)
  }
  return unused
}

export async function trashedUploads(): Promise<string[]> {
  return (await fs.readdir(TRASH_DIR()).catch(() => [] as string[])).filter((name) => FILE_NAME_PATTERN.test(name))
}

// Kullanılmayan görselleri uploads/.trash'e taşır; çöpte 30 günü geçenleri kalıcı siler
export async function cleanupUploads(): Promise<number> {
  const trash = TRASH_DIR()
  for (const name of await trashedUploads()) {
    const stat = await fs.stat(path.join(trash, name)).catch(() => null)
    if (stat && Date.now() - stat.mtimeMs > TRASH_KEEP) await fs.unlink(path.join(trash, name)).catch(() => {})
  }
  const removed: string[] = []
  for (const name of await findUnusedUploads()) {
    await fs.mkdir(trash, { recursive: true })
    // Taşıma anı çöpte kalma süresinin başlangıcı olsun
    if (await fs.rename(path.join(UPLOAD_DIR, name), path.join(trash, name)).then(() => true, () => false)) {
      const now = new Date()
      await fs.utimes(path.join(trash, name), now, now).catch(() => {})
      removed.push(name)
    }
  }
  if (removed.length) console.log(`🧹 Kullanılmayan ${removed.length} görsel çöp klasörüne taşındı (uploads/.trash): ${removed.join(', ')}`)
  return removed.length
}

// Çöpteki tüm görselleri yerine geri taşır (aynı adla dosya varsa dokunmaz)
export async function restoreTrash(): Promise<number> {
  let restored = 0
  for (const name of await trashedUploads()) {
    const target = path.join(UPLOAD_DIR, name)
    if (await fs.stat(target).then(() => true, () => false)) continue
    if (await fs.rename(path.join(TRASH_DIR(), name), target).then(() => true, () => false)) restored++
  }
  return restored
}

async function cleanupData() {
  const now = Date.now()
  const profile = await prisma.profile.findUnique({ where: { id: 1 }, select: { analyticsRetentionDays: true } })
  if (profile && profile.analyticsRetentionDays > 0) {
    const cutoff = new Date(now - profile.analyticsRetentionDays * DAY)
    await prisma.analytics.deleteMany({ where: { timestamp: { lt: cutoff } } })
    await prisma.pageView.deleteMany({ where: { timestamp: { lt: cutoff } } })
  }
  await prisma.loginEvent.deleteMany({ where: { timestamp: { lt: new Date(now - 90 * DAY) } } })
  // E-postasını 7 gün içinde onaylamayan aboneler listeden çıkar
  await prisma.subscriber.deleteMany({ where: { confirmed: false, createdAt: { lt: new Date(now - 7 * DAY) } } })
  // Görsel temizliği burada çalışmaz; yalnızca admin düğmesiyle (bkz. cleanupUploads)
}

// Açık blokların adreslerini kontrol eder; sonuç panelde (Linkler, Genel Bakış) gösterilir
export async function checkLinkHealth(): Promise<number> {
  const links = await prisma.link.findMany({ where: { enabled: true, url: { not: '' } }, select: { id: true, url: true, type: true } })
  const results: Array<{ id: number; status: number }> = []
  for (const link of links) {
    // Gömmeler ve iletişim/metin blokları kendi servislerine bağlı; yalnızca ziyaretçinin gideceği adresler
    if (link.type.startsWith('embed-') || link.type === 'spotify' || link.type === 'map' || !isSafeUrl(link.url) || !/^https?:/i.test(link.url)) continue
    results.push({ id: link.id, status: await checkUrlStatus(link.url) })
  }
  // Hiçbir adrese ulaşılamadıysa sorun büyük olasılıkla sunucunun internet bağlantısındadır (proxy, güvenlik
  // duvarı): linkler "açılmıyor" diye işaretlenmez, sonuç "kontrol edilmedi" olarak kalır
  const offline = results.length >= 2 && results.every((result) => result.status === -1)
  if (offline) console.warn('Link kontrolü: hiçbir adrese ulaşılamadı; sunucunun internet bağlantısını kontrol edin')
  const checkedAt = new Date()
  for (const result of results) {
    await prisma.link.update({ where: { id: result.id }, data: { healthStatus: offline ? 0 : result.status, healthCheckedAt: checkedAt } })
  }
  return results.length
}

export async function runScheduledJobs() {
  const settings = await prisma.profile.findUnique({
    where: { id: 1 },
    select: { autoBackupEnabled: true, linkHealthEnabled: true, weeklyReportEnabled: true },
  })
  await runOnce('job.cleanup', DAY - HOUR, cleanupData)
  if (settings?.autoBackupEnabled) await runOnce('job.autoBackup', DAY - HOUR, writeAutoBackup)
  if (settings?.linkHealthEnabled) await runOnce('job.linkHealth', DAY - HOUR, checkLinkHealth)
  // Haftalık özet: pazartesi (sunucu saatiyle), haftada bir
  if (settings?.weeklyReportEnabled && new Date().getDay() === 1) await runOnce('job.weeklyReport', 6 * DAY, sendWeeklyReport)
}

const globalForJobs = globalThis as unknown as { jobsStarted?: boolean }

export function startScheduler() {
  if (globalForJobs.jobsStarted) return
  globalForJobs.jobsStarted = true
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runScheduledJobs()
    } catch (error) {
      console.error('Otomatik işler çalıştırılamadı:', error)
    } finally {
      running = false
    }
  }
  // Açılışı yavaşlatmamak için ilk çalışma bir dakika sonra
  setTimeout(tick, 60_000).unref()
  setInterval(tick, HOUR).unref()
}
