# MUAMMA — İHBAR #01: Var Olmaması Gereken Kara Delik (devir notu)

Bu dosya, kullanıcının verdiği senaryo/brief'in birebir özetidir. Yeni oturum buradan devam eder.

## Durum (2026-11-27)
- Seslendirme: **ElevenLabs** (Google değil). Anahtar `ELEVENLABS_API_KEY` ortam değişkeninden okunacak.
  - Network secret olarak denendi; proxy `Authorization: Bearer` gönderdi, ElevenLabs reddetti
    (`xi-api-key` başlığı gerekiyor). Bu yüzden ortam değişkeni kullanılıyor.
  - Yapılacak: `pipeline/tts.py`'ye ElevenLabs desteği (model `eleven_multilingual_v2`,
    `/v1/text-to-speech/{voice_id}/with-timestamps` → karakter hizalamasından kelime zamanlaması).
    Ses: derin erkek; kullanıcıya `GET /v1/voices` listesinden öner.
- Abone yorumu fotoğrafı kullanıcı tarafından yüklenecek. Gönderen: `@oziboaydıno`.
- Senaryo henüz `bilgi-dogrulayici`'dan GEÇMEDİ (zorunlu).
- Kullanıcı süreyi kısaltmaya izin verdi (hedef ~45–55 sn).
- Kanal geri bildirimi (Dosya 003 incelemesinden): ilk 2 sn'de olay, yüksek kontrast vurgu,
  başlıkta anahtar kelime başta, 3–5 hashtag, okunaklı büyük etiketler (üst kenardan uzak).

## Görsel kimlik (kanalın diğer videolarıyla aynı)
- Zemin: koyu siyah/lacivert uzay. Açılış ve kapanışta kraft kâğıt dosya dokusu.
- Renkler: kraft bej `#D4B483`, damga kırmızısı `#C8102E`, kirli beyaz metin `#F2EDE4`, arka plan `#0E0E10`.
- Fontlar: tarih/başlık serif italik ("15.08.1977" stili); etiketler aralıklı büyük harf daktilo/mono.
  Yerelde yok → OFL fontları (örn. npm `@fontsource/playfair-display`, `@fontsource/special-elite`
  veya `ibm-plex-mono`) `engine/fonts/` altına konup @font-face ile yüklenmeli.
- Vurgu: her sahnede en fazla BİR kelime kırmızı (altyazı karaoke vurgusu kırmızı olmamalı).
- Ses: alçak drone ambiyans; 0,1 sn sinyal anında keskin "tık" + sub-bass darbesi; damga sesi.

## Sahneler
1. KANCA (0–3 sn) — Üst etiket `İHBAR #01 · KARA DELİK`; ortada serif italik `23.11.2023`;
   altında mono `13:54 UTC · LIGO, ABD`; alt yazı "Var olmaMAMASI gereken kara delik" (MAMASI kırmızı).
   Görsel: siyah, ince yıldız tozu, ortada karanlık boşluk ve bükülen ışık halkası.
   VO: "Bu kara delik var olmamalıydı. Ama 2023'te, uzay-zamanı titretti."
2. İHBAR (3–7) — kraft dosya kapağı kayar, kırmızı damga `İHBAR` (sarsıntı), `Gönderen: @oziboaydıno`
   (+ yorum fotoğrafı). VO: "Bu dosya bir ihbarla geldi. Gönderen: @oziboaydıno."
3. OLAY (7–15) — `LIGO HANFORD · WASHINGTON`, `LIGO LIVINGSTON · LOUISIANA`, sonra `SÜRE: 0,1 SANİYE`.
   Görsel: iki L-şekilli dedektör tüneli, karanlık sade 3B; ikisinde aynı anda yükselip kaybolan dalga.
   VO: "23 Kasım 2023. ABD'deki iki dev dedektör, aynı anda bir titreşim yakaladı. Sadece saniyenin onda biri sürdü."
4. KAYNAK (15–24) — `~140 GÜNEŞ KÜTLESİ` + `~100 GÜNEŞ KÜTLESİ` → `= 225`.
   Görsel: iki karanlık küre hızlanarak döner, birleşir; beyaz flaş + sarsıntı.
   VO: "Kaynağı: milyarlarca ışık yılı ötede çarpışan iki kara delik. Biri Güneş'in yaklaşık yüz kırk,
   diğeri yüz katı. Birleştiklerinde ortaya Güneş'in iki yüz yirmi beş katı bir canavar çıktı."
5. SORUN (24–36) — kütle cetveli `0 —— 60 ██████ 130 —— 250`, 60–130 kırmızı taralı, damga `YASAK BÖLGE`;
   iki kara delik ikonu bu bölgeye düşer. Görsel: dev yıldız şişer, kendini parçalar, geride hiçbir şey kalmaz.
   VO: "Ama asıl sorun başka. Fiziğe göre, Güneş'in altmış ile yüz otuz katı arasındaki kara delikler
   yıldızlardan doğamaz. O kadar büyük yıldızlar öldüğünde kendini tamamen parçalar. Geride hiçbir şey
   bırakmaz. Bu iki kara delik, tam o yasak bölgede."
6. İKİNCİ İPUCU (36–44) — `DÖNÜŞ HIZI: DÜNYA'NIN ~400.000 KATI`. Görsel: hızla dönen kara delik, girdap ışık.
   VO: "Üstelik ikisi de Einstein'ın izin verdiği sınıra yakın bir hızla dönüyordu. Dünya'nın dönüşünden
   yaklaşık dört yüz bin kat hızlı."
7. TEORİ (44–52) — polaroid gibi soy ağacı: altta küçük kara delikler ikişer birleşir, tepede `GW231123?`.
   VO: "En güçlü teori şu: Bunlar ilk kuşak değil. Daha önce birleşmiş kara deliklerin çocukları olabilirler.
   Yani kara delikler, başka kara delikler doğurmuş olabilir."
8. KAPANIŞ (52–60) — dosyaya kırmızı damga `ÇÖZÜLMEDİ`; `Sıradaki ihbar senden → yorumlara yaz`;
   dosya kapanır, kamera anahtar deliği logosuna yaklaşır, kararır.
   VO: "Bilim insanları bu sinyali çözmenin yıllar alacağını söylüyor. Dosya hâlâ açık. Sıradaki ihbar sizden. Yorumlara yazın."

## Yükleme bilgileri
- Başlık: Var Olmaması Gereken Kara Delik 🕳️ | İhbar #01
- Açıklama: "23 Kasım 2023'te LIGO, fiziğin izin vermediği iki kara deliğin çarpışmasını yakaladı. Bu dosya
  bir abonemizin ihbarıyla açıldı. Sıradaki dosyayı sen seç: yorumlara yaz. 📁"
  #karadelik #uzay #bilim #muamma #çözülmemişdosyalar
- Sabitlenmiş yorum: "İhbar hattı açık. 📁 Hangi gizemi açalım?"

## Kullanıcının bilgi notları (doğrulanacak)
- 23 Kasım 2023, 13:54:30 UTC; LIGO Hanford + Livingston. Sinyal ~0,1 sn.
- Kütleler ~140 ve ~100 M☉; son kara delik ~225 M☉ (toplam 190–265 aralığı).
- Mesafe 2–13 milyar ışık yılı (belirsiz → "milyarlarca ışık yılı").
- Dönüş: azami hızın %80–90'ı, Dünya'nın dönüşünün ~400.000 katı.
- Yasak bölge: çift-kararsızlık süpernovaları, ~60–130 M☉.
- Teori: hiyerarşik birleşme.
- Kaynaklar: LIGO Caltech basın bülteni (15 Tem 2025), ligo.org GW231123 bilim özeti,
  arXiv:2507.08219, Birmingham Üniversitesi bilgi notu.
