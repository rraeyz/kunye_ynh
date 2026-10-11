import { NextRequest, NextResponse } from 'next/server'
import { isSetupComplete, setAuthCookie, verifyAdminCredentials, verifySecondFactor } from '@/lib/auth'
import { getClientIp, isRateLimited, isRateLimitExceeded } from '@/lib/security'
import { prisma } from '@/lib/prisma'
import { setState } from '@/lib/appState'
import { getBaseUrl } from '@/lib/url'

// Ayarlar → Güvenlik'teki giriş geçmişi. Kayıt yazılamasa da giriş etkilenmez.
function logLogin(request: NextRequest, success: boolean, reason: string) {
  prisma.loginEvent.create({
    data: {
      success,
      reason,
      ip: getClientIp(request.headers).slice(0, 64),
      userAgent: (request.headers.get('user-agent') || '').slice(0, 300),
    },
  }).catch((error) => console.warn('Giriş kaydı yazılamadı:', error?.message))
}

export async function POST(request: NextRequest) {
  try {
    // Brute-force koruması: IP başına 15 dakikada 10 HATALI deneme (şifre veya doğrulama kodu; başarılı girişler sayılmaz)
    const rateKey = `login:${getClientIp(request.headers)}`
    if (isRateLimitExceeded(rateKey, 10)) {
      return NextResponse.json(
        { error: 'Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.' },
        { status: 429 }
      )
    }

    const { username, password, code } = await request.json()

    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return NextResponse.json(
        { error: 'Kullanıcı adı ve şifre gerekli' },
        { status: 400 }
      )
    }

    if (!(await isSetupComplete())) {
      return NextResponse.json(
        { error: 'Sistem ayarları eksik. Lütfen setup yapın.' },
        { status: 500 }
      )
    }

    if (!(await verifyAdminCredentials(username, password))) {
      isRateLimited(rateKey, 10, 15 * 60 * 1000)
      logLogin(request, false, 'password')
      return NextResponse.json(
        { error: 'Kullanıcı adı veya şifre hatalı' },
        { status: 401 }
      )
    }

    // İki adımlı doğrulama açıksa şifreden sonra kod istenir (kod gelmediyse deneme sayılmaz)
    const second = await verifySecondFactor(code)
    if (second === 'required') {
      return NextResponse.json({ twoFactorRequired: true })
    }
    if (second === 'invalid') {
      isRateLimited(rateKey, 10, 15 * 60 * 1000)
      logLogin(request, false, 'totp')
      return NextResponse.json(
        { error: 'Doğrulama kodu hatalı', twoFactorRequired: true },
        { status: 401 }
      )
    }

    await setAuthCookie(username)
    logLogin(request, true, second === 'recovery' ? 'recovery' : 'ok')
    // Zamanlanmış e-postalardaki (haftalık özet) linkler için sitenin adresi
    setState('baseUrl', getBaseUrl(request.headers)).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Sunucu hatası' },
      { status: 500 }
    )
  }
}
