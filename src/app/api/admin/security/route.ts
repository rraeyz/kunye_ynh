import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { API_TOKEN_STATE, hashApiToken, isAuthenticated } from '@/lib/auth'
import { deleteState, getState, setState } from '@/lib/appState'
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, verifyTotp } from '@/lib/totp'

export const dynamic = 'force-dynamic'

const recoveryCount = (value: string) => {
  try {
    return (JSON.parse(value || '[]') as unknown[]).length
  } catch {
    return 0
  }
}

// Ayarlar → Güvenlik: iki adımlı doğrulama durumu ve son giriş denemeleri
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [admin, events, apiToken] = await Promise.all([
    prisma.admin.findFirst({ select: { totpSecret: true, totpRecovery: true } }),
    prisma.loginEvent.findMany({ orderBy: { id: 'desc' }, take: 30 }),
    getState(API_TOKEN_STATE),
  ])
  return NextResponse.json({
    twoFactor: { enabled: !!admin?.totpSecret, recoveryLeft: recoveryCount(admin?.totpRecovery || '') },
    apiToken: { enabled: !!apiToken },
    events,
  })
}

// action: totp-start (anahtar üret) → totp-enable (uygulamadaki kodla onayla) | totp-disable | recovery-regenerate
// | api-token-create (yenisi eskisini geçersiz kılar) | api-token-revoke
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const admin = await prisma.admin.findFirst()
  if (!admin) return NextResponse.json({ error: 'Admin bulunamadı' }, { status: 404 })

  // Kapatma ve yeni kurtarma kodu üretme şifre ister: açık kalmış bir oturum 2FA'yı tek başına kapatamasın
  const passwordOk = async () => typeof body.password === 'string' && bcrypt.compare(body.password, admin.passwordHash)

  switch (body.action) {
    case 'totp-start': {
      const secret = generateTotpSecret()
      await setState('totpPending', secret)
      return NextResponse.json({ secret, otpauthUrl: otpauthUrl(secret, admin.username) })
    }
    case 'totp-enable': {
      const pending = await getState('totpPending')
      if (!pending) return NextResponse.json({ error: 'Önce kurulumu başlatın' }, { status: 400 })
      const counter = verifyTotp(pending, body.code)
      if (counter === null) {
        return NextResponse.json({ error: 'Kod doğrulanamadı. Uygulamadaki güncel 6 haneli kodu girin; telefonun saati doğru olmalı.' }, { status: 400 })
      }
      const codes = generateRecoveryCodes()
      await prisma.admin.update({
        where: { id: admin.id },
        data: { totpSecret: pending, totpRecovery: JSON.stringify(codes.map(hashRecoveryCode)) },
      })
      await deleteState('totpPending')
      await setState('totpLastCounter', String(counter)) // kurulumda kullanılan kod girişte tekrar kullanılamaz
      return NextResponse.json({ enabled: true, recoveryCodes: codes })
    }
    case 'totp-disable': {
      if (!(await passwordOk())) return NextResponse.json({ error: 'Şifre hatalı' }, { status: 401 })
      await prisma.admin.update({ where: { id: admin.id }, data: { totpSecret: '', totpRecovery: '' } })
      return NextResponse.json({ enabled: false })
    }
    case 'recovery-regenerate': {
      if (!admin.totpSecret) return NextResponse.json({ error: 'İki adımlı doğrulama kapalı' }, { status: 400 })
      if (!(await passwordOk())) return NextResponse.json({ error: 'Şifre hatalı' }, { status: 401 })
      const codes = generateRecoveryCodes()
      await prisma.admin.update({ where: { id: admin.id }, data: { totpRecovery: JSON.stringify(codes.map(hashRecoveryCode)) } })
      return NextResponse.json({ recoveryCodes: codes })
    }
    case 'api-token-create': {
      // Anahtar yalnızca bu yanıtta görünür; açık kalmış bir oturum şifresiz anahtar çıkaramasın
      if (!(await passwordOk())) return NextResponse.json({ error: 'Şifre hatalı' }, { status: 401 })
      const token = crypto.randomBytes(32).toString('base64url')
      await setState(API_TOKEN_STATE, hashApiToken(token))
      return NextResponse.json({ apiToken: token })
    }
    case 'api-token-revoke': {
      await deleteState(API_TOKEN_STATE)
      return NextResponse.json({ success: true })
    }
    default:
      return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })
  }
}
