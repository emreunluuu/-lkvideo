---
description: Gündem, büyüme ve AI video tarama ajanlarını paralel çalıştırıp tek bir haftalık rapor hazırlar
argument-hint: [isteğe bağlı odak, ör. "uzay gizemleri"]
---

Üç araştırma ajanını **aynı anda (paralel)** çalıştır:

1. `gundem-arastirmaci`
2. `kanal-buyume-stratejisti`
3. `ai-video-tarayici`

Kullanıcı bir odak verdiyse her ajana ilet: $ARGUMENTS

Hepsi bitince `research/` klasöründeki üç raporu oku ve
`research/<YYYY-AA-GG>-haftalik-ozet.md` dosyasına birleştirilmiş özet yaz:

- **Bu haftanın 10 video önerisi:** 7 short + 3 uzun video. Her biri için konu,
  ilk 2 saniyenin kanca cümlesi, neden şimdi, hangi rapordan geldiği.
- **Kanal için en önemli 3 aksiyon**
- **Riskler** (para kazanma, telif, yanlış bilgi)

Sonra kullanıcıya kısa bir özet ver ve önerilen konuları `topics.txt`
dosyasına eklemeden önce onay iste.
