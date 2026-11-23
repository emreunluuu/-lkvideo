"""Yeni konu için senaryo taslağı üretir (Claude API + web araması ile bilgi doğrulama).

    python -m pipeline.generate_script "Kapadokya'nın yer altı şehirleri"
    python -m pipeline.generate_script --next      # topics.txt'te senaryosu olmayan ilk konu

Çıktı content/scripts/<id>.json olarak yazılır. Senaryo her zaman insan onayından geçer;
üretilen dosyayı okuyup bilgileri kontrol etmeden videoya dönüştürmeyin.
Gerekli: `pip install anthropic` ve ANTHROPIC_API_KEY (veya `ant auth login`).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "content" / "scripts"
MODEL = "claude-opus-5-5"

SCENE_LIBRARY = {
    "cistern": "Yer altı sütunlu salon, su yansıması (params.shot: dolly|crane|low; glow, fog)",
    "medusa": "Taş heykel başları yakın çekim (anchors: head1, head2)",
    "strait_map": "Stilize 3B harita: iki kara arasında kıvrılan su yolu, şehir ışıkları (cues.draw; anchors: europe, asia, mid)",
    "currents": "Su kesiti: üstte ve altta zıt yönlü akıntılar (cues.surface, cues.deep; anchors: surface, deep)",
    "hagia": "Büyük kubbeli yapı + ölçü çizgisi, alacakaranlık (cues.measure; anchors: domeTop)",
    "maiden": "Denizde kule, gün batımı, kuleyi saran ışık izi (cues.legend; anchors: top)",
    "skyline": "Tepelerde kubbe ve minare siluetleri, deniz, gün batımı (final sahnesi)",
}

RULES = """Kurallar (CLAUDE.md'den):
- Dil Türkçe. Seslendirme metni toplam ~270-290 hece (≈55-60 sn kısa video). Sayıları YAZIYLA yaz ("üç yüz otuz altı").
- İlk cümle güçlü kanca (soru, şaşırtıcı bilgi veya gizem). Her 5-8 saniyede yeni bilgi/görsel.
- Yapı: kanca → gelişme → sürpriz bilgi → kapanış sorusu ("Sence …? Yorumlara yaz.").
- Bilgiler doğru olmalı: tarih, sayı ve isimleri web aramasıyla doğrula ve `sources` alanına kaynakları yaz.
  Efsaneleri "Rivayete göre" diye belirt. Yanıltıcı clickbait, korkutucu içerik, marka kullanma.
- YouTube "inauthentic content" politikası: önceki videodan FARKLI sahne sırası, kamera planı, renk düzeni
  (grade/accent), müzik (makam, bpm, katmanlar) ve anlatım yapısı seç. Örnek senaryoyu kopyalama.
- labels[].at, title.at, scene.cues değerleri o segmentin metninde birebir geçen bir kelime/ifade olmalı.
- Sadece verilen sahne türlerini kullan. Konuya uymayan sahne gerekiyorsa `needs_new_scenes` alanına açıkla.
- Başlık ve açıklama Türkçe arama alışkanlıklarına göre; 3-5 hashtag."""


def build_prompt(topic: str, example: dict, recent: list[dict]) -> str:
    prev = [{"id": r["id"], "makam": r.get("music", {}).get("makam"), "scenes": [s["scene"]["type"] for s in r["segments"]], "accent": r.get("accent")} for r in recent]
    return f"""Konu: {topic}

Mevcut 3B sahne kütüphanesi:
{json.dumps(SCENE_LIBRARY, ensure_ascii=False, indent=1)}

Müzik seçenekleri: makam ∈ hicaz, kurdi, nihavend, rast, ussak, huseyni; root nota; bpm 60-100; layers ⊂ drone,pad,ney,drum.
Ortam sesleri: cave, drips, sea, wind, gulls. Geçişler: whip, zoom, flash, dip, crossfade, cut.
Başlık stilleri: impact, cinematic, legend. Etiket stilleri: chip (slot tl|ml|bl), pin (anchor), map (anchor).

Son üretilen videolar (bunlardan farklı ol): {json.dumps(prev, ensure_ascii=False)}

{RULES}

Biçim örneği (yapıyı izle, içeriği kopyalama):
```json
{json.dumps(example, ensure_ascii=False, indent=1)}
```

Önce gerekli bilgileri web aramasıyla doğrula, sonra yalnızca tek bir ```json kod bloğu içinde tam senaryoyu ver."""


def validate(sc: dict) -> list[str]:
    from .produce import find_phrase  # noqa: E402
    from .tts import syllables

    errs = []
    for seg in sc.get("segments", []):
        if seg["scene"]["type"] not in SCENE_LIBRARY:
            errs.append(f"{seg['id']}: bilinmeyen sahne {seg['scene']['type']}")
        words = [{"w": w} for w in seg["text"].split()]
        phrases = [lb["at"] for lb in seg.get("labels", [])] + list(seg["scene"].get("cues", {}).values())
        if isinstance(seg.get("title", {}).get("at"), str):
            phrases.append(seg["title"]["at"])
        for ph in phrases:
            try:
                find_phrase(words, ph)
            except ValueError:
                errs.append(f"{seg['id']}: '{ph}' metinde yok")
    syl = sum(syllables(w) for s in sc.get("segments", []) for w in s["text"].split())
    if not 240 <= syl <= 310:
        errs.append(f"toplam hece {syl} (hedef 270-290)")
    return errs


def generate(topic: str) -> Path:
    import anthropic

    example = json.loads((SCRIPTS / "istanbul-gizemi.json").read_text(encoding="utf-8"))
    recent = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(SCRIPTS.glob("*.json"))[-3:]]
    client = anthropic.Anthropic()
    messages = [{"role": "user", "content": build_prompt(topic, example, recent)}]
    for attempt in range(3):
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high"},
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 10}],
            messages=messages,
        ) as stream:
            msg = stream.get_final_message()
        if msg.stop_reason == "refusal":
            sys.exit("Model isteği reddetti; konuyu gözden geçirin.")
        text = "".join(b.text for b in msg.content if b.type == "text")
        m = re.search(r"```json\s*(\{.*\})\s*```", text, re.S)
        if not m:
            messages += [{"role": "assistant", "content": msg.content}, {"role": "user", "content": "Lütfen senaryoyu tek bir ```json bloğu olarak ver."}]
            continue
        sc = json.loads(m.group(1))
        sc["topic"] = topic
        errs = validate(sc)
        if not errs:
            out = SCRIPTS / f"{sc['id']}.json"
            out.write_text(json.dumps(sc, ensure_ascii=False, indent=2), encoding="utf-8")
            return out
        messages += [{"role": "assistant", "content": msg.content},
                     {"role": "user", "content": "Doğrulama hataları, düzeltip tüm senaryoyu tekrar ver:\n- " + "\n- ".join(errs)}]
    sys.exit("Geçerli senaryo üretilemedi: " + "; ".join(errs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("topic", nargs="?")
    ap.add_argument("--next", action="store_true")
    a = ap.parse_args()
    topic = a.topic
    if a.next or not topic:
        have = {json.loads(p.read_text(encoding="utf-8")).get("topic") for p in SCRIPTS.glob("*.json")}
        todo = [l.strip() for l in (ROOT / "topics.txt").read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
        topic = next((t for t in todo if t not in have), None)
        if not topic:
            sys.exit("Tüm konuların senaryosu var.")
    out = generate(topic)
    print("Senaryo yazıldı:", out)
    print("Bilgileri ve kaynakları kontrol edin, sonra: python -m pipeline.produce", out)


if __name__ == "__main__":
    main()
