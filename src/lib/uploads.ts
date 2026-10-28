import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import sharp, { type Metadata, type Sharp } from 'sharp'

// Docker'da /app/public/uploads kalıcı volume olarak bağlı (YunoHost: $data_dir/uploads).
// Next.js build sonrası public/'e eklenen dosyaları servis etmediği için dosyalar /media/<ad> route'u ile sunulur.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads')

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB (yükleme sonrası zaten küçültülüyor)
const MAX_ANIMATION_FRAMES = 500

type UploadKind = 'avatar' | 'favicon' | 'og' | 'background' | 'icon' | 'cover' | 'thumb' | 'gallery'

const PRESETS: Record<UploadKind, { process: (img: Sharp) => Sharp; ext: 'webp' | 'png' | 'jpg' }> = {
  // Profil fotoğrafı: kare, 512px
  avatar: { process: (img) => img.resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }), ext: 'webp' },
  // Tarayıcı sekme ikonu: 64px PNG (her tarayıcı destekler)
  favicon: { process: (img) => img.resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png(), ext: 'png' },
  // Sosyal medya önizlemesi: 1200x630 JPEG (Facebook/Twitter/WhatsApp en iyi bunu destekler)
  og: { process: (img) => img.resize(1200, 630, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }), ext: 'jpg' },
  // Sayfa arka planı: en fazla 1920px genişlik
  background: { process: (img) => img.resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }), ext: 'webp' },
  // Özel link ikonu: 128px PNG
  icon: { process: (img) => img.resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png(), ext: 'png' },
  // Profil kapak görseli (banner): 1500x500
  cover: { process: (img) => img.resize(1500, 500, { fit: 'cover' }).webp({ quality: 82 }), ext: 'webp' },
  // Link önizleme / portfolyo kartı görseli
  thumb: { process: (img) => img.resize(800, 450, { fit: 'cover' }).webp({ quality: 82 }), ext: 'webp' },
  // Galeri görseli: en fazla 1600px
  gallery: { process: (img) => img.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }), ext: 'webp' },
}

export function isUploadKind(value: unknown): value is UploadKind {
  return typeof value === 'string' && value in PRESETS
}

// sharp AVIF'i 'heif' olarak bildirir, o yüzden heif açık. tiff kapalı: web için gerekmiyor ve
// çözücüsü gereksiz saldırı yüzeyi (yükleme arayüzü de tiff kabul etmiyor)
const ALLOWED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'])

// Görseli doğrular, yeniden kodlar (EXIF/konum bilgisi silinir) ve kaydeder. Herkese açık yolu döner.
export async function saveUploadedImage(buffer: Buffer, kind: UploadKind): Promise<string> {
  let metadata: Metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw new UploadError('Dosya bir görsel olarak okunamadı')
  }

  // SVG kabul edilmez (içinde script olabilir); diğer formatlar raster'a dönüştürülür
  if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
    throw new UploadError('Desteklenmeyen format. JPG, PNG, WEBP, GIF veya AVIF yükleyin.')
  }
  if ((metadata.width || 0) * (metadata.height || 0) > 50_000_000) {
    throw new UploadError('Görsel çözünürlüğü çok yüksek')
  }

  const preset = PRESETS[kind]
  // Hareketli GIF/WebP: WebP'ye kaydedilen türlerde (arka plan, kapak, galeri, profil fotoğrafı, kart görseli)
  // animasyon korunur ve hareketli WebP olur (GIF'ten çok daha küçük). Diğerlerinde ilk kare kullanılır.
  const frames = metadata.pages || 1
  const animated = frames > 1 && preset.ext === 'webp'
  if (animated && (frames > MAX_ANIMATION_FRAMES || (metadata.width || 0) * (metadata.height || 0) * frames > 400_000_000)) {
    throw new UploadError(`Animasyon çok büyük (en fazla ${MAX_ANIMATION_FRAMES} kare). Daha kısa veya küçük bir GIF deneyin.`)
  }
  // rotate(): telefon fotoğraflarındaki EXIF yönünü uygular (hareketli görsellerde EXIF yok)
  const input = animated ? sharp(buffer, { animated: true }) : sharp(buffer, { animated: false }).rotate()
  const output = await preset.process(input).toBuffer()

  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  const fileName = `${kind}-${crypto.randomUUID()}.${preset.ext}`
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), output)

  return `/media/${fileName}`
}

export class UploadError extends Error {}

export const FILE_NAME_PATTERN = /^(avatar|favicon|og|background|icon|cover|thumb|gallery)-[0-9a-f-]{36}\.(webp|png|jpg)$/

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
}

export async function readUploadedImage(fileName: string): Promise<{ data: Buffer; contentType: string } | null> {
  // Sadece bizim ürettiğimiz dosya adları: dizin dışına çıkma (../) imkansız
  if (!FILE_NAME_PATTERN.test(fileName)) return null
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, fileName))
    return { data, contentType: CONTENT_TYPES[fileName.split('.').pop() as string] }
  } catch {
    return null
  }
}

// Eski sürümler yüklenen görselleri base64 (data: URI) olarak database'e yazıyordu; bu görseller
// her sayfa yüklemesinde HTML'e gömülüyor, e-posta ve sosyal medya önizlemelerinde çalışmıyordu.
// İlk istekte bunları dosyaya çevirip database'i günceller. Çevrilemeyen biçimler (SVG, ICO) olduğu gibi kalır.
const INLINE_IMAGE_FIELDS = [
  ['imageUrl', 'avatar'],
  ['faviconUrl', 'favicon'],
  ['ogImageUrl', 'og'],
  ['backgroundImage', 'background'],
] as const

type InlineImageProfile = Partial<Record<(typeof INLINE_IMAGE_FIELDS)[number][0], string>>

const globalForMigration = globalThis as unknown as { inlineImageMigration?: Promise<Record<string, string>> }

// Sadece dosyaya çevrilebilen biçimler; SVG/ICO data URI'leri her istekte boşuna denenmesin
const CONVERTIBLE_DATA_URI = /^data:image\/(jpeg|jpg|png|webp|gif|avif);base64,(.+)$/i

export function hasInlineImages(profile: InlineImageProfile): boolean {
  return INLINE_IMAGE_FIELDS.some(([field]) => CONVERTIBLE_DATA_URI.test(profile[field] || ''))
}

// Dönen nesne: dosyaya çevrilen alanların yeni değerleri (değişmeyenler yok)
export function migrateInlineImages(
  profile: InlineImageProfile,
  save: (data: Record<string, string>) => Promise<unknown>
): Promise<Record<string, string>> {
  // Aynı anda gelen istekler aynı işi iki kez yapmasın
  if (globalForMigration.inlineImageMigration) return globalForMigration.inlineImageMigration

  globalForMigration.inlineImageMigration = (async () => {
    const updates: Record<string, string> = {}
    for (const [field, kind] of INLINE_IMAGE_FIELDS) {
      const value = profile[field]
      const match = value?.match(CONVERTIBLE_DATA_URI)
      if (!match) continue
      try {
        updates[field] = await saveUploadedImage(Buffer.from(match[2], 'base64'), kind)
      } catch (error) {
        console.warn(`Base64 görsel dosyaya çevrilemedi (${field}), olduğu gibi bırakıldı:`, error instanceof Error ? error.message : error)
      }
    }
    if (Object.keys(updates).length > 0) {
      await save(updates)
      console.log(`🖼️  ${Object.keys(updates).length} base64 görsel dosyaya taşındı: ${Object.keys(updates).join(', ')}`)
    }
    return updates
  })().finally(() => {
    globalForMigration.inlineImageMigration = undefined
  })

  return globalForMigration.inlineImageMigration
}
