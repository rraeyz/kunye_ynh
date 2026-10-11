// Profil tablosunda admin panelinden güncellenebilen alanlar.
// Gövdeyi doğrudan Prisma'ya vermek yerine sadece bunlar kabul edilir (id, createdAt vb. değiştirilemez).
export const PROFILE_EDITABLE_FIELDS = [
  'name', 'bio', 'imageUrl',
  'pageTitle', 'pageDescription', 'ogImageUrl', 'faviconUrl',
  'themePreset', 'primaryColor', 'accentColor', 'backgroundColor', 'cardColor', 'textColor',
  'buttonStyle', 'fontFamily', 'borderRadius', 'animationSpeed',
  'backgroundType', 'backgroundImage', 'backgroundOpacity', 'coverImage', 'layout',
  'contactEmail', 'contactPhone', 'contactAddress', 'showVCard',
  'darkMode', 'verified', 'badges', 'analyticsRetentionDays',
  'smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'smtpFrom', 'smtpFromName', 'smtpSecure',
  'companyName', 'companyAddress',
  'linkedinUrl', 'twitterUrl', 'discordUrl', 'youtubeUrl', 'instagramUrl', 'githubUrl', 'showSocialIcons',
  'statusText', 'location', 'timezone',
  'showContactButton', 'showShareButton', 'showNewsletter', 'showCategoryTabs',
  'newsletterDoubleOptIn', 'autoBackupEnabled', 'weeklyReportEnabled', 'linkHealthEnabled',
  'notifyNtfyUrl', 'notifyTelegramToken', 'notifyTelegramChatId',
] as const

// Sayfanın içeriği olmayan ayarlar: "Yalnızca profil ve görünüm" yedeğine ve geri al / ileri al'a girmez
export const PROFILE_SETTINGS_FIELDS: ReadonlySet<string> = new Set([
  'analyticsRetentionDays',
  'smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'smtpFrom', 'smtpFromName', 'smtpSecure',
  'newsletterDoubleOptIn', 'autoBackupEnabled', 'weeklyReportEnabled', 'linkHealthEnabled',
  'notifyNtfyUrl', 'notifyTelegramToken', 'notifyTelegramChatId',
])

const SETTINGS_BOOLEANS = ['newsletterDoubleOptIn', 'autoBackupEnabled', 'weeklyReportEnabled', 'linkHealthEnabled'] as const

// Ayarlar → Otomatik işler / Bildirimler alanlarını doğrular. Hatalıysa { error } döner.
export function normalizeSettings(data: Record<string, any>): { error: string } | null {
  for (const key of SETTINGS_BOOLEANS) {
    if (data[key] !== undefined) data[key] = data[key] === true || data[key] === 'true'
  }
  if (data.notifyNtfyUrl !== undefined) {
    data.notifyNtfyUrl = String(data.notifyNtfyUrl ?? '').trim().slice(0, 500)
    if (data.notifyNtfyUrl && !/^https?:\/\/[^\s]+$/i.test(data.notifyNtfyUrl)) return { error: 'ntfy adresi http(s):// ile başlamalı (örnek: https://ntfy.sh/konu-adi)' }
  }
  if (data.notifyTelegramChatId !== undefined) {
    data.notifyTelegramChatId = String(data.notifyTelegramChatId ?? '').trim().slice(0, 64)
    if (data.notifyTelegramChatId && !/^-?\d+$|^@[A-Za-z0-9_]{5,}$/.test(data.notifyTelegramChatId)) return { error: 'Telegram sohbet kimliği bir sayı (ör. 123456789) veya @kanal_adi olmalı' }
  }
  if (data.notifyTelegramToken !== undefined) {
    data.notifyTelegramToken = String(data.notifyTelegramToken ?? '').trim()
    if (data.notifyTelegramToken && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(data.notifyTelegramToken)) return { error: 'Telegram bot anahtarı geçersiz (BotFather\'ın verdiği 123456:ABC... biçiminde olmalı)' }
  }
  return null
}

const PROFILE_CARD_BOOLEANS = ['showContactButton', 'showShareButton', 'showNewsletter', 'showCategoryTabs'] as const

// Geçerli bir IANA saat dilimi mi (Europe/Istanbul gibi)? Boş değer "saat gösterme" demektir.
export function isValidTimezone(value: string): boolean {
  if (!value) return true
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

// Profil kartı alanlarını doğrular/normalleştirir. Hatalıysa { error } döner.
export function normalizeProfileCard(data: Record<string, any>): { error: string } | null {
  if (data.statusText !== undefined) data.statusText = String(data.statusText ?? '').trim().slice(0, 120)
  if (data.location !== undefined) data.location = String(data.location ?? '').trim().slice(0, 80)
  if (data.timezone !== undefined) {
    data.timezone = String(data.timezone ?? '').trim()
    if (!isValidTimezone(data.timezone)) return { error: 'Geçersiz saat dilimi (örnek: Europe/Istanbul)' }
  }
  for (const key of PROFILE_CARD_BOOLEANS) {
    if (data[key] !== undefined) data[key] = data[key] === true || data[key] === 'true'
  }
  return null
}

// SMTP şifresi ve Telegram bot anahtarı hiçbir zaman istemciye gönderilmez; sadece kayıtlı olup olmadıkları bildirilir
export function toClientProfile<T extends { smtpPassword?: string; notifyTelegramToken?: string } | null>(profile: T) {
  if (!profile) return profile
  const { smtpPassword, notifyTelegramToken, ...rest } = profile
  return {
    ...rest,
    smtpPassword: '',
    hasSmtpPassword: !!smtpPassword,
    notifyTelegramToken: '',
    hasTelegramToken: !!notifyTelegramToken,
  }
}
