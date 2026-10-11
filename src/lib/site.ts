import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'

// Ziyaretçi sayfasının verisi (profil + açık bloklar) önbellekte tutulur; her ziyarette veritabanına
// gidilmez. Admin panelinden yapılan her kayıt revalidateSite() ile önbelleği hemen tazeler.
// Zamanlanmış linklerin süzülmesi önbellekten sonra, her istekte yapılır; o yüzden önbellek
// zamanlamayı geciktirmez. 5 dakikalık süre yalnızca gözden kaçan bir yazma için güvenlik ağıdır.
export const SITE_TAG = 'site'

const loadSiteData = unstable_cache(
  async () => {
    const [profile, links] = await Promise.all([
      prisma.profile.findFirst(),
      prisma.link.findMany({ where: { enabled: true }, orderBy: { order: 'asc' } }),
    ])
    // Gizli değerler önbellek dosyasına yazılmaz: yalnızca kayıtlı olup olmadıkları tutulur
    const publicProfile = profile && {
      ...profile,
      smtpPassword: '',
      notifyTelegramToken: '',
      hasSmtpPassword: !!profile.smtpPassword,
    }
    const publicLinks = links.map((link) => ({ ...link, password: link.password ? 'protected' : '' }))
    return { profile: publicProfile, links: publicLinks }
  },
  ['site-data'],
  { tags: [SITE_TAG], revalidate: 300 }
)

// Önbellekten dönen veride tarihler metne dönüşür; burada yeniden Date yapılır
const toDate = (value: unknown) => (value ? new Date(value as string) : null)

export async function getSiteData() {
  const { profile, links } = await loadSiteData()
  return {
    profile: profile && { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt) },
    links: links.map((link) => ({
      ...link,
      startDate: toDate(link.startDate),
      endDate: toDate(link.endDate),
      targetDate: toDate(link.targetDate),
      healthCheckedAt: toDate(link.healthCheckedAt),
      createdAt: new Date(link.createdAt),
      updatedAt: new Date(link.updatedAt),
    })),
  }
}

export function revalidateSite() {
  try {
    revalidateTag(SITE_TAG)
  } catch (error) {
    // İstek dışında (ör. zamanlanmış iş) çağrılırsa; önbellek en geç 5 dakikada kendiliğinden tazelenir
    console.warn('Site önbelleği tazelenemedi:', error instanceof Error ? error.message : error)
  }
}
