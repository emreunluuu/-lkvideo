"""Seslendirme: Google Cloud Text-to-Speech (erkek, derin ses) + kelime zamanlaması.

- Anahtar `GOOGLE_TTS_API_KEY` ortam değişkeninden okunur; koda yazılmaz.
- Ses seçimi: voices.list çıktısından tercih sırasına göre ilk uygun ERKEK ses.
- Kelime zamanları: SSML <mark> destekleyen seslerde (Wavenet/Neural2/Standard) API'den,
  desteklemeyenlerde (Chirp3-HD) hece-ağırlıklı hizalama + sessizlik tespitiyle hesaplanır.
- Anahtar yoksa yalnızca ÖNİZLEME için yerel espeak-ng (mbrola tr1) kullanılabilir.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

SR = 48000
API = "https://texttospeech.googleapis.com"
CACHE = Path(__file__).resolve().parent.parent / ".cache" / "tts"

# Tercih sırası: daha doğal erkek sesler önce. voices.list ile doğrulanır.
PREFERRED_VOICES = [
    "tr-TR-Chirp3-HD-Charon",
    "tr-TR-Chirp3-HD-Orus",
    "tr-TR-Chirp3-HD-Algenib",
    "tr-TR-Chirp3-HD-Fenrir",
    "tr-TR-Wavenet-E",
    "tr-TR-Wavenet-B",
    "tr-TR-Standard-E",
    "tr-TR-Standard-B",
]

VOWELS = set("aeıioöuüAEIİOÖUÜâîûÂÎÛ")


@dataclass
class Word:
    w: str
    start: float
    end: float


@dataclass
class Speech:
    audio: np.ndarray  # mono float32, SR
    words: list[Word]
    engine: str
    voice: str
    meta: dict = field(default_factory=dict)

    @property
    def duration(self) -> float:
        return len(self.audio) / SR


def syllables(word: str) -> int:
    """Türkçede hece sayısı ≈ ünlü sayısı."""
    n = sum(1 for c in word if c in VOWELS)
    return max(1, n)


def tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"\s+", text.strip()) if t]


def _read_wav_bytes(b: bytes) -> np.ndarray:
    with wave.open(io.BytesIO(b)) as w:
        sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if sr != SR:
        a = resample(a, sr, SR)
    return a


def resample(a: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    from scipy.signal import resample_poly
    from math import gcd

    g = gcd(sr_in, sr_out)
    return resample_poly(a, sr_out // g, sr_in // g).astype(np.float32)


def trim_silence(a: np.ndarray, thr_db: float = -45.0, pad: float = 0.04) -> np.ndarray:
    env = _envelope(a)
    thr = 10 ** (thr_db / 20)
    idx = np.where(env > thr)[0]
    if len(idx) == 0:
        return a
    s = max(0, idx[0] - int(pad * SR))
    e = min(len(a), idx[-1] + int(pad * SR))
    return a[s:e]


def _envelope(a: np.ndarray, win: float = 0.02) -> np.ndarray:
    n = max(1, int(win * SR))
    k = np.ones(n) / n
    return np.sqrt(np.convolve(a * a, k, mode="same"))


def find_silences(a: np.ndarray, min_len: float = 0.09, thr_db: float = -38.0) -> list[tuple[float, float]]:
    env = _envelope(a, 0.015)
    peak = env.max() + 1e-9
    quiet = env < peak * 10 ** (thr_db / 20)
    out, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) / SR >= min_len:
                out.append((start / SR, i / SR))
            start = None
    return out


def align_words(text: str, audio: np.ndarray) -> list[Word]:
    """Kelime zamanlarını tahmin et: noktalama → sessizlik eşlemesi, öbek içinde hece ağırlığı."""
    tokens = tokenize(text)
    dur = len(audio) / SR
    # Noktalamaya göre öbeklere ayır
    phrases, cur = [], []
    for t in tokens:
        cur.append(t)
        if re.search(r"[,.;:!?…]$", t):
            phrases.append(cur)
            cur = []
    if cur:
        phrases.append(cur)
    sil = [s for s in find_silences(audio) if s[0] > 0.05 and s[1] < dur - 0.05]
    need = len(phrases) - 1
    bounds = []
    if need > 0 and len(sil) >= need:
        # Beklenen sınır zamanlarına (hece oranına göre) en yakın sessizlikleri sırayla eşle
        tot = sum(syllables(w) + 0.6 for p in phrases for w in p)
        acc, expected = 0.0, []
        for p in phrases[:-1]:
            acc += sum(syllables(w) + 0.6 for w in p)
            expected.append(acc / tot * dur)
        used = -1
        for e in expected:
            cands = [(abs((s[0] + s[1]) / 2 - e), i) for i, s in enumerate(sil) if i > used]
            if not cands:
                break
            _, i = min(cands)
            used = i
            bounds.append(sil[i])
    if len(bounds) != need:
        bounds = []
        tot = sum(syllables(w) + 0.6 for p in phrases for w in p)
        acc = 0.0
        for p in phrases[:-1]:
            acc += sum(syllables(w) + 0.6 for w in p)
            m = acc / tot * dur
            bounds.append((m, m))
    words: list[Word] = []
    starts = [0.0] + [b[1] for b in bounds]
    ends = [b[0] for b in bounds] + [dur]
    for p, s, e in zip(phrases, starts, ends):
        wts = [syllables(w) + 0.6 for w in p]
        T = sum(wts)
        t = s
        for w, wt in zip(p, wts):
            d = (e - s) * wt / T
            words.append(Word(w, round(t, 3), round(t + d, 3)))
            t += d
    return words


# ----------------------------------------------------------------------------- Google
class GoogleTTS:
    def __init__(self, key: str, rate: float = 0.95, pitch: float = -2.0, voice: str | None = None):
        import requests

        self.s = requests.Session()
        self.s.headers["X-Goog-Api-Key"] = key
        self.rate, self.pitch = rate, pitch
        self.voice = voice or self.pick_voice()

    def list_voices(self) -> list[dict]:
        r = self.s.get(f"{API}/v1/voices", params={"languageCode": "tr-TR"}, timeout=30)
        r.raise_for_status()
        return r.json().get("voices", [])

    def pick_voice(self) -> str:
        voices = self.list_voices()
        male = {v["name"] for v in voices if v.get("ssmlGender") == "MALE"}
        for name in PREFERRED_VOICES:
            if name in male:
                return name
        if male:
            return sorted(male)[0]
        raise RuntimeError("tr-TR için erkek ses bulunamadı")

    @property
    def supports_marks(self) -> bool:
        return "Chirp" not in self.voice

    def synth(self, text: str) -> Speech:
        key = hashlib.sha1(json.dumps([text, self.voice, self.rate, self.pitch]).encode()).hexdigest()[:16]
        CACHE.mkdir(parents=True, exist_ok=True)
        cf = CACHE / f"g_{key}.json"
        if cf.exists():
            d = json.loads(cf.read_text())
        else:
            d = self._call(text)
            cf.write_text(json.dumps(d))
        raw = _read_wav_bytes(base64.b64decode(d["audioContent"]))
        lead = 0.0
        audio = trim_silence(raw)
        # trim'in baştan kestiği süre: kelime zamanlarını kaydırmak için
        env = _envelope(raw)
        idx = np.where(env > 10 ** (-45 / 20))[0]
        if len(idx):
            lead = max(0, idx[0] - int(0.04 * SR)) / SR
        if d.get("timepoints"):
            toks = tokenize(text)
            tp = {int(t["markName"][1:]): float(t["timeSeconds"]) - lead for t in d["timepoints"]}
            words = []
            for i, w in enumerate(toks):
                s = max(0.0, tp.get(i, 0.0))
                e = tp.get(i + 1, len(audio) / SR)
                words.append(Word(w, round(s, 3), round(max(s + 0.05, e), 3)))
        else:
            words = align_words(text, audio)
        return Speech(audio, words, "google", self.voice, {"timing": "marks" if d.get("timepoints") else "aligned"})

    def _call(self, text: str) -> dict:
        audio_cfg = {"audioEncoding": "LINEAR16", "sampleRateHertz": SR, "speakingRate": self.rate, "pitch": self.pitch}
        body: dict = {"voice": {"languageCode": "tr-TR", "name": self.voice}, "audioConfig": audio_cfg}
        if self.supports_marks:
            toks = tokenize(text)
            ssml = "<speak>" + " ".join(f'<mark name="w{i}"/>{_esc(t)}' for i, t in enumerate(toks)) + f'<mark name="w{len(toks)}"/></speak>'
            body["input"] = {"ssml": ssml}
            body["enableTimePointing"] = ["SSML_MARK"]
        else:
            body["input"] = {"text": text}
        r = self.s.post(f"{API}/v1beta1/text:synthesize", json=body, timeout=120)
        if r.status_code == 400 and "pitch" in r.text.lower():
            audio_cfg.pop("pitch", None)  # bazı sesler (Chirp3-HD) perde ayarını desteklemez
            r = self.s.post(f"{API}/v1beta1/text:synthesize", json=body, timeout=120)
        if r.status_code == 400 and "rate" in r.text.lower():
            audio_cfg.pop("speakingRate", None)
            r = self.s.post(f"{API}/v1beta1/text:synthesize", json=body, timeout=120)
        r.raise_for_status()
        return r.json()


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ----------------------------------------------------------------------------- Yerel önizleme
class EspeakPreview:
    """Sadece önizleme: Google anahtarı yokken zamanlama/kurgu kontrolü için. Yayın için kullanılmaz."""

    def __init__(self, rate: float = 0.95):
        self.bin = shutil.which("espeak-ng") or shutil.which("espeak")
        if not self.bin:
            raise RuntimeError("espeak-ng yok (apt-get install espeak-ng mbrola mbrola-tr1)")
        self.voice = "mb-tr1" if Path("/usr/share/mbrola/tr1").exists() else "tr"
        self.rate = rate
        self.wpm = int(150 * rate)

    def _run(self, text: str, wpm: int) -> np.ndarray:
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "o.wav"
            subprocess.run([self.bin, "-v", self.voice, "-s", str(wpm), "-p", "30", "-g", "4", "-w", str(f), text],
                           check=True, capture_output=True)
            return trim_silence(_read_wav_bytes(f.read_bytes()))

    def synth(self, text: str) -> Speech:
        # Google TTS'in Türkçe temposuna (~5.5 hece/sn x hız) kalibre et ki kurgu süresi gerçekçi olsun.
        target = 5.5 * self.rate
        syl = sum(syllables(w) for w in tokenize(text))
        a = self._run(text, self.wpm)
        wpm = max(80, min(260, int(self.wpm * target / (syl / (len(a) / SR)))))
        a = self._run(text, wpm)
        return Speech(a, align_words(text, a), "espeak-preview", self.voice, {"timing": "aligned"})


def make_engine(mode: str = "auto", rate: float = 0.95, pitch: float = -2.0, voice: str | None = None):
    key = os.environ.get("GOOGLE_TTS_API_KEY", "").strip()
    if mode in ("auto", "google") and key:
        return GoogleTTS(key, rate, pitch, voice)
    if mode == "google":
        raise RuntimeError("GOOGLE_TTS_API_KEY ortam değişkeni tanımlı değil")
    return EspeakPreview(rate)
