// Uçtan uca API testleri: boş (kurulmamış) bir kuruluma karşı çalışır, kendi verisini oluşturur.
// Kullanım: BASE_URL=http://localhost:3000 node --test tests/e2e/api.test.mjs
// Ek bağımlılık yok (Node 20 yerleşik test aracı + fetch).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

const B = process.env.BASE_URL || 'http://localhost:3000'
const PASSWORD = 'e2e-password-123'
const NEW_PASSWORD = 'e2e-password-456'
// Rate limit IP başına; her test grubunda farklı IP ile birbirini etkilemesin
const ip = (n) => ({ 'x-real-ip': `203.0.113.${n}` })

// 1x1 PNG (yükleme testi için)
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const ANIMATED_GIF = Buffer.from('R0lGODlhKAAeAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAFAAAACH/C0ltYWdlTWFnaWNrDmdhbW1hPTAuNDU0NTQ1ACwAAAAAKAAeAAACIYSPqcvtD6OctNqLs968+w+G4kiW5omm6sq27gvH8kxzBQAh+QQAFAAAACH/C0ltYWdlTWFnaWNrDmdhbW1hPTAuNDU0NTQ1ACwAAAAAKAAeAIAA/wAAAAACIYSPqcvtD6OctNqLs968+w+G4kiW5omm6sq27gvH8kxzBQAh+QQAFAAAACH/C0ltYWdlTWFnaWNrDmdhbW1hPTAuNDU0NTQ1ACwAAAAAKAAeAIAAAP8AAAACIYSPqcvtD6OctNqLs968+w+G4kiW5omm6sq27gvH8kxzBQA7', 'base64')

async function req(path, { method = 'GET', body, cookie, headers = {}, json = true } = {}) {
  const init = { method, redirect: 'manual', headers: { ...headers } }
  if (cookie) init.headers.cookie = cookie
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['content-type'] = 'application/json'
  }
  const res = await fetch(B + path, init)
  const text = await res.text()
  let data = text
  if (json) { try { data = JSON.parse(text) } catch {} }
  const setCookie = res.headers.get('set-cookie') || ''
  const token = setCookie.match(/auth-token=([^;]+)/)?.[1]
  return { status: res.status, data, text, headers: res.headers, cookie: token ? `auth-token=${token}` : undefined }
}

let admin // oturum cookie'si

// Container SETUP_TOKEN ile başlatıldıysa (CI ve YunoHost kurulumu) sihirbaz anahtarsız tamamlanamaz
const SETUP_TOKEN = process.env.SETUP_TOKEN || ''

test('kurulum sihirbazı', async () => {
  assert.deepEqual((await req('/api/setup')).data, { setupRequired: true, step: 'initial', tokenRequired: !!SETUP_TOKEN })
  assert.equal((await req('/')).status, 307, 'kurulum yokken ana sayfa /setup\'a yönlenmeli')

  if (SETUP_TOKEN) {
    for (const setupToken of [undefined, 'yanlis-anahtar', SETUP_TOKEN.slice(0, -1)]) {
      const denied = await req('/api/setup', { method: 'POST', body: { step: 'initial', data: { adminUsername: 'evil', adminPassword: 'hackedhacked', setupToken } } })
      assert.equal(denied.status, 403, `kurulum anahtarı olmadan/yanlışken admin oluşturulmamalı (${setupToken})`)
    }
    assert.equal((await req('/api/setup')).data.setupRequired, true, 'reddedilen deneme kurulumu tamamlamamalı')
  }

  const initial = await req('/api/setup', { method: 'POST', body: { step: 'initial', data: { adminUsername: 'admin', adminPassword: PASSWORD, baseUrl: B, setupToken: SETUP_TOKEN } } })
  assert.equal(initial.status, 200)
  admin = initial.cookie
  assert.ok(admin, 'kurulum oturum açmalı')

  assert.equal((await req('/api/setup', { method: 'POST', cookie: admin, body: { step: 'database', data: { name: 'E2E Test', bio: 'bio' } } })).status, 200)
  assert.deepEqual((await req('/api/setup')).data, { setupRequired: false })
})

test('kurulum ikinci kez çalıştırılamaz', async () => {
  assert.equal((await req('/api/setup', { method: 'POST', body: { step: 'initial', data: { adminUsername: 'evil', adminPassword: 'hackedhacked' } } })).status, 403)
  assert.equal((await req('/api/setup', { method: 'POST', body: { step: 'database', data: { name: 'pwned' } } })).status, 401)
})

test('admin verileri girişsiz okunamaz/değiştirilemez', async () => {
  for (const path of ['/api/profile', '/api/links', '/api/subscribers', '/api/analytics', '/api/admin/overview', '/api/admin/backup']) {
    assert.equal((await req(path)).status, 401, path)
  }
  assert.equal((await req('/api/theme', { method: 'PUT', body: {} })).status, 401)
  assert.equal((await req('/api/profile/seo', { method: 'PUT', body: {} })).status, 401)
})

test('linkler: oluşturma, doğrulama, kısa link, şifre koruması', async () => {
  const bad = await req('/api/links', { method: 'POST', cookie: admin, body: { title: 'x', url: 'javascript:alert(1)' } })
  assert.equal(bad.status, 400, 'javascript: URL reddedilmeli')

  const pub = await req('/api/links', { method: 'POST', cookie: admin, body: { title: 'Örnek', url: 'https://example.com/', slug: 'ornek' } })
  assert.equal(pub.status, 200)
  const secret = await req('/api/links', { method: 'POST', cookie: admin, body: { title: 'Gizli', url: 'https://secret.example.com/', password: 'linkpw', slug: 'gizli' } })
  assert.equal(secret.status, 200)
  assert.match(secret.data.password, /^\$2[aby]\$/, 'link şifresi hash\'lenmeli')

  const home = await req('/', { json: false })
  assert.equal(home.status, 200)
  assert.ok(home.text.includes('Örnek'))
  assert.ok(!home.text.includes('secret.example.com'), 'şifreli linkin URL\'si sayfada olmamalı')

  const go = await req('/go/ornek', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/128.0' } })
  assert.equal(go.status, 307)
  assert.equal(go.headers.get('location'), 'https://example.com/')
  assert.match((await req('/go/gizli')).headers.get('location') || '', /\/\?link=\d+$/)

  assert.equal((await req(`/api/links/${secret.data.id}/verify`, { method: 'POST', body: { password: 'yanlis' }, headers: ip(10) })).status, 401)
  const ok = await req(`/api/links/${secret.data.id}/verify`, { method: 'POST', body: { password: 'linkpw' }, headers: ip(10) })
  assert.equal(ok.data.url, 'https://secret.example.com/')

  // Düzenlemede mevcut hash geri gönderilince şifre bozulmamalı
  await req(`/api/links/${secret.data.id}`, { method: 'PUT', cookie: admin, body: { title: 'Gizli 2', password: secret.data.password } })
  assert.equal((await req(`/api/links/${secret.data.id}/verify`, { method: 'POST', body: { password: 'linkpw' }, headers: ip(11) })).status, 200)
})

test('SMTP şifresi istemciye gönderilmez', async () => {
  await req('/api/profile', { method: 'PUT', cookie: admin, body: { smtpHost: 'smtp.example.com', smtpPassword: 'cok-gizli' } })
  const profile = await req('/api/profile', { cookie: admin })
  assert.equal(profile.data.smtpPassword, '')
  assert.equal(profile.data.hasSmtpPassword, true)
  assert.ok(!(await req('/', { json: false })).text.includes('cok-gizli'))
})

test('görsel yükleme ve /media', async () => {
  const unauth = new FormData()
  unauth.append('kind', 'avatar'); unauth.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'a.png')
  assert.equal((await req('/api/admin/upload', { method: 'POST', body: unauth })).status, 401)

  const svg = new FormData()
  svg.append('kind', 'avatar'); svg.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'a.svg')
  assert.equal((await req('/api/admin/upload', { method: 'POST', cookie: admin, body: svg })).status, 400)

  const form = new FormData()
  form.append('kind', 'avatar'); form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'a.png')
  const upload = await req('/api/admin/upload', { method: 'POST', cookie: admin, body: form })
  assert.equal(upload.status, 200, JSON.stringify(upload.data))
  assert.match(upload.data.url, /^\/media\/avatar-[0-9a-f-]{36}\.webp$/)

  const media = await req(upload.data.url, { json: false })
  assert.equal(media.status, 200)
  assert.equal(media.headers.get('content-type'), 'image/webp')
  assert.equal((await req('/media/..%2Fprisma%2Fdev.db')).status, 404)

  // Hareketli GIF (3 kare) arka plan olarak yüklenince hareketli WebP olur (ANIM bölümü)
  const gif = new FormData()
  gif.append('kind', 'background'); gif.append('file', new Blob([ANIMATED_GIF], { type: 'image/gif' }), 'a.gif')
  const gifUpload = await req('/api/admin/upload', { method: 'POST', cookie: admin, body: gif })
  assert.equal(gifUpload.status, 200, JSON.stringify(gifUpload.data))
  const gifMedia = Buffer.from(await (await fetch(B + gifUpload.data.url)).arrayBuffer())
  assert.equal(gifMedia.subarray(8, 12).toString(), 'WEBP')
  assert.ok(gifMedia.includes(Buffer.from('ANIM')), 'animasyon korunmalı')
})

test('güvenlik başlıkları, CSRF ve kapalı görsel proxy', async () => {
  const home = await req('/', { json: false })
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN')
  assert.equal(home.headers.get('x-powered-by'), null)
  assert.equal((await req('/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example', ...ip(20) }, body: { username: 'admin', password: 'x' } })).status, 403)
  assert.equal((await req('/_next/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=64&q=75')).status, 404)
})

test('herkese açık uç noktalar', async () => {
  assert.equal((await req('/api/health')).status, 200)
  assert.equal((await req('/robots.txt', { json: false })).status, 200)
  assert.equal((await req('/sitemap.xml', { json: false })).status, 200)
  assert.equal((await req('/api/vcard')).status, 404, 'vCard varsayılan kapalı')
  assert.equal((await req('/api/subscribe', { method: 'POST', body: { email: 'okur@example.com' }, headers: ip(30) })).data.success, true)
  assert.equal((await req('/api/unsubscribe?e=okur%40example.com&t=yanlis', { method: 'POST' })).status, 400)
  assert.deepEqual((await req('/api/views', { method: 'POST', body: {}, headers: { 'user-agent': 'curl/8' } })).data, { recorded: false })
})

test('admin genel bakış özeti', async () => {
  const browserUA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', ...ip(60) }
  assert.deepEqual((await req('/api/views', { method: 'POST', body: {}, headers: browserUA })).data, { recorded: true })
  const future = new Date(Date.now() + 3 * 86400e3).toISOString()
  assert.equal((await req('/api/links', { method: 'POST', cookie: admin, body: { title: 'Yakında', url: 'https://example.com/soon', startDate: future } })).status, 200)

  const week = await req('/api/admin/overview', { cookie: admin })
  assert.equal(week.status, 200)
  assert.equal(week.data.range, 7)
  assert.equal(week.data.days.length, 7)
  assert.ok(week.data.kpis.views.value >= 1, 'görüntülenme sayılmalı')
  assert.ok(week.data.kpis.visitors.value >= 1)
  assert.equal(week.data.kpis.views.series.length, 7)
  assert.equal(week.data.kpis.views.series.reduce((a, b) => a + b, 0), week.data.kpis.views.value, 'seri toplamı değere eşit olmalı')
  assert.ok(week.data.kpis.subscribers.total >= 1, 'abone sayılmalı')
  assert.ok(week.data.status.upcoming >= 1)
  assert.equal(week.data.status.nextUpcoming.title, 'Yakında')
  assert.equal(typeof week.data.status.smtpConfigured, 'boolean')
  assert.match(week.data.status.version, /^\d+\.\d+\.\d+/)
  assert.ok(Array.isArray(week.data.topLinks))

  const month = await req('/api/admin/overview?range=30d', { cookie: admin })
  assert.equal(month.data.range, 30)
  assert.equal(month.data.kpis.clicks.series.length, 30)
})

test('blok tipleri, düzen ve öne çıkan link', async () => {
  const thumbForm = new FormData()
  thumbForm.append('kind', 'thumb'); thumbForm.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 't.png')
  const thumb = (await req('/api/admin/upload', { method: 'POST', cookie: admin, body: thumbForm })).data.url
  assert.match(thumb, /^\/media\/thumb-/)

  const create = (body) => req('/api/links', { method: 'POST', cookie: admin, body })
  assert.equal((await create({ type: 'text', title: 'Hakkımda', description: 'Merhaba dünya' })).status, 200, 'metin bloğu URL istemez')
  assert.equal((await create({ type: 'gallery', title: 'Galeri', images: [thumb] })).status, 200)
  assert.equal((await create({ type: 'spotify', title: 'Liste', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' })).status, 200)
  assert.equal((await create({ type: 'countdown', title: 'Etkinlik', targetDate: new Date(Date.now() + 86400e3).toISOString() })).status, 200)
  assert.equal((await create({ type: 'portfolio', title: 'Proje Kartı', description: 'Açıklama', thumbnail: thumb })).status, 200)
  assert.equal((await create({ type: 'link', title: 'Öne Çıkan', url: 'https://example.com/one', featured: true, thumbnail: thumb })).status, 200)

  assert.equal((await create({ type: 'spotify', title: 'x', url: 'https://example.com/x' })).status, 400, 'Spotify olmayan adres reddedilmeli')
  assert.equal((await create({ type: 'gallery', title: 'x', images: ['javascript:alert(1)'] })).status, 400)
  assert.equal((await create({ type: 'bilinmeyen', title: 'x', url: 'https://a.com' })).status, 400)

  let home = (await req('/', { json: false })).text
  for (const text of ['Merhaba dünya', 'open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M', 'Proje Kartı', 'featured-card']) {
    assert.ok(home.includes(text), `ana sayfada olmalı: ${text}`)
  }

  assert.equal((await req('/api/theme', { method: 'PUT', cookie: admin, body: { layout: 'grid' } })).status, 200)
  home = (await req('/', { json: false })).text
  assert.ok(home.includes('grid grid-cols-2'), 'ızgara düzeni uygulanmalı')
})

test('ziyaretçi sayfası: profil kartı, dinamik bloklar ve sıra', async () => {
  const put = (body) => req('/api/profile', { method: 'PUT', cookie: admin, body })
  assert.equal((await put({ timezone: 'Mars/Olympus' })).status, 400, 'geçersiz saat dilimi reddedilmeli')
  assert.equal((await put({ statusText: 'Tez yazıyor', location: 'İstanbul', timezone: 'Europe/Istanbul', showNewsletter: false, showShareButton: false })).status, 200)
  let home = (await req('/', { json: false })).text
  assert.ok(home.includes('Tez yazıyor') && home.includes('İstanbul'), 'durum ve konum görünmeli')
  assert.ok(!home.includes('newsletter-email'), 'bülten kapalıyken kutu olmamalı')
  // İletişim e-postası girilmediği için "Bana yaz" gizli kalmalı
  assert.ok(!home.includes('Bana yaz'), 'iletişim e-postası yokken Bana yaz görünmemeli')

  assert.equal((await put({ statusText: '', location: '', showNewsletter: true })).status, 200)
  home = (await req('/', { json: false })).text
  assert.ok(!home.includes('Tez yazıyor'), 'boş durum görünmemeli')
  assert.ok(home.includes('newsletter-email'), 'bülten açıkken kutu olmalı')

  // İçi boş blok (görselsiz galeri) sayfada yer kaplamaz (blok sarmalayıcı sayısı değişmemeli)
  const blockCount = (html) => (html.match(/data-cat="/g) || []).length
  const before = blockCount(home)
  const empty = await req('/api/links', { method: 'POST', cookie: admin, body: { type: 'gallery', title: 'Boş galeri', images: [] } })
  assert.equal(empty.status, 200)
  home = (await req('/', { json: false })).text
  assert.equal(blockCount(home), before, 'boş galeri çizilmemeli')
  assert.ok(!home.includes('Boş galeri'))

  // Sıra: metin bloğunu en üste al, sayfada linklerden önce gelmeli
  const links = (await req('/api/links', { cookie: admin })).data
  const about = links.find((l) => l.title === 'Hakkımda')
  const featured = links.find((l) => l.title === 'Öne Çıkan')
  assert.ok(about && featured)
  const reordered = [about, ...links.filter((l) => l.id !== about.id)]
  for (const [index, link] of reordered.entries()) {
    assert.equal((await req(`/api/links/${link.id}`, { method: 'PUT', cookie: admin, body: { order: index } })).status, 200)
  }
  home = (await req('/', { json: false })).text
  assert.ok(home.indexOf('Merhaba dünya') < home.indexOf('Öne Çıkan'), 'Hakkımda en üste taşınmalı')
  await req(`/api/links/${empty.data.id}`, { method: 'DELETE', cookie: admin })
})

test('e-posta gönder: doğrulama ve önizleme (imza profilden)', async () => {
  const send = (body, cookie = admin) => req('/api/admin/send-email', { method: 'POST', cookie, body })
  assert.equal((await send({ to: 'a@example.com', subject: 's', message: 'm' }, '')).status, 401)
  assert.equal((await req('/api/admin/email-preview', { method: 'POST', body: { subject: 's' } })).status, 401)
  assert.equal((await send({ to: '', subject: 's', message: 'm' })).status, 400, 'alıcı zorunlu')
  const invalid = await send({ to: 'a@example.com, bozuk-adres', subject: 's', message: 'm' })
  assert.equal(invalid.status, 400)
  assert.match(invalid.data.error, /bozuk-adres/)
  const many = Array.from({ length: 21 }, (_, i) => `k${i}@example.com`).join(', ')
  assert.equal((await send({ to: many, subject: 's', message: 'm' })).status, 400, '20 alıcı sınırı')
  // SMTP tamamlanmadığı için gönderim yapılmaz ama doğrulamadan geçer
  const noSmtp = await send({ to: 'a@example.com, b@example.com', subject: 's', message: 'm' })
  assert.equal(noSmtp.status, 400)
  assert.match(noSmtp.data.error, /SMTP/)

  // İmzadaki sosyal ikonlar Profil'deki adreslerden gelir
  assert.equal((await req('/api/profile', { method: 'PUT', cookie: admin, body: { githubUrl: 'https://github.com/ornek', companyName: 'Örnek Şirket' } })).status, 200)
  const preview = await req('/api/admin/email-preview', { method: 'POST', cookie: admin, body: { subject: 'Konu', message: 'Merhaba **dünya**', audience: 'subscribers' } })
  assert.equal(preview.status, 200)
  assert.ok(preview.data.html.includes('<strong>dünya</strong>'))
  assert.ok(preview.data.html.includes('https://github.com/ornek'), 'imzada GitHub linki olmalı')
  assert.ok(preview.data.html.includes('Örnek Şirket'))
  assert.ok(preview.data.html.includes('Abonelikten'), 'abonelere giden e-postada çıkış linki')
  assert.equal(preview.data.smtpConfigured, false)
})

test('yedekleme: yedek alma, geri yükleme, otomatik tür algılama', async () => {
  const backup = (kind, cookie = admin) => req(`/api/admin/backup?kind=${kind}`, { cookie })
  const restore = (body) => req('/api/admin/backup', { method: 'POST', cookie: admin, body })
  assert.equal((await backup('full', '')).status, 401)
  assert.equal((await req('/api/admin/backup', { method: 'POST', body: {} })).status, 401)
  assert.equal((await backup('bogus')).status, 400)

  await req('/api/subscribe', { method: 'POST', body: { email: 'yedek@example.com' }, headers: ip(60) })
  const fullRes = await backup('full')
  assert.equal(fullRes.status, 200)
  assert.match(fullRes.headers.get('content-disposition') || '', /attachment; filename="kunye-full-/)
  const full = fullRes.data
  assert.equal(full.format, 'kunye-backup')
  assert.equal(full.kind, 'full')
  assert.ok(full.links.length > 0 && full.links.every((link) => link.id), 'bloklar kimlikleriyle yedeklenmeli')
  assert.ok(full.links.some((link) => link.password), 'tam yedek link şifre özetlerini içermeli')
  assert.ok(full.subscribers.some((s) => s.email === 'yedek@example.com'))
  assert.ok(Array.isArray(full.analytics) && Array.isArray(full.pageViews))
  assert.ok(Object.keys(full.files).length > 0, 'yüklenen görseller tam yedekte olmalı')
  assert.ok(!JSON.stringify(full).includes('passwordHash'), 'admin hesabı yedeğe girmemeli')

  const settings = (await backup('settings')).data
  assert.equal(settings.kind, 'settings')
  assert.equal(settings.subscribers, undefined)
  assert.ok(settings.links.every((link) => link.password === undefined))
  const profileOnly = (await backup('profile')).data
  assert.equal(profileOnly.links, undefined)
  assert.equal(profileOnly.profile.smtpHost, undefined, 'profil yedeği SMTP içermemeli')

  // Değişiklik yap, sonra tam yedekten dön: her şey yedekteki hâline gelir, admin oturumu sürer
  await req('/api/profile', { method: 'PUT', cookie: admin, body: { name: 'Değişti' } })
  await req('/api/links', { method: 'POST', cookie: admin, body: { title: 'Yedekte yok', url: 'https://example.org/' } })
  const restored = await restore(full)
  assert.equal(restored.status, 200, JSON.stringify(restored.data))
  assert.equal(restored.data.kind, 'full')
  assert.equal(restored.data.links, full.links.length)
  assert.equal((await req('/api/profile', { cookie: admin })).data.name, full.profile.name)
  const linksAfter = (await req('/api/links', { cookie: admin })).data
  assert.deepEqual(linksAfter.map((link) => link.id).sort(), full.links.map((link) => link.id).sort())
  assert.ok((await req('/api/subscribers', { cookie: admin })).data.some((s) => s.email === 'yedek@example.com'))

  // Profil yedeği yalnızca profili değiştirir
  await req('/api/profile', { method: 'PUT', cookie: admin, body: { name: 'Profil testi' } })
  assert.equal((await restore(profileOnly)).data.kind, 'profile')
  assert.equal((await req('/api/profile', { cookie: admin })).data.name, full.profile.name)
  assert.equal((await req('/api/links', { cookie: admin })).data.length, full.links.length)

  // "Sayfa ve ayarlar": aynı kimlikli bloklar güncellenir, şifreleri korunur, yedekte olmayan blok silinir
  await req('/api/links', { method: 'POST', cookie: admin, body: { title: 'Ayar yedeğinde yok', url: 'https://example.org/x' } })
  const settingsRes = await restore(settings)
  assert.equal(settingsRes.status, 200, JSON.stringify(settingsRes.data))
  const afterSettings = (await req('/api/links', { cookie: admin })).data
  assert.deepEqual(afterSettings.map((link) => link.id).sort(), full.links.map((link) => link.id).sort())
  assert.ok(afterSettings.some((link) => link.password), 'ayar yedeği yüklenince mevcut link şifreleri korunmalı')

  // Eski "Ayarları dışa aktar" dosyası tanınır; güvensiz adresler alınmaz
  const legacy = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    profile: { ...full.profile },
    links: [{ title: 'Eski', url: 'https://example.com/eski', type: 'link' }, { title: 'Kötü', url: 'javascript:alert(1)', type: 'link' }],
  }
  const legacyRes = await restore(legacy)
  assert.equal(legacyRes.status, 200, JSON.stringify(legacyRes.data))
  assert.equal(legacyRes.data.legacy, true)
  assert.equal(legacyRes.data.kind, 'settings')
  const legacyLinks = (await req('/api/links', { cookie: admin })).data
  assert.equal(legacyLinks.length, 2)
  assert.equal(legacyLinks.find((link) => link.title === 'Kötü').url, '')

  // Görseller: yalnızca bizim adlandırdığımız ve gerçekten o türde olan dosyalar yazılır
  const goodName = 'avatar-00000000-0000-4000-8000-000000000001.png'
  const fakeName = 'avatar-00000000-0000-4000-8000-000000000002.webp'
  await restore({ ...profileOnly, files: { [goodName]: Buffer.from(PNG_1PX).toString('base64'), [fakeName]: Buffer.from('<script>alert(1)</script>').toString('base64'), '../x.png': 'AAAA' } })
  assert.equal((await req(`/media/${goodName}`, { json: false })).status, 200)
  assert.equal((await req(`/media/${fakeName}`, { json: false })).status, 404)

  // Yedek olmayan / daha yeni sürüm dosyaları reddedilir, hiçbir şey değişmez
  assert.equal((await restore({ foo: 1 })).status, 400)
  assert.equal((await restore({ format: 'kunye-backup', formatVersion: 99, kind: 'full', profile: {} })).status, 400)

  // Sonraki testler için tam yedekten geri dön
  assert.equal((await restore(full)).status, 200)
  assert.equal((await req('/api/links', { cookie: admin })).data.length, full.links.length)
})

test('link önizleme: yetki ve SSRF koruması', async () => {
  assert.equal((await req('/api/admin/link-preview', { method: 'POST', body: { url: 'https://example.com' } })).status, 401)
  for (const url of ['http://127.0.0.1:3000/', 'http://localhost/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'file:///etc/passwd']) {
    const res = await req('/api/admin/link-preview', { method: 'POST', cookie: admin, body: { url } })
    assert.equal(res.status, 400, `${url} reddedilmeli`)
  }
})

// RFC 6238 TOTP (sunucudaki src/lib/totp.ts ile aynı hesap; test bağımsız olsun diye burada yeniden yazıldı)
function totpCode(secret, counter) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const bytes = []
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char)
    bits += 5
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(message).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
const nowCounter = () => Math.floor(Date.now() / 30_000)

test('iki adımlı doğrulama ve giriş geçmişi', async () => {
  const sec = (body) => req('/api/admin/security', { method: 'POST', cookie: admin, body })
  assert.equal((await req('/api/admin/security')).status, 401)
  assert.equal((await req('/api/admin/security', { method: 'POST', body: { action: 'totp-start' } })).status, 401)

  const start = await sec({ action: 'totp-start' })
  assert.equal(start.status, 200)
  assert.match(start.data.secret, /^[A-Z2-7]{32}$/)
  assert.ok(start.data.otpauthUrl.startsWith('otpauth://totp/'))
  assert.equal((await sec({ action: 'totp-enable', code: '000000' })).status, 400, 'yanlış kodla açılmamalı')
  const counter = nowCounter()
  const enable = await sec({ action: 'totp-enable', code: totpCode(start.data.secret, counter) })
  assert.equal(enable.status, 200, JSON.stringify(enable.data))
  assert.equal(enable.data.recoveryCodes.length, 8)

  const login = (body, n) => req('/api/auth/login', { method: 'POST', headers: ip(n), body: { username: 'admin', password: PASSWORD, ...body } })
  const noCode = await login({}, 70)
  assert.equal(noCode.status, 200)
  assert.equal(noCode.data.twoFactorRequired, true, 'şifreden sonra kod istenmeli')
  assert.equal(noCode.cookie, undefined, 'kodsuz oturum açılmamalı')
  assert.equal((await login({ code: '123456' }, 70)).status, 401)
  assert.equal((await login({ code: totpCode(start.data.secret, counter) }, 70)).status, 401, 'kurulumda kullanılan kod tekrar kullanılamaz')
  const ok = await login({ code: totpCode(start.data.secret, counter + 1) }, 71)
  assert.equal(ok.status, 200, JSON.stringify(ok.data))
  assert.ok(ok.cookie)

  assert.equal((await req('/api/auth/login', { method: 'POST', headers: ip(74), body: { username: 'admin', password: 'yanlis-sifre' } })).status, 401)

  const recovery = enable.data.recoveryCodes[0]
  assert.equal((await login({ code: recovery.toUpperCase() }, 72)).status, 200, 'kurtarma kodu çalışmalı')
  assert.equal((await login({ code: recovery }, 72)).status, 401, 'kurtarma kodu ikinci kez çalışmamalı')
  assert.equal((await req('/api/admin/security', { cookie: admin })).data.twoFactor.recoveryLeft, 7)

  const events = (await req('/api/admin/security', { cookie: admin })).data.events
  assert.ok(events.some((e) => !e.success && e.reason === 'totp'), 'hatalı kod kaydedilmeli')
  assert.ok(events.some((e) => e.success && e.reason === 'recovery'))
  assert.ok(events.some((e) => !e.success && e.reason === 'password'), 'hatalı şifre kaydedilmeli')

  assert.equal((await sec({ action: 'totp-disable', password: 'yanlis' })).status, 401, 'şifresiz kapatılamamalı')
  assert.equal((await sec({ action: 'totp-disable', password: PASSWORD })).status, 200)
  assert.equal((await login({}, 73)).data.success, true, 'kapatınca yalnızca şifre yeterli')
})

test('iletişim mesajları panelde saklanır', async () => {
  const put = (body) => req('/api/profile', { method: 'PUT', cookie: admin, body })
  const contact = (body) => req('/api/contact', { method: 'POST', headers: ip(80), body })
  assert.equal((await put({ contactEmail: '' })).status, 200)
  assert.equal((await contact({ name: 'Ziyaretçi', email: 'z@example.com', message: 'Merhaba' })).status, 400, 'iletişim e-postası yokken form kapalı')

  assert.equal((await put({ contactEmail: 'ben@example.com' })).status, 200)
  const home = (await req('/', { json: false })).text
  assert.ok(home.includes('Bana yaz'), 'iletişim e-postası girilince Bana yaz görünmeli (SMTP olmadan da)')

  const sent = await contact({ name: 'Ayşe <b>', email: 'ayse@example.com', message: 'Merhaba,\nnasılsın?' })
  assert.equal(sent.status, 200, 'SMTP olmasa da mesaj kabul edilmeli')
  assert.equal((await req('/api/admin/messages')).status, 401)
  assert.equal((await req('/api/admin/messages?unread=1', { cookie: admin })).data.unread, 1)
  const [message] = (await req('/api/admin/messages', { cookie: admin })).data
  assert.equal(message.name, 'Ayşe <b>')
  assert.equal(message.message, 'Merhaba,\nnasılsın?')
  assert.equal(message.read, false)
  assert.equal(message.emailed, false)

  assert.equal((await req(`/api/admin/messages/${message.id}`, { method: 'PATCH', body: { read: true } })).status, 401)
  assert.equal((await req(`/api/admin/messages/${message.id}`, { method: 'PATCH', cookie: admin, body: { read: true } })).status, 200)
  assert.equal((await req('/api/admin/messages?unread=1', { cookie: admin })).data.unread, 0)
  assert.equal((await req('/api/admin/overview', { cookie: admin })).data.status.unreadMessages, 0)

  // Tam yedek mesajları içerir
  const full = (await req('/api/admin/backup?kind=full', { cookie: admin })).data
  assert.ok(full.contactMessages.some((m) => m.email === 'ayse@example.com'))

  assert.equal((await req(`/api/admin/messages/${message.id}`, { method: 'DELETE', cookie: admin })).status, 200)
  assert.equal((await req('/api/admin/messages', { cookie: admin })).data.length, 0)
  await put({ contactEmail: '' })
})

test('bülten: e-posta onayı ayarı, aboneler ve onay linki', async () => {
  const put = (body) => req('/api/profile', { method: 'PUT', cookie: admin, body })
  const subscribe = (body) => req('/api/subscribe', { method: 'POST', headers: ip(90), body })
  assert.equal((await put({ newsletterDoubleOptIn: true })).status, 200)
  assert.equal((await req('/api/profile', { cookie: admin })).data.newsletterDoubleOptIn, true)

  // SMTP tam ayarlı değil: onay e-postası gidemeyeceği için abone doğrudan eklenir
  const first = await subscribe({ email: 'Onay@Example.com', name: 'İlk' })
  assert.equal(first.status, 200)
  assert.equal(first.data.pending, undefined)
  // Onaylı abonenin adı başkası tarafından değiştirilemez
  assert.equal((await subscribe({ email: 'onay@example.com', name: 'Kötü niyetli' })).status, 200)
  const subscriber = (await req('/api/subscribers', { cookie: admin })).data.find((s) => s.email === 'onay@example.com')
  assert.equal(subscriber.name, 'İlk')
  assert.equal(subscriber.confirmed, true)

  // Geçersiz onay linkleri
  assert.equal((await req('/api/subscribe/confirm', { method: 'POST', body: { email: 'onay@example.com', token: 'x'.repeat(32) } })).status, 400)
  const page = (await req('/subscribe/confirm?e=onay@example.com&t=yanlis', { json: false })).text
  assert.ok(page.includes('geçersiz'))
  // Abonelikten çıkma imzası onay yerine geçmez (ve tersi)
  assert.equal((await req('/api/unsubscribe', { method: 'POST', body: { email: 'onay@example.com', token: 'x'.repeat(32) } })).status, 400)

  assert.equal((await put({ newsletterDoubleOptIn: false })).status, 200)
})

test('geri al / ileri al', async () => {
  const revisions = () => req('/api/admin/revisions', { cookie: admin })
  const step = (direction) => req('/api/admin/revisions', { method: 'POST', cookie: admin, body: { direction } })
  assert.equal((await req('/api/admin/revisions')).status, 401)
  assert.equal((await step('bogus')).status, 400)

  const created = await req('/api/links', { method: 'POST', cookie: admin, body: { title: 'Geri alınacak', url: 'https://example.com/geri' } })
  assert.equal(created.status, 200)
  assert.equal((await revisions()).data.undo.label, '"Geri alınacak" eklendi')
  assert.equal((await revisions()).data.redo, null)

  const undo = await step('undo')
  assert.equal(undo.status, 200, JSON.stringify(undo.data))
  assert.equal(undo.data.label, '"Geri alınacak" eklendi')
  let links = (await req('/api/links', { cookie: admin })).data
  assert.ok(!links.some((l) => l.id === created.data.id), 'geri alınca blok silinmeli')
  assert.ok(!(await req('/', { json: false })).text.includes('Geri alınacak'), 'site önbelleği tazelenmeli')

  assert.equal((await step('redo')).status, 200)
  links = (await req('/api/links', { cookie: admin })).data
  assert.ok(links.some((l) => l.id === created.data.id && l.url === 'https://example.com/geri'), 'ileri alınca aynı kimlikle geri gelmeli')
  assert.equal((await step('redo')).status, 409, 'ileri alınacak adım kalmamalı')

  // Profil değişikliği geri alınır; ayarlar (SMTP vb.) geri al listesine girmez
  const before = (await req('/api/profile', { cookie: admin })).data.name
  await req('/api/profile', { method: 'PUT', cookie: admin, body: { name: 'Geçici isim' } })
  await req('/api/profile', { method: 'PUT', cookie: admin, body: { smtpPort: 2525 } })
  assert.equal((await revisions()).data.undo.label, 'Profil')
  assert.equal((await step('undo')).status, 200)
  const profile = (await req('/api/profile', { cookie: admin })).data
  assert.equal(profile.name, before)
  assert.equal(profile.smtpPort, 2525, 'geri al ayarlara dokunmamalı')

  await req(`/api/links/${created.data.id}`, { method: 'DELETE', cookie: admin })
})

test('analitik: dönem karşılaştırma, ısı haritası, link detayı', async () => {
  const links = (await req('/api/links', { cookie: admin })).data
  const target = links.find((l) => l.type === 'link' && l.enabled && !l.password)
  const ua = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }
  assert.equal((await req(`/api/links/${target.id}/click`, { method: 'POST', headers: { ...ua, ...ip(100) }, body: { referrer: 'https://www.instagram.com/x' } })).data.recorded, true)
  // Olmayan / geçersiz link tıklaması hata vermez, kaydedilmez
  for (const id of ['999999', 'abc']) {
    const res = await req(`/api/links/${id}/click`, { method: 'POST', headers: { ...ua, ...ip(100) }, body: {} })
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.data)}`)
    assert.equal(res.data.recorded, false)
  }
  await req('/api/views', { method: 'POST', headers: { ...ua, ...ip(101) }, body: {} })

  const all = (await req('/api/analytics?range=7d', { cookie: admin })).data
  assert.equal(all.heatmap.length, 7)
  assert.ok(all.heatmap.every((row) => row.length === 24))
  assert.ok(all.heatmap.flat().reduce((a, b) => a + b, 0) === all.views, 'ısı haritası görüntülenme sayısıyla tutmalı')
  assert.deepEqual(Object.keys(all.previous).sort(), ['clicks', 'uniqueVisitors', 'views'])
  assert.equal(all.dailyClicks.length, 7)
  assert.ok(all.referrers['instagram.com'] >= 1)

  const one = (await req(`/api/analytics?range=7d&linkId=${target.id}`, { cookie: admin })).data
  assert.ok(one.rangeClicks >= 1 && one.rangeClicks <= all.rangeClicks)
  assert.equal(one.views, all.views, 'görüntülenmeler profil geneli kalır')
  assert.equal((await req('/api/analytics?range=all', { cookie: admin })).data.previous, null)
})

test('otomatik işler, bildirim ayarları ve link kontrolü', async () => {
  const job = (name) => req('/api/admin/jobs', { method: 'POST', cookie: admin, body: { job: name } })
  const put = (body) => req('/api/profile', { method: 'PUT', cookie: admin, body })
  assert.equal((await req('/api/admin/jobs')).status, 401)
  assert.equal((await job('bogus')).status, 400)

  const backup = await job('auto-backup')
  assert.equal(backup.status, 200, JSON.stringify(backup.data))
  const info = (await req('/api/admin/jobs', { cookie: admin })).data
  assert.equal(info.autoBackups.length, 1)
  assert.ok(info.lastRuns.autoBackup)
  const file = await req(`/api/admin/backup?auto=${info.autoBackups[0].name}`, { cookie: admin })
  assert.equal(file.status, 200)
  assert.equal(file.data.format, 'kunye-backup')
  assert.equal(file.data.kind, 'full')
  assert.equal((await req(`/api/admin/backup?auto=${info.autoBackups[0].name}`)).status, 401)
  assert.equal((await req('/api/admin/backup?auto=..%2F.env', { cookie: admin })).status, 404)
  assert.ok((await req('/api/admin/overview', { cookie: admin })).data.status.lastBackup, 'son yedek Genel Bakış\'ta görünmeli')

  assert.equal((await job('link-health')).status, 200)
  assert.equal((await job('test-notification')).status, 400, 'bildirim ayarı yokken test reddedilmeli')
  const report = await job('weekly-report')
  assert.equal(report.status, 500)
  assert.match(report.data.error, /SMTP/)

  assert.equal((await put({ notifyNtfyUrl: 'javascript:alert(1)' })).status, 400)
  assert.equal((await put({ notifyTelegramToken: 'kotu' })).status, 400)
  assert.equal((await put({ notifyTelegramChatId: 'abc def' })).status, 400)
  const saved = await put({ notifyTelegramToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abc', notifyTelegramChatId: '12345', autoBackupEnabled: true })
  assert.equal(saved.status, 200)
  assert.equal(saved.data.notifyTelegramToken, '', 'bot anahtarı istemciye gönderilmemeli')
  assert.equal(saved.data.hasTelegramToken, true)
  assert.equal(saved.data.autoBackupEnabled, true)
  assert.ok(!JSON.stringify((await req('/api/admin/backup?kind=profile', { cookie: admin })).data).includes('ABCDEFGHIJKLMNOP'), 'profil yedeği bildirim ayarı içermemeli')
  await put({ notifyTelegramChatId: '', autoBackupEnabled: false })
})

test('paylaşım görseli, yapısal veri ve içerik güvenlik politikası', async () => {
  const og = await fetch(B + '/api/og')
  assert.equal(og.status, 200)
  assert.equal(og.headers.get('content-type'), 'image/png')
  assert.ok((await og.arrayBuffer()).byteLength > 10_000)

  const res = await fetch(B + '/')
  const html = await res.text()
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1])
  assert.equal(ld['@type'], 'ProfilePage')
  assert.equal(ld.mainEntity['@type'], 'Person')
  assert.ok(ld.mainEntity.name)
  assert.ok(html.includes('/api/og?v='), 'kendi görseli yoksa üretilen kart kullanılmalı')

  const csp = res.headers.get('content-security-policy') || ''
  assert.ok(csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'self'"))
})

test('liste blokları: başlık, rozetler, SSS, zaman çizelgesi, referanslar, kupon', async () => {
  const add = (body) => req('/api/links', { method: 'POST', cookie: admin, body })
  const created = []
  const make = async (body) => {
    const res = await add(body)
    assert.equal(res.status, 200, `${body.type}: ${JSON.stringify(res.data)}`)
    created.push(res.data.id)
    return res.data
  }
  await make({ type: 'heading', title: 'Bölüm Bir', description: 'Alt yazı burada' })
  await make({ type: 'heading', title: '' }) // başlıksız: ayırıcı çizgi
  const skills = await make({ type: 'skills', title: 'Araçlar', items: [{ label: 'TypeScript' }, { label: '' }, { label: 'Figma', kotu: 'x' }] })
  assert.deepEqual(JSON.parse(skills.items), [{ label: 'TypeScript' }, { label: 'Figma' }], 'boş satırlar ve bilinmeyen alanlar atılmalı')
  await make({ type: 'faq', title: 'SSS', items: [{ q: 'Ders veriyor musun?', a: 'Evet <b>bazen</b>' }] })
  await make({ type: 'timeline', title: 'Deneyim', items: [{ date: '2021 – 2024', title: 'Geliştirici', text: 'Örnek A.Ş.' }] })
  await make({ type: 'testimonials', title: 'Referanslar', items: [{ quote: 'Harika iş', name: 'Ayşe', role: 'Müdür' }] })
  await make({ type: 'coupon', title: 'İndirim', description: 'KUPON10', url: 'https://example.com/magaza' })
  assert.equal((await add({ type: 'coupon', title: 'Kötü', description: 'X', url: 'javascript:alert(1)' })).status, 400)
  assert.equal((await add({ type: 'skills', title: 'Çok', items: Array.from({ length: 51 }, (_, i) => ({ label: `e${i}` })) })).status, 400)
  const empty = await make({ type: 'faq', title: 'Boş SSS', items: [] })

  const home = (await req('/', { json: false })).text
  for (const text of ['Bölüm Bir', 'Alt yazı burada', 'TypeScript', 'Figma', 'Ders veriyor musun?', '2021 – 2024', 'Harika iş', 'KUPON10', '<hr']) {
    assert.ok(home.includes(text), `ana sayfada olmalı: ${text}`)
  }
  assert.ok(home.includes('Evet &lt;b&gt;bazen&lt;/b&gt;'), 'satır metni HTML olarak çalışmamalı')
  assert.ok(!home.includes('Boş SSS'), 'satırı olmayan blok çizilmemeli')

  // Yedek blok satırlarını korur
  const settings = (await req('/api/admin/backup?kind=settings', { cookie: admin })).data
  assert.deepEqual(JSON.parse(settings.links.find((l) => l.id === skills.id).items), [{ label: 'TypeScript' }, { label: 'Figma' }])

  // Düzenleme: yalnızca satırlar değişir
  const edit = await req(`/api/links/${skills.id}`, { method: 'PUT', cookie: admin, body: { items: [{ label: 'Rust' }] } })
  assert.equal(edit.status, 200)
  assert.deepEqual(JSON.parse(edit.data.items), [{ label: 'Rust' }])

  for (const id of created) await req(`/api/links/${id}`, { method: 'DELETE', cookie: admin })
  assert.ok(!(await req('/', { json: false })).text.includes('Bölüm Bir'))
  assert.ok(empty.id)
})

test('ürün kartı ve harita', async () => {
  const add = (body) => req('/api/links', { method: 'POST', cookie: admin, body })
  const product = await add({ type: 'product', title: 'Seramik Kupa', price: '₺250', description: 'El yapımı', url: 'https://example.com/kupa' })
  assert.equal(product.status, 200, JSON.stringify(product.data))
  assert.equal(product.data.price, '₺250')

  assert.equal((await add({ type: 'map', title: 'Kötü', url: 'https://maps.app.goo.gl/abc' })).status, 400, 'koordinatsız kısa link reddedilmeli')
  assert.equal((await add({ type: 'map', title: 'Boş' })).status, 400)
  const fromCoords = await add({ type: 'map', title: 'Atölye', url: '41.0082, 28.9784', description: 'Fatih, İstanbul' })
  assert.equal(fromCoords.status, 200, JSON.stringify(fromCoords.data))
  assert.ok(fromCoords.data.url.startsWith('https://www.openstreetmap.org/?mlat=41.0082&mlon=28.9784'), 'koordinat açılabilir linke çevrilmeli')
  const fromGoogle = await add({ type: 'map', title: 'Kule', url: 'https://www.google.com/maps/place/X/@41.0256,28.9741,17z/data=!3d41.0256424!4d28.9741505' })
  assert.equal(fromGoogle.status, 200)

  const res = await fetch(B + '/')
  const home = await res.text()
  for (const text of ['Seramik Kupa', '₺250', 'Satın al', 'Fatih, İstanbul', 'openstreetmap.org/export/embed.html', 'marker=41.0082,28.9784', 'marker=41.0256424,28.9741505']) {
    assert.ok(home.includes(text), `ana sayfada olmalı: ${text}`)
  }
  assert.ok((res.headers.get('content-security-policy') || '').includes('https://www.openstreetmap.org'), 'CSP harita gömmesine izin vermeli')
  for (const item of [product, fromCoords, fromGoogle]) await req(`/api/links/${item.data.id}`, { method: 'DELETE', cookie: admin })
})

test('giriş rate limit: sadece hatalı denemeler sayılır', async () => {
  for (let i = 0; i < 12; i++) {
    assert.equal((await req('/api/auth/login', { method: 'POST', headers: ip(40), body: { username: 'admin', password: PASSWORD } })).status, 200)
  }
  const codes = []
  for (let i = 0; i < 11; i++) {
    codes.push((await req('/api/auth/login', { method: 'POST', headers: ip(41), body: { username: 'admin', password: 'yanlis' } })).status)
  }
  assert.deepEqual(codes, [...Array(10).fill(401), 429])
})

test('şifre değişince tüm oturumlar kapanır', async () => {
  const other = (await req('/api/auth/login', { method: 'POST', headers: ip(50), body: { username: 'admin', password: PASSWORD } })).cookie
  assert.equal((await req('/api/profile', { cookie: other })).status, 200)

  const change = await req('/api/admin/change-password', { method: 'POST', cookie: admin, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } })
  assert.equal(change.status, 200)
  assert.equal((await req('/api/profile', { cookie: admin })).status, 401)
  assert.equal((await req('/api/profile', { cookie: other })).status, 401)
  assert.equal((await req('/api/auth/login', { method: 'POST', headers: ip(51), body: { username: 'admin', password: PASSWORD } })).status, 401)
  assert.equal((await req('/api/auth/login', { method: 'POST', headers: ip(51), body: { username: 'admin', password: NEW_PASSWORD } })).status, 200)
})
