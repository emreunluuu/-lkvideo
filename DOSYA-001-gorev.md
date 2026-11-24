# GÖREV: DOSYA #001 — WOW! SİNYALİ videosunu yeniden üret

## 0) Hazırlık
- Bu depodasın; `claude/modest-gauss-4kfa2a` dalında çalış. CLAUDE.md kurallarına uy.
- `engine/fonts/` içinde OFL lisanslı fontlar hazır: CormorantGaramond-Italic, EBGaramond-Italic, PlayfairDisplay-Italic, Montserrat, CourierPrime-Bold.
- Kullanıcının "VİDEO İÇERİK" klasöründeki görselleri ve ses dosyasını önce listele, ne bulduğunu söyle. Hangisini hangi sahnede kullanacağını öner.
- Gerekli araçları kontrol et (Python, ffmpeg, Chrome/Playwright). Eksik olanı kurmadan önce sor.

## 1) Asıl prompt (birebir uy)
Bu klasördeki görselleri ve sesi kullanarak Reels, TikTok ve Shorts'a uygun bir video oluştur. Sinematik yazı tipi, vinyet ve eskitme efektleri olsun; içerik özgün görünsün, gizem içerikli videoma uygun olsun ama abartmayalım. Akıcı, belgesel tarzı animasyonlar istiyorum. Görsellerin dışında da konuyu destekleyen animasyonlar oluştur. Belgesele uygun italik bir font seç, aynı zamanda çarpıcı görünsün. Müzik ve ses efektlerini kendin sentezle. Videoyu kodla ve render et.

## 2) Format
- Dikey 1080x1920, 30 fps, ~60 sn (55–65).
- Alt %20 ve sağ kenar platform arayüzü için boş kalsın; hiçbir yazı/kart oraya taşmasın.

## 3) Sahne yapısı (kullanıcının yapısı, esas al)
1. Kanca (0–10 sn): Karanlıkta dönen radyo teleskobu, ekranda büyük "15.08.1977", altında "22:16 · OHIO, ABD", "BIG EAR · KANAL 2" etiketi ve canlı sinyal dalgası (kırmızı "SİNYAL ●").
2. Dosya açılışı: Kilitli "GİZLİ ARŞİV" kraft klasörü, kilit açılıyor, daktiloyla "DOSYA #001" yazılıyor, başlık "WOW! SİNYALİ", alt satır "GİZEMLİ RADYO SİNYALİ · 1977".
3. Çıktı sahnesi: Delikli bilgisayar kâğıdında daktilo tarzı akan rakam/harfler, 6EQUJ5 dizisi beliriyor, kırmızı kalemle elle çizilir gibi daire + "Wow!" yazısı, altında büyük "6EQUJ5".
4. Hidrojen frekansı ve arayış: 1420 MHz (hidrojen çizgisi) animasyonu; teleskopların gökyüzünü defalarca taraması; "SESSİZLİK — Sinyal bir daha hiç duyulmadı."
5. Magnetar: patlayan/parlayan yıldız, manyetik alan çizgileri, hidrojen bulutuna çarpan ışık, bulutun fener gibi parlaması, sinyalin Dünya'ya ulaşması ("2024 HİPOTEZİ").
6. Hüküm: Daktilo dosya kartı (KONU / TARİH / YÖN: YAY TAKIMYILDIZI / FREKANS: 1420 MHz / HİPOTEZ: MAGNETAR + HİDROJEN BULUTU) ve kırmızı mühür "tak" diye basılıyor: KISMEN ÇÖZÜLDÜ.
7. Kapanış: "Sıradaki dosyayı sen seç." — A: Onikiyüzlü, B: Muamma (DOSYA #002 ?) + "Yorumlara yaz."

## 4) Görsel dil (seri kimliği — koru)
- Koyu zemin, altın/krem renkte italik serif büyük yazılar, aralıklı büyük harf (Montserrat) küçük etiketler, daktilo fontu (Courier Prime), kraft kâğıt, kırmızı vurgu (kalem, mühür).
- Film greni, vinyet, eskitme; abartısız. Akıcı belgesel kamera hareketleri (yavaş zoom, pan, parallax), ölçülü whip/flash geçişleri.
- Her 5–8 saniyede yeni bir bilgi veya görsel değişim.

## 5) Önceki sürümün hataları (mutlaka düzelt)
- Türkçe İ/ı harflerinde harf aralığı bozuluyordu ("WOW! SİNY ALİ", "du yulmadı", "Oniki yüzlü"). Font Türkçe karakterleri desteklemeli; letter-spacing doğru uygulanmalı. Kontrol karelerinde bunu özellikle göster.
- Telif riski olan dış görselleri kullanma: internetten alınmış "WOW SİNYALİ" fotoğrafı, Roma onikiyüzlüsü fotoğrafı, antik gravür. Kullanıcının kendi görsellerini ya da kodla çizilmiş görselleri kullan. ARAYIŞ sahnesindeki gravür konuyla ilgisizdi ve solunda siyah şerit vardı.
- Big Ear çanak anten değildi; düz yansıtıcılı, futbol sahası büyüklüğünde bir radyo teleskobuydu. Doğru çiz.
- Kapanış kartları ve "DÜNYA" etiketi alt kenara çok yakındı; güvenli alana al.
- Yazı animasyonları yarıda kesik kalmasın (ör. "bir hidrojen bu…"); her cümle okunacak kadar ekranda kalsın.

## 6) Bilgiler (yazı/seslendirmeden önce bilgi-dogrulayici ile doğrula)
- 15 Ağustos 1977, ~22:16 (yerel saat), Big Ear radyo teleskobu, Ohio State Üniversitesi, Delaware/Ohio.
- Sinyal ~72 saniye sürdü; Jerry R. Ehman çıktıda fark edip kırmızı kalemle "Wow!" yazdı.
- 6EQUJ5 = sinyal yoğunluğunun zamana göre değişimi; "gürültünün ~30 kat üzerinde" ifadesini doğrula.
- Frekans ~1420 MHz (nötr hidrojen çizgisi), yön Yay takımyıldızı.
- Sonraki aramalarda bir daha tespit edilmedi.
- 2024 hipotezi (Abel Méndez ve ekibi): magnetar gibi bir kaynağın ışıması soğuk hidrojen bulutunu kısa süreli parlatmış olabilir. Kesinleşmiş değil → "KISMEN ÇÖZÜLDÜ" ve anlatımda "olabilir" dili.
- Uzaylı iddiasını kesin bilgi gibi sunma.

## 7) Ses
- Klasördeki ses dosyası seslendirmeyse onu kullan; altyazıları onunla senkronla (kelime kelime vurgulu, 2–4 kelimelik parçalar) ve .srt üret.
- Müzik ve efektleri tamamen sentezle: derin uzay drone'u/pad, radyo statiği, sinyal bip'i, daktilo tıkırtısı, kilit sesi, kâğıt hışırtısı, whoosh/riser, mühür "tak" sesi. Telifli ses yok.
- Seslendirme konuşurken müzik kısılsın (ducking). Final miks −14 LUFS.

## 8) Akış
1. Klasördeki dosyaları listele, sahne-görsel eşleşmesini ve kısa anlatım metnini öner.
2. bilgi-dogrulayici ile bilgileri doğrula.
3. Her sahneden kontrol kareleri üret, kullanıcıya göster (Türkçe harf aralığına özellikle bak).
4. Onaydan sonra tam render: `output/<tarih>-wow-sinyali/` içine video.mp4, kapak.jpg, .srt, başlık + açıklama + 3–5 hashtag.
5. Kodu depoya commit et (`output/` hariç). Onay olmadan hiçbir yere yükleme.
