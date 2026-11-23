# İlk Video — Otomatik 3D Video Üretim Sistemi

Türkçe, merak uyandıran, 3D animasyonlu Shorts/Reels/TikTok ve uzun YouTube
videoları üretir. Kurallar: [CLAUDE.md](CLAUDE.md).

## Hızlı başlangıç

```bash
pip install -r requirements.txt          # numpy, scipy, playwright
python3 -m playwright install chromium   # Chrome kuruluysa gerekmez

# Seslendirme için (isteğe bağlı; yoksa video sessiz anlatımla üretilir)
export GOOGLE_TTS_API_KEY=...            # asla depoya yazma

python3 pipeline/build.py videos/istanbul-gizemi/script.json            # tam video
python3 pipeline/build.py videos/istanbul-gizemi/script.json --stills   # 15 sn'de kontrol kareleri
python3 pipeline/build.py videos/istanbul-gizemi/script.json --draft    # yarım çözünürlük önizleme
python3 pipeline/build.py videos/istanbul-gizemi/script.json --format horizontal  # 16:9
```

Çıktı: `output/<tarih>-<id>-<format>/` → video `.mp4`, `.srt` altyazı,
`kapak.jpg`, `yayin.json` (başlık/açıklama/etiket, `approved: false`), kontrol kareleri.

## Yapı

| Dosya | Görev |
|---|---|
| `engine/render.html` | Bağımlılıksız WebGL2 3D motoru, sahne kütüphanesi, motion graphics ve altyazı katmanı |
| `pipeline/build.py` | Senaryo → seslendirme → zaman çizelgesi → render → miks → çıktı |
| `pipeline/tts.py` | Google Cloud Text-to-Speech (REST) |
| `pipeline/audio.py` | Sentezlenmiş ses tasarımı: makam tabanlı atmosfer, telli çalgı, ritim, whoosh, impact, riser, shimmer, ducking |
| `pipeline/render.py` | Headless Chrome ile kare yakalama → ffmpeg |
| `videos/<id>/script.json` | Video senaryosu |

## Senaryo formatı (`script.json`)

- `scenes[]`: `kind` (sahne), `cam` (kamera hareketi), `narration` (seslendirme metni),
  isteğe bağlı `title` (büyük başlık), `label` (yer etiketi), `chip` (sayı/bilgi etiketi), `sfx`.
- `music`: `scale` (hicaz, kurdi, nihavent, rast, ussak), `root` (Hz), `tempo`.
- `grade`, `accent`, `seed`: her videoya özgü renk ve görünüm.
- Sahne süreleri seslendirme uzunluğundan otomatik hesaplanır.

Mevcut sahneler: `city_night` (flyin, reveal), `cistern` (dolly, low), `hagia` (orbit, rise),
`galata` (crane), `maiden` (orbit). Yeni konular için `engine/render.html` içindeki
`SCENES` nesnesine yeni sahneler eklenir.
