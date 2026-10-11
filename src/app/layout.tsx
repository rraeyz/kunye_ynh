import type { Metadata } from 'next'
// Yazı tipleri (bkz. src/lib/fonts.ts). Her pakette latin-ext (Türkçe ğ, ş, ı, İ) dahil tüm alt kümeler var;
// tarayıcı unicode-range sayesinde yalnızca sayfada kullanılan yazı tipinin gereken parçalarını indirir.
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/montserrat/wght.css'
import '@fontsource-variable/roboto/wght.css'
import '@fontsource-variable/open-sans/wght.css'
import '@fontsource-variable/sora/wght.css'
import '@fontsource-variable/manrope/wght.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './globals.css'
import { getSiteData } from '@/lib/site'
import { headers } from 'next/headers'
import { getBaseUrl } from '@/lib/url'


async function getProfileData() {
  try {
    return (await getSiteData()).profile
  } catch (error) {
    return null
  }
}

function safeBaseUrl(): URL {
  try {
    return new URL(getBaseUrl(headers()))
  } catch {
    // Bozuk Host başlığı sayfayı çökertmesin
    return new URL('http://localhost:3000')
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfileData()
  
  const title = profile?.pageTitle || profile?.name || 'Personal Link Tree'
  const description = profile?.pageDescription || profile?.bio || 'Modern and minimalist personal link tree'
  // Kendi paylaşım görseli yüklenmediyse profil bilgilerinden üretilen kart kullanılır (bkz. api/og).
  // data: URI (eski base64 yüklemeler) sosyal medya önizlemelerinde çalışmaz.
  const ogCandidate = profile?.ogImageUrl || ''
  // ?v=: profil değişince sosyal ağların önbelleğindeki eski kart yerine yenisi alınsın
  const ogImage = ogCandidate && !ogCandidate.startsWith('data:') ? ogCandidate : `/api/og?v=${profile?.updatedAt ? new Date(profile.updatedAt).getTime() : 0}`
  const favicon = profile?.faviconUrl || '/favicon.png'
  
  return {
    // Göreli görsel yolları (/media/...) bu adrese göre tam URL'ye çevrilir; WhatsApp/Twitter önizlemesi için gerekli
    metadataBase: safeBaseUrl(),
    title,
    description,
    icons: {
      icon: favicon,
      shortcut: favicon,
      apple: favicon,
    },
    openGraph: {
      title,
      description,
      images: [ogImage],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning: açık/koyu mod sınıfı hydration'dan önce ThemeScript tarafından ekleniyor
    <html lang="tr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
