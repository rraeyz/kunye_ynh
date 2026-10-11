'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { IconType } from 'react-icons'
import {
  FaPlus, FaTrash, FaTimes, FaGripVertical, FaSave, FaChartBar, FaFolder, FaEdit, FaLock, FaClock, FaStar, FaChevronUp, FaChevronDown,
  FaGithub, FaTwitter, FaLinkedin, FaInstagram, FaYoutube, FaGlobe, FaEnvelope, FaDiscord, FaMedium, FaLink, FaDonate, FaPhone,
  FaMapMarkerAlt, FaCalendarAlt, FaFileAlt, FaMusic, FaVideo, FaGamepad, FaCamera, FaBook, FaHeart, FaShoppingCart, FaUser, FaUsers,
  FaCode, FaCogs, FaCloud, FaAlignLeft, FaBriefcase, FaHourglassHalf, FaImages, FaSpotify, FaExclamationTriangle,
  FaHeading, FaTags, FaQuestionCircle, FaStream, FaQuoteLeft, FaTicketAlt, FaShoppingBag, FaMapMarkedAlt, FaCopy, FaHandHoldingHeart,
} from 'react-icons/fa'
import { SUPPORT_PLATFORMS } from '@/lib/supportPlatforms'
import { healthLabel, isBrokenStatus } from '@/lib/linkHealth'
import { SiTelegram } from 'react-icons/si'
import ScheduleStatus from '@/components/ScheduleStatus'
import ImageUploadButton from './ImageUploadButton'
import SelectMenu from './SelectMenu'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface LinksEditorProps {
  initialLinks: any[]
  // Başka bir yerden (Genel Bakış, komut paleti, telefondaki "+") "yeni ekle" istendi
  autoAdd?: boolean
  onAutoAddHandled?: () => void
}

const popularIcons = [
  { name: 'FaGithub', label: 'GitHub' },
  { name: 'FaTwitter', label: 'Twitter/X' },
  { name: 'FaLinkedin', label: 'LinkedIn' },
  { name: 'FaInstagram', label: 'Instagram' },
  { name: 'FaYoutube', label: 'YouTube' },
  { name: 'FaGlobe', label: 'Website' },
  { name: 'FaEnvelope', label: 'Email' },
  { name: 'FaDiscord', label: 'Discord' },
  { name: 'SiTelegram', label: 'Telegram' },
  { name: 'FaMedium', label: 'Medium' },
  { name: 'FaLink', label: 'Link' },
  { name: 'FaDonate', label: 'Bağış' },
  { name: 'FaPhone', label: 'Telefon' },
  { name: 'FaMapMarkerAlt', label: 'Konum' },
  { name: 'FaCalendarAlt', label: 'Etkinlik' },
  { name: 'FaFileAlt', label: 'Dosya' },
  { name: 'FaMusic', label: 'Müzik' },
  { name: 'FaVideo', label: 'Video' },
  { name: 'FaGamepad', label: 'Oyun' },
  { name: 'FaCamera', label: 'Fotoğraf' },
  { name: 'FaBook', label: 'Kitap' },
  { name: 'FaHeart', label: 'Favori' },
  { name: 'FaStar', label: 'Yıldız' },
  { name: 'FaShoppingCart', label: 'Mağaza' },
  { name: 'FaUser', label: 'Kullanıcı' },
  { name: 'FaUsers', label: 'Topluluk' },
  { name: 'FaCode', label: 'Kod' },
  { name: 'FaCogs', label: 'Ayarlar' },
  { name: 'FaCloud', label: 'Bulut' },
]

const linkCategories = [
  'Sosyal Medya',
  'İş & Kariyer',
  'Projeler',
  'İletişim',
  'Blog & Yazılar',
  'Video & Podcast',
  'Diğer'
]


// Blok tipleri (gruplu). fields: formda gösterilecek alanlar
type Field = 'url' | 'urlOptional' | 'icon' | 'thumbnail' | 'featured' | 'password' | 'slug' | 'description' | 'images' | 'targetDate' | 'items' | 'price'

const linkTypes: Array<{ value: string; label: string; icon: string; description: string; group: string; fields: Field[] }> = [
  { value: 'link', label: 'Normal Link', icon: 'FaLink', description: 'Başka sayfaya yönlendir', group: 'Linkler', fields: ['url', 'description', 'icon', 'thumbnail', 'featured', 'password', 'slug'] },
  { value: 'contact', label: 'Bana Ulaşın', icon: 'FaEnvelope', description: 'İletişim formu aç', group: 'Linkler', fields: ['icon', 'featured'] },
  { value: 'support', label: 'Destek Ol', icon: 'FaHandHoldingHeart', description: 'Shopier, Buy Me a Coffee, Ko-fi...', group: 'Linkler', fields: ['description', 'items'] },
  { value: 'donation', label: 'Bağış Yap', icon: 'FaDonate', description: 'Bağış sayfasına git', group: 'Linkler', fields: ['url', 'description', 'icon', 'thumbnail', 'featured', 'password', 'slug'] },
  { value: 'text', label: 'Metin', icon: 'FaAlignLeft', description: 'Başlık ve paragraf', group: 'İçerik', fields: ['description'] },
  { value: 'portfolio', label: 'Portfolyo Kartı', icon: 'FaBriefcase', description: 'Görsel + açıklama', group: 'İçerik', fields: ['urlOptional', 'thumbnail', 'description', 'featured'] },
  { value: 'product', label: 'Ürün Kartı', icon: 'FaShoppingBag', description: 'Görsel + fiyat + satın al', group: 'İçerik', fields: ['urlOptional', 'thumbnail', 'price', 'description', 'featured'] },
  { value: 'map', label: 'Harita', icon: 'FaMapMarkedAlt', description: 'Konumunu göster', group: 'İçerik', fields: ['url', 'description'] },
  { value: 'countdown', label: 'Geri Sayım', icon: 'FaHourglassHalf', description: 'Etkinliğe kalan süre', group: 'İçerik', fields: ['targetDate', 'description', 'urlOptional'] },
  { value: 'heading', label: 'Bölüm Başlığı', icon: 'FaHeading', description: 'Blokları bölümlere ayır', group: 'Düzen', fields: ['description'] },
  { value: 'skills', label: 'Rozetler', icon: 'FaTags', description: 'Beceri / araç etiketleri', group: 'Düzen', fields: ['items'] },
  { value: 'faq', label: 'SSS', icon: 'FaQuestionCircle', description: 'Açılır soru-cevap', group: 'Düzen', fields: ['items'] },
  { value: 'timeline', label: 'Zaman Çizelgesi', icon: 'FaStream', description: 'Kariyer, eğitim', group: 'Düzen', fields: ['items'] },
  { value: 'testimonials', label: 'Referanslar', icon: 'FaQuoteLeft', description: 'Yorum kartları', group: 'Düzen', fields: ['items'] },
  { value: 'coupon', label: 'Kupon Kodu', icon: 'FaTicketAlt', description: 'Kopyalanabilir kod', group: 'Linkler', fields: ['description', 'urlOptional'] },
  { value: 'gallery', label: 'Galeri', icon: 'FaImages', description: 'Fotoğraf ızgarası', group: 'Medya', fields: ['images'] },
  { value: 'spotify', label: 'Spotify', icon: 'FaSpotify', description: 'Şarkı / çalma listesi', group: 'Medya', fields: ['url'] },
  { value: 'embed-youtube', label: 'YouTube', icon: 'FaYoutube', description: 'Video göm', group: 'Medya', fields: ['url'] },
  { value: 'embed-twitter', label: 'X (Twitter)', icon: 'FaTwitter', description: 'Gönderi göm', group: 'Medya', fields: ['url'] },
  { value: 'embed-instagram', label: 'Instagram', icon: 'FaInstagram', description: 'Gönderi göm', group: 'Medya', fields: ['url'] },
]

// Liste bloklarının satır alanları: anahtarlar sunucudaki ITEM_FIELDS (lib/links) ile aynı
type ItemField = { key: string; label: string; placeholder: string; multiline?: boolean; options?: Record<string, string> }
const ITEM_FORMS: Record<string, { addLabel: string; fields: ItemField[] }> = {
  support: {
    addLabel: 'Platform ekle',
    fields: [
      { key: 'platform', label: 'Platform', placeholder: '', options: SUPPORT_PLATFORMS },
      { key: 'url', label: 'Link', placeholder: 'https://www.buymeacoffee.com/kullanici' },
    ],
  },
  skills: { addLabel: 'Rozet ekle', fields: [{ key: 'label', label: 'Etiket', placeholder: 'React' }] },
  faq: {
    addLabel: 'Soru ekle',
    fields: [
      { key: 'q', label: 'Soru', placeholder: 'Ders veriyor musun?' },
      { key: 'a', label: 'Cevap', placeholder: 'Evet, haftada iki gün...', multiline: true },
    ],
  },
  timeline: {
    addLabel: 'Satır ekle',
    fields: [
      { key: 'date', label: 'Tarih', placeholder: '2021 – 2024' },
      { key: 'title', label: 'Başlık', placeholder: 'Yazılım Geliştirici, Örnek A.Ş.' },
      { key: 'text', label: 'Açıklama (opsiyonel)', placeholder: 'Neler yaptın?', multiline: true },
    ],
  },
  testimonials: {
    addLabel: 'Referans ekle',
    fields: [
      { key: 'quote', label: 'Yorum', placeholder: 'Birlikte çalışmak çok keyifliydi...', multiline: true },
      { key: 'name', label: 'İsim', placeholder: 'Ayşe Yılmaz' },
      { key: 'role', label: 'Unvan / şirket (opsiyonel)', placeholder: 'Ürün Müdürü, Örnek' },
    ],
  },
}
const MAX_ITEMS = 50

const TITLE_PLACEHOLDERS: Record<string, string> = {
  product: 'El yapımı seramik kupa', map: 'Atölyem',
  text: 'Hakkımda', support: 'Beni destekle', heading: 'Projelerim (boş bırakılırsa ince çizgi)', skills: 'Kullandığım araçlar',
  faq: 'Sıkça sorulanlar', timeline: 'Deneyim', testimonials: 'Hakkımda söylenenler', coupon: 'Mağazamda %10 indirim',
}

const typeInfo = (type: string) => linkTypes.find((t) => t.value === type) || linkTypes[0]

const URL_PLACEHOLDERS: Record<string, string> = {
  spotify: 'https://open.spotify.com/playlist/...',
  'embed-youtube': 'https://www.youtube.com/watch?v=...',
  'embed-twitter': 'https://x.com/kullanici/status/...',
  'embed-instagram': 'https://www.instagram.com/p/...',
  map: 'https://www.google.com/maps/place/... veya 41.0082, 28.9784',
  product: 'https://www.shopier.com/...',
}

// Panelde yalnızca seçilebilen ikonlar ve blok tipi ikonları yüklenir. Önceden tüm Fa/Si setleri
// (~2.5 MB) panele gömülüyordu. Listede olmayan eski bir ikon adı panelde link ikonuyla görünür;
// ziyaretçi sayfası ikonları sunucuda tüm setten çizmeye devam eder (bkz. lib/linkIcon).
const PANEL_ICONS: Record<string, IconType> = {
  FaGithub, FaTwitter, FaLinkedin, FaInstagram, FaYoutube, FaGlobe, FaEnvelope, FaDiscord, SiTelegram, FaMedium,
  FaLink, FaDonate, FaPhone, FaMapMarkerAlt, FaCalendarAlt, FaFileAlt, FaMusic, FaVideo, FaGamepad, FaCamera,
  FaBook, FaHeart, FaStar, FaShoppingCart, FaUser, FaUsers, FaCode, FaCogs, FaCloud,
  FaAlignLeft, FaBriefcase, FaHourglassHalf, FaImages, FaSpotify,
  FaHeading, FaTags, FaQuestionCircle, FaStream, FaQuoteLeft, FaTicketAlt, FaShoppingBag, FaMapMarkedAlt, FaHandHoldingHeart,
}
const getIconComponent = (iconName: string): IconType => PANEL_ICONS[iconName] || FaLink

// datetime-local alanı yerel saat ister; veritabanı UTC tutar. İki yönde de doğru çevir
// (önceden UTC değer yerel saatmiş gibi gösteriliyor, her düzenlemede saat kayıyordu).
const toLocalInput = (value: string | Date | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

type FormData = {
  title: string
  url: string
  icon: string
  customIconUrl: string
  useCustomIcon: boolean
  category: string
  type: string
  password: string
  passwordHint: string
  hasExistingPassword: boolean
  removePassword: boolean
  slug: string
  startDate: string
  endDate: string
  featured: boolean
  thumbnail: string
  description: string
  images: string[]
  targetDate: string
  items: Array<Record<string, string>>
  price: string
}

const emptyForm = (): FormData => ({
  title: '', url: '', icon: 'FaLink', customIconUrl: '', useCustomIcon: false, category: '', type: 'link',
  password: '', passwordHint: '', hasExistingPassword: false, removePassword: false, slug: '',
  startDate: '', endDate: '', featured: false, thumbnail: '', description: '', images: [], targetDate: '', items: [], price: '',
})

const formFromLink = (link: any): FormData => {
  let images: string[] = []
  try { images = JSON.parse(link.images || '[]') } catch {}
  let items: Array<Record<string, string>> = []
  try { items = JSON.parse(link.items || '[]') } catch {}
  const customIcon = (link.icon || '').startsWith('http')
  return {
    title: link.title || '',
    url: link.url || '',
    icon: customIcon ? 'FaLink' : link.icon || 'FaLink',
    customIconUrl: customIcon ? link.icon : '',
    useCustomIcon: customIcon,
    category: link.category || '',
    type: link.type || 'link',
    password: '', // mevcut şifre (hash) forma konmaz
    passwordHint: link.passwordHint || '',
    hasExistingPassword: !!link.password,
    removePassword: false,
    slug: link.slug || '',
    startDate: toLocalInput(link.startDate),
    endDate: toLocalInput(link.endDate),
    featured: !!link.featured,
    thumbnail: link.thumbnail || '',
    description: link.description || '',
    images: Array.isArray(images) ? images : [],
    targetDate: toLocalInput(link.targetDate),
    items: Array.isArray(items) ? items : [],
    price: link.price || '',
  }
}

// Formdan API gövdesi. Düzenlemede şifre: boş = değişmez, "kaldır" = korumayı kaldır.
const payloadFromForm = (form: FormData, mode: 'add' | 'edit') => {
  const fields = typeInfo(form.type).fields
  const body: Record<string, any> = {
    title: form.title,
    type: form.type,
    category: form.category,
    url: fields.includes('url') || fields.includes('urlOptional') ? form.url : '',
    icon: form.useCustomIcon && form.customIconUrl ? form.customIconUrl : form.icon,
    startDate: fromLocalInput(form.startDate),
    endDate: fromLocalInput(form.endDate),
    featured: fields.includes('featured') ? form.featured : false,
    thumbnail: fields.includes('thumbnail') ? form.thumbnail : '',
    description: fields.includes('description') ? form.description : '',
    images: fields.includes('images') ? form.images : [],
    items: fields.includes('items') ? form.items : [],
    price: fields.includes('price') ? form.price : '',
    targetDate: fields.includes('targetDate') ? fromLocalInput(form.targetDate) : null,
    slug: fields.includes('slug') ? form.slug : '',
    passwordHint: form.passwordHint,
  }
  if (!fields.includes('password')) {
    body.password = ''
  } else if (mode === 'add') {
    body.password = form.password
  } else if (form.removePassword) {
    body.password = ''
  } else if (form.password) {
    body.password = form.password
  }
  return body
}

const inputClass = 'w-full px-4 py-2 bg-dark-card border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500'
const labelClass = 'block text-sm font-medium text-gray-300 mb-2'

// Blok türü seçici: eklemenin ilk adımı, düzenlemede "Değiştir" ile açılır
function TypePicker({ value, onPick }: { value?: string; onPick: (type: string) => void }) {
  return (
    <div>
      {['Linkler', 'İçerik', 'Düzen', 'Medya'].map((group) => (
        <div key={group} className="mb-3 last:mb-0">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{group}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {linkTypes.filter((t) => t.group === group).map((linkType) => {
              const IconComponent = getIconComponent(linkType.icon)
              return (
                <button
                  key={linkType.value}
                  type="button"
                  onClick={() => onPick(linkType.value)}
                  aria-pressed={value === linkType.value}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    value === linkType.value ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 hover:border-gray-600 bg-dark-card'
                  }`}
                >
                  <IconComponent className="w-4 h-4 text-purple-400 mb-1" />
                  <div className="text-xs font-medium text-white">{linkType.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{linkType.description}</div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Liste bloklarının satırları: ekle, sil, yukarı/aşağı taşı
function ItemsEditor({ type, items, onChange }: { type: string; items: Array<Record<string, string>>; onChange: (items: Array<Record<string, string>>) => void }) {
  const config = ITEM_FORMS[type]
  const update = (index: number, key: string, value: string) => onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)))
  const move = (index: number, delta: number) => {
    const next = [...items]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    onChange(next)
  }
  const compact = config.fields.length === 1
  return (
    <div>
      <label className={labelClass}>Satırlar ({items.length}/{MAX_ITEMS})</label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className={`flex gap-2 ${compact ? 'items-center' : 'items-start p-3 bg-dark-bg border border-gray-700 rounded-lg'}`}>
            <div className={`flex-1 min-w-0 ${compact ? '' : 'space-y-2'}`}>
              {config.fields.map((field) => (
                field.options ? (
                  <SelectMenu
                    key={field.key}
                    ariaLabel={`${index + 1}. satır: ${field.label}`}
                    value={item[field.key] || ''}
                    onChange={(value) => update(index, field.key, value)}
                    options={Object.entries(field.options).map(([value, label]) => ({ value, label }))}
                    placeholder={`${field.label} seçin`}
                    className={inputClass}
                  />
                ) : field.multiline ? (
                  <textarea key={field.key} aria-label={`${index + 1}. satır: ${field.label}`} value={item[field.key] || ''} onChange={(e) => update(index, field.key, e.target.value)} rows={2} className={`${inputClass} resize-y`} placeholder={`${field.label}: ${field.placeholder}`} />
                ) : (
                  <input key={field.key} type="text" aria-label={`${index + 1}. satır: ${field.label}`} value={item[field.key] || ''} onChange={(e) => update(index, field.key, e.target.value)} className={inputClass} placeholder={compact ? field.placeholder : `${field.label}: ${field.placeholder}`} />
                )
              ))}
            </div>
            <div className={`flex shrink-0 ${compact ? 'gap-1' : 'flex-col gap-1'}`}>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${index + 1}. satırı yukarı taşı`} className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25"><FaChevronUp className="w-3 h-3" /></button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`${index + 1}. satırı aşağı taşı`} className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25"><FaChevronDown className="w-3 h-3" /></button>
              <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`${index + 1}. satırı sil`} className="p-2 rounded text-red-400 hover:bg-red-500/10"><FaTrash className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
      {items.length < MAX_ITEMS && (
        <button type="button" onClick={() => onChange([...items, Object.fromEntries(config.fields.map((field) => [field.key, '']))])} className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-lg text-sm">
          <FaPlus className="w-3 h-3" aria-hidden="true" />{config.addLabel}
        </button>
      )}
    </div>
  )
}

// Ekleme ve düzenleme formunun ortak alanları
function LinkFormFields({ form, setForm, mode }: { form: FormData; setForm: (f: FormData) => void; mode: 'add' | 'edit' }) {
  const info = typeInfo(form.type)
  const has = (field: Field) => info.fields.includes(field)
  const set = (patch: Partial<FormData>) => setForm({ ...form, ...patch })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [pickingType, setPickingType] = useState(false)
  const TypeIcon = getIconComponent(info.icon)

  const fetchPreview = async () => {
    setPreviewError('')
    setPreviewLoading(true)
    try {
      const response = await fetch('/api/admin/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.url }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Önizleme alınamadı')
      set({ thumbnail: data.url })
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Önizleme alınamadı')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tür: seçili tür gösterilir, "Değiştir" ile seçici açılır */}
      <div>
        <div className="flex items-center justify-between gap-3 p-3 bg-dark-card border border-gray-700 rounded-lg">
          <div className="flex items-center gap-3 min-w-0">
            <TypeIcon className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">{info.label}</div>
              <div className="text-xs text-gray-400">{info.description}</div>
            </div>
          </div>
          <button type="button" onClick={() => setPickingType(!pickingType)} aria-expanded={pickingType} className="text-sm text-purple-300 hover:text-purple-200 whitespace-nowrap">
            {pickingType ? 'Vazgeç' : 'Türü değiştir'}
          </button>
        </div>
        {pickingType && (
          <div className="mt-3">
            <TypePicker value={form.type} onPick={(type) => { set({ type }); setPickingType(false) }} />
          </div>
        )}
      </div>

      <div>
        <label className={labelClass}>Başlık</label>
        <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} placeholder={TITLE_PLACEHOLDERS[form.type] || 'GitHub Profilim'} />
      </div>

      {(has('url') || has('urlOptional')) && (
        <div>
          <label className={labelClass}>{form.type === 'map' ? 'Konum' : has('url') ? 'URL' : form.type === 'coupon' ? 'Mağaza linki (opsiyonel)' : form.type === 'product' ? 'Satın alma linki (opsiyonel)' : 'Link (opsiyonel)'}</label>
          <input type={form.type === 'map' ? 'text' : 'url'} value={form.url} onChange={(e) => set({ url: e.target.value })} className={inputClass} placeholder={URL_PLACEHOLDERS[form.type] || 'https://...'} />
          {form.type === 'map' && (
            <p className="text-xs text-gray-500 mt-1">Google Maps&apos;te yeri aç, adres çubuğundaki uzun linki yapıştır. Ya da &quot;41.0082, 28.9784&quot; gibi enlem, boylam yaz. Kısa maps.app.goo.gl linklerinde konum bilgisi yoktur.</p>
          )}
        </div>
      )}

      {has('description') && (
        <div>
          <label className={labelClass}>{form.type === 'text' ? 'Metin' : form.type === 'coupon' ? 'Kupon kodu' : form.type === 'heading' ? 'Alt yazı (opsiyonel)' : form.type === 'map' ? 'Adres (opsiyonel)' : form.type === 'support' ? 'Açıklama (opsiyonel)' : has('url') ? 'Kısa açıklama (opsiyonel)' : 'Açıklama'}</label>
          {form.type === 'coupon' ? (
            <input type="text" value={form.description} onChange={(e) => set({ description: e.target.value })} className={`${inputClass} font-mono`} placeholder="INDIRIM10" />
          ) : (
            <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={form.type === 'text' ? 5 : has('url') || form.type === 'heading' ? 2 : 3} className={`${inputClass} resize-y`} placeholder={form.type === 'text' ? 'Kendinizden veya duyurunuzdan bahsedin...' : has('url') ? 'Başlığın altında küçük yazı olarak görünür' : form.type === 'heading' ? 'Başlığın altında küçük yazı' : 'Kısa açıklama'} />
          )}
        </div>
      )}

      {has('items') && ITEM_FORMS[form.type] && (
        <ItemsEditor type={form.type} items={form.items} onChange={(items) => set({ items })} />
      )}

      {has('price') && (
        <div>
          <label className={labelClass}>Fiyat (opsiyonel)</label>
          <input type="text" value={form.price} onChange={(e) => set({ price: e.target.value })} maxLength={50} className={inputClass} placeholder="₺250" />
        </div>
      )}

      {has('targetDate') && (
        <div>
          <label className={labelClass}>Hedef tarih ve saat</label>
          <input type="datetime-local" value={form.targetDate} onChange={(e) => set({ targetDate: e.target.value })} className={inputClass} />
        </div>
      )}

      {has('images') && (
        <div>
          <label className={labelClass}>Galeri görselleri ({form.images.length}/24)</label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {form.images.map((src, index) => (
              <div key={src + index} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-700" />
                <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" disabled={index === 0} onClick={() => { const images = [...form.images]; [images[index - 1], images[index]] = [images[index], images[index - 1]]; set({ images }) }} className="px-2 py-1 text-xs bg-black/70 text-white rounded disabled:opacity-30" aria-label="Sola taşı">←</button>
                  <button type="button" onClick={() => set({ images: form.images.filter((_, i) => i !== index) })} className="px-2 py-1 text-xs bg-red-600/90 text-white rounded" aria-label="Kaldır"><FaTrash className="w-3 h-3" /></button>
                  <button type="button" disabled={index === form.images.length - 1} onClick={() => { const images = [...form.images]; [images[index + 1], images[index]] = [images[index], images[index + 1]]; set({ images }) }} className="px-2 py-1 text-xs bg-black/70 text-white rounded disabled:opacity-30" aria-label="Sağa taşı">→</button>
                </div>
              </div>
            ))}
          </div>
          {form.images.length < 24 && (
            <ImageUploadButton kind="gallery" label="Görsel Ekle" onUploaded={(url) => setForm({ ...form, images: [...form.images, url] })} />
          )}
        </div>
      )}

      {has('thumbnail') && (
        <div>
          <label className={labelClass}>{form.type === 'portfolio' ? 'Kart görseli' : form.type === 'product' ? 'Ürün görseli' : 'Önizleme görseli (opsiyonel)'}</label>
          {form.thumbnail && (
            <div className="relative mb-2 w-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.thumbnail} alt="" className="w-48 aspect-video object-cover rounded-lg border border-gray-700" />
              <button type="button" onClick={() => set({ thumbnail: '' })} className="absolute top-1 right-1 p-1.5 bg-black/70 text-white rounded" aria-label="Görseli kaldır"><FaTimes className="w-3 h-3" /></button>
            </div>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <ImageUploadButton kind="thumb" label="Görsel Yükle" onUploaded={(url) => set({ thumbnail: url })} />
            {form.url && form.type !== 'portfolio' && form.type !== 'product' && (
              <button type="button" onClick={fetchPreview} disabled={previewLoading} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg disabled:opacity-60">
                {previewLoading ? 'Alınıyor...' : 'Siteden otomatik al'}
              </button>
            )}
          </div>
          {previewError && <p className="text-xs text-red-400 mt-1">{previewError}</p>}
        </div>
      )}

      {has('icon') && (
        <div>
          <label className={labelClass}>İkon</label>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => set({ useCustomIcon: false })} className={`flex-1 px-3 py-2 rounded-lg text-sm ${!form.useCustomIcon ? 'bg-purple-500 text-white' : 'bg-dark-card text-gray-400'}`}>Hazır ikon</button>
            <button type="button" onClick={() => set({ useCustomIcon: true })} className={`flex-1 px-3 py-2 rounded-lg text-sm ${form.useCustomIcon ? 'bg-purple-500 text-white' : 'bg-dark-card text-gray-400'}`}>Özel ikon (URL)</button>
          </div>
          {!form.useCustomIcon ? (
            <SelectMenu
              ariaLabel="İkon"
              value={form.icon}
              onChange={(icon) => set({ icon })}
              options={popularIcons.map((icon) => {
                const IconComponent = getIconComponent(icon.name)
                return { value: icon.name, label: icon.label, icon: <IconComponent className="w-4 h-4 shrink-0 text-purple-400" /> }
              })}
              className={inputClass}
            />
          ) : (
            <input type="url" value={form.customIconUrl} onChange={(e) => set({ customIconUrl: e.target.value })} className={inputClass} placeholder="https://example.com/icon.png" />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Kategori (opsiyonel)</label>
          <SelectMenu
            ariaLabel="Kategori"
            value={form.category}
            onChange={(category) => set({ category })}
            options={[{ value: '', label: 'Kategorisiz' }, ...linkCategories.map((cat) => ({ value: cat, label: cat }))]}
            className={inputClass}
          />
          <p className="text-xs text-gray-500 mt-1">Sitede kategori sekmeleri olarak görünür (Profil → Profil kartı).</p>
        </div>
        {has('slug') && (
          <div>
            <label className={labelClass}>Kısa link (opsiyonel)</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">/go/</span>
              <input type="text" value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className={inputClass} placeholder="github" />
            </div>
          </div>
        )}
      </div>

      {has('featured') && (
        <label className="flex items-start gap-3 p-3 bg-dark-card border border-gray-700 rounded-lg cursor-pointer">
          <input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} className="mt-1 w-4 h-4 accent-purple-500" />
          <span>
            <span className="flex items-center gap-2 text-sm font-medium text-white"><FaStar className="w-3 h-3 text-yellow-400" /> Öne çıkar</span>
            <span className="block text-xs text-gray-400 mt-0.5">Daha büyük ve animasyonlu çerçeveyle gösterilir; ızgara düzeninde tam genişlik kaplar.</span>
          </span>
        </label>
      )}

      {has('password') && (
        <div className="p-4 bg-dark-card rounded-lg border border-gray-700 space-y-3">
          <div className="flex items-center gap-2"><FaLock className="w-4 h-4 text-purple-400" /><h4 className="text-sm font-semibold text-white">Şifre koruması</h4></div>
          {mode === 'edit' && form.hasExistingPassword && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.removePassword} onChange={(e) => set({ removePassword: e.target.checked })} className="accent-purple-500" />
              Şifre korumasını kaldır
            </label>
          )}
          {!form.removePassword && (
            <>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                className={inputClass}
                placeholder={mode === 'edit' && form.hasExistingPassword ? 'Şifreli. Değiştirmek için yeni şifre girin (boş = aynı kalır)' : 'Boş bırakılırsa korumasız'}
              />
              {(form.password || form.hasExistingPassword) && (
                <input type="text" value={form.passwordHint} onChange={(e) => set({ passwordHint: e.target.value })} className={inputClass} placeholder="Şifre ipucu (opsiyonel)" />
              )}
            </>
          )}
        </div>
      )}

      <div className="p-4 bg-dark-card rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 mb-3"><FaClock className="w-4 h-4 text-purple-400" /><h4 className="text-sm font-semibold text-white">Zamanlama (opsiyonel)</h4></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Başlangıç</label>
            <input type="datetime-local" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Bitiş</label>
            <input type="datetime-local" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Blok sadece bu tarihler arasında gösterilir</p>
      </div>
    </div>
  )
}

// Sortable Link Item Component
// Düzenlenen blokta form satırın hemen altında açılır (sayfanın başına kaydırmaya gerek kalmaz)
function SortableLinkItem({ link, onToggle, onEdit, onMoveUp, onMoveDown, editing, editor }: { link: any; onToggle: (id: number, enabled: boolean) => void; onEdit: (link: any) => void; onMoveUp?: () => void; onMoveDown?: () => void; editing: boolean; editor: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const now = new Date()
  const isScheduled = !!(link.startDate || link.endDate)
  const isNotYetActive = link.startDate && new Date(link.startDate) > now
  const isExpired = link.endDate && new Date(link.endDate) < now
  const info = typeInfo(link.type)
  const TypeIcon = getIconComponent(info.icon)
  const isLinkLike = ['link', 'donation', 'contact'].includes(link.type)

  let subtitle = link.url
  if (link.type === 'text') subtitle = link.description
  if (link.type === 'gallery') { try { subtitle = `${JSON.parse(link.images || '[]').length} görsel` } catch { subtitle = '' } }
  if (link.type === 'countdown') subtitle = link.targetDate ? new Date(link.targetDate).toLocaleString('tr-TR') : 'Tarih yok'
  if (link.type === 'contact') subtitle = 'İletişim formu'
  if (link.type === 'heading') subtitle = link.title ? 'Bölüm başlığı' : 'Ayırıcı çizgi'
  if (link.type === 'coupon') subtitle = `Kod: ${link.description || '-'}`
  if (link.type === 'product' && link.price) subtitle = `${link.price}${link.url ? ` · ${link.url}` : ''}`
  if (link.type === 'map') subtitle = link.description || 'Harita'
  if (ITEM_FORMS[link.type]) { try { subtitle = `${JSON.parse(link.items || '[]').length} satır` } catch { subtitle = '0 satır' } }

  return (
    <div ref={setNodeRef} style={style} className={`bg-dark-bg rounded-xl border ${editing ? 'border-purple-500/60' : link.featured ? 'border-yellow-500/40' : 'border-gray-700'}`}>
      <div className={`flex items-center gap-3 sm:gap-4 p-4 ${!link.enabled && !editing ? 'opacity-50' : ''}`}>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-2 -m-2" aria-label="Sürükle">
          <FaGripVertical className="text-gray-600" />
        </div>

        {link.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.thumbnail} alt="" className="hidden sm:block w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="hidden sm:block p-2 bg-purple-500/10 rounded-lg shrink-0">
            {isLinkLike && (link.icon || '').startsWith('http') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.icon} alt="" className="w-5 h-5 object-contain" />
            ) : (
              (() => { const IconComponent = isLinkLike ? getIconComponent(link.icon) : TypeIcon; return <IconComponent className="w-5 h-5 text-purple-400" /> })()
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-white font-medium">{link.title}</h3>
            <span className="px-2 py-0.5 bg-gray-700/60 text-gray-300 text-xs rounded-full flex items-center gap-1"><TypeIcon className="w-3 h-3" />{info.label}</span>
            {link.featured && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1"><FaStar className="w-3 h-3" />Öne çıkan</span>}
            {link.category && <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full flex items-center gap-1"><FaFolder className="w-3 h-3" />{link.category}</span>}
            {link.password && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1"><FaLock className="w-3 h-3" />Şifreli</span>}
            {isScheduled && (
              <span className={`px-2 py-0.5 text-xs rounded-full flex items-center gap-1 ${isNotYetActive ? 'bg-orange-500/20 text-orange-400' : isExpired ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                <FaClock className="w-3 h-3" />{isNotYetActive ? 'Bekliyor' : isExpired ? 'Dolmuş' : 'Zamanlanmış'}
              </span>
            )}
            {link.slug && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">/go/{link.slug}</span>}
            {link.clicks > 0 && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1"><FaChartBar className="w-3 h-3" />{link.clicks} tıklama</span>}
            {link.enabled && isBrokenStatus(link.healthStatus ?? 0) && (
              <span
                className="px-2 py-0.5 bg-red-500/20 text-red-300 text-xs rounded-full flex items-center gap-1"
                title={`Son kontrol${link.healthCheckedAt ? ` (${new Date(link.healthCheckedAt).toLocaleString('tr-TR')})` : ''}: ${healthLabel(link.healthStatus)}`}
              >
                <FaExclamationTriangle className="w-3 h-3" aria-hidden="true" />Açılmıyor ({healthLabel(link.healthStatus)})
              </span>
            )}
          </div>
          {subtitle && <p className="text-sm text-gray-400 mt-1 truncate">{subtitle}</p>}
          {isScheduled && <div className="mt-2"><ScheduleStatus startDate={link.startDate} endDate={link.endDate} /></div>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col">
            <button type="button" onClick={onMoveUp} disabled={!onMoveUp} aria-label={`${link.title}: yukarı taşı`} title="Yukarı taşı" className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"><FaChevronUp className="w-3 h-3" /></button>
            <button type="button" onClick={onMoveDown} disabled={!onMoveDown} aria-label={`${link.title}: aşağı taşı`} title="Aşağı taşı" className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"><FaChevronDown className="w-3 h-3" /></button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!link.enabled}
            aria-label={`${link.title}: sitede göster`}
            title={link.enabled ? 'Sitede görünüyor' : 'Gizli'}
            onClick={() => onToggle(link.id, link.enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${link.enabled ? 'bg-purple-600' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${link.enabled ? 'translate-x-5' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(link)}
            aria-expanded={editing}
            className={`p-2.5 rounded-lg transition-colors ${editing ? 'bg-purple-500/20 text-purple-200' : 'bg-white/5 hover:bg-white/10 text-gray-300'}`}
            aria-label={editing ? 'Düzenlemeyi kapat' : 'Düzenle'}
          >
            {editing ? <FaTimes className="w-4 h-4" /> : <FaEdit className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {editing && <div className="border-t border-gray-800 p-4 sm:p-5">{editor}</div>}
    </div>
  )
}

export default function LinksEditor({ initialLinks, autoAdd, onAutoAddHandled }: LinksEditorProps) {
  const [links, setLinks] = useState(initialLinks)
  // add-pick: önce tür seçilir, add: ekleme formu, edit: satır içinde düzenleme
  const [mode, setMode] = useState<'closed' | 'add-pick' | 'add' | 'edit'>('closed')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const startAdd = () => {
    setForm(emptyForm())
    setEditingId(null)
    setError('')
    setMode('add-pick')
  }

  // Genel Bakış, komut paleti veya telefondaki "+" butonundan gelen "yeni ekle" isteği
  useEffect(() => {
    if (autoAdd) {
      startAdd()
      onAutoAddHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdd])

  const reload = async () => {
    router.refresh()
    const response = await fetch('/api/links')
    if (response.ok) setLinks(await response.json())
  }

  const closeForm = () => {
    setMode('closed')
    setEditingId(null)
    setForm(emptyForm())
    setError('')
  }

  // Yeni sırayı kaydet (sürükle-bırak ve yukarı/aşağı okları ortak kullanır)
  const persistOrder = async (newLinks: any[]) => {
    setLinks(newLinks)
    try {
      await Promise.all(newLinks.map((link: any, index: number) =>
        fetch(`/api/links/${link.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: index }) })
      ))
      router.refresh()
    } catch (err) {
      console.error('Sıralama güncellenirken hata:', err)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = links.findIndex((link: any) => link.id === active.id)
    const newIndex = links.findIndex((link: any) => link.id === over.id)
    await persistOrder(arrayMove(links, oldIndex, newIndex))
  }

  const moveLink = async (index: number, step: -1 | 1) => {
    const target = index + step
    if (target < 0 || target >= links.length) return
    await persistOrder(arrayMove(links, index, target))
  }

  const handleSave = async () => {
    setError('')
    // Bölüm başlığı boş bırakılırsa ayırıcı çizgi olur
    if (!form.title.trim() && form.type !== 'heading') return setError('Başlık gerekli')
    if (form.type === 'coupon' && !form.description.trim()) return setError('Kupon kodu gerekli')
    setSaving(true)
    try {
      const response = await fetch(mode === 'edit' ? `/api/links/${editingId}` : '/api/links', {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromForm(form, mode === 'edit' ? 'edit' : 'add')),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Kaydedilemedi')
      closeForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Bu bloğu silmek istediğinize emin misiniz?')) return
    const response = await fetch(`/api/links/${id}`, { method: 'DELETE' })
    if (response.ok) {
      closeForm()
      await reload()
    } else alert('Silinirken hata oluştu')
  }

  // Kopya hemen altına eklenir ve düzenlemek için açılır
  const handleDuplicate = async (id: number) => {
    const response = await fetch(`/api/links/${id}/duplicate`, { method: 'POST' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setError(data.error || 'Kopyalanamadı')
    await reload()
    setForm(formFromLink(data))
    setEditingId(data.id)
    setMode('edit')
    setError('')
  }

  const toggleEnabled = async (id: number, enabled: boolean) => {
    const response = await fetch(`/api/links/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) })
    if (response.ok) await reload()
  }

  const handleEditClick = (link: any) => {
    // Aynı bloğa tekrar basmak formu kapatır
    if (mode === 'edit' && editingId === link.id) return closeForm()
    setForm(formFromLink(link))
    setEditingId(link.id)
    setMode('edit')
    setError('')
  }

  // Ekleme ve düzenlemede ortak form + kaydet/vazgeç/sil
  const formPanel = (formMode: 'add' | 'edit') => (
    <>
      <LinkFormFields form={form} setForm={setForm} mode={formMode} />
      {error && <p className="mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 text-sm">{error}</p>}
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
        >
          <FaSave className="w-4 h-4" />
          <span>{saving ? 'Kaydediliyor...' : formMode === 'edit' ? 'Değişiklikleri kaydet' : 'Ekle'}</span>
        </button>
        <button type="button" onClick={closeForm} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
          Vazgeç
        </button>
        {formMode === 'edit' && editingId !== null && (
          <>
            <button type="button" onClick={() => handleDuplicate(editingId)} title="Kaydedilmiş hâlinin kopyası altına eklenir" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-200 rounded-lg transition-colors sm:ml-auto">
              <FaCopy className="w-3.5 h-3.5" /> Kopyala
            </button>
            <button type="button" onClick={() => handleDelete(editingId)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-lg transition-colors">
              <FaTrash className="w-3.5 h-3.5" /> Sil
            </button>
          </>
        )}
      </div>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400 max-w-2xl">
          {links.length > 0
            ? 'Sitedeki sıra buradaki sıradır: tutamaçtan sürükle ya da oklarla taşı. Art arda gelen linkler geniş ekranda ikişerli dizilir; öne çıkanlar, galeri ve Spotify tam genişlik kaplar.'
            : 'Sayfana ilk bloğu ekle'}
        </p>
        <button
          type="button"
          onClick={startAdd}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
        >
          <FaPlus className="w-4 h-4" />
          <span>Yeni Ekle</span>
        </button>
      </div>

      {(mode === 'add-pick' || mode === 'add') && (
        <div className="p-5 sm:p-6 bg-dark-card rounded-2xl border border-purple-500/40">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">{mode === 'add-pick' ? 'Ne eklemek istersin?' : 'Yeni blok'}</h2>
            <button type="button" onClick={closeForm} className="p-2 rounded-lg text-gray-400 hover:text-white" aria-label="Kapat">
              <FaTimes className="w-4 h-4" />
            </button>
          </div>
          {mode === 'add-pick' ? (
            <TypePicker onPick={(type) => { setForm({ ...emptyForm(), type }); setMode('add') }} />
          ) : (
            formPanel('add')
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          {links.length === 0 ? (
            <p className="text-center text-gray-400 py-10 bg-dark-card rounded-2xl border border-gray-800">Henüz bir şey eklenmemiş</p>
          ) : (
            <SortableContext items={links.map((link: any) => link.id)} strategy={verticalListSortingStrategy}>
              {links.map((link: any, index: number) => (
                <SortableLinkItem
                  key={link.id}
                  link={link}
                  onMoveUp={index > 0 ? () => moveLink(index, -1) : undefined}
                  onMoveDown={index < links.length - 1 ? () => moveLink(index, 1) : undefined}
                  onToggle={toggleEnabled}
                  onEdit={handleEditClick}
                  editing={mode === 'edit' && editingId === link.id}
                  editor={mode === 'edit' && editingId === link.id ? formPanel('edit') : null}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </DndContext>
    </div>
  )
}
