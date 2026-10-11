import { NextRequest, NextResponse } from 'next/server'
import { withRevision } from '@/lib/revisions'
import { prisma } from '@/lib/prisma'
import { isAuthenticated } from '@/lib/auth'
import { toClientProfile } from '@/lib/profile'

export async function PUT(request: NextRequest) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pageTitle, pageDescription, ogImageUrl, faviconUrl } = await request.json()

    // İlk profili bul ve güncelle
    const profile = await prisma.profile.findFirst()
    
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Sadece gönderilen alanları güncelle
    const updateData: any = {}
    if (pageTitle !== undefined) updateData.pageTitle = pageTitle || "Personal Link Tree"
    if (pageDescription !== undefined) updateData.pageDescription = pageDescription || "Welcome to my link tree"
    if (ogImageUrl !== undefined) updateData.ogImageUrl = ogImageUrl || ""
    if (faviconUrl !== undefined) updateData.faviconUrl = faviconUrl || ""

    const updatedProfile = await withRevision('SEO', () => prisma.profile.update({
      where: { id: profile.id },
      data: updateData,
    }))

    return NextResponse.json(toClientProfile(updatedProfile))
  } catch (error) {
    console.error('SEO update error:', error)
    return NextResponse.json(
      { error: 'Failed to update SEO settings' },
      { status: 500 }
    )
  }
}
