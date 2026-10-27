import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { generateEmailHTML, textToHTML } from '@/lib/emailTemplate'

// Admin panelinden gönderilen e-postaların ortak parçaları (tek kişiye gönderim, toplu bülten, önizleme).
// İmza (logo, şirket adı/adresi, sosyal medya ikonları) her gönderimde profilden okunur;
// Profil → Sosyal medya hesapları değişince imza da kendiliğinden değişir.

const MAIL_PROFILE_SELECT = {
  smtpHost: true,
  smtpPort: true,
  smtpUser: true,
  smtpPassword: true,
  smtpFrom: true,
  smtpFromName: true,
  smtpSecure: true,
  companyName: true,
  companyAddress: true,
  imageUrl: true,
  linkedinUrl: true,
  twitterUrl: true,
  discordUrl: true,
  youtubeUrl: true,
  instagramUrl: true,
  githubUrl: true,
} as const

export type MailProfile = {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
  smtpFromName: string
  smtpSecure: boolean
  companyName: string
  companyAddress: string
  imageUrl: string
  linkedinUrl: string
  twitterUrl: string
  discordUrl: string
  youtubeUrl: string
  instagramUrl: string
  githubUrl: string
}

export async function loadMailProfile(): Promise<MailProfile | null> {
  return prisma.profile.findUnique({ where: { id: 1 }, select: MAIL_PROFILE_SELECT })
}

export function isSmtpConfigured(profile: MailProfile | null): profile is MailProfile {
  return !!(profile && profile.smtpHost && profile.smtpUser && profile.smtpPassword)
}

export function createMailTransport(profile: MailProfile) {
  return nodemailer.createTransport({
    host: profile.smtpHost,
    port: profile.smtpPort,
    secure: profile.smtpSecure,
    auth: {
      user: profile.smtpUser,
      pass: profile.smtpPassword,
    },
  })
}

// "Gönderen Adı" <adres>
export function senderAddress(profile: MailProfile, name = profile.smtpFromName): string {
  const address = profile.smtpFrom || profile.smtpUser
  return name ? `"${name.replace(/["\\\r\n]/g, '')}" <${address}>` : address
}

interface BuildOptions {
  subject: string
  message: string
  baseUrl: string
  unsubscribeUrl?: string
  viewInBrowserUrl?: string
}

// E-postanın HTML'i: mesaj + imza (logo, şirket, sosyal ikonlar)
export function buildEmailHtml(profile: MailProfile, options: BuildOptions): string {
  return generateEmailHTML({
    subject: options.subject,
    content: textToHTML(options.message),
    companyLogo: profile.imageUrl || undefined,
    companyName: profile.companyName,
    companyAddress: profile.companyAddress,
    socialLinks: {
      linkedin: profile.linkedinUrl,
      twitter: profile.twitterUrl,
      discord: profile.discordUrl,
      youtube: profile.youtubeUrl,
      instagram: profile.instagramUrl,
      github: profile.githubUrl,
    },
    unsubscribeUrl: options.unsubscribeUrl,
    viewInBrowserUrl: options.viewInBrowserUrl,
    baseUrl: options.baseUrl,
  })
}

const decodeEntities = (value: string) =>
  value.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

// Düz metin sürümü (multipart/alternative): HTML göstermeyen istemciler ve spam filtreleri için
export function buildEmailText(profile: MailProfile, options: BuildOptions): string {
  const body = textToHTML(options.message)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const label = text.replace(/<[^>]+>/g, '').trim()
      return label && label !== href ? `${label} (${href})` : href
    })
    .replace(/<img [^>]*src="([^"]+)"[^>]*>/gi, '[görsel: $1]')
    .replace(/<[^>]+>/g, '')

  const lines = [decodeEntities(body).replace(/\n{3,}/g, '\n\n').trim()]
  const signature = [profile.companyName, profile.companyAddress].filter(Boolean).join('\n')
  if (signature) lines.push(`--\n${signature}`)
  if (options.unsubscribeUrl) lines.push(`Abonelikten çıkmak için: ${options.unsubscribeUrl}`)
  return lines.join('\n\n')
}

// "a@x.com, b@y.com\nc@z.com" → benzersiz adres listesi
export function parseRecipients(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '')
  const seen = new Set<string>()
  const list: string[] = []
  for (const part of raw.split(/[,;\n]+/)) {
    const email = part.trim()
    if (email && !seen.has(email.toLowerCase())) {
      seen.add(email.toLowerCase())
      list.push(email)
    }
  }
  return list
}
