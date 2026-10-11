# Yol haritası

Sıra: önce kolay ve kısa işler, en sonda uzun ve hata çıkarmaya yatkın olanlar. Her adım ayrı commit'lenir
ve testten geçer; oturum yarıda kalırsa bir sonraki işaretsiz adımdan devam edilir.

## Aşama 1: kolay ve kısa
- [x] 1.1 Liste blokları: ayırıcı/bölüm başlığı, beceri rozetleri, kupon kodu (kopyala), referanslar, SSS, zaman çizelgesi
- [x] 1.2 Ürün kartı (fiyat), harita (OpenStreetMap, API anahtarı gerekmez)
- [x] 1.3 "Bu hafta / şu an" duyuru kutusu, ziyaretçi sayacı, bakım modu
- [x] 1.4 İletişim formuna otomatik yanıt, yeni aboneye hoş geldin e-postası
- [ ] 1.5 Blok kopyalama

## Aşama 2: orta
- [ ] 2.1 Bağış bloğu (Shopier, Buy Me a Coffee, Ko-fi, Patreon...; birden fazlası birlikte)
- [ ] 2.2 Sayfa içi arama
- [ ] 2.3 Toplu düzenleme (çoklu seçim: gizle, sil, kategori)
- [ ] 2.4 Linke tarihli hatırlatma notu
- [ ] 2.5 Gerçek zamanlı ziyaretçi ("şu an X kişi")
- [ ] 2.6 Planlanmış bülten gönderimi
- [ ] 2.7 Mesajlara panelden yanıt + konuşma geçmişi
- [ ] 2.8 Kısa link yönetimi (/go linkleri, QR, tıklama)
- [ ] 2.9 Aylık rapor (yazdırılabilir sayfa → PDF)

## Aşama 3: büyük veya riskli
- [ ] 3.1 Anket bloğu
- [ ] 3.2 Ziyaretçi defteri (onaylı yorumlar, spam koruması)
- [ ] 3.3 Abone CSV içe aktarma ve etiketler
- [ ] 3.4 İndirilebilir dosya bloğu (CV, PDF) + indirme sayısı
- [ ] 3.5 GitHub depoları bloğu
- [ ] 3.6 Hazır sayfa şablonları
- [ ] 3.7 Blok tıklama haritası
- [ ] 3.8 İki dilli sayfa (TR/EN)
- [ ] 3.9 Canlı yayın durumu (Twitch/YouTube; geliştirici anahtarı ister)
- [ ] 3.10 API anahtarı + kullanım eğitimi

## Bekleyen, istenmemiş güvenlik notları
- Docker kurulumunda kurulum anahtarı (SETUP_TOKEN) üretilmiyor
- 3000 portu doğrudan açıksa X-Real-IP başlığına güveniliyor (deneme sınırı aşılabilir)
