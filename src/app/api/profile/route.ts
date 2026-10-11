import { NextResponse } from 'next/server'
import { withRevision } from '@/lib/revisions'
import { revalidateSite } from '@/lib/site'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { pick } from '@/lib/security'
import { PROFILE_EDITABLE_FIELDS, normalizeProfileCard, normalizeSettings, toClientProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

// Profil (SMTP ayarları dahil) sadece admin paneli içindir.
// Herkese açık sayfa veriyi doğrudan sunucu tarafında okur.
export async function GET() {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.profile.findFirst()
    return NextResponse.json(toClientProfile(profile))
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data: Record<string, any> = pick(body, PROFILE_EDITABLE_FIELDS)

    // Boş SMTP şifresi "değiştirme" anlamına gelir (panel kayıtlı şifreyi göstermez)
    if (!data.smtpPassword) delete data.smtpPassword
    if (!data.notifyTelegramToken) delete data.notifyTelegramToken
    if (data.smtpPort !== undefined) data.smtpPort = parseInt(data.smtpPort) || 587
    if (data.backgroundOpacity !== undefined) data.backgroundOpacity = parseInt(data.backgroundOpacity) || 0
    const invalid = normalizeProfileCard(data) || normalizeSettings(data)
    if (invalid) return NextResponse.json(invalid, { status: 400 })

    const profile = await withRevision('Profil', async () => {
      const existing = await prisma.profile.findFirst()
      return existing
        ? prisma.profile.update({ where: { id: existing.id }, data })
        : prisma.profile.create({ data: { id: 1, ...data } })
    })

    // Ayar alanları (ör. bakım modu) geri al kapsamında olmadığından withRevision önbelleği tazelemeyebilir
    revalidateSite()
    return NextResponse.json(toClientProfile(profile))
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
