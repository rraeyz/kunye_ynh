import { FaBullhorn, FaArrowRight } from 'react-icons/fa'

// "Bu hafta / şu an" duyurusu (admin: Profil → Duyuru). Bitiş tarihi sayfada her istekte denetlenir.
export default function AnnouncementBar({ text, url }: { text: string; url: string }) {
  const content = (
    <>
      <span className="icon-chip !w-9 !h-9"><FaBullhorn className="w-4 h-4" aria-hidden="true" /></span>
      <span className="flex-1 min-w-0 font-medium break-words">{text}</span>
      {url && <FaArrowRight className="w-3.5 h-3.5 shrink-0 text-dynamic-primary" aria-hidden="true" />}
    </>
  )
  const className = 'site-card flex items-center gap-3 px-4 py-3 text-dynamic-text'
  // Tema rengi çerçeve: diğer kartlardan ayrışsın
  const style = { borderColor: 'var(--color-primary)' }
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} style={style} role="note">{content}</a>
  ) : (
    <div className={className} style={style} role="note">{content}</div>
  )
}
