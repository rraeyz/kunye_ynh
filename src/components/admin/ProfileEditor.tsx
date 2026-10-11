'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FaSave, FaImage, FaGlobe } from 'react-icons/fa'
import Image from 'next/image'
import ImageUploadButton from './ImageUploadButton'

interface ProfileEditorProps {
  initialProfile: any
}

export default function ProfileEditor({ initialProfile }: ProfileEditorProps) {
  const [name, setName] = useState(initialProfile?.name || 'Your Name')
  const [bio, setBio] = useState(initialProfile?.bio || 'Your bio goes here')
  const [imageUrl, setImageUrl] = useState(initialProfile?.imageUrl || '/default-avatar.jpg')
  const [coverImage, setCoverImage] = useState(initialProfile?.coverImage || '')
  const [pageTitle, setPageTitle] = useState(initialProfile?.pageTitle || '')
  const [pageDescription, setPageDescription] = useState(initialProfile?.pageDescription || '')
  const [ogImageUrl, setOgImageUrl] = useState(initialProfile?.ogImageUrl || '')
  const [faviconUrl, setFaviconUrl] = useState(initialProfile?.faviconUrl || '')
  const [contactEmail, setContactEmail] = useState(initialProfile?.contactEmail || '')
  const [contactPhone, setContactPhone] = useState(initialProfile?.contactPhone || '')
  const [contactAddress, setContactAddress] = useState(initialProfile?.contactAddress || '')
  const [showVCard, setShowVCard] = useState<boolean>(initialProfile?.showVCard || false)
  const [verified, setVerified] = useState(initialProfile?.verified || false)
  const [badges, setBadges] = useState(initialProfile?.badges || '')
  // Profil kartı (sitede solda / telefonda üstte)
  const [statusText, setStatusText] = useState(initialProfile?.statusText || '')
  const [location, setLocation] = useState(initialProfile?.location || '')
  const [timezone, setTimezone] = useState(initialProfile?.timezone || '')
  const [showContactButton, setShowContactButton] = useState<boolean>(initialProfile?.showContactButton ?? true)
  const [showShareButton, setShowShareButton] = useState<boolean>(initialProfile?.showShareButton ?? true)
  const [showNewsletter, setShowNewsletter] = useState<boolean>(initialProfile?.showNewsletter ?? true)
  const [showCategoryTabs, setShowCategoryTabs] = useState<boolean>(initialProfile?.showCategoryTabs ?? true)
  // Sosyal medya hesapları (sitedeki ikonlar ve e-posta imzası)
  const [socials, setSocials] = useState({
    instagramUrl: initialProfile?.instagramUrl || '',
    twitterUrl: initialProfile?.twitterUrl || '',
    linkedinUrl: initialProfile?.linkedinUrl || '',
    youtubeUrl: initialProfile?.youtubeUrl || '',
    githubUrl: initialProfile?.githubUrl || '',
    discordUrl: initialProfile?.discordUrl || '',
  })
  const [showSocialIcons, setShowSocialIcons] = useState<boolean>(initialProfile?.showSocialIcons ?? true)
  const [error, setError] = useState('')
  // "Bana yaz" butonu iletişim e-postası girilince görünür; mesajlar panelde (Mesajlar) saklanır,
  // SMTP ayarlıysa ayrıca e-postayla gelir
  const contactReady = !!contactEmail
  const contactMailReady = !!(initialProfile?.smtpHost && initialProfile?.smtpUser && initialProfile?.hasSmtpPassword)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    try {
      // Profil bilgilerini güncelle
      const profileResponse = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          bio, 
          imageUrl,
          coverImage,
          contactEmail,
          contactPhone,
          contactAddress,
          showVCard,
          verified,
          badges,
          statusText,
          location,
          timezone,
          showContactButton,
          showShareButton,
          showNewsletter,
          showCategoryTabs,
          ...socials,
          showSocialIcons,
        }),
      })

      if (!profileResponse.ok) {
        const data = await profileResponse.json().catch(() => ({}))
        throw new Error(data.error || 'Kayıt başarısız')
      }

      // SEO bilgilerini güncelle
      const seoResponse = await fetch('/api/profile/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageTitle, pageDescription, ogImageUrl, faviconUrl }),
      })

      if (!seoResponse.ok) {
        throw new Error('SEO kayıt başarısız')
      }

      setMessage('Profil başarıyla güncellendi!')
      router.refresh()
      
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-dark-card border border-gray-800 rounded-2xl p-8">
      <h2 className="text-xl font-bold text-white mb-6">Profil Bilgileri</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Preview */}
        <div className="flex items-center gap-6 p-6 bg-dark-bg rounded-xl">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-purple-500/20">
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                if (!target.src.endsWith('/default-avatar.jpg')) target.src = '/default-avatar.jpg'
              }}
            />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{name}</h3>
            <p className="text-gray-400 mt-1">{bio}</p>
          </div>
        </div>

        {/* Form Fields */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
            İsim
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
            required
          />
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-300 mb-2">
            Biyografi
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
            required
          />
        </div>

        <div>
          <label htmlFor="imageUrl" className="block text-sm font-medium text-gray-300 mb-2">
            Profil Fotoğrafı
          </label>
          
          <div className="space-y-3">
            {/* Dosya Yükleme */}
            <div className="flex items-center gap-4">
              <ImageUploadButton kind="avatar" onUploaded={setImageUrl} />
              <span className="text-sm text-gray-500">veya URL girin:</span>
            </div>

            {/* URL Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <FaImage className="text-gray-500" />
                </div>
                <input
                  id="imageUrl"
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
            </div>
          </div>
          
          <p className="text-xs text-gray-500 mt-2">
            Maksimum 10MB • JPG, PNG, WEBP, GIF • Otomatik olarak 512x512 boyutuna küçültülür
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Kapak Görseli (opsiyonel)
          </label>
          {coverImage && (
            <div className="relative mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImage} alt="Kapak önizleme" className="w-full aspect-[3/1] object-cover rounded-xl border border-gray-700" />
              <button
                type="button"
                onClick={() => setCoverImage('')}
                className="absolute top-2 right-2 px-3 py-1 text-xs bg-black/70 text-white rounded-lg hover:bg-black/90"
              >
                Kaldır
              </button>
            </div>
          )}
          <ImageUploadButton kind="cover" onUploaded={setCoverImage} label="Kapak Görseli Yükle" />
          <p className="text-xs text-gray-500 mt-2">
            Profil fotoğrafınızın arkasında geniş bir banner olarak görünür • Otomatik olarak 1500x500 boyutuna kırpılır
          </p>
        </div>

        {/* Profil kartı */}
        <div className="pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold text-white">Profil kartı</h3>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Sitede solda (telefonda en üstte) duran bölüm. Boş bıraktığın alanlar sitede hiç görünmez.
          </p>
          <div className="space-y-4">
            <div>
              <label htmlFor="statusText" className="block text-sm font-medium text-gray-300 mb-2">Durum</label>
              <input id="statusText" type="text" maxLength={120} value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="ör. Tez üzerinde çalışıyor" className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500" />
              <p className="text-xs text-gray-500 mt-1">Yanında yeşil nokta ile küçük bir etiket olarak görünür.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-300 mb-2">Konum</label>
                <input id="location" type="text" maxLength={80} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ör. İstanbul" className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-300 mb-2">Yerel saat (saat dilimi)</label>
                <div className="flex gap-2">
                  <input id="timezone" type="text" list="timezone-list" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="ör. Europe/Istanbul" className="flex-1 min-w-0 px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500" />
                  <button type="button" onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || '')} className="px-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-gray-200 whitespace-nowrap">Bu cihazınki</button>
                </div>
                <datalist id="timezone-list">
                  {['Europe/Istanbul', 'Europe/Berlin', 'Europe/London', 'Europe/Amsterdam', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'UTC'].map((zone) => <option key={zone} value={zone} />)}
                </datalist>
                <p className="text-xs text-gray-500 mt-1">Doluysa konumun yanında o saat dilimindeki saat görünür.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                [showContactButton, setShowContactButton, '"Bana yaz" butonu', !contactReady ? 'İletişim e-postası girilmeden sitede görünmez.' : contactMailReady ? 'Ziyaretçi iletişim formunu açar. Mesajlar Mesajlar bölümüne ve e-postana gelir.' : 'Mesajlar Mesajlar bölümünde birikir. E-postana da gelmesi için Ayarlar → SMTP\'yi doldur.'],
                [showShareButton, setShowShareButton, 'Paylaş butonu', 'Sayfa linkini paylaşır ya da kopyalar.'],
                [showNewsletter, setShowNewsletter, 'Bülten kutusu', 'Ziyaretçiler e-postasıyla abone olur (Aboneler bölümüne düşer).'],
                [showCategoryTabs, setShowCategoryTabs, 'Kategori sekmeleri', 'Bloklarda en az 2 farklı kategori varsa üstte Tümü / kategori sekmeleri çıkar.'],
              ] as Array<[boolean, (value: boolean) => void, string, string]>).map(([checked, setChecked, label, hint]) => (
                <label key={label} className="flex items-start gap-3 p-4 bg-dark-bg border border-gray-700 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 w-4 h-4 accent-purple-500" />
                  <span>
                    <span className="block text-sm font-medium text-white">{label}</span>
                    <span className={`block text-xs mt-1 ${label.startsWith('"Bana') && !contactReady ? 'text-amber-400' : 'text-gray-400'}`}>{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500">&quot;Rehbere ekle&quot; butonu aşağıdaki İletişim Bilgileri bölümünden açılır.</p>
          </div>
        </div>

        {/* Sosyal medya hesapları */}
        <div className="pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold text-white">Sosyal medya hesapları</h3>
          <p className="text-sm text-gray-400 mt-1 mb-4">Profil kartında ikon olarak ve gönderdiğin e-postaların imzasında görünür. Boş olanlar gösterilmez.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ['instagramUrl', 'Instagram', 'https://instagram.com/...'],
              ['twitterUrl', 'X (Twitter)', 'https://x.com/...'],
              ['linkedinUrl', 'LinkedIn', 'https://linkedin.com/in/...'],
              ['youtubeUrl', 'YouTube', 'https://youtube.com/@...'],
              ['githubUrl', 'GitHub', 'https://github.com/...'],
              ['discordUrl', 'Discord', 'https://discord.gg/...'],
            ] as Array<[keyof typeof socials, string, string]>).map(([key, label, placeholder]) => (
              <div key={key}>
                <label htmlFor={key} className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
                <input id={key} type="url" value={socials[key]} onChange={(e) => setSocials({ ...socials, [key]: e.target.value })} placeholder={placeholder} className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500" />
              </div>
            ))}
          </div>
          <label className="flex items-center gap-3 mt-4 text-sm text-gray-200 cursor-pointer">
            <input type="checkbox" checked={showSocialIcons} onChange={(e) => setShowSocialIcons(e.target.checked)} className="w-4 h-4 accent-purple-500" />
            İkonları sitede göster
          </label>
        </div>

        {/* İletişim Ayarları */}
        <div className="pt-6 border-t border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <FaImage className="text-purple-400" />
            <h3 className="text-lg font-semibold text-white">İletişim Bilgileri</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Bu bilgiler iletişim formundan gelen mesajlarda kullanılır
          </p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-300 mb-2">
                İletişim E-posta
              </label>
              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="ornek@email.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                İletişim formundan gelen mesajlar bu adrese gönderilir
              </p>
            </div>

            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-300 mb-2">
                Telefon (Opsiyonel)
              </label>
              <input
                id="contactPhone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="+90 555 123 4567"
              />
            </div>

            <div>
              <label htmlFor="contactAddress" className="block text-sm font-medium text-gray-300 mb-2">
                Adres (Opsiyonel)
              </label>
              <textarea
                id="contactAddress"
                value={contactAddress}
                onChange={(e) => setContactAddress(e.target.value)}
                rows={2}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
                placeholder="Şehir, Ülke"
              />
            </div>

            <label className="flex items-start gap-3 p-4 bg-dark-bg border border-gray-700 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={showVCard}
                onChange={(e) => setShowVCard(e.target.checked)}
                className="mt-1 w-4 h-4 accent-purple-500"
              />
              <span>
                <span className="block text-sm font-medium text-white">Ziyaretçilere &quot;Rehbere Ekle&quot; butonu göster</span>
                <span className="block text-xs text-gray-400 mt-1">
                  Açılırsa adınız, yukarıdaki e-posta, telefon ve adres ile profil fotoğrafınız herkesin indirebileceği bir kişi kartına (vCard) eklenir. Kapalıyken bu bilgiler sayfada görünmez.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* SEO Ayarları */}
        <div className="pt-6 border-t border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <FaGlobe className="text-purple-400" />
            <h3 className="text-lg font-semibold text-white">SEO & Social Media</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="pageTitle" className="block text-sm font-medium text-gray-300 mb-2">
                Sayfa Başlığı (Meta Title)
              </label>
              <input
                id="pageTitle"
                type="text"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder={name || "Adınız | Link Tree"}
              />
              <p className="text-xs text-gray-500 mt-1">
                Boş bırakırsanız profil adınız kullanılır
              </p>
            </div>

            <div>
              <label htmlFor="pageDescription" className="block text-sm font-medium text-gray-300 mb-2">
                Sayfa Açıklaması (Meta Description)
              </label>
              <textarea
                id="pageDescription"
                value={pageDescription}
                onChange={(e) => setPageDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
                placeholder={bio || "Tüm linklerim burada"}
              />
              <p className="text-xs text-gray-500 mt-1">
                Boş bırakırsanız biyografiniz kullanılır
              </p>
            </div>

            <div>
              <label htmlFor="ogImageUrl" className="block text-sm font-medium text-gray-300 mb-2">
                Social Media Görseli (Open Graph)
              </label>
              <div className="mb-2">
                <ImageUploadButton kind="og" onUploaded={setOgImageUrl} label="Görsel Yükle (1200x630)" />
              </div>
              <input
                id="ogImageUrl"
                type="text"
                value={ogImageUrl}
                onChange={(e) => setOgImageUrl(e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder={imageUrl || "https://example.com/og-image.jpg"}
              />
              <p className="text-xs text-gray-500 mt-1">
                Twitter ve Facebook paylaşımlarında görünecek. Boş bırakırsanız profil fotoğrafınız kullanılır.
              </p>
            </div>

            <div>
              <label htmlFor="faviconUrl" className="block text-sm font-medium text-gray-300 mb-2">
                🌐 Site İkonu (Favicon)
              </label>
              
              <div className="space-y-3">
                {/* Dosya Yükleme */}
                <div className="flex items-center gap-4">
                  <ImageUploadButton kind="favicon" onUploaded={setFaviconUrl} label="Favicon Yükle" />
                  <span className="text-sm text-gray-500">veya URL girin:</span>
                </div>

                {/* URL Input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaGlobe className="text-gray-500" />
                    </div>
                    <input
                      id="faviconUrl"
                      type="text"
                      value={faviconUrl}
                      onChange={(e) => setFaviconUrl(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="https://example.com/favicon.ico"
                    />
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-gray-500 mt-2">
                Tarayıcı sekmesinde görünen ikon • Maks 500KB • PNG, ICO, SVG önerilir
              </p>
            </div>
          </div>
        </div>

        {/* Rozet ve Doğrulama Ayarları */}
        <div className="pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Rozetler & Doğrulama</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-dark-bg rounded-xl">
              <div>
                <label htmlFor="verified" className="text-sm font-medium text-gray-300">
                  Doğrulanmış Profil
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Mavi onay rozeti görüntüler
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="verified"
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
              </label>
            </div>

            <div>
              <label htmlFor="badges" className="block text-sm font-medium text-gray-300 mb-2">
                Rozetler (JSON Array)
              </label>
              <input
                id="badges"
                type="text"
                value={badges}
                onChange={(e) => setBadges(e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors font-mono text-sm"
                placeholder='["premium", "star", "supporter"]'
              />
              <p className="text-xs text-gray-500 mt-1">
                Kullanılabilir rozetler: <span className="text-yellow-400">premium</span>, <span className="text-purple-400">star</span>, <span className="text-pink-400">supporter</span>
              </p>
            </div>
          </div>
        </div>

        {error && <div className="px-4 py-3 rounded-xl text-sm bg-red-500/10 border border-red-500/50 text-red-400" role="alert">{error}</div>}

        {message && (
          <div className={`px-4 py-3 rounded-xl text-sm ${
            message.includes('başarıyla') 
              ? 'bg-green-500/10 border border-green-500/50 text-green-400'
              : 'bg-red-500/10 border border-red-500/50 text-red-400'
          }`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium py-3 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FaSave className="w-4 h-4" />
          <span>{saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}</span>
        </button>
      </form>
    </div>
  )
}
