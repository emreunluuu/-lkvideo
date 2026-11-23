# Otomatik Video Üretim Sistemi — Proje Kuralları

Bu depo; Instagram Reels, TikTok, YouTube Shorts ve YouTube uzun videoları için
Türkçe, merak uyandıran, 3D animasyonlu videoları otomatik üreten sistemdir.
Bu dosyadaki kurallar her oturumda geçerlidir.

## 1. Video türleri ve sıklık

| Tür | Format | Süre | Sıklık |
|---|---|---|---|
| Kısa (Shorts / Reels / TikTok) | Dikey 1080x1920, 30 fps | ~60 sn (55–65 sn) | Günde 1 |
| Uzun (YouTube) | Yatay 1920x1080, 30 fps | 8–10 dk | Haftada 3 (bkz. Açık sorular) |

- Uzun videolar en az 8 dk olmalı (video ortası reklam için).
- Uzun videodan ayrıca 3–4 kısa video kesilebilir; ama her kısa video kendi
  başına anlamlı bir hikâye ve kendi giriş kancası olmalı.

## 2. Görsel kalite

- 3D animasyon, profesyonel motion graphics kalitesi.
- Sinematik kamera hareketleri (dolly, orbit, crane), sis, ışık, derinlik.
- Kinetik tipografi: başlık girişleri, bilgi etiketleri (yıl, sayı, yer),
  sahne geçişlerinde whip/flash/zoom geçişleri.
- Renk düzenlemesi, vinyet, hafif film greni.
- Dikey videoda alt %20 ve sağ kenar platform arayüzü için boş bırakılır.

## 3. Dil, seslendirme ve altyazı

- Dil: Türkçe.
- Seslendirme: **Google Cloud Text-to-Speech**, **erkek, derin ses**.
  - Varsayılan: `tr-TR-Wavenet-E` (erkek). Daha doğal bir erkek sesi varsa
    (ör. Chirp3-HD), API'nin `voices.list` çıktısından kontrol edip onu kullan.
  - Konuşma hızı ~0.95, perde −2 (gizem/belgesel tonu).
  - API anahtarı ortam değişkeninden okunur: `GOOGLE_TTS_API_KEY`. Anahtarı asla
    koda veya depoya yazma.
- Altyazı: videoya gömülü (kelime kelime vurgulu, 2–4 kelimelik parçalar) ve
  ayrıca `.srt` dosyası olarak (YouTube'a yüklemek için).

## 4. Ses tasarımı (tamamen sentezlenir, telifli ses/müzik kullanılmaz)

- Arka plan atmosferi: konuya uygun drone/pad (ör. İstanbul için Hicaz makamı
  tınısı), rüzgâr/deniz dokusu.
- Geçişler: whoosh, riser.
- Vurgular: impact/boom (başlık girişleri), shimmer (bilgi etiketleri).
- Seslendirme konuşurken müzik otomatik kısılır (ducking).
- Final miks: −14 LUFS (YouTube/TikTok standardı).

## 5. İçerik kuralları (YouTube para kazanma uyumu)

YouTube "inauthentic content" politikası, şablonla seri üretilmiş ve videodan
videoya az farklılık gösteren içerikleri para kazanmaya kapatır. Bu yüzden:

- Her video **farklı** olmalı: farklı sahneler, kamera kurgusu, renk paleti,
  müzik teması ve anlatım yapısı. Aynı şablonu sadece metni değiştirerek kullanma.
- Her senaryo özgün bir hikâye anlatmalı (giriş kancası → gelişme → sürpriz
  bilgi → kapanış/soru).
- Bilgiler doğru olmalı; tarih, sayı ve isimler kaynaktan doğrulanır. Efsaneler
  "rivayete göre" diye belirtilir.
- Yanıltıcı clickbait, korkutucu/rahatsız edici içerik, telifli görsel, müzik
  veya marka kullanılmaz.
- YouTube'a yüklerken "değiştirilmiş veya sentetik içerik" beyanı gerekiyorsa
  işaretlenir.

## 6. Merak uyandırma kuralları

- İlk 2 saniyede güçlü kanca (soru, şaşırtıcı bilgi veya gizem).
- Her 5–8 saniyede yeni bir bilgi veya görsel değişim.
- Kapanışta izleyiciye soru sor ("Sence…? Yorumlara yaz.").
- Başlık ve açıklama Türkçe arama alışkanlıklarına göre yazılır; 3–5 hashtag.

## 7. Yayınlama: onaydan sonra otomatik

1. Sistem videoyu, kapak görselini, başlığı, açıklamayı, etiketleri ve `.srt`
   dosyasını `output/<tarih>-<konu>/` klasörüne üretir.
2. Kullanıcı videoyu izler ve onaylar. **Onay olmadan hiçbir şey yayınlanmaz.**
3. Onaydan sonra yüklenir:
   - YouTube: YouTube Data API v3 (OAuth; bilgiler `YOUTUBE_*` ortam değişkenlerinde).
   - Instagram: Instagram Graph API (profesyonel hesap gerekir).
   - TikTok: Content Posting API (TikTok geliştirici onayı gerekir).
   API erişimi olmayan platform için video dosyası elle yüklemeye hazır bırakılır.

## 8. Konu sırası

- Konular `topics.txt` dosyasından sırayla alınır.
- İlk video: **İstanbul'un gizemi ve güzellikleri**.

## 9. Teknik notlar

- Gizli anahtarlar sadece ortam değişkenlerinde veya GitHub Secrets'ta tutulur.
- Üretilen video dosyaları (`output/`) depoya commit edilmez.

## Açık sorular

- "Haftada 3" uzun video mu, yoksa ek kısa video mu? Kullanıcıdan teyit edilecek.
