# Docker ile Kurulum

YunoHost kullanıyorsanız [YUNOHOST-KURULUM.md](YUNOHOST-KURULUM.md) dosyasına bakın. Bu kılavuz, herhangi bir Linux sunucuda Docker ile kurulum içindir.

**Gereksinimler:** Docker ve Docker Compose (`docker compose` eklentisi veya `docker-compose`), ~1 GB RAM (build sırasında).

## Kurulum

```bash
git clone https://github.com/rraeyz/kunye_ynh.git linktree
cd linktree
./start.sh
```

`start.sh` şunları yapar: `.env` dosyasını oluşturur, imajı derler, container'ı başlatır ve uygulama hazır olana kadar bekler. Aynı işi elle yapmak için:

```bash
touch .env                 # kurulum sihirbazı ayarlarını buraya yazar (yoksa Docker klasör oluşturur!)
docker compose up -d --build
```

Ardından `http://sunucu-ip:3000/setup` adresini açıp admin kullanıcısını ve profilinizi oluşturun. Panel `/admin` adresindedir.

## Veriler

| Yer | İçerik |
|---|---|
| `db-data` volume → `/app/prisma/dev.db` | Veritabanı |
| `uploads` volume → `/app/public/uploads` | Yüklenen görseller |
| `./.env` → `/app/.env` | JWT anahtarı (sihirbaz oluşturur; silerseniz oturumlar ve "abonelikten çık" linkleri geçersiz olur) |

## Alan adı ve HTTPS (nginx örneği)

Uygulamayı doğrudan internete açmak yerine önüne HTTPS'li bir ters proxy koyun. Aşağıdaki başlıklar önemlidir. Uygulama site adresini (sosyal medya önizlemeleri, e-posta linkleri) ve HTTPS kullanılıp kullanılmadığını (güvenli cookie) bu başlıklardan anlar.

```nginx
server {
    server_name link.ornek.com;
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # listen 443 ssl; ve sertifika satırlarını certbot ekler:
    #   sudo certbot --nginx -d link.ornek.com
}
```

> Proxy kullanıyorsanız `docker-compose.yml` içindeki port satırını `"127.0.0.1:3000:3000"` yapın. Böylece uygulama yalnızca proxy üzerinden erişilebilir olur ve ziyaretçi IP başlıkları taklit edilemez.

## Güncelleme

```bash
git pull
docker compose up -d --build
```

Açılışta veritabanı şeması otomatik güncellenir (`db-migrate.js`, öncesinde `prisma/dev.db.before-migrate-<tarih>` yedeği alınır).

## Yedekleme

Çalışan veritabanını `cp` ile kopyalamayın; yazma anına denk gelirse yedek bozuk olabilir. Container içindeki yedekleme aracını kullanın:

```bash
# Tutarlı veritabanı yedeği
docker exec personal-linktree node /app/db-backup.js /app/prisma/backups/db-$(date +%Y%m%d).db
docker cp personal-linktree:/app/prisma/backups/db-$(date +%Y%m%d).db ./

# Yüklenen görseller
docker cp personal-linktree:/app/public/uploads ./uploads-yedek
```

Geri yüklemek için container'ı durdurun, yedeği `/app/prisma/dev.db` olarak volume'a kopyalayın ve yeniden başlatın.

## Sorun giderme

```bash
docker compose logs -f                      # loglar
curl http://localhost:3000/api/health       # {"status":"ok"} dönmeli
docker compose restart                      # yeniden başlat
```

- **Admin şifresini unuttum:**
  ```bash
  docker exec personal-linktree node -e "new (require('better-sqlite3'))('/app/prisma/dev.db').exec('DELETE FROM Admin')"
  ```
  Ardından `/setup` sihirbazını yeniden çalıştırın. Linkler, analitik ve aboneler korunur. Bu işlem iki adımlı doğrulamayı da kapatır.
- **İki adımlı doğrulamada telefonumu kaybettim:** Girişte kod yerine kurtarma kodlarından birini yazın. Kurtarma kodlarınız da yoksa yalnızca iki adımlı doğrulamayı kapatın (şifreniz değişmez):
  ```bash
  docker exec personal-linktree node -e "new (require('better-sqlite3'))('/app/prisma/dev.db').exec(\"UPDATE Admin SET totpSecret='', totpRecovery=''\")"
  ```
- **Port 3000 kullanımda:** `docker-compose.yml` içinde `"3001:3000"` gibi başka bir port verin.
- **`/app/.env` bir klasör olarak oluşmuş:** Container'ı durdurun, `rm -r .env && touch .env` çalıştırıp yeniden başlatın.
- **E-posta gitmiyor:** Gmail için "uygulama şifresi" kullanın (smtp.gmail.com, port 587, Secure kapalı).

Not: Uygulama yalnızca SQLite ile çalışır; PostgreSQL/MySQL desteklenmez.
