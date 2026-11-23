---
description: Gündem, büyüme ve AI video tarama ajanlarını paralel çalıştırıp tek bir kısa haftalık rapor hazırlar
argument-hint: [isteğe bağlı odak, ör. "uzay gizemleri"]
---

Üç araştırma ajanını **aynı anda (paralel)** çalıştır:

1. `gundem-arastirmaci`
2. `kanal-buyume-stratejisti`
3. `ai-video-tarayici`

Kullanıcı bir odak verdiyse her ajana ilet: $ARGUMENTS

Hepsi bitince `research/` klasöründeki üç raporu oku ve
`research/<YYYY-AA-GG>-haftalik-ozet.md` dosyasına **en fazla 15 satırlık**
birleştirilmiş özet yaz (telefonda tek ekran):

- **Bu haftanın 10 konusu:** 7 short + 3 uzun video; her biri tek satır:
  konu — kanca cümlesi.
- **Bu hafta yapılacak 2 şey** (kanal büyütme)
- **1 risk uyarısı** (varsa)

Raporları commit edip push et. Sonra kullanıcıya aynı kısa özeti ver ve
önerilen konuları `topics.txt` dosyasına eklemeden önce onay iste.
