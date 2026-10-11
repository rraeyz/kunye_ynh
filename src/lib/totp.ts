import crypto from 'crypto'

// İki adımlı doğrulama: RFC 6238 TOTP (Google Authenticator, Aegis, 1Password vb. ile uyumlu).
// 30 saniyelik adım, 6 hane, HMAC-SHA1. Saat kaymasına karşı bir önceki/sonraki adım da kabul edilir.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i]
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20))

export function totpCode(secret: string, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(message).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 1_000_000).padStart(6, '0')
}

export const currentCounter = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS)

// Kod geçerliyse eşleşen adım numarasını döner (aynı kodun ikinci kez kullanılmasını engellemek için), değilse null
export function verifyTotp(secret: string, code: unknown, now = Date.now()): number | null {
  const given = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(given)) return null
  const counter = currentCounter(now)
  for (const candidate of [counter, counter - 1, counter + 1]) {
    if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, candidate)), Buffer.from(given))) return candidate
  }
  return null
}

export function otpauthUrl(secret: string, account: string, issuer = 'Künye'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`
}

// Kurtarma kodları: telefon kaybolursa giriş için, her biri bir kez kullanılır. Yalnızca SHA-256 özetleri saklanır
// (kodlar rastgele ve uzun olduğu için yavaş bir özete gerek yok).
export const hashRecoveryCode = (code: string) =>
  crypto.createHash('sha256').update(code.toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex')

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(8)).toLowerCase().slice(0, 10)
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}
