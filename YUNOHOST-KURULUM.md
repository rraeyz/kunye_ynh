# YunoHost Kurulumu

Uygulama YunoHost üzerinde Docker container olarak çalışır; nginx, SSL, yedekleme ve güncelleme YunoHost tarafından yönetilir.

**Gereksinimler:** YunoHost 11.3 veya üstü (12.x önerilir), ~1 GB RAM (build sırasında), ~500 MB disk. Docker kurulum sırasında otomatik kurulur.

> **Kaynak kod nereden geliyor?** Kurulum, güncelleme ve geri yükleme script'leri uygulama kodunu
> `scripts/_common.sh` içindeki `source_repo` / `source_branch` adresinden çeker (bu repo: `kunye_ynh`, `main` branch'i).
> Yani bir değişikliği denemek için önce `main`'e alınmış olması gerekir.

## 1. Test domaininde kurulum

Önce ayrı bir alt domainde deneyin. Sorun çıkarsa ana sitenize dokunmamış olursunuz.

```bash
# Domaini ekleyin (DNS kaydı sunucunuzu göstermeli) ve SSL sertifikası alın
sudo yunohost domain add test.ornek.com
sudo yunohost domain cert install test.ornek.com

# Uygulamayı kurun
sudo yunohost app install https://github.com/rraeyz/kunye_ynh \
  --args "domain=test.ornek.com&path=/&init_main_permission=visitors"
```

Kurulum Docker imajını derlediği için birkaç dakika sürer. Bittiğinde:

1. Kurulumun sonunda gösterilen `https://test.ornek.com/setup?token=...` linkini açın (linki kaybederseniz: `sudo yunohost app setting kunye setup_token`). Admin kullanıcı adını ve şifresini belirleyin, profilinizi oluşturun. Bu tek kullanımlık anahtar sayesinde kurulumu sizden önce başkası tamamlayıp admin olamaz.
2. Panel `https://test.ornek.com/admin` adresindedir.
3. Ayarlar → E-posta (SMTP) bölümünü doldurursanız iletişim formu ve bülten çalışır.

> Yol olarak mutlaka `/` kullanın. `ornek.com/linktree` gibi alt yollara kurulum henüz desteklenmiyor.

## 2. Ana domaine taşıma

Test domaininde her şey yolundaysa uygulamayı **verileriyle birlikte** ana domaine taşıyın. Yeniden kurulum gerekmez:

```bash
sudo yunohost app change-url kunye -d ornek.com -p /
```

Bu komut nginx ayarını yeni domaine taşır ve container'ı yeni adresle yeniden başlatır. Veritabanı, yüklenen görseller ve ayarlar aynen kalır. İşlem başarısız olursa YunoHost eski ayarı geri yükler.

- Ana domainin `/` yolunda başka bir uygulama varsa önce onu taşımanız veya kaldırmanız gerekir.
- Taşıdıktan sonra test domainini isterseniz `sudo yunohost domain remove test.ornek.com` ile kaldırabilirsiniz.
- Daha önce paylaştığınız `test.ornek.com` linkleri artık çalışmaz. QR kodları da yeni domainle yeniden oluşturun.

## 3. Güncelleme

```bash
sudo yunohost app upgrade kunye \
  -u https://github.com/rraeyz/kunye_ynh --force
```

- Yeni imaj derlenirken eski sürüm çalışmaya devam eder, kesinti yalnızca container değişirken birkaç saniyedir.
- Açılışta veritabanı şeması otomatik güncellenir (`db-migrate.js`). Değişiklikten önce `prisma/dev.db.before-migrate-<tarih>` adıyla yedek alınır.
- `--force`, sürüm numarası değişmediğinde de güncellemeyi zorlar.

### Uygulamanın adı

Uygulama kimliği `kunye`dir (komutlarda ve klasör adlarında geçer); kurulum ekranında önerilen ad **Künye**'dir.

#### Eski "Personal Linktree" (`personal_linktree`) kurulumundan geçiş

Kimlik değiştiği için yeni kurulum eski verileri kendiliğinden görmez. (Bundan sonraki taşımalarda en kolayı: eski sitede **Ayarlar → Yedekleme → Tam yedek**, yeni sitede **Yedekten yükle**. Eski Personal Linktree sürümlerinde bu düğme olmadığı için ilk geçişte aşağıdaki komutları kullanın.) Veritabanını (profil, linkler, aboneler,
analitik, admin hesabı), görselleri ve `.env`'i (oturum anahtarı) olduğu gibi taşımak için:

```bash
# 1. Eski kurulumun yedeği ve verilerin kopyası
sudo yunohost backup create --apps personal_linktree
sudo mkdir -p /root/kunye-tasima
sudo cp -a /home/yunohost.app/personal_linktree/prisma/dev.db /home/yunohost.app/personal_linktree/uploads \
  /home/yunohost.app/personal_linktree/.env /root/kunye-tasima/

# 2. Eskiyi kaldır, yenisini kur (kurulum sihirbazını AÇMAYIN, veriler geri gelecek)
sudo yunohost app remove personal_linktree
sudo yunohost app install https://github.com/rraeyz/kunye_ynh -a "domain=ornek.com&path=/&init_main_permission=visitors"

# 3. Verileri yeni kuruluma koy ve container'ı yeniden oluştur
cd /opt/yunohost/kunye && sudo docker-compose down
sudo cp -a /root/kunye-tasima/dev.db /home/yunohost.app/kunye/prisma/dev.db
sudo cp -a /root/kunye-tasima/uploads/. /home/yunohost.app/kunye/uploads/
sudo cp -a /root/kunye-tasima/.env /home/yunohost.app/kunye/.env
sudo chown -R kunye:kunye /home/yunohost.app/kunye
sudo docker-compose up -d --force-recreate
```

Site ve admin girişi eskisi gibi çalışıyorsa `/root/kunye-tasima` klasörünü silebilirsiniz.

## 4. Yedekleme ve geri yükleme

```bash
# YunoHost yedeği (veritabanı + yüklenen görseller + ayarlar)
sudo yunohost backup create --apps kunye

# Geri yükleme (önce uygulamayı kaldırmanız gerekiyorsa: sudo yunohost app remove kunye)
sudo yunohost backup list
sudo yunohost backup restore <yedek-adı> --apps kunye
```

Ayrıca her gün otomatik bir veritabanı yedeği alınır: `/home/yunohost.app/kunye/backup/db-YYYYMMDD.db` (son 7 gün). Yedekler, çalışan veritabanından SQLite'ın çevrimiçi yedekleme özelliğiyle alınır, yani yazma sırasında da tutarlıdır.

Admin paneli → Ayarlar → "Tüm Ayarları Yedekle" ise profil, tema ve linkleri JSON olarak indirir. Başka bir kuruluma taşımak için kullanılabilir. Analitik, aboneler ve yüklenen görseller bu dosyada yoktur.

## Veriler nerede?

| Yol | İçerik |
|---|---|
| `/home/yunohost.app/kunye/prisma/dev.db` | Veritabanı (profil, linkler, analitik, aboneler, admin) |
| `/home/yunohost.app/kunye/uploads/` | Yüklenen görseller |
| `/home/yunohost.app/kunye/.env` | JWT anahtarı (kurulum sihirbazı oluşturur) |
| `/home/yunohost.app/kunye/backup/` | Günlük otomatik veritabanı yedekleri |
| `/opt/yunohost/kunye/` | Uygulama kodu ve `docker-compose.yml` (güncellemede yeniden oluşturulur) |

## Sorun giderme

```bash
# Container durumu ve logları
sudo docker ps --filter name=kunye
sudo docker logs --tail 100 kunye

# Uygulama yanıt veriyor mu?
curl -s http://127.0.0.1:$(sudo yunohost app setting kunye port)/api/health

# Container'ı yeniden başlat
cd /opt/yunohost/kunye && sudo docker-compose restart
```

- **Admin şifresini unuttum:** Şifre veritabanında hash'li tutulur. Sıfırlamak için `Admin` tablosundaki kaydı silip `/setup` sihirbazını yeniden çalıştırın:
  ```bash
  sudo docker exec kunye node -e "new (require('better-sqlite3'))('/app/prisma/dev.db').exec('DELETE FROM Admin')"
  ```
  Ardından `https://<domain>/setup` açın. Linkler, analitik ve aboneler korunur. Sihirbazın profil adımında boş bıraktığınız alanlar değişmez.
  Çok eski bir kurulumdan geliyorsanız ve `/home/yunohost.app/kunye/.env` içinde `ADMIN_PASSWORD=` satırı varsa, onu da silip `sudo docker restart kunye` çalıştırın.
  Bu işlem iki adımlı doğrulamayı da kapatır.
- **İki adımlı doğrulamada telefonumu kaybettim:** Girişte kod yerine kurtarma kodlarından birini yazın. Kurtarma kodlarınız da yoksa yalnızca iki adımlı doğrulamayı kapatın (şifreniz değişmez):
  ```bash
  sudo docker exec kunye node -e "new (require('better-sqlite3'))('/app/prisma/dev.db').exec(\"UPDATE Admin SET totpSecret='', totpRecovery=''\")"
  ```
- **Kurulumdan sonra sayfa açılmıyor:** İmaj derlemesi uzun sürmüş olabilir. `docker logs` çıktısında `Ready` satırını bekleyin.
- **E-posta gitmiyor:** Gmail için normal şifre değil "uygulama şifresi" gerekir (port 587, Secure kapalı).

## Bir güncellemeyi geri alma

Her değişiklik bu repoya bir pull request (PR) ile gelir. Bir güncelleme sorun çıkarırsa:

1. GitHub'da o PR'ın sayfasını açın, altta **Revert** butonuna basın; açılan geri alma PR'ını birleştirin.
2. Sunucuda güncellemeyi yeniden çalıştırın:
   ```bash
   sudo yunohost app upgrade kunye -u https://github.com/rraeyz/kunye_ynh --force
   ```

Veritabanına eklenen yeni kolonlar geri almada silinmez; eski sürüm onları yok sayar, veriler korunur.
Daha eski bir duruma dönmek için YunoHost yedeğini de kullanabilirsiniz (bkz. "Yedekleme ve geri yükleme").
