import { prisma } from '@/lib/prisma'
import LinkButton from '@/components/LinkButton'
import DynamicBackground from '@/components/DynamicBackground'
import ThemeProvider from '@/components/ThemeProvider'
import SocialEmbed from '@/components/SocialEmbed'
import ThemeToggle from '@/components/ThemeToggle'
import ThemeScript from '@/components/ThemeScript'
import ViewTracker from '@/components/ViewTracker'
import MotionProvider from '@/components/MotionProvider'
import ProfileCard from '@/components/site/ProfileCard'
import NewsletterBox from '@/components/site/NewsletterBox'
import CategoryTabs from '@/components/site/CategoryTabs'
import { groupBlocks, blockCategories } from '@/lib/pageBlocks'
import TextBlock from '@/components/blocks/TextBlock'
import GalleryBlock from '@/components/blocks/GalleryBlock'
import SpotifyBlock from '@/components/blocks/SpotifyBlock'
import CountdownBlock from '@/components/blocks/CountdownBlock'
import PortfolioCard from '@/components/blocks/PortfolioCard'
import HeadingBlock from '@/components/blocks/HeadingBlock'
import SkillsBlock from '@/components/blocks/SkillsBlock'
import TestimonialsBlock from '@/components/blocks/TestimonialsBlock'
import FaqBlock from '@/components/blocks/FaqBlock'
import TimelineBlock from '@/components/blocks/TimelineBlock'
import CouponBlock from '@/components/blocks/CouponBlock'
import MapBlock from '@/components/blocks/MapBlock'
import { ITEM_FIELDS, parseImages, parseItems, parseMapLocation, spotifyEmbedUrl } from '@/lib/links'
import { isSafeUrl } from '@/lib/security'
import { renderLinkIcon } from '@/lib/linkIcon'
import { hasInlineImages, migrateInlineImages } from '@/lib/uploads'
import { redirect } from 'next/navigation'
import { isSetupComplete } from '@/lib/auth'
import { getSiteData, revalidateSite } from '@/lib/site'
import { getBaseUrl, toAbsoluteUrl } from '@/lib/url'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function Home({ searchParams }: { searchParams?: { link?: string } }) {
  // /go/[slug] şifreli linkleri /?link=ID ile buraya yönlendirir, şifre penceresi otomatik açılır
  const autoOpenLinkId = parseInt(searchParams?.link || '')

  // Kurulum tamamlanmamışsa sihirbaza yönlendir
  if (!(await isSetupComplete())) {
    redirect('/setup')
  }

  // Profil ve açık bloklar (önbellekten; bkz. lib/site)
  let siteData
  try {
    siteData = await getSiteData()
  } catch (error) {
    // Database not initialized
    redirect('/setup')
  }
  let profile = siteData.profile
  
  // İlk kez çalışıyorsa setup'a yönlendir
  if (!profile) {
    redirect('/setup')
  }

  // Eski sürümlerden kalan base64 görselleri bir kerelik dosyaya taşı
  if (hasInlineImages(profile)) {
    const currentProfile = profile
    const updates = await migrateInlineImages(currentProfile, async (data) => {
      await prisma.profile.update({ where: { id: currentProfile.id }, data })
      revalidateSite()
    }).catch((error) => {
      console.error('Base64 görsel taşıma hatası:', error)
      return {}
    })
    profile = { ...profile, ...updates }
  }

  // Tarih kontrolü - sadece aktif scheduled links göster
  const now = new Date()
  const links = siteData.links.map((link) => ({
    ...link,
    // Son savunma hattı: http(s)/mailto/tel dışındaki adresler (ör. javascript:) sayfaya hiç çıkmaz
    url: isSafeUrl(link.url) ? link.url : '',
  })).filter(link => {
    // Başlangıç tarihi varsa ve henüz gelmemişse, gösterme
    if (link.startDate && new Date(link.startDate) > now) {
      return false
    }
    // Bitiş tarihi varsa ve geçmişse, gösterme
    if (link.endDate && new Date(link.endDate) < now) {
      return false
    }
    return true
  })

  const isGrid = profile.layout === 'grid'
  // İçi boş bloklar (metni olmayan metin, görselsiz galeri, tarihsiz geri sayım...) hiç yer kaplamasın
  const hasContent = (link: any) => {
    switch (link.type) {
      case 'text': return !!(link.title?.trim() || link.description?.trim())
      case 'gallery': return parseImages(link.images).length > 0
      case 'spotify': return !!spotifyEmbedUrl(link.url)
      case 'countdown': return !!link.targetDate
      case 'coupon': return !!link.description?.trim()
      case 'map': return !!parseMapLocation(link.url)
      // Ayırıcı başlıksız da olabilir (yalnızca çizgi)
      case 'heading': return true
      default: return ITEM_FIELDS[link.type] ? parseItems(link.type, link.items).length > 0 : true
    }
  }
  const visibleLinks = links.filter(hasContent)
  const segments = groupBlocks(visibleLinks)
  const categories = blockCategories(visibleLinks)
  const showTabs = profile.showCategoryTabs && categories.length >= 2

  // "Bana yaz": iletişim e-postası girildiyse görünür. Mesajlar admin panelinde (Mesajlar) saklanır;
  // SMTP ayarlıysa ayrıca e-posta olarak da gelir
  const contactReady = !!profile.contactEmail

  const renderBlock = (link: any, inRun: boolean) => {
    switch (link.type) {
      case 'text':
        return <TextBlock title={link.title} text={link.description} />
      case 'gallery':
        return <GalleryBlock title={link.title} images={parseImages(link.images)} />
      case 'spotify': {
        const embedUrl = spotifyEmbedUrl(link.url)
        return embedUrl ? <SpotifyBlock title={link.title} embedUrl={embedUrl} /> : null
      }
      case 'countdown':
        return link.targetDate ? (
          <CountdownBlock
            linkId={link.id}
            title={link.title}
            description={link.description}
            targetDate={new Date(link.targetDate).toISOString()}
            url={link.url}
          />
        ) : null
      case 'map': {
        const location = parseMapLocation(link.url)
        return location ? <MapBlock title={link.title} address={link.description} lat={location.lat} lon={location.lon} url={link.url} /> : null
      }
      case 'product':
      case 'portfolio':
        return (
          <PortfolioCard
            price={link.price}
            product={link.type === 'product'}
            linkId={link.id}
            title={link.title}
            description={link.description}
            image={link.thumbnail}
            url={link.url}
            featured={link.featured}
          />
        )
      case 'heading':
        return <HeadingBlock title={link.title} text={link.description} />
      case 'skills':
        return <SkillsBlock title={link.title} items={parseItems('skills', link.items)} />
      case 'testimonials':
        return <TestimonialsBlock title={link.title} items={parseItems('testimonials', link.items)} />
      case 'faq':
        return <FaqBlock title={link.title} items={parseItems('faq', link.items)} />
      case 'timeline':
        return <TimelineBlock title={link.title} items={parseItems('timeline', link.items)} />
      case 'coupon':
        return <CouponBlock linkId={link.id} title={link.title} code={link.description.trim()} url={link.url} />
      case 'embed-youtube':
      case 'embed-twitter':
      case 'embed-instagram':
        return (
          <SocialEmbed
            url={link.url}
            type={link.type.replace('embed-', '') as 'youtube' | 'twitter' | 'instagram'}
            title={link.title}
          />
        )
      default:
        return (
          <LinkButton
            title={link.title}
            // Şifreli linklerin gerçek URL'si tarayıcıya gönderilmez; şifre doğrulanınca sunucudan alınır
            url={link.password ? '' : link.url}
            icon={link.icon}
            iconElement={link.icon.startsWith('http') ? undefined : renderLinkIcon(link.icon, 'w-[18px] h-[18px]')}
            linkId={link.id}
            type={link.type}
            hasPassword={!!link.password}
            passwordHint={link.passwordHint}
            autoOpen={link.id === autoOpenLinkId}
            featured={link.featured}
            thumbnail={link.thumbnail}
            description={link.type === 'contact' ? '' : link.description}
            variant={isGrid && inRun ? 'tile' : 'row'}
          />
        )
    }
  }

  // Art arda gelen linkler / metinler / proje kartları geniş ekranda yan yana dizilir.
  // "Bento ızgara" düzeninde linkler telefonda da ikişerli kutu olur.
  const runClass = (run: string) => {
    if (run === 'links' && isGrid) return 'grid grid-cols-2 gap-3'
    // grid-cols-1 (minmax(0,1fr)): dar ekranda sütun ekran genişliğini aşamaz
    if (run === 'cards') return 'grid grid-cols-1 gap-3 sm:grid-cols-2'
    return 'grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]'
  }

  // Yapısal veri (schema.org ProfilePage + Person): arama motorları sayfanın kime ait olduğunu ve
  // hangi sosyal hesapların aynı kişiye ait olduğunu (sameAs) anlar. Değerler Profil bölümünden gelir.
  const baseUrl = getBaseUrl(headers())
  const absolute = (url: string) => toAbsoluteUrl(url, baseUrl)
  const sameAs = [profile.linkedinUrl, profile.twitterUrl, profile.instagramUrl, profile.youtubeUrl, profile.githubUrl]
    .filter((url) => isSafeUrl(url) && /^https?:/i.test(url))
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: `${baseUrl}/`,
    mainEntity: {
      '@type': 'Person',
      name: profile.name,
      ...(profile.bio ? { description: profile.bio } : {}),
      ...(profile.imageUrl && !profile.imageUrl.startsWith('data:') ? { image: absolute(profile.imageUrl) } : {}),
      ...(profile.location ? { homeLocation: { '@type': 'Place', name: profile.location } } : {}),
      url: `${baseUrl}/`,
      ...(sameAs.length ? { sameAs } : {}),
    },
  }

  return (
    <MotionProvider>
    <main className="min-h-screen relative">
      {/* "<" kaçışlanır: profil metni script etiketini kapatamasın */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ThemeScript />
      <ViewTracker />
      <ThemeProvider
        theme={{
          primaryColor: profile.primaryColor,
          accentColor: profile.accentColor,
          backgroundColor: profile.backgroundColor,
          cardColor: profile.cardColor,
          textColor: profile.textColor,
          buttonStyle: profile.buttonStyle,
          fontFamily: profile.fontFamily,
          borderRadius: profile.borderRadius,
          animationSpeed: profile.animationSpeed,
        }}
      />
      <DynamicBackground
        type={profile.backgroundType}
        backgroundColor={profile.backgroundColor}
        primaryColor={profile.primaryColor}
        accentColor={profile.accentColor}
        imageUrl={profile.backgroundImage}
        opacity={profile.backgroundOpacity}
      />

      <ThemeToggle />

      {/* min-h-screen + flex: içerik kısa olsa da © satırı ekranın en altında durur */}
      <div className="relative z-10 mx-auto w-full max-w-[1180px] min-h-screen flex flex-col px-5 sm:px-8 pt-20 pb-10 lg:pt-16">
        <div className="flex-1">
        {profile.coverImage && (
          // Telefon/tablet: kenardan kenara, sayfanın en üstünde, alt kenarı arka plana yumuşakça karışır.
          // Geniş ekran (lg): içerik genişliğinde, yuvarlak köşeli banner.
          <div className="relative -mx-5 sm:-mx-8 -mt-20 lg:mx-0 lg:mt-0 aspect-[16/9] sm:aspect-[5/2] lg:aspect-[4/1] overflow-hidden cover-banner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={profile.coverImage} alt="" className="w-full h-full object-cover" />
            <div aria-hidden="true" className="lg:hidden absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[color:var(--color-background)]" />
          </div>
        )}

        <div className={`grid grid-cols-1 gap-8 lg:gap-x-12 lg:gap-y-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] items-start ${profile.coverImage ? '-mt-14 lg:-mt-16' : ''}`}>
          <aside className="relative min-w-0 lg:col-start-1 lg:row-start-1 lg:px-0">
            <ProfileCard profile={profile} showContact={profile.showContactButton && contactReady} />
          </aside>

          <section id="page-blocks" aria-label="İçerik" className={`min-w-0 flex flex-col gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-2 ${profile.coverImage ? 'lg:mt-20' : ''}`}>
            {showTabs && <CategoryTabs categories={categories} targetId="page-blocks" />}
            {segments.map((segment) =>
              segment.kind === 'run' ? (
                <div key={`run-${segment.items[0].id}`} data-run={segment.run} className={runClass(segment.run)}>
                  {segment.items.map((link) => (
                    <div key={link.id} data-cat={(link.category || '').trim()}>
                      {renderBlock(link, true)}
                    </div>
                  ))}
                </div>
              ) : (
                <div key={segment.item.id} data-cat={(segment.item.category || '').trim()}>
                  {renderBlock(segment.item, false)}
                </div>
              )
            )}
          </section>

          {profile.showNewsletter && (
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <NewsletterBox />
            </div>
          )}
        </div>
        </div>

        <footer className="mt-14 text-center text-sm text-dynamic-text opacity-50">
          © {new Date().getFullYear()} {profile.name}
        </footer>
      </div>
    </main>
    </MotionProvider>
  )
}
