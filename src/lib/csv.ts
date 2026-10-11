// CSV hücresi: tırnak içine alınır, içindeki tırnaklar ikilenir. =, +, -, @ ile başlayan değerlerin
// başına ' eklenir; böylece Excel/LibreOffice ziyaretçiden gelen bir değeri (referrer, abone adı)
// formül olarak çalıştırmaz.
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',')
}

// Excel'in UTF-8'i (Türkçe karakterleri) doğru tanıması için dosya başı işareti
export const CSV_BOM = '﻿'

// Basit CSV okuyucu: tırnaklı hücreler (içinde virgül, "" kaçışı) desteklenir. Ayırıcı ilk satıra
// göre seçilir (Türkçe Excel ; kullanır). Boş satırlar atlanır.
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] || ''
  const delimiter = [';', '\t', ','].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  // csvCell'in formül koruması için eklediği baştaki ' geri alınır
  return rows.map((r) => r.map((c) => c.trim().replace(/^'(?=[=+\-@])/, '')))
}
