// Tarayıcı duman testi: ana sayfa (açık/koyu mod), mod geçişi, admin panelinin tüm bölümleri,
// komut paleti, blok ekleme/düzenleme, telefon görünümü ve 320px'ten geniş ekrana taşma kontrolü.
// api.test.mjs'den SONRA çalıştırılmalı (kurulu site ve ADMIN_PASSWORD gerekir).
// Kullanım: BASE_URL=http://localhost:3000 ADMIN_PASSWORD=... node tests/e2e/browser.mjs
import { chromium } from 'playwright'

const B = process.env.BASE_URL || 'http://localhost:3000'
const PASSWORD = process.env.ADMIN_PASSWORD || 'e2e-password-456'
const SHOTS = process.env.SCREENSHOT_DIR || ''
const problems = []

const browser = await chromium.launch()

// Üçüncü taraf gömmeler (Spotify, YouTube, X, Instagram) testte yüklenmez: kendi iframe'lerindeki
// hatalar (ör. Spotify oynatıcısının kendi React hataları) Playwright'ta sayfa hatası olarak görünüp
// testi ağ durumuna bağımlı yapıyordu. Böylece test sadece bu uygulamanın kodunu ölçer.
const THIRD_PARTY = /(^|\.)(spotify\.com|scdn\.co|youtube\.com|ytimg\.com|twitter\.com|x\.com|twimg\.com|instagram\.com|cdninstagram\.com)$/
const blockThirdParty = (context) =>
  context.route((url) => THIRD_PARTY.test(url.hostname), (route) => route.abort())
const watch = (page, tag) => {
  page.on('pageerror', (e) => problems.push(`${tag} sayfa hatası: ${e.message} @ ${(e.stack || '').split('\n').slice(1, 3).join(' | ')}`))
  // Spotify gibi üçüncü taraf iframe'lerin kendi hataları (ör. CI'da ağ) uygulama hatası sayılmaz
  page.on('console', (m) => m.type() === 'error' && !m.location()?.url?.includes('spotify') && problems.push(`${tag} konsol: ${m.text()}`))
  page.on('response', (r) => r.status() >= 500 && problems.push(`${tag} ${r.status()} ${r.url()}`))
}

for (const mode of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } })
  await blockThirdParty(ctx)
  // Sadece ana çerçevede (iframe'lerde, ör. Spotify, localStorage erişimi olmayabilir)
  await ctx.addInitScript((m) => {
    try { if (window === window.top) localStorage.setItem('theme', m) } catch {}
  }, mode)
  const page = await ctx.newPage()
  watch(page, `ana sayfa (${mode})`)
  await page.goto(B + '/', { waitUntil: 'networkidle' })
  const isLight = await page.evaluate(() => document.documentElement.classList.contains('light'))
  if (isLight !== (mode === 'light')) problems.push(`${mode} modu uygulanmadı`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-${mode}.png` })
  await ctx.close()
}

{
  const ctx = await browser.newContext({ colorScheme: 'dark' })
  await blockThirdParty(ctx)
  const page = await ctx.newPage()
  watch(page, 'mod geçişi')
  await page.goto(B + '/', { waitUntil: 'networkidle' })
  await page.click('button[aria-label="Toggle theme"]')
  if (!(await page.evaluate(() => document.documentElement.classList.contains('light')))) problems.push('toggle açık moda geçmedi')
  await ctx.close()
}

const login = async (page) => {
  await page.goto(B + '/admin/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([page.waitForURL('**/admin/dashboard', { timeout: 15000 }), page.click('button[type="submit"]')])
}
const heading = (page, name) => page.getByRole('heading', { level: 1, name, exact: true }).waitFor({ timeout: 10000 })
// Ekrandan taşan öğe var mı? overflow-x: clip taşmayı gizlediği için scrollWidth tek başına yetmez;
// öğeler tek tek ölçülür (kendi kaydırılabilir/kırpılan kutusu içindekiler ve sabit konumlular hariç).
const noHorizontalScroll = async (page, tag) => {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const clipped = (element) => {
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.position === 'fixed' || /(auto|scroll|hidden|clip)/.test(style.overflowX)) return true
      }
      return false
    }
    const offenders = [...document.querySelectorAll('body *')]
      .filter((element) => !element.closest('svg, .stars-bg, [data-overflow-ok]') && getComputedStyle(element).position !== 'fixed' && element.getClientRects().length && !clipped(element))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && (rect.right > width + 1 || rect.left < -1))
      .slice(0, 3)
      .map(({ element, rect }) => `<${element.tagName.toLowerCase()} class="${String(element.className).slice(0, 50)}"> ${Math.round(rect.left)}..${Math.round(rect.right)}px`)
    return { scroll: document.documentElement.scrollWidth - window.innerWidth, width, offenders }
  })
  if (result.scroll > 1) problems.push(`${tag}: sayfa ${result.scroll}px yatay taşıyor`)
  if (result.offenders.length) problems.push(`${tag}: ${result.width}px ekrandan taşan öğe: ${result.offenders.join(' | ')}`)
}

// Ziyaretçi sayfası küçük telefondan geniş ekrana kadar her genişlikte ekrana sığmalı
for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 })
  await blockThirdParty(ctx)
  const page = await ctx.newPage()
  watch(page, `ana sayfa ${width}px`)
  await page.goto(B + '/', { waitUntil: 'networkidle' })
  await noHorizontalScroll(page, `ana sayfa ${width}px`)
  if (SHOTS && (width === 360 || width === 1440)) await page.screenshot({ path: `${SHOTS}/home-${width}.png`, fullPage: true })
  await ctx.close()
}

{
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await blockThirdParty(adminContext)
  const page = await adminContext.newPage()
  watch(page, 'admin')
  await login(page)

  // Açılış ekranı: Genel Bakış
  await heading(page, 'Genel Bakış')
  await page.getByText(/^Sürüm /).waitFor({ timeout: 15000 })
  await page.getByText('Görüntülenme').first().waitFor({ timeout: 15000 })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-Genel_Bakis.png` })

  // Canlı önizleme açılmalı ve siteyi göstermeli
  await page.getByRole('button', { name: 'Önizleme' }).click()
  await page.frameLocator('iframe[title="Site önizlemesi"]').locator('h1').first().waitFor({ timeout: 15000 })

  // Sol menüdeki tüm bölümler
  const nav = page.getByRole('navigation', { name: 'Admin menüsü' })
  for (const tab of ['Profil', 'Linkler ve Bloklar', 'Görünüm', 'Analitik', 'Mesajlar', 'Aboneler', 'E-posta Gönder', 'QR Kod', 'Ayarlar', 'Genel Bakış']) {
    await nav.getByRole('button', { name: tab, exact: true }).click()
    await heading(page, tab)
    await page.waitForTimeout(700)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-${tab.replace(/\s/g, '_')}.png` })
    // Yerel <select> kullanılmaz: bazı Linux tarayıcılarında (KDE/Wayland) liste kutunun üstüne açılıp
    // fare bırakılınca yanlış seçenek seçiliyordu. Yerine SelectMenu bileşeni var.
    const nativeSelects = await page.locator('main select').count()
    if (nativeSelects) problems.push(`${tab}: ${nativeSelects} yerel <select> var (SelectMenu kullanılmalı)`)
  }
  await noHorizontalScroll(page, 'admin masaüstü')

  // Açılır menü: tıklayınca açılır ve açık kalır, seçenek tıklanınca seçilip kapanır
  await nav.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  const kind = page.getByRole('combobox', { name: 'Yedek türü' })
  await kind.click()
  const kindList = page.getByRole('listbox', { name: 'Yedek türü' })
  await kindList.waitFor()
  if ((await kind.innerText()).trim() !== 'Tam yedek') problems.push('açılır menü tıklayınca değeri değiştirdi')
  await kindList.getByRole('option', { name: 'Sayfa ve ayarlar' }).click()
  await kindList.waitFor({ state: 'detached' })
  if ((await kind.innerText()).trim() !== 'Sayfa ve ayarlar') problems.push('açılır menüde seçim yapılamadı')

  // Komut paleti (Ctrl+K): yazıp Enter ile bölüme gider
  await page.keyboard.press('Control+k')
  await page.getByRole('dialog', { name: 'Ara veya komut çalıştır' }).waitFor()
  await page.keyboard.type('analit')
  await page.keyboard.press('Enter')
  await heading(page, 'Analitik')

  // Blok ekleme: önce tür seçilir, sonra form
  await nav.getByRole('button', { name: 'Linkler ve Bloklar', exact: true }).click()
  await page.getByRole('button', { name: 'Yeni Ekle' }).click()
  await page.getByRole('button', { name: /^Metin/ }).click()
  await page.getByPlaceholder('Hakkımda').fill('Tarayıcı testi bloğu')
  await page.getByPlaceholder('Kendinizden veya duyurunuzdan bahsedin...').fill('Tarayıcıdan eklendi')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  const title = page.locator('h3', { hasText: 'Tarayıcı testi bloğu' })
  await title.waitFor({ timeout: 10000 })

  // Satır içi düzenleme: form o bloğun altında açılır, mevcut değerlerle dolu gelir
  const row = title.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
  await row.getByRole('button', { name: 'Düzenle', exact: true }).click()
  const titleInput = row.getByPlaceholder('Hakkımda')
  await titleInput.waitFor()
  if ((await titleInput.inputValue()) !== 'Tarayıcı testi bloğu') problems.push('satır içi düzenleme formu bloğun verisiyle açılmadı')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-Linkler_duzenleme.png` })
  await row.getByRole('button', { name: 'Vazgeç' }).click()
  await adminContext.close()
}

{
  // Telefon: alt menü ve "Daha fazla" listesi
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await blockThirdParty(phone)
  const page = await phone.newPage()
  watch(page, 'admin telefon')
  await login(page)
  await page.getByText(/^Sürüm /).waitFor({ timeout: 15000 })
  await noHorizontalScroll(page, 'admin telefon')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-telefon.png` })

  const bottom = page.getByRole('navigation', { name: 'Alt menü' })
  await bottom.getByRole('button', { name: 'Linkler' }).click()
  await heading(page, 'Linkler ve Bloklar')
  await noHorizontalScroll(page, 'admin telefon linkler')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-telefon-linkler.png` })

  await bottom.getByRole('button', { name: 'Daha fazla' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tüm bölümler' })
  await sheet.waitFor()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-telefon-menu.png` })
  await sheet.getByRole('button', { name: 'Görünüm' }).click()
  await heading(page, 'Görünüm')
  await noHorizontalScroll(page, 'admin telefon görünüm')
  await phone.close()
}

{
  // Küçük telefon (320px): admin panelinin her bölümü ekrana sığmalı
  const small = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true })
  await blockThirdParty(small)
  const page = await small.newPage()
  watch(page, 'admin 320px')
  await login(page)
  await page.getByText(/^Sürüm /).waitFor({ timeout: 15000 })
  await noHorizontalScroll(page, 'admin 320px Genel Bakış')
  const bottom = page.getByRole('navigation', { name: 'Alt menü' })
  for (const tab of ['Profil', 'Linkler ve Bloklar', 'Görünüm', 'Analitik', 'Mesajlar', 'Aboneler', 'E-posta Gönder', 'QR Kod', 'Ayarlar']) {
    await bottom.getByRole('button', { name: 'Daha fazla' }).click()
    await page.getByRole('dialog', { name: 'Tüm bölümler' }).getByRole('button', { name: tab, exact: true }).click()
    await heading(page, tab)
    await page.waitForTimeout(500)
    await noHorizontalScroll(page, `admin 320px ${tab}`)
  }
  await small.close()
}

await browser.close()
if (problems.length) {
  console.error('Tarayıcı testinde sorunlar:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('Tarayıcı testi başarılı')
