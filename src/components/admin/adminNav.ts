import type { IconType } from 'react-icons'
import { FaHome, FaUser, FaLink, FaPalette, FaChartLine, FaUsers, FaPaperPlane, FaQrcode, FaCog, FaInbox } from 'react-icons/fa'

// Admin panelinin bölümleri. Sol menü, telefondaki "Daha fazla" listesi ve komut paleti buradan beslenir.
export type AdminTab =
  | 'overview' | 'profile' | 'links' | 'theme'
  | 'analytics' | 'messages' | 'subscribers' | 'custom-email'
  | 'qr' | 'settings'

export interface AdminNavItem {
  id: AdminTab
  label: string
  icon: IconType
  group: string | null
  keywords: string
}

export const ADMIN_NAV: AdminNavItem[] = [
  { id: 'overview', label: 'Genel Bakış', icon: FaHome, group: null, keywords: 'özet ana sayfa dashboard' },
  { id: 'profile', label: 'Profil', icon: FaUser, group: 'Sayfam', keywords: 'isim biyografi fotoğraf kapak iletişim sosyal seo' },
  { id: 'links', label: 'Linkler ve Bloklar', icon: FaLink, group: 'Sayfam', keywords: 'link blok ekle galeri spotify metin' },
  { id: 'theme', label: 'Görünüm', icon: FaPalette, group: 'Sayfam', keywords: 'tema renk yazı tipi font arka plan düzen' },
  { id: 'analytics', label: 'Analitik', icon: FaChartLine, group: 'Kitle', keywords: 'istatistik tıklama ziyaretçi analytics' },
  { id: 'messages', label: 'Mesajlar', icon: FaInbox, group: 'Kitle', keywords: 'iletişim bana yaz gelen kutusu mesaj' },
  { id: 'subscribers', label: 'Aboneler', icon: FaUsers, group: 'Kitle', keywords: 'bülten abone toplu e-posta' },
  { id: 'custom-email', label: 'E-posta Gönder', icon: FaPaperPlane, group: 'Kitle', keywords: 'özel e-posta mail' },
  { id: 'qr', label: 'QR Kod', icon: FaQrcode, group: 'Araçlar', keywords: 'qr karekod' },
  { id: 'settings', label: 'Ayarlar', icon: FaCog, group: 'Araçlar', keywords: 'şifre smtp yedek dışa aktar içe aktar oturum güvenlik iki adımlı 2fa bildirim telegram ntfy otomatik' },
]

export const NAV_GROUPS = ['Sayfam', 'Kitle', 'Araçlar']

export const isAdminTab = (value: string | null | undefined): value is AdminTab =>
  !!value && ADMIN_NAV.some((item) => item.id === value)

export const navItem = (id: AdminTab) => ADMIN_NAV.find((item) => item.id === id) || ADMIN_NAV[0]
