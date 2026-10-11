import { prisma } from '@/lib/prisma'

// Uygulamanın iç durumu için anahtar/değer deposu (AppState tablosu): kalıcı gizli anahtar,
// otomatik işlerin son çalışma zamanı, kurulmakta olan 2FA anahtarı gibi. Yedeğe girmez.
export async function getState(key: string): Promise<string | null> {
  const row = await prisma.appState.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setState(key: string, value: string): Promise<void> {
  await prisma.appState.upsert({ where: { key }, update: { value }, create: { key, value } })
}

export async function deleteState(key: string): Promise<void> {
  await prisma.appState.deleteMany({ where: { key } })
}
