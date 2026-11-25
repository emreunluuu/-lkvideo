---
name: kanal-hafizasi
description: Kanalın geçmiş kararlarını, "Dosya" serisi şablonunu, Dosya #001 (Wow! sinyali) durumunu ve çalışma ortamı notlarını tek yerde özetler. Yeni oturumda geçmişi tekrar okumadan devam etmek, yeni "Dosya #00X" videosu planlamak veya "nerede kalmıştık?" sorusu için kullan.
---

# Kanal hafızası (kısa özet — eski sohbetleri yeniden okuma, bunu kullan)

Son güncelleme: 2026-11-25. Yeni bir karar alındığında bu dosyanın ilgili satırını
güncelle ve commit et (kısa tut, ≤ 120 satır).

## 1. Seri: "GİZLİ ARŞİV — DOSYA #00X"
- Kanalın ana kısa video formatı. Her video bir "dosya": bir gizem, belgesel tonu, abartısız.
- Dikey 1080x1920, 30 fps, ~60 sn. Alt %20 ve sağ kenar boş (platform arayüzü).
- Anlatı iskeleti (Dosya #001'den):
  1. Kanca: büyük tarih + saat/yer etiketi + konuya özgü canlı animasyon
  2. Dosya açılışı: kilitli kraft "GİZLİ ARŞİV" klasörü açılır, daktiloyla "DOSYA #00X — BAŞLIK"
  3. Kanıt sahnesi: belge/çıktı, kırmızı kalemle işaretleme, büyük anahtar ifade
  4. Gelişme: bölüm başlıkları (ör. ARAYIŞ, SESSİZLİK) + tek cümlelik italik yazılar
  5. Açıklama/hipotez: bilimsel diyagram animasyonu
  6. Hüküm: daktilo dosya kartı + kırmızı mühür "tak" (ÇÖZÜLDÜ / KISMEN ÇÖZÜLDÜ / ÇÖZÜLEMEDİ)
  7. Kapanış: "Sıradaki dosyayı sen seç." A/B kartları + "Yorumlara yaz."
- Görsel dil (sabit kimlik): koyu zemin; altın/krem italik serif büyük yazı; aralıklı büyük
  harf küçük etiketler (Montserrat); daktilo (Courier Prime); kraft kâğıt; kırmızı vurgu;
  film greni + vinyet + eskitme; yavaş zoom/pan/parallax, ölçülü whip/flash.
- Değişmesi zorunlu olanlar (YouTube "inauthentic content"): sahneler, kanıt görselleri,
  renk tonu, müzik teması, anlatım yapısındaki ayrıntılar.
- Fontlar: `engine/fonts/` (OFL): CormorantGaramond-Italic, EBGaramond-Italic,
  PlayfairDisplay-Italic, Montserrat, CourierPrime-Bold.

## 2. Kullanıcının standart promptu (her dosyada geçerli)
Klasördeki görselleri ve sesi kullan; Reels/TikTok/Shorts'a uygun. Sinematik yazı tipi,
vinyet, eskitme; özgün görünsün; gizemli ama abartısız. Akıcı belgesel animasyonları.
Görsellerin dışında konuyu destekleyen animasyonlar üret. Belgesele uygun, çarpıcı italik
font. Müzik ve efektleri kendin sentezle. Videoyu kodla ve render et.
**Kullanıcının verdiği sahne yapısı, araştırma önerilerinden önce gelir.**

## 3. Kalıcı kalite kuralları (Dosya #001'de bulunan hatalardan)
- Türkçe İ/ı harf aralığı bozulmasın ("SİNY ALİ", "du yulmadı" hatası). Kontrol karelerinde bak.
- İnternetten alınmış/telifli görsel yok (fotoğraf, gravür). Kullanıcının görselleri veya
  kodla çizim. Konuyla ilgisiz görsel koyma; kenarda siyah şerit bırakma.
- Nesneleri doğru çiz (ör. Big Ear çanak değil, düz yansıtıcılı teleskoptu).
- Kartlar/etiketler güvenli alanda; yazı animasyonu yarıda kesik kalmasın.
- Bilgiler `bilgi-dogrulayici` ile doğrulanır; kesin olmayan hipotez "olabilir" diliyle.

## 4. Dosya durumu
| Dosya | Konu | Durum |
|---|---|---|
| #001 | Wow! sinyali (15.08.1977, Big Ear, 6EQUJ5, 1420 MHz, Yay; 2024 magnetar+hidrojen bulutu hipotezi) | İlk sürüm claude.ai'de yapıldı (depoda yok). Yeniden üretim görevi: `DOSYA-001-gorev.md`. Yerel oturumda yapılacak. |
| #002 | Aday A: Roma Onikiyüzlüsü · Aday B: Muamma | #001 kapanışında izleyiciye soruluyor; seçilmedi. |

- "Muamma": claude.ai'de "Muamma — Logo Taslakları" artifact'i var; kanal adı mı konu mu,
  kullanıcıya teyit ettir.
- Eski İstanbul işi: `videos/istanbul-gizemi/` (3D şehir motoru, `engine/render.html`) ve
  ayrı bir dal `claude/istanbul-mystery-video-system-ds7psn` (başka motor). Dosya serisi bunlardan
  bağımsız 2D/motion-graphics yaklaşımı ister; hangisinin temel alınacağı henüz kararlaştırılmadı.

## 5. Çalışma ortamı notları
- Görseller ve ses kullanıcının bilgisayarında, **"VİDEO İÇERİK"** klasöründe (bilgisayar: EMRE).
- Bulut oturumu bu klasöre Remote Control ile bağlanamadı (not_available). Video işleri
  Claude masaüstü uygulaması → Code → yerel klasör oturumunda yapılır.
- Bulutta GPU yok, `GOOGLE_TTS_API_KEY` tanımlı değil (sessiz anlatım + altyazı olur).
- Çalışma dalı: `claude/modest-gauss-4kfa2a`.
- Senaryoyu sohbette değil, doğrudan Claude Code'da yazdır (`videos/<id>/` + doğrulama).

## 6. Kullanıcı tercihleri
- Türkçe, kısa ve net cevaplar; gereksiz tekrar/okuma ile kredi harcanmasın.
- Onay olmadan hiçbir platforma yükleme yok.
