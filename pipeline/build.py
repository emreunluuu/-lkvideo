"""Senaryodan tam video üretir.

Kullanım:
  python3 pipeline/build.py videos/istanbul-gizemi/script.json            # tam video
  python3 pipeline/build.py videos/istanbul-gizemi/script.json --stills   # sadece kontrol kareleri
  python3 pipeline/build.py ... --format horizontal                       # 16:9 sürüm
  python3 pipeline/build.py ... --draft                                   # hızlı düşük kalite önizleme
"""
import argparse, datetime, json, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tts, audio, render  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LEAD, TAIL, FIRST_LEAD = 0.30, 0.45, 0.20


def voice_file(script_dir, i, out_wav, tempo=1.0):
    """videos/<id>/voice/<n>.mp3|wav|m4a varsa: baş/son sessizliği kırpıp 48 kHz mono WAV'a çevirir, süreyi döndürür."""
    for ext in ("mp3", "wav", "m4a"):
        src = script_dir / "voice" / f"{i + 1}.{ext}"
        if src.exists():
            trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af",
                            f"{trim},areverse,{trim},areverse" + (f",atempo={tempo}" if tempo != 1.0 else ""), "-ac", "1", "-ar", "48000", str(out_wav)], check=True)
            import wave
            with wave.open(str(out_wav)) as w:
                return w.getnframes() / w.getframerate()
    return None


def resolve_u(obj, dur):
    """Sahne süresine göre oransal zamanları (tu, u, ...AtU, dropsU) saniyeye çevirir."""
    if isinstance(obj, list):
        return [resolve_u(x, dur) for x in obj]
    if not isinstance(obj, dict):
        return obj
    out = {}
    for k, v in obj.items():
        if k in ("tu", "u") and isinstance(v, (int, float)):
            out["t"] = round(v * dur, 3)
        elif k in ("stampAtU", "closeAtU") and isinstance(v, (int, float)):
            out[k[:-1]] = round(v * dur, 3)
        elif k == "dropsU":
            out["drops"] = resolve_u(v, dur)
        else:
            out[k] = resolve_u(v, dur)
    return out


def word_times(text, t0, dur):
    """Kelime zamanlarını karakter uzunluğuna göre dağıtır."""
    words = text.split()
    weights = [len(re.sub(r"\W", "", w)) + 2 + (3 if re.search(r"[.,:;!?…]$", w) else 0) for w in words]
    tot, t, out = sum(weights), t0, []
    for w, k in zip(words, weights):
        d = dur * k / tot
        out.append({"w": w, "t0": round(t, 3), "t1": round(t + d, 3)})
        t += d
    return out


def chunks(words, max_words=3):
    """2–4 kelimelik altyazı parçaları; noktalama işaretinde böl."""
    out, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= max_words or re.search(r"[.,:;!?…]$", w["w"]):
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    res = []
    for i, c in enumerate(out):
        t1 = c[-1]["t1"]
        if i + 1 < len(out):
            t1 = min(out[i + 1][0]["t0"], t1 + 0.35)
        res.append({"t0": c[0]["t0"], "t1": round(t1, 3), "words": c})
    return res


def srt(chs):
    def ts(s):
        h, m = int(s // 3600), int(s % 3600 // 60)
        return f"{h:02}:{m:02}:{s % 60:06.3f}".replace(".", ",")
    return "\n".join(f"{i}\n{ts(c['t0'])} --> {ts(c['t1'])}\n{' '.join(w['w'] for w in c['words'])}\n"
                     for i, c in enumerate(chs, 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--format", choices=["vertical", "horizontal"])
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--draft", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()

    S = json.load(open(a.script, encoding="utf-8"))
    fmt = a.format or S.get("format", "vertical")
    W, H = (1080, 1920) if fmt == "vertical" else (1920, 1080)
    if a.draft:
        W, H = W // 2, H // 2
    out = Path(a.out or ROOT / "output" / f"{datetime.date.today()}-{S['id']}-{fmt}")
    (out / "voice").mkdir(parents=True, exist_ok=True)

    # 1) Seslendirme ve zaman çizelgesi
    script_dir = Path(a.script).resolve().parent
    files_mode = S["voice"].get("provider") == "files"
    use_tts = (not files_mode) and tts.available() and not a.stills
    tm = S.get("timing", {})
    lead_n, tail_n, lead_0 = tm.get("lead", LEAD), tm.get("tail", TAIL), tm.get("firstLead", FIRST_LEAD)
    print("Seslendirme:", "hazır ses dosyaları (voice/)" if files_mode else
          ("Google TTS (" + S["voice"]["name"] + ")" if use_tts else "YOK (tahmini süre, sessiz anlatım)"))
    t, scenes, words, voice_clips = 0.0, [], [], []
    for i, sc in enumerate(S["scenes"]):
        lead = lead_0 if i == 0 else lead_n
        wav = out / "voice" / f"{i:02}.wav"
        if files_mode:
            vd = voice_file(script_dir, i, wav, S["voice"].get("tempo", 1.0))
            if vd is None:
                print(f"  UYARI: voice/{i + 1}.mp3 yok, süre tahmin ediliyor")
        else:
            vd = tts.synthesize(sc["narration"], wav, S["voice"]) if use_tts else None
        if vd is None:
            vd = tts.estimate_duration(sc["narration"], S["voice"].get("rate", .95))
        else:
            voice_clips.append((t + lead, str(wav)))
        dur = round(lead + vd + tail_n, 3)
        ws = word_times(sc["narration"], t + lead, vd)
        words += ws
        scenes.append({**resolve_u({k: v for k, v in sc.items() if k != "narration"}, dur), "start": round(t, 3), "dur": dur})
        t += dur
    total = round(t, 3)
    chs = chunks(words)
    print(f"Toplam süre: {total:.1f} sn, {len(scenes)} sahne")

    data = {"width": W, "height": H, "fps": 30, "scale3d": 0.75 if not a.draft else 1.0, "seed": S.get("seed", 1),
            "accent": S.get("accent"), "grade": S.get("grade", {}), "title": S["title"], "thumbText": S.get("thumbText"),
            "scenes": scenes, "chunks": chs, "total": total, "style": S.get("style")}
    (out / "timeline.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    # 2) Kontrol kareleri + kapak
    stills = [(s["start"] + min(3.0, s["dur"] * .6), str(out / f"kare_{i:02}.jpg"), False) for i, s in enumerate(scenes)]
    stills.append((scenes[0]["start"] + 1.5, str(out / "kapak.jpg"), True))
    if a.stills:
        render.render(data, stills=stills)
        print("Kareler:", out); return

    # 3) Ses tasarımı + miks
    mix = out / "ses_miks.wav"
    audio.build_mix(S, scenes, total, voice_clips, mix)

    # 4) Görüntü
    silent = out / "goruntu.mp4"
    print("3D render başlıyor…")
    render.render(data, out_mp4=silent, stills=stills)

    # 5) Birleştir (−14 LUFS)
    final = out / f"{S['id']}-{fmt}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(mix),
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-ar", "48000", "-shortest", "-movflags", "+faststart", str(final)], check=True)
    silent.unlink()

    # 6) Altyazı + yayın bilgileri
    (out / f"{S['id']}.srt").write_text(srt(chs), encoding="utf-8")
    meta = dict(S.get("meta", {}))
    meta.update({"format": fmt, "duration_sec": total, "voice": ("elevenlabs (dosya)" if files_mode else "google-tts") if voice_clips else "yok",
                 "approved": False, "sources": S.get("sources", []),
                 "synthetic_content_disclosure": True})
    (out / "yayin.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Hazır:", final)
    if not voice_clips:
        print("NOT: Seslendirme yok. GOOGLE_TTS_API_KEY ekleyip aynı komutu tekrar çalıştır.")


if __name__ == "__main__":
    main()
