import { UAParser } from 'ua-parser-js'
import { prisma } from '@/lib/prisma'
import { getClientIp, hashIp, isPrivateIp } from '@/lib/security'

// geoip-lite opsiyonel (build ortamında olmayabilir)
let geoip: any = null
try {
  geoip = require('geoip-lite')
} catch (error) {
  console.log('GeoIP not available, will use default location data')
}

export type UtmParams = {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
}

const UTM_KEYS: Array<[keyof UtmParams, string]> = [
  ['utmSource', 'utm_source'],
  ['utmMedium', 'utm_medium'],
  ['utmCampaign', 'utm_campaign'],
  ['utmTerm', 'utm_term'],
  ['utmContent', 'utm_content'],
]

export function utmFromSearchParams(params: URLSearchParams | Record<string, string | string[] | undefined>): UtmParams {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key]
    return (Array.isArray(value) ? value[0] : value) || ''
  }
  const utm: UtmParams = {}
  for (const [field, key] of UTM_KEYS) utm[field] = get(key).slice(0, 200)
  return utm
}

// Bir link tıklamasını kaydeder: tıklama sayacı + detaylı analytics satırı
export async function recordClick(
  linkId: number,
  headers: Headers,
  extra: { referrer?: string; utm?: UtmParams } = {}
) {
  const userAgent = (headers.get('user-agent') || '').slice(0, 500)
  // Link önizleme botları (WhatsApp, Telegram, arama motorları...) tıklama sayılmaz
  if (isBot(userAgent)) return null

  const result = new UAParser(userAgent).getResult()

  const ip = getClientIp(headers)
  let country = 'Unknown'
  let city = ''
  let region = ''

  if (isPrivateIp(ip)) {
    country = 'Local'
  } else if (geoip) {
    const geo = geoip.lookup(ip)
    if (geo) {
      country = geo.country || 'Unknown'
      city = geo.city || ''
      region = geo.region || ''
    }
  }

  // Silinmiş/kapalı ya da geçersiz kimlikli link: kayıt yok (önceden 500 hatası dönüyordu)
  if (!Number.isInteger(linkId)) return null
  const updated = await prisma.link.updateMany({
    where: { id: linkId, enabled: true },
    data: { clicks: { increment: 1 } },
  })
  if (updated.count === 0) return null

  await prisma.analytics.create({
    data: {
      linkId,
      userAgent,
      device: result.device.type || 'desktop',
      browser: result.browser.name || 'Unknown',
      os: result.os.name || 'Unknown',
      country,
      city,
      region,
      referrer: (extra.referrer ?? headers.get('referer') ?? '').slice(0, 500),
      utmSource: extra.utm?.utmSource || '',
      utmMedium: extra.utm?.utmMedium || '',
      utmCampaign: extra.utm?.utmCampaign || '',
      utmTerm: extra.utm?.utmTerm || '',
      utmContent: extra.utm?.utmContent || '',
      ipHash: hashIp(ip),
    },
  })

  return true
}

// Arama motoru botları, link önizleme servisleri vb. görüntülenme sayılmaz
const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch/i

export function isBot(userAgent: string): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent)
}

// Referrer'ı alan adına indirger (https://www.instagram.com/x?y → instagram.com)
export function referrerHost(referrer: string): string {
  if (!referrer) return ''
  try {
    return new URL(referrer).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Toplam görüntülenme (sayfadaki sayaç). Analitik kayıtları silinse de düşmez; sayaç ilk kez
// oluşturulurken mevcut görüntülenme kayıtlarından başlar.
const VIEW_COUNTER = 'pageViews'

async function incrementViewCount() {
  const updated = await prisma.counter.updateMany({ where: { key: VIEW_COUNTER }, data: { value: { increment: 1 } } })
  if (updated.count === 0) {
    const existing = await prisma.pageView.count()
    await prisma.counter.upsert({ where: { key: VIEW_COUNTER }, update: { value: { increment: 1 } }, create: { key: VIEW_COUNTER, value: existing + 1 } })
  }
}

export async function getViewCount(): Promise<number> {
  const counter = await prisma.counter.findUnique({ where: { key: VIEW_COUNTER } })
  return counter?.value ?? prisma.pageView.count()
}

// Profil sayfası görüntülenmesini kaydeder (botlar hariç). Kaydedildiyse true döner.
export async function recordPageView(
  headers: Headers,
  extra: { referrer?: string; utm?: UtmParams } = {}
): Promise<boolean> {
  const userAgent = headers.get('user-agent') || ''
  if (isBot(userAgent)) return false

  const result = new UAParser(userAgent).getResult()
  const ip = getClientIp(headers)

  let country = 'Unknown'
  if (isPrivateIp(ip)) {
    country = 'Local'
  } else if (geoip) {
    country = geoip.lookup(ip)?.country || 'Unknown'
  }

  await incrementViewCount()
  await prisma.pageView.create({
    data: {
      device: result.device.type || 'desktop',
      browser: result.browser.name || 'Unknown',
      os: result.os.name || 'Unknown',
      country,
      referrer: (extra.referrer || '').slice(0, 500),
      utmSource: extra.utm?.utmSource || '',
      utmMedium: extra.utm?.utmMedium || '',
      utmCampaign: extra.utm?.utmCampaign || '',
      ipHash: hashIp(ip),
    },
  })
  return true
}
