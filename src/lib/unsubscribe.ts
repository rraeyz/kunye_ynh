import crypto from 'crypto'
import { getJwtSecret } from '@/lib/auth'

// Abonelikten çıkma ve abonelik onayı linkleri için e-postaya özel imza: link tahmin edilemez,
// başkası adına çıkış/onay yapılamaz. İki amaç farklı imza üretir (biri diğerinin yerine geçmez).
type Purpose = 'unsubscribe' | 'confirm'

function signedToken(purpose: Purpose, email: string): string {
  return crypto.createHmac('sha256', getJwtSecret()).update(`${purpose}:${email.toLowerCase()}`).digest('hex').slice(0, 32)
}

function isValidToken(purpose: Purpose, email: string, token: string): boolean {
  const expected = Buffer.from(signedToken(purpose, email))
  const given = Buffer.from(String(token || ''))
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

export const unsubscribeToken = (email: string) => signedToken('unsubscribe', email)
export const isValidUnsubscribeToken = (email: string, token: string) => isValidToken('unsubscribe', email, token)
export const isValidConfirmToken = (email: string, token: string) => isValidToken('confirm', email, token)

export function unsubscribeUrl(baseUrl: string, email: string, path: '/unsubscribe' | '/api/unsubscribe' = '/unsubscribe'): string {
  const params = new URLSearchParams({ e: email, t: unsubscribeToken(email) })
  return `${baseUrl}${path}?${params.toString()}`
}

export function confirmUrl(baseUrl: string, email: string): string {
  const params = new URLSearchParams({ e: email, t: signedToken('confirm', email) })
  return `${baseUrl}/subscribe/confirm?${params.toString()}`
}
