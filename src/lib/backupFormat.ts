// Yedek dosyası biçimi. Hem tarayıcıda (yüklemeden önce özet göstermek için) hem sunucuda kullanılır;
// bu yüzden burada sunucuya özgü hiçbir şey (prisma, fs) olmamalı.

export const BACKUP_FORMAT = 'kunye-backup'
export const BACKUP_FORMAT_VERSION = 1

export const BACKUP_KINDS = ['full', 'settings', 'profile'] as const
export type BackupKind = (typeof BACKUP_KINDS)[number]

export const BACKUP_KIND_INFO: Record<BackupKind, { label: string; description: string }> = {
  full: {
    label: 'Tam yedek',
    description: 'Her şey: profil, görünüm, bloklar (şifreleri dahil), aboneler, iletişim mesajları, analitik, SMTP ve bildirim ayarları ve yüklenen görseller. Sunucu taşırken bunu kullanın.',
  },
  settings: {
    label: 'Sayfa ve ayarlar',
    description: 'Profil, görünüm, bloklar, SMTP ve e-posta imzası ile kullandıkları görseller. Aboneler, analitik ve link şifreleri dahil değil.',
  },
  profile: {
    label: 'Yalnızca profil ve görünüm',
    description: 'Profil kartı, tema, kapak ve sosyal hesaplar ile görselleri. Bloklara, SMTP ayarlarına, abonelere dokunmaz.',
  },
}

export interface BackupSummary {
  kind: BackupKind
  legacy: boolean // Eski "Ayarları dışa aktar" dosyası
  createdAt: string
  appVersion: string
  counts: { links: number; subscribers: number; analytics: number; pageViews: number; files: number }
}

const count = (value: unknown) => (Array.isArray(value) ? value.length : 0)

// Dosyanın bir yedek olup olmadığını ve türünü bulur. Yedek değilse { error } döner.
export function summarizeBackup(data: any): BackupSummary | { error: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Bu dosya bir yedek değil' }

  if (data.format === BACKUP_FORMAT) {
    if (typeof data.formatVersion !== 'number' || data.formatVersion > BACKUP_FORMAT_VERSION) {
      return { error: 'Bu yedek daha yeni bir sürümle alınmış; önce uygulamayı güncelleyin' }
    }
    if (!(BACKUP_KINDS as readonly string[]).includes(data.kind)) return { error: 'Bilinmeyen yedek türü' }
    if (!data.profile || typeof data.profile !== 'object') return { error: 'Yedekte profil bilgisi yok' }
    return {
      kind: data.kind,
      legacy: false,
      createdAt: String(data.createdAt || ''),
      appVersion: String(data.appVersion || ''),
      counts: {
        links: count(data.links),
        subscribers: count(data.subscribers),
        analytics: count(data.analytics),
        pageViews: count(data.pageViews),
        files: data.files && typeof data.files === 'object' ? Object.keys(data.files).length : 0,
      },
    }
  }

  // Eski sürümlerin "Ayarları dışa aktar" dosyası: { version, exportDate, profile, links }
  if (data.version && data.profile && typeof data.profile === 'object') {
    return {
      kind: 'settings',
      legacy: true,
      createdAt: String(data.exportDate || ''),
      appVersion: '',
      counts: { links: count(data.links), subscribers: 0, analytics: 0, pageViews: 0, files: 0 },
    }
  }

  return { error: 'Bu dosya bir yedek değil' }
}
