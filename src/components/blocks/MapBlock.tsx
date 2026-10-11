import { FaMapMarkerAlt, FaArrowRight } from 'react-icons/fa'

// Harita: OpenStreetMap gömmesi (API anahtarı gerekmez) + "Haritada aç" linki. Sunucuda çizilir.
export default function MapBlock({ title, address, lat, lon, url }: { title: string; address: string; lat: number; lon: number; url: string }) {
  const d = 0.006 // yaklaşık 1 km çevre
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`
  return (
    <section className="site-card overflow-hidden text-dynamic-text">
      <iframe src={embed} title={title || 'Harita'} loading="lazy" className="w-full h-64 border-0 block" referrerPolicy="no-referrer" />
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {title && <h3 className="font-semibold leading-snug break-words">{title}</h3>}
          {address && (
            <p className="text-sm opacity-75 flex items-start gap-1.5 mt-0.5 break-words">
              <FaMapMarkerAlt className="w-3.5 h-3.5 mt-0.5 shrink-0 text-dynamic-primary" aria-hidden="true" />{address}
            </p>
          )}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-dynamic-primary whitespace-nowrap">
          Haritada aç <FaArrowRight className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}
