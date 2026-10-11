import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'
import { getSiteData } from '@/lib/site'
import { readUploadedImage } from '@/lib/uploads'

export const dynamic = 'force-dynamic'

// Kişiye özel paylaşım görseli (Open Graph, 1200x630): link WhatsApp, X, LinkedIn, Telegram gibi yerlerde
// paylaşılınca görünen kart. Profil → SEO'da kendi görselini yüklemediysen bu kullanılır; profil fotoğrafı,
// isim, biyografi ve tema renklerinden üretilir.

const FONT_DIR = path.join(process.cwd(), 'node_modules/@fontsource/poppins/files')

// Türkçe karakterler (ğ, ş, ı, İ) latin-ext alt kümesinde. İki alt küme ayrı adla yüklenir ve
// fontFamily'de sırayla verilir: aynı ad + kalınlıkla yüklenince biri diğerinin yerine geçiyordu
// (kalın başlıktaki Türkçe harfler ince çıkıyordu).
async function loadFonts() {
  const files: Array<[string, string, 400 | 700]> = [
    ['poppins-latin-400-normal.woff', 'Poppins', 400], ['poppins-latin-ext-400-normal.woff', 'PoppinsExt', 400],
    ['poppins-latin-700-normal.woff', 'Poppins', 700], ['poppins-latin-ext-700-normal.woff', 'PoppinsExt', 700],
  ]
  const fonts = await Promise.all(files.map(async ([file, name, weight]) => {
    const data = await fs.readFile(path.join(FONT_DIR, file)).catch(() => null)
    return data && { name, data, weight, style: 'normal' as const }
  }))
  return fonts.filter((font): font is NonNullable<typeof font> => !!font)
}

// Profil fotoğrafı PNG data URI olarak (görsel çizici WebP okuyamaz). Uzak adresler indirilmez.
async function avatarDataUri(imageUrl: string): Promise<string | null> {
  try {
    let buffer: Buffer | null = null
    if (imageUrl.startsWith('/media/')) buffer = (await readUploadedImage(imageUrl.slice('/media/'.length)))?.data ?? null
    else if (imageUrl === '/default-avatar.jpg') buffer = await fs.readFile(path.join(process.cwd(), 'public/default-avatar.jpg'))
    if (!buffer) return null
    const png = await sharp(buffer, { animated: false }).resize(320, 320, { fit: 'cover' }).png().toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)
const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

export async function GET() {
  const { profile } = await getSiteData()
  const name = clip(profile?.name || 'Künye', 40)
  const bio = clip((profile?.bio || '').replace(/\s+/g, ' ').trim(), 140)
  const primary = isHex(profile?.primaryColor || '') ? profile!.primaryColor : '#a855f7'
  const accent = isHex(profile?.accentColor || '') ? profile!.accentColor : '#ec4899'
  const background = isHex(profile?.backgroundColor || '') ? profile!.backgroundColor : '#0a0a0a'
  const text = isHex(profile?.textColor || '') ? profile!.textColor : '#ffffff'
  const [fonts, avatar] = await Promise.all([loadFonts(), avatarDataUri(profile?.imageUrl || '')])

  const response = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 90px', background, fontFamily: 'Poppins, PoppinsExt', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -220, right: -160, width: 640, height: 640, borderRadius: 9999, background: primary, opacity: 0.35, filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', bottom: -260, left: -140, width: 600, height: 600, borderRadius: 9999, background: accent, opacity: 0.3, filter: 'blur(120px)' }} />
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} width={260} height={260} alt="" style={{ borderRadius: 9999, border: `6px solid ${primary}`, marginRight: 64, objectFit: 'cover' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, color: text }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>{name}</div>
          {bio && <div style={{ fontSize: 34, marginTop: 24, opacity: 0.8, lineHeight: 1.35 }}>{bio}</div>}
          {profile?.location && <div style={{ fontSize: 28, marginTop: 28, color: primary }}>{clip(profile.location, 60)}</div>}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined }
  )
  // Sosyal ağlar görseli kendi önbelleğinde tutar; burada da bir saat önbelleklenir
  response.headers.set('Cache-Control', 'public, max-age=3600')
  return response
}
