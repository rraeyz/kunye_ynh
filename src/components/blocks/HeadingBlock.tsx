// Bölüm başlığı / ayırıcı: blokları bölümlere ayırır. Başlık boşsa yalnızca ince bir çizgi çizilir.
export default function HeadingBlock({ title, text }: { title: string; text: string }) {
  if (!title) return <hr className="border-0 h-px my-2 bg-[color:var(--color-border)]" />
  return (
    <div className="pt-4 pb-1 text-dynamic-text">
      <h2 className="text-xl font-semibold leading-snug break-words">{title}</h2>
      {text && <p className="mt-1 text-sm opacity-70 whitespace-pre-line break-words">{text}</p>}
    </div>
  )
}
