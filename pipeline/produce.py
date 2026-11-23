"""Senaryodan yayına hazır video üretir.

    python -m pipeline.produce content/scripts/istanbul-gizemi.json
    python -m pipeline.produce --next            # topics.txt'teki sıradaki konunun senaryosu
    python -m pipeline.produce <senaryo> --tts espeak --workers 3 --stills-only

Çıktı: output/<tarih>-<id>/ {video.mp4, kapak.jpg, altyazi.srt, metadata.json, aciklama.txt, rapor.json}
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

from . import audio as A
from .tts import SR, make_engine

ROOT = Path(__file__).resolve().parent.parent
FORMATS = {
    "short": {"width": 1080, "height": 1920, "fps": 30, "min": 55, "max": 65},
    "long": {"width": 1920, "height": 1080, "fps": 30, "min": 480, "max": 600},
}
TRANSITION_SFX_LEAD = {"whip": 0.35, "zoom": 0.3, "flash": 0.25, "dip": 0.4, "crossfade": 0.4}


def norm(s: str) -> str:
    return re.sub(r"[^\wçğıöşüâîû']", "", s.replace("I", "ı").replace("İ", "i").lower())


def find_phrase(words, phrase):
    """Segment kelimeleri içinde ifadenin ilk geçtiği kelime indeksini bul (ön ek eşleşmesi)."""
    p = [norm(x) for x in phrase.split()]
    toks = [norm(w["w"]) for w in words]
    for i in range(len(toks) - len(p) + 1):
        if all(toks[i + j].startswith(p[j]) for j in range(len(p))):
            return i
    raise ValueError(f"'{phrase}' ifadesi metinde bulunamadı")


def chunk_words(words, max_words=3, max_chars=20):
    """Altyazı parçaları: 2–4 kelime, noktalamada kır."""
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        text = " ".join(x["w"] for x in cur)
        punct = re.search(r"[,.;:!?…]$", w["w"])
        if punct or len(cur) >= max_words or len(text) >= max_chars:
            if len(cur) == 1 and not punct and chunks and len(chunks[-1]) < 4:
                chunks[-1].append(cur.pop())
            if cur:
                chunks.append(cur)
            cur = []
    if cur:
        if len(cur) == 1 and chunks and len(chunks[-1]) < 4:
            chunks[-1].extend(cur)
        else:
            chunks.append(cur)
    return chunks


def srt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    data = (x * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(data.shape[1] if data.ndim == 2 else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


class Producer:
    def __init__(self, scenario_path: Path, args):
        self.sp = scenario_path
        self.sc = json.loads(scenario_path.read_text(encoding="utf-8"))
        self.args = args
        self.fmt = FORMATS[self.sc.get("format", "short")]
        date = args.date or dt.date.today().isoformat()
        self.out = ROOT / "output" / f"{date}-{self.sc['id']}"
        self.out.mkdir(parents=True, exist_ok=True)
        self.rng = np.random.default_rng(self.sc.get("music", {}).get("seed", 1))

    # ------------------------------------------------------------------ 1. Seslendirme
    def narrate(self):
        v = self.sc.get("voice", {})
        eng = make_engine(self.args.tts, v.get("rate", 0.95), v.get("pitch", -2.0), v.get("name"))
        print(f"[tts] motor={type(eng).__name__} ses={eng.voice}")
        self.speech = []
        for seg in self.sc["segments"]:
            sp = eng.synth(seg["text"])
            print(f"  - {seg['id']}: {sp.duration:.2f} sn, {len(sp.words)} kelime ({sp.meta.get('timing')})")
            self.speech.append(sp)
        self.engine_name = self.speech[0].engine
        self.voice_name = self.speech[0].voice

    # ------------------------------------------------------------------ 2. Zaman çizelgesi
    def timeline(self):
        segs = self.sc["segments"]
        lead, gap, tail = 0.35, self.sc.get("gap", 0.45), self.sc.get("tail", 2.6)
        t = lead
        self.voice_starts = []
        for i, sp in enumerate(self.speech):
            self.voice_starts.append(t)
            t += sp.duration + (gap if i < len(segs) - 1 else 0)
        self.duration = round(t + tail, 3)
        fps = self.fmt["fps"]
        self.duration = round(np.ceil(self.duration * fps) / fps, 3)

        scenes, titles, labels, subs = [], [], [], []
        self.sfx = [("impact", 0.08, {"size": 1.0})]
        self.seg_windows = []
        for i, (seg, sp) in enumerate(zip(segs, self.speech)):
            vs = self.voice_starts[i]
            words = [{"w": w.w, "start": round(vs + w.start, 3), "end": round(vs + w.end, 3)} for w in sp.words]
            seg["_words"] = words
            start = 0.0 if i == 0 else round(vs - 0.22, 3)
            end = self.duration if i == len(segs) - 1 else round(self.voice_starts[i + 1] - 0.22, 3)
            self.seg_windows.append((start, end))
            at = lambda ph: words[find_phrase(words, ph)]["start"] if isinstance(ph, str) else start + float(ph)
            cue_times = {k: round(at(v) - start, 3) for k, v in seg["scene"].get("cues", {}).items()}
            tr = seg.get("transition", "cut") if i > 0 else "cut"
            scenes.append({"type": seg["scene"]["type"], "start": start, "end": end, "transition": tr,
                           "params": {**seg["scene"].get("params", {}), "duration": end - start}, "cueTimes": cue_times})
            if i > 0 and tr in TRANSITION_SFX_LEAD:
                if tr in ("whip", "zoom"):
                    self.sfx.append(("whoosh", start - TRANSITION_SFX_LEAD[tr], {"dir": 1 if i % 2 else -1}))
                if tr in ("zoom", "flash", "dip"):
                    self.sfx.append(("riser", start - 1.3, {"dur": 1.3}))
                if tr == "flash":
                    self.sfx.append(("flash", start - 0.05, {}))
            if "title" in seg:
                ti = seg["title"]
                ts = at(ti.get("at", 0.0))
                titles.append({"text": ti["text"], "sub": ti.get("sub"), "style": ti.get("style", "impact"), "pos": ti.get("pos", "top"),
                               "start": round(ts, 3), "end": round(min(end, ts + ti.get("dur", 2.8)), 3)})
                if ti.get("style", "impact") == "impact" and ts > 0.5:
                    self.sfx.append(("impact", ts + 0.08, {"size": 0.8}))
                elif ti.get("style") in ("cinematic", "legend"):
                    self.sfx.append(("shimmer", ts, {})); self.sfx.append(("impact", ts, {"size": 0.45}))
            seg_labels = []
            for lb in seg.get("labels", []):
                ls = at(lb["at"])
                seg_labels.append({k: v for k, v in {"value": lb["value"], "caption": lb.get("caption"), "style": lb.get("style", "chip"),
                                   "slot": lb.get("slot", "tl"), "anchor": lb.get("anchor"), "count": lb.get("count", False),
                                   "start": round(ls, 3), "end": round(min(end - 0.1, ls + lb.get("dur", 2.6)), 3)}.items() if v is not None})
                self.sfx.append(("shimmer" if lb.get("style") != "map" else "whoosh_soft", ls, {}))
            # Etiket, aynı segmentte sonradan başlayan başlığın üstüne binmesin
            for lab in seg_labels:
                for ti in titles:
                    if lab["start"] < ti["start"] < lab["end"]:
                        lab["end"] = round(ti["start"] - 0.15, 3)
            # Aynı yuvadaki etiketler üst üste binmesin
            for a, b in zip(seg_labels, seg_labels[1:]):
                if a["style"] == b["style"] == "chip" and a["slot"] == b["slot"]:
                    a["end"] = round(min(a["end"], b["start"] - 0.35), 3)
            labels += seg_labels
            for ch in chunk_words(words):
                subs.append({"start": ch[0]["start"], "end": ch[-1]["end"], "words": ch})

        # Altyazı parçalarını boşluksuz yap (kısa aralıklarda bir sonrakine kadar tut)
        for a, b in zip(subs, subs[1:]):
            if b["start"] - a["end"] < 0.35:
                a["end"] = b["start"]
            else:
                a["end"] = round(a["end"] + 0.15, 3)
        self.subs_all = subs
        endcard = None
        if self.sc.get("endcard"):
            ec = self.sc["endcard"]
            last = segs[-1]["_words"]
            es = last[find_phrase(last, ec["at"])]["start"] if isinstance(ec.get("at"), str) else self.duration - 3
            endcard = {"text": ec["text"], "cta": ec.get("cta", "Yorumlara yaz"), "start": round(es, 3)}
            self.sfx.append(("riser", es - 1.4, {"dur": 1.4}))
            self.sfx.append(("impact", es, {"size": 0.6}))
            # Kapanış kartı aynı soruyu gösterdiği için videoda altyazıyı orada bitir (SRT'de kalır)
            subs = [s for s in subs if s["start"] < es - 0.05]
            if subs:
                subs[-1]["end"] = min(subs[-1]["end"], es)

        self.manifest = {
            "width": self.fmt["width"], "height": self.fmt["height"], "fps": self.fmt["fps"], "duration": self.duration,
            "accent": self.sc.get("accent", "#f5c451"), "accent2": self.sc.get("accent2", "#7fd6ff"), "grade": self.sc.get("grade", {}),
            "scenes": scenes, "titles": titles, "labels": labels, "subs": subs, "endcard": endcard,
        }
        (self.out / "manifest.json").write_text(json.dumps(self.manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[zaman] toplam {self.duration:.2f} sn, {len(scenes)} sahne, {len(subs)} altyazı parçası")
        lo, hi = self.fmt["min"], self.fmt["max"]
        if not (lo <= self.duration <= hi):
            print(f"[UYARI] süre {self.duration:.1f} sn — hedef aralık {lo}-{hi} sn. Metni kısalt/uzat.")

    # ------------------------------------------------------------------ 3. Altyazı (.srt)
    def write_srt(self):
        lines = []
        for i, s in enumerate(self.subs_all, 1):
            txt = " ".join(w["w"] for w in s["words"])
            lines += [str(i), f"{srt_time(s['start'])} --> {srt_time(s['end'])}", txt, ""]
        (self.out / "altyazi.srt").write_text("\n".join(lines), encoding="utf-8")

    # ------------------------------------------------------------------ 4. Ses tasarımı + miks
    def mix(self):
        n = int(self.duration * SR)
        rng = self.rng
        music_cfg = self.sc.get("music", {})
        # Seslendirme
        voice = np.zeros(n)
        for vs, sp in zip(self.voice_starts, self.speech):
            v = sp.audio / (np.abs(sp.audio).max() + 1e-9) * 0.7
            A.place(voice, v, vs)
        voice_st = A.voice_chain(voice)
        # Müzik
        starts = [w[0] for w in self.seg_windows]
        music = A.music_bed(self.duration, music_cfg, starts, rng)
        # Ortam
        amb = np.zeros((n, 2))
        levels = {"cave": 0.6, "drips": 0.35, "sea": 0.35, "wind": 0.25, "gulls": 0.6}
        for (s, e), seg in zip(self.seg_windows, self.sc["segments"]):
            a, b = max(0, s - 0.8), min(self.duration, e + 0.8)
            m = int((b - a) * SR)
            fade = A.env_adsr(m, 0.8, 0.01, 1.0, 0.8, 1.0)[:, None]
            for kind in seg.get("ambience", []):
                sig = A.AMBIENCES[kind](m, rng)
                sig = sig / (np.abs(sig).max() + 1e-9) * levels.get(kind, 0.3)
                i0 = int(a * SR)
                amb[i0:i0 + m] += (sig * fade)[: n - i0]
        # Efektler
        sfx = np.zeros((n, 2))
        makam, root = music_cfg.get("makam", "hicaz"), A.root_midi(music_cfg.get("root", "D"), 2)
        for kind, t0, o in self.sfx:
            if kind == "impact":
                s = A.sfx_impact(rng, o.get("size", 1.0)) * 0.38
            elif kind == "whoosh":
                s = A.sfx_whoosh(rng, 0.7, o.get("dir", 1)) * 0.22
            elif kind == "whoosh_soft":
                s = A.sfx_whoosh(rng, 0.9, 1) * 0.08
            elif kind == "riser":
                s = A.sfx_riser(rng, o.get("dur", 1.4)) * 0.2
            elif kind == "shimmer":
                s = A.sfx_shimmer(rng, root, makam) * 0.45
            elif kind == "flash":
                s = A.sfx_flash(rng) * 0.2
            else:
                continue
            i = int(max(0, t0) * SR)
            if t0 < 0:
                s = s[int(-t0 * SR):]
            k = min(len(s), n - i)
            if k > 0:
                sfx[i:i + k] += s[:k]
        duck = A.duck_envelope(voice, depth=0.6)[:, None]
        duck_sfx = A.duck_envelope(voice, depth=0.3)[:, None]
        bed = (music * 0.55 + amb * 0.35) * duck
        mixed = voice_st * 1.0 + bed + sfx * duck_sfx
        mixed, before, after = A.loudness_normalize(mixed, -14.0, -1.0)
        self.lufs = after
        write_wav(self.out / "ses.wav", mixed)
        write_wav(self.out / "seslendirme.wav", np.stack([voice, voice], 1))
        print(f"[ses] miks {before:.1f} → {after:.1f} LUFS")

    # ------------------------------------------------------------------ 5. Görüntü
    def render(self):
        cmd = ["node", str(ROOT / "pipeline" / "render.js"), "--manifest", str(self.out / "manifest.json"),
               "--out", str(self.out / "goruntu.mp4"), "--workers", str(self.args.workers)]
        if self.args.stills_only:
            cmd = cmd[:4] + ["--stills", ",".join(f"{(s + e) / 2:.2f}" for s, e in self.seg_windows), "--stills-dir", str(self.out / "onizleme")]
        subprocess.run(cmd, check=True)

    def mux(self):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(self.out / "goruntu.mp4"), "-i", str(self.out / "ses.wav"),
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", "-movflags", "+faststart",
                        str(self.out / "video.mp4")], check=True)
        (self.out / "goruntu.mp4").unlink(missing_ok=True)

    def cover(self):
        # Kapak: kanca başlığının tamamen göründüğü kare
        t = 2.0
        if self.manifest["titles"]:
            t = min(self.manifest["titles"][0]["end"] - 0.3, self.manifest["titles"][0]["start"] + 1.6)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(self.out / "video.mp4"), "-frames:v", "1", "-q:v", "2",
                        str(self.out / "kapak.jpg")], check=True)

    def metadata(self):
        pub = self.sc.get("publish", {})
        desc = pub.get("description", "") + "\n\n" + " ".join(pub.get("hashtags", []))
        meta = {
            "id": self.sc["id"], "topic": self.sc["topic"], "format": self.sc.get("format", "short"),
            "title": pub.get("title", self.sc["topic"]), "description": desc, "tags": pub.get("tags", []),
            "hashtags": pub.get("hashtags", []), "category_id": pub.get("category_id", "27"),
            "synthetic_disclosure": pub.get("synthetic_disclosure", True), "language": "tr",
            "duration": self.duration, "files": {"video": "video.mp4", "cover": "kapak.jpg", "srt": "altyazi.srt"},
            "tts": {"engine": self.engine_name, "voice": self.voice_name},
            "approved": False,
        }
        (self.out / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        (self.out / "aciklama.txt").write_text(f"{meta['title']}\n\n{desc}\n", encoding="utf-8")
        rapor = {"duration": self.duration, "lufs": round(self.lufs, 2), "tts_engine": self.engine_name, "voice": self.voice_name,
                 "sources": self.sc.get("sources", []), "scenes": [s["type"] for s in self.manifest["scenes"]]}
        if self.engine_name != "google":
            rapor["UYARI"] = "Seslendirme yerel ÖNİZLEME motoruyla üretildi. Yayından önce GOOGLE_TTS_API_KEY ile yeniden üretin."
        (self.out / "rapor.json").write_text(json.dumps(rapor, ensure_ascii=False, indent=2), encoding="utf-8")

    def remux_audio(self):
        """Görüntüyü yeniden render etmeden yalnızca sesi yeniden miksleyip videoya koy."""
        src = self.out / "video.mp4"
        tmp = self.out / "video_tmp.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-i", str(self.out / "ses.wav"), "-map", "0:v", "-map", "1:a",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(tmp)], check=True)
        tmp.replace(src)

    def run(self):
        self.narrate()
        self.timeline()
        self.write_srt()
        if self.args.audio_only:
            self.mix()
            self.remux_audio()
            self.metadata()
            print("Ses yenilendi:", self.out / "video.mp4")
            return
        if self.args.stills_only:
            self.render()
            print("önizleme kareleri:", self.out / "onizleme")
            return
        self.mix()
        self.render()
        self.mux()
        self.cover()
        self.metadata()
        print("\nHAZIR:", self.out)
        print("İzleyip onaylamak için: python -m pipeline.publish", self.out, "--approve")


def next_scenario() -> Path:
    topics = [l.strip() for l in (ROOT / "topics.txt").read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    done = {json.loads(p.read_text(encoding="utf-8")).get("topic") for p in (ROOT / "output").glob("*/metadata.json")} if (ROOT / "output").exists() else set()
    scripts = {json.loads(p.read_text(encoding="utf-8"))["topic"]: p for p in (ROOT / "content" / "scripts").glob("*.json")}
    for t in topics:
        if t in done:
            continue
        if t in scripts:
            return scripts[t]
        sys.exit(f"'{t}' için senaryo yok. Önce: python -m pipeline.generate_script \"{t}\"")
    sys.exit("topics.txt'teki tüm konular üretilmiş.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario", nargs="?")
    ap.add_argument("--next", action="store_true")
    ap.add_argument("--tts", default="auto", choices=["auto", "google", "espeak"])
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--date")
    ap.add_argument("--stills-only", action="store_true")
    ap.add_argument("--audio-only", action="store_true", help="görüntüyü koru, sesi yeniden üret")
    a = ap.parse_args()
    path = next_scenario() if a.next or not a.scenario else Path(a.scenario)
    Producer(path, a).run()


if __name__ == "__main__":
    main()
