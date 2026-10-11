import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { isValidEmail } from '@/lib/security'
import { parseCsv } from '@/lib/csv'
import { normalizeTags, splitTags } from '@/lib/newsletter'

const MAX_ROWS = 5000

// CSV'den abone ekleme: { csv, tags? }. E-posta sütunu otomatik bulunur; başlık satırı varsa
// isim ve etiket sütunları da okunur (bu paneldeki "CSV İndir" dosyası olduğu gibi geri yüklenebilir).
// Var olan abonelerin etiketleri birleştirilir, ismi boşsa doldurulur; içe aktarılanlar onaylı sayılır.
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const csv = typeof body.csv === 'string' ? body.csv : ''
  if (!csv.trim()) return NextResponse.json({ error: 'CSV boş' }, { status: 400 })
  if (csv.length > 2_000_000) return NextResponse.json({ error: 'Dosya çok büyük (en fazla 2 MB)' }, { status: 400 })
  const extraTags = normalizeTags(typeof body.tags === 'string' ? body.tags : '')

  const rows = parseCsv(csv)
  const header = rows[0] && !rows[0].some((cell) => isValidEmail(cell)) ? rows[0] : null
  const nameCol = header ? header.findIndex((h) => /isim|^ad\b|ad soyad|name/i.test(h)) : -1
  const tagsCol = header ? header.findIndex((h) => /etiket|tag/i.test(h)) : -1
  const dataRows = header ? rows.slice(1) : rows
  if (dataRows.length > MAX_ROWS) return NextResponse.json({ error: `En fazla ${MAX_ROWS} satır` }, { status: 400 })

  const entries = new Map<string, { name: string; tags: string }>()
  let skipped = 0
  for (const row of dataRows) {
    const emailIndex = row.findIndex((cell) => isValidEmail(cell))
    if (emailIndex < 0) { skipped++; continue }
    const email = row[emailIndex].toLowerCase()
    // Başlık yoksa e-posta dışındaki ilk dolu hücre isim sayılır
    const rawName = nameCol >= 0 ? row[nameCol] || '' : row.find((cell, i) => i !== emailIndex && cell) || ''
    const name = rawName === '-' ? '' : rawName.slice(0, 100)
    const tags = normalizeTags([...splitTags(tagsCol >= 0 && row[tagsCol] !== '-' ? row[tagsCol] || '' : ''), ...splitTags(extraTags)])
    const previous = entries.get(email)
    entries.set(email, previous ? { name: previous.name || name, tags: normalizeTags([...splitTags(previous.tags), ...splitTags(tags)]) } : { name, tags })
  }
  if (entries.size === 0) return NextResponse.json({ error: 'Dosyada geçerli e-posta adresi bulunamadı' }, { status: 400 })

  const existing = await prisma.subscriber.findMany({ where: { email: { in: Array.from(entries.keys()) } } })
  const existingByEmail = new Map(existing.map((s) => [s.email, s]))
  let updated = 0
  await prisma.$transaction(async (tx) => {
    const fresh = Array.from(entries).filter(([email]) => !existingByEmail.has(email))
    if (fresh.length) await tx.subscriber.createMany({ data: fresh.map(([email, e]) => ({ email, name: e.name, tags: e.tags, confirmed: true })) })
    for (const subscriber of existing) {
      const entry = entries.get(subscriber.email)!
      const tags = normalizeTags([...splitTags(subscriber.tags), ...splitTags(entry.tags)])
      const name = subscriber.name || entry.name
      if (tags === subscriber.tags && name === subscriber.name) continue
      await tx.subscriber.update({ where: { id: subscriber.id }, data: { tags, name } })
      updated++
    }
  })
  return NextResponse.json({ added: entries.size - existing.length, updated, skipped })
}
