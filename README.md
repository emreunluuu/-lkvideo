# Otomatik Video Üretim Sistemi

Instagram Reels, TikTok, YouTube Shorts ve YouTube uzun videoları için **Türkçe, merak uyandıran,
3D animasyonlu** videoları otomatik üreten sistem. Kurallar: [`CLAUDE.md`](CLAUDE.md).

```
topics.txt ──► generate_script (Claude + web doğrulama) ──► content/scripts/<id>.json   ◄── insan kontrol eder
                                                                   │
                                                                   ▼
              produce:  Google TTS ─► zaman çizelgesi ─► 3D render (Three.js, headless Chromium)
                                     │                  └► kinetik tipografi + kelime kelime altyazı
                                     └► ses tasarımı (sentez: makam drone/ney/bendir, ortam, whoosh/riser/impact/shimmer)
                                         └► ducking + −14 LUFS miks
                                                                   │
                                                                   ▼
              output/<tarih>-<id>/  video.mp4 · kapak.jpg · altyazi.srt · metadata.json · aciklama.txt · rapor.json
                                                                   │
                                     İNSAN İZLER VE ONAYLAR (onay yoksa yayın yok)
                                                                   ▼
              publish:  YouTube Data API v3 · Instagram Graph API (Reels) · TikTok Content Posting API
```

## Kurulum

```bash
sudo apt-get install -y ffmpeg            # önizleme sesi için ayrıca: espeak-ng mbrola mbrola-tr1
pip install -r requirements.txt
npm install                               # three.js
npm i -g playwright && npx playwright install chromium   # render için headless Chromium
```

Gizli bilgiler **yalnızca ortam değişkenlerinde** (yerelde `.env`, CI'da GitHub Secrets) tutulur:

| Değişken | Ne için |
|---|---|
| `GOOGLE_TTS_API_KEY` | Google Cloud Text-to-Speech (seslendirme) |
| `ANTHROPIC_API_KEY` | Yeni konu için senaryo taslağı (isteğe bağlı) |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | YouTube yükleme (OAuth) |
| `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN` | Instagram Reels (profesyonel hesap) |
| `TIKTOK_ACCESS_TOKEN` | TikTok (geliştirici uygulaması + `video.publish` onayı) |

## Kullanım

```bash
# 1) Video üret (Google TTS ile)
python -m pipeline.produce content/scripts/istanbul-gizemi.json --tts google

#    Hızlı kontrol: sadece her sahneden birer kare
python -m pipeline.produce content/scripts/istanbul-gizemi.json --stills-only
#    Görüntüyü koruyup yalnızca sesi yeniden üret
python -m pipeline.produce content/scripts/istanbul-gizemi.json --audio-only

# 2) İzle, sonra onayla ve yükle
python -m pipeline.publish output/2026-11-23-istanbul-gizemi --approve
python -m pipeline.publish output/2026-11-23-istanbul-gizemi --upload youtube,instagram,tiktok

# Sıradaki konu
python -m pipeline.generate_script --next      # taslak senaryo + kaynaklar (kontrol edin!)
python -m pipeline.produce --next
```

GitHub Actions (`.github/workflows/uret-ve-yayinla.yml`) her gün videoyu üretip Artifacts'a koyar; yayın
adımı **`yayin` ortamının onaylayıcısı** videoyu izleyip onaylamadan çalışmaz (Settings → Environments →
`yayin` → Required reviewers).

## Senaryo biçimi

`content/scripts/<id>.json` — her segment: anlatım metni, 3D sahne türü + parametreleri, geçiş türü,
başlık, bilgi etiketleri (metindeki bir kelimeye zamanlanır), ortam sesleri. Ayrıca renk düzenlemesi
(`grade`), vurgu rengi, müzik (`makam`, `root`, `bpm`, katmanlar) ve yayın bilgileri. Sayılar anlatımda
yazıyla yazılır ("üç yüz otuz altı"), ekranda rakamla gösterilir.

## Sahne kütüphanesi (`renderer/scenes/`)

| Tür | İçerik |
|---|---|
| `cistern` | 12×28 = 336 sütunlu yer altı sarnıcı, su yansıması, sıcak taban ışıkları, damla halkaları |
| `medusa` | Prosedürel taş Medusa başları (baş aşağı / yan) |
| `strait_map` | Stilize 3D harita: kıtalar, şehir ışıkları, ışıkla çizilen boğaz hattı |
| `currents` | Boğaz kesiti: zıt yönlü yüzey/dip akıntıları (parçacıklar) |
| `hagia` | Ayasofya (stilize), 55 m ölçü çizgisi, martılar, gün batımı |
| `maiden` | Kız Kulesi, gün batımı denizi, efsane izi |
| `skyline` | Tarihi yarımada silueti, Galata, asma köprü |

Her şey kodla üretilir (telifli model/görsel/müzik yok). Yeni konular için yeni sahne türleri eklenmeli;
YouTube'un "inauthentic content" politikası gereği her video farklı sahne, kurgu, renk ve müzik kullanmalı.

## Teknik

- Render: Three.js sahneleri, bloom, FXAA, ACES ton eşleme, renk düzenlemesi, vinyet, film greni,
  kromatik sapma; whip / zoom / flash / dip geçişleri; kare kare deterministik (Chromium + SwiftShader, GPU gerekmez).
- Dikey videoda alt %20 ve sağ kenar platform arayüzü için boş bırakılır.
- Ses: 48 kHz, tamamı numpy/scipy ile sentez; seslendirme konuşurken müzik ~8 dB kısılır; −14 LUFS, −1 dBTP.
