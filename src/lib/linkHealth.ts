// Link sağlık kontrolü sonucu (Link.healthStatus): 0 = kontrol edilmedi, -1 = ulaşılamadı, yoksa HTTP kodu.
// Tarayıcıda da kullanılır; sunucuya özgü bir şey içermemeli.

// Kırık sayılan durumlar. 401/403/429 ve standart dışı kodlar (LinkedIn'in botlara verdiği 999 gibi)
// çoğu zaman sitenin botları engellemesidir, kırık sayılmaz.
export const isBrokenStatus = (status: number) => status === -1 || status === 404 || status === 410 || (status >= 500 && status < 600)

export const healthLabel = (status: number) => (status === -1 ? 'ulaşılamadı' : `HTTP ${status}`)
