# Künye

Kendi sunucunuzda çalışan, analitikli ve bültenli bir "link in bio" sayfası. Tüm veriler sizde kalır: SQLite veritabanı ve yüklenen görseller tek bir klasörde durur.

**Teknoloji:** Next.js 14.2 (App Router) · TypeScript · Tailwind CSS · Prisma 7 + SQLite (better-sqlite3) · sharp · Docker

## Özellikler

**Ziyaretçi sayfası**
- Geniş ekranda iki sütun (solda profil kartı, sağda bloklar), telefonda alt alta; açık/koyu mod
- Tamamen dinamik: boş alanlar ve içi boş bloklar görünmez, blokların sırası admin panelindeki sıradır
- Profil kartı: durum, konum ve yerel saat, sosyal ikonlar, "Bana yaz" (iletişim formu), paylaş, "Rehbere Ekle" (vCard), bülten
- Bloklar: link (açıklamalı), iletişim formu, bağış, metin, portfolyo kartı, geri sayım, galeri (tam ekran görüntüleyici), Spotify, YouTube/X/Instagram gömme
- Öne çıkan link/proje, link önizleme görseli (yükleme veya siteden otomatik alma), kategori sekmeleri
- 9 hazır tema (Gece Gökyüzü dahil); renk, 7 yazı tipi (Türkçe karakter destekli, sunucudan servis edilir), buton stili, köşe yuvarlaklığı, arka plan (düz, gradient, parçacık, mesh, yıldızlı gece, görsel), kapak görseli
- Şifreli linkler (URL sayfa kaynağında görünmez), zamanlanmış linkler, kısa linkler (`/go/<slug>`)
- SEO: başlık/açıklama, Open Graph görseli (yüklenmezse profilden otomatik üretilen paylaşım kartı), favicon, yapısal veri (JSON-LD), `robots.txt`, `sitemap.xml`

**Admin paneli** (`/admin`)
- Sol menülü düzen; telefonda alt menü. Ctrl/⌘+K ile bölümler ve işlemler arasında arama
- Genel Bakış: son 7/30 günün özeti, en çok tıklananlar, site durumu (son yedek, e-posta ayarı, zamanlanmış linkler)
- Profil, linkler ve bloklar (sürükle-bırak sıralama, satır içi düzenleme), tema ve düzen, QR kod
- Geri al / ileri al: profil, görünüm ve bloklardaki son 30 değişiklik
- Canlı önizleme: telefon çerçevesinde site, her kayıttan sonra kendiliğinden yenilenir
- Görsel yükleme: otomatik boyutlandırma, EXIF/konum bilgisi silinir, hareketli GIF desteği
- Analitik: profil görüntülenme, tekil ziyaretçi, etkileşim oranı, tıklamalar, önceki döneme göre değişim, gün × saat ısı haritası, link bazında detay, cihaz/tarayıcı/ülke, trafik kaynakları, UTM kampanyaları, CSV dışa aktarma, saklama süresi
- Mesajlar: "Bana yaz" formundan gelenler panelde (SMTP olmasa da), okunmamış rozeti
- E-posta: canlı önizleme, birden fazla alıcı veya tüm abonelere gönderim (kişiye özel "abonelikten çık" linki), kendine test, taslak kaydı, e-posta imzası, bülten geçmişi
- Bülten: isteğe bağlı e-posta onayı (çift onay), onay bekleyen aboneler
- Otomatik işler (günlük): otomatik yedek, link kontrolü (kırık linkler), kullanılmayan görsellerin temizliği, haftalık özet e-postası
- Anlık bildirim: yeni abone ve mesajda ntfy / Telegram
- Ayarlar: SMTP, şifre değiştirme, tüm cihazlardan çıkış, yedekleme (tam yedek / sayfa ve ayarlar / yalnızca profil; yedekten yüklemede tür kendiliğinden anlaşılır)

**Güvenlik**
- Admin şifresi bcrypt ile saklanır; şifre değişince tüm oturumlar kapanır
- İki adımlı doğrulama (TOTP, kurtarma kodları) ve giriş geçmişi
- İçerik Güvenlik Politikası (CSP)
- Giriş, iletişim formu, abonelik ve link şifresi için deneme sınırı (rate limit)
- SMTP şifresi tarayıcıya hiç gönderilmez; iletişim e-postası sayfa kaynağında görünmez
- Güvenlik başlıkları, CSRF için Origin kontrolü, SVG/zararlı dosya yükleme engeli
- Ziyaretçi IP'leri saklanmaz, yalnızca tuzlanmış hash tutulur (KVKK/GDPR)

## Kurulum

| Yöntem | Kılavuz |
|---|---|
| YunoHost (önerilen) | [YUNOHOST-KURULUM.md](YUNOHOST-KURULUM.md) |
| Docker / Docker Compose | [DOCKER-KURULUM.md](DOCKER-KURULUM.md) |
| Hızlı deneme | [QUICKSTART.md](QUICKSTART.md) |

İlk açılışta `/setup` sihirbazı admin kullanıcısını oluşturur. Ayrıca `.env` ile şifre ayarlamanız gerekmez.

## Blog ile bağlantı

Kardeş uygulama [blog_ynh](https://github.com/rraeyz/blog_ynh) (yapay zekâlı bilim blogu) abone tutmaz ve e-posta göndermez; Künye'nin API'sini kullanır:

1. Künye → Ayarlar → Güvenlik → **API anahtarı oluştur**; anahtarı blogun Ayarlar → Bülten sekmesine Künye adresiyle birlikte gir.
2. `POST /api/subscribe` (`Authorization: Bearer <anahtar>`): blogdaki abonelik kutusu. Abone, blogun etiketiyle işaretlenir; çift onay açıksa onay e-postasını Künye gönderir.
3. `POST /api/admin/scheduled-newsletters` (aynı anahtar): blogun haftalık bülteni ve "Haftanın astronomi özeti" buraya planlanır. `fromName` gönderen adını blogun adı yapar, `tag` yalnızca o etiketli abonelere gönderir; Künye dakikada bir bakıp gönderir.

## Geliştirme

Node.js 20 gerekir.

```bash
npm ci --legacy-peer-deps
export DATABASE_URL="file:./prisma/dev.db"
npx prisma generate
npx prisma db push        # veritabanını şemadan oluşturur
npm run dev               # http://localhost:3000/setup
```

Kontroller (CI'da da çalışır):

```bash
npx tsc --noEmit
npm run lint
npm run build
```

### Uçtan uca testler

`tests/e2e/` altındaki testler **boş (kurulmamış)** bir kuruluma karşı çalışır, kendi verisini oluşturur:

```bash
# Ayrı bir terminalde temiz bir kurulum başlatın (ör. Docker), sonra:
BASE_URL=http://localhost:3000 npm run test:e2e

# Tarayıcı testi (playwright gerekir; api testlerinden sonra)
BASE_URL=http://localhost:3000 ADMIN_PASSWORD=e2e-password-456 node tests/e2e/browser.mjs
```

GitHub Actions her push'ta Docker imajını derler, container'ı başlatır ve bu testleri çalıştırır. Ekran görüntüleri çalıştırmanın "Artifacts" bölümünde bulunur.

## Veritabanı şeması ve yükseltmeler

Şema `prisma/schema.prisma` dosyasındadır. Docker imajı build edilirken şemadan bir `template.db` üretilir. Container her açıldığında `db-migrate.js`, canlı veritabanını bu template ile karşılaştırır. Eksik tablo, kolon ve index'leri ekler; değişiklikten önce yedek alır. Veri silmez, kolon tipi değiştirmez. Bu yüzden yeni alanları **varsayılan değerli** olarak ekleyin.

## Proje yapısı

```
src/
  app/            sayfalar ve API route'ları (api/, admin/, go/, media/, setup/, unsubscribe/)
  components/     ziyaretçi sayfası bileşenleri; admin/ altında panel bileşenleri
  lib/            auth, güvenlik, analitik, yükleme, e-posta şablonu, geri al, otomatik işler yardımcıları
  instrumentation.ts  açılışta kalıcı gizli anahtar ve günlük otomatik işler
prisma/           veritabanı şeması
scripts/          YunoHost paket script'leri (install, upgrade, backup, restore, remove, change_url)
conf/             YunoHost nginx / docker-compose / systemd şablonları
tests/e2e/        uçtan uca testler
db-migrate.js     açılışta otomatik şema güncellemesi
db-backup.js      çalışan veritabanının tutarlı yedeği
```

## Lisans

MIT
