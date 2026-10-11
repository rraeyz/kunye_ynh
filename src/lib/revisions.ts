import { prisma } from '@/lib/prisma'
import { PROFILE_EDITABLE_FIELDS, PROFILE_SETTINGS_FIELDS } from '@/lib/profile'
import { revalidateSite } from '@/lib/site'

// Geri al / ileri al. Sayfa içeriğini (profil, görünüm, bloklar) değiştiren her kayıttan önce o anki
// hâl saklanır. Ayarlar (SMTP, bildirimler, otomatik işler), aboneler ve analitik bunun dışındadır.
// Tıklama sayaçları geri alınmaz. Yeni eklenmiş bir blok geri alınırsa o bloğun tıklama kayıtları da silinir.

const MAX_REVISIONS = 30
// Aynı türden art arda gelen kayıtlar (ör. sürükle-bırak sıralamada her blok için ayrı istek) tek adım sayılır
const MERGE_WINDOW_MS = 5000

const PAGE_FIELDS = PROFILE_EDITABLE_FIELDS.filter((field) => !PROFILE_SETTINGS_FIELDS.has(field))
const DATE_FIELDS = ['startDate', 'endDate', 'targetDate'] as const

type Db = Pick<typeof prisma, 'profile' | 'link'>

async function snapshot(db: Db = prisma): Promise<string> {
  const [profile, links] = await Promise.all([db.profile.findFirst(), db.link.findMany({ orderBy: { id: 'asc' } })])
  return JSON.stringify({
    profile: profile && Object.fromEntries(PAGE_FIELDS.map((field) => [field, (profile as any)[field]])),
    links: links.map(({ clicks, createdAt, updatedAt, healthStatus, healthCheckedAt, ...link }) => link),
  })
}

async function applySnapshot(tx: Db, data: string) {
  const { profile, links } = JSON.parse(data) as { profile: Record<string, any> | null; links: Array<Record<string, any>> }
  const existing = await tx.profile.findFirst({ select: { id: true } })
  if (profile && existing) await tx.profile.update({ where: { id: existing.id }, data: profile })

  await tx.link.deleteMany({ where: { id: { notIn: links.map((link) => link.id) } } })
  for (const raw of links) {
    const link: Record<string, any> = { ...raw }
    for (const field of DATE_FIELDS) link[field] = link[field] ? new Date(link[field]) : null
    const { id, ...fields } = link
    await tx.link.upsert({ where: { id }, update: fields, create: link as any })
  }
}

// İşlemler sırayla çalışır: aynı anda gelen kayıtlar birbirinin "önceki hâl"ini bozmasın
const globalForRevisions = globalThis as unknown as { revisionQueue?: Promise<unknown> }
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = (globalForRevisions.revisionQueue ?? Promise.resolve()).then(task)
  globalForRevisions.revisionQueue = run.catch(() => {})
  return run
}

// Sayfa içeriğini değiştiren bir işlemi sarar: önceki hâli geri al listesine ekler, site önbelleğini tazeler.
// İşlem hiçbir şeyi değiştirmediyse (ör. doğrulama hatası) kayıt oluşmaz.
export function withRevision<T>(label: string, change: () => Promise<T>): Promise<T> {
  return serialize(async () => {
    const before = await snapshot()
    const result = await change()
    const after = await snapshot()
    if (before !== after) {
      const last = await prisma.revision.findFirst({ where: { kind: 'undo' }, orderBy: { id: 'desc' } })
      const merge = last && last.label === label && Date.now() - last.createdAt.getTime() < MERGE_WINDOW_MS
      await prisma.revision.deleteMany({ where: { kind: 'redo' } })
      if (merge) {
        // Pencere kayar: uzun bir sıralama da tek adım kalır
        await prisma.revision.update({ where: { id: last.id }, data: { createdAt: new Date() } })
      } else {
        await prisma.revision.create({ data: { kind: 'undo', label, data: before } })
        const old = await prisma.revision.findMany({ where: { kind: 'undo' }, orderBy: { id: 'desc' }, skip: MAX_REVISIONS, select: { id: true } })
        if (old.length) await prisma.revision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } })
      }
      revalidateSite()
    }
    return result
  })
}

export async function revisionStatus() {
  const [undo, redo] = await Promise.all(
    (['undo', 'redo'] as const).map((kind) =>
      prisma.revision.findFirst({ where: { kind }, orderBy: { id: 'desc' }, select: { label: true, createdAt: true } })
    )
  )
  return { undo, redo }
}

// Geri al (undo) ya da ileri al (redo). Geri alınan adımın etiketi döner; yapılacak adım yoksa null.
export function stepRevision(direction: 'undo' | 'redo'): Promise<string | null> {
  return serialize(async () => {
    const entry = await prisma.revision.findFirst({ where: { kind: direction }, orderBy: { id: 'desc' } })
    if (!entry) return null
    const current = await snapshot()
    await prisma.$transaction(async (tx) => {
      await applySnapshot(tx, entry.data)
      await tx.revision.delete({ where: { id: entry.id } })
      await tx.revision.create({ data: { kind: direction === 'undo' ? 'redo' : 'undo', label: entry.label, data: current } })
    }, { timeout: 60_000 })
    revalidateSite()
    return entry.label
  })
}
