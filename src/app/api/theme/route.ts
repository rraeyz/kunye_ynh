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

    const {
      themePreset,
      primaryColor,
      accentColor,
      backgroundColor,
      cardColor,
      textColor,
      buttonStyle,
      fontFamily,
      borderRadius,
      animationSpeed,
      backgroundType,
      backgroundImage,
      backgroundOpacity,
      layout,
    } = await request.json()

    // İlk profili bul ve güncelle
    const profile = await prisma.profile.findFirst()
    
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const updatedProfile = await withRevision('Görünüm', () => prisma.profile.update({
      where: { id: profile.id },
      data: {
        themePreset: themePreset || 'purple-dream',
        primaryColor: primaryColor || '#a855f7',
        accentColor: accentColor || '#ec4899',
        backgroundColor: backgroundColor || '#0a0a0a',
        cardColor: cardColor || '#1a1a1a',
        textColor: textColor || '#ffffff',
        buttonStyle: buttonStyle || 'gradient',
        fontFamily: fontFamily || 'Inter',
        borderRadius: borderRadius || 'xl',
        animationSpeed: animationSpeed || 'normal',
        backgroundType: backgroundType || 'gradient-blur',
        backgroundImage: backgroundImage || '',
        backgroundOpacity: backgroundOpacity !== undefined ? backgroundOpacity : 100,
        // Sayfa düzeni: classic (liste) | grid (bento ızgara); gönderilmezse değişmez
        ...(layout !== undefined ? { layout: layout === 'grid' ? 'grid' : 'classic' } : {}),
      },
    }))

    return NextResponse.json(toClientProfile(updatedProfile))
  } catch (error) {
    console.error('Theme update error:', error)
    return NextResponse.json(
      { error: 'Failed to update theme' },
      { status: 500 }
    )
  }
}
