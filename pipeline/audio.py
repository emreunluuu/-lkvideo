"""Ses tasarımı: tamamen sentezlenir (telifli ses/müzik yok).

- Atmosfer: makam tabanlı drone/pad (Hicaz vb.), Karplus-Strong telli çalgı
  ezgisi, def/darbuka ritmi, rüzgâr / su / damla dokuları
- Efektler: whoosh (geçiş), impact (başlık), riser (final öncesi), shimmer (bilgi etiketi)
- Ducking: seslendirme konuşurken müzik kısılır
"""
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
MAKAM = {  # kökten yarım ses aralıkları
    "hicaz": [0, 1, 4, 5, 7, 8, 10],
    "kurdi": [0, 1, 3, 5, 7, 8, 10],
    "nihavent": [0, 2, 3, 5, 7, 8, 10],
    "rast": [0, 2, 4, 5, 7, 9, 10],
    "ussak": [0, 1, 3, 5, 7, 8, 10],
}
CHORDS = {"hicaz": [[0, 4, 7], [1, 5, 8], [0, 4, 7], [-2, 1, 5]],
          "nihavent": [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]]}


def db(x): return 10 ** (x / 20)
def hz(root, semi): return root * 2 ** (semi / 12)
def sos(kind, f, order=2): return signal.butter(order, f, kind, fs=SR, output="sos")
def filt(x, kind, f, order=2): return signal.sosfilt(sos(kind, f, order), x)


def env_ad(n, a, d):
    """a: atak (sn), d: üstel sönüm sabiti (sn)"""
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-np.maximum(t - a, 0) / d)


def place(buf, x, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= buf.shape[0]:
        return
    if i < 0:
        x, i = x[-i:], 0
    n = min(len(x), buf.shape[0] - i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    if x.ndim == 1:
        buf[i:i + n, 0] += x[:n] * gain * l * 1.414
        buf[i:i + n, 1] += x[:n] * gain * r * 1.414
    else:
        buf[i:i + n] += x[:n] * gain


def reverb(x, secs=2.4, damp=4000, seed=0):
    r = np.random.default_rng(seed)
    n = int(secs * SR); t = np.arange(n) / SR
    out = np.zeros((len(x) + n - 1, 2))
    mono = x if x.ndim == 1 else x.mean(1)
    for c in range(2):
        ir = r.standard_normal(n) * np.exp(-t * 6.9 / secs)
        ir = filt(ir, "low", damp); ir[: int(.012 * SR)] *= np.linspace(0, 1, int(.012 * SR))
        ir /= np.sqrt((ir ** 2).sum())
        out[:, c] = signal.fftconvolve(mono, ir)
    return out


# ---------------- müzik ----------------
def pad(T, root, makam, scenes, rnd):
    n = int(T * SR); t = np.arange(n) / SR
    out = np.zeros((n, 2))
    # drone: kök + beşli, alt oktav
    for semi, g in [(-12, .55), (-5, .3), (0, .25)]:
        f = hz(root, semi)
        for c, det in [(0, -.12), (1, .12)]:
            ph = 2 * np.pi * (f + det) * t
            w = sum(np.sin(ph * k) / k ** 1.3 for k in range(1, 9))
            out[:, c] += w * g * (0.75 + 0.25 * np.sin(2 * np.pi * (.07 + .02 * c) * t))
    out = np.stack([filt(out[:, c], "low", 700) for c in range(2)], 1)
    # sahnelere göre değişen akorlar (yumuşak geçişli)
    chords = CHORDS.get(makam, CHORDS["hicaz"])
    ch = np.zeros((n, 2))
    for i, sc in enumerate(scenes):
        a, b = sc["start"] - .8, sc["start"] + sc["dur"] + .8
        i0, i1 = max(0, int(a * SR)), min(n, int(b * SR))
        tt = t[i0:i1]
        fade = np.clip(np.minimum(tt - a, b - tt) / .8, 0, 1)
        for semi in chords[i % len(chords)]:
            f = hz(root, semi)
            for c, det in [(0, -.3), (1, .3)]:
                ph = 2 * np.pi * (f + det) * tt
                ch[i0:i1, c] += (np.sin(ph) + .3 * np.sin(2 * ph) + .12 * np.sin(3 * ph)) * fade * .16
    ch = np.stack([filt(ch[:, c], "low", 1600) for c in range(2)], 1)
    return out * .5 + ch


def ks_note(f, dur, bright=.5, seed=0):
    """Karplus-Strong telli çalgı (ud/kanun benzeri)."""
    r = np.random.default_rng(seed)
    N = max(2, int(SR / f)); n = int(dur * SR)
    x = np.zeros(n); burst = r.uniform(-1, 1, N)
    burst = filt(burst, "low", 1500 + 5000 * bright, 1); x[:N] = burst
    g = .996
    a = np.zeros(N + 2); a[0] = 1; a[N] = -g / 2; a[N + 1] = -g / 2
    y = signal.lfilter([1], a, x)
    return y * env_ad(n, .002, dur * .45)


def melody(T, root, makam, tempo, scenes, rnd):
    buf = np.zeros((int(T * SR), 2))
    scale = MAKAM.get(makam, MAKAM["hicaz"])
    beat = 60 / tempo / 2       # sekizlik
    deg, t = 0, scenes[0]["start"] + 1.2
    phrase = 0
    while t < T - 2.5:
        if rnd.random() < .62:
            deg = int(np.clip(deg + rnd.choice([-2, -1, -1, 1, 1, 2, 0]), -3, 9))
            o, d = divmod(deg, 7)
            f = hz(root * 2, scale[d] + 12 * o)
            v = .5 + .5 * rnd.random()
            note = ks_note(f, 1.6, bright=.35 + .4 * v, seed=int(t * 100))
            place(buf, note, t, gain=.32 * v, pan=rnd.uniform(-.5, .5))
            if rnd.random() < .18:  # süsleme (çarpma)
                gf = hz(root * 2, scale[(d + 1) % 7] + 12 * o)
                place(buf, ks_note(gf, .5, .6, seed=int(t * 77)), t - .06, gain=.14, pan=.2)
        phrase += 1
        t += beat * (2 if phrase % 8 in (6, 7) else 1)
        if phrase % 16 == 0:
            t += beat * 2
    return buf


def drums(T, tempo, start, rnd):
    buf = np.zeros((int(T * SR), 2)); q = 60 / tempo
    n_d = int(.5 * SR); td = np.arange(n_d) / SR
    dum = np.sin(2 * np.pi * (48 + 30 * np.exp(-td * 25)) * td) * env_ad(n_d, .002, .16)
    dum += filt(rnd.standard_normal(n_d), "low", 250) * env_ad(n_d, .001, .03) * .4
    n_t = int(.12 * SR)
    tek = filt(rnd.standard_normal(n_t), "band", [1800, 5200]) * env_ad(n_t, .0005, .025)
    t, bar = start, 0
    while t < T - 1.5:
        for b, kind, g in [(0, dum, 1), (1, tek, .55), (2.5, dum, .8), (3, tek, .5), (3.5, tek, .3)]:
            place(buf, kind, t + b * q, gain=g * (.85 + .3 * rnd.random()), pan=0 if kind is dum else .25)
        t += 4 * q; bar += 1
    return buf


# ---------------- ortam dokuları ----------------
def ambience(T, scenes, rnd):
    n = int(T * SR); t = np.arange(n) / SR
    buf = np.zeros((n, 2))
    for c in range(2):
        wind = filt(rnd.standard_normal(n), "band", [250, 1400])
        wind *= .5 + .5 * np.sin(2 * np.pi * (.05 + .03 * c) * t + c)
        buf[:, c] += wind * .25
    for sc in scenes:
        a, b = sc["start"], sc["start"] + sc["dur"]
        i0, i1 = int(a * SR), min(n, int(b * SR)); m = i1 - i0
        fade = np.clip(np.minimum(np.arange(m) / SR, (m - np.arange(m)) / SR) / .5, 0, 1)
        if sc["kind"] in ("city_night", "maiden", "galata"):
            for c in range(2):
                water = filt(rnd.standard_normal(m), "band", [140, 700])
                water *= .55 + .45 * np.sin(2 * np.pi * .28 * np.arange(m) / SR + c * 1.7)
                buf[i0:i1, c] += water * fade * .22
        if sc["kind"] == "cistern":  # yankılı su damlaları
            tt = a + .4
            while tt < b - .3:
                nd = int(.06 * SR); td = np.arange(nd) / SR
                f0 = rnd.uniform(900, 1500)
                drip = np.sin(2 * np.pi * (f0 * (1 + 1.2 * np.exp(-td * 60))) * td) * env_ad(nd, .001, .012)
                place(buf, drip, tt, gain=.35, pan=rnd.uniform(-.8, .8))
                tt += rnd.uniform(.5, 1.6)
    return buf


# ---------------- efektler ----------------
def whoosh(dur=.75, up=True, seed=0):
    r = np.random.default_rng(seed); n = int(dur * SR)
    x = r.standard_normal(n); y = np.zeros(n)
    fc = np.geomspace(250, 4500, n // 2); fc = np.concatenate([fc, fc[::-1][: n - len(fc)]])
    # zamanla değişen durum-değişkenli filtre (blok bazlı)
    blk = 256; zi = None
    for i in range(0, n, blk):
        s = sos("band", [fc[i] * .6, min(fc[i] * 1.6, SR / 2 - 100)])
        if zi is None or zi.shape != (s.shape[0], 2):
            zi = np.zeros((s.shape[0], 2))
        y[i:i + blk], zi = signal.sosfilt(s, x[i:i + blk], zi=zi)
    e = np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    return y * e


def impact(seed=0):
    r = np.random.default_rng(seed); n = int(2.2 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 90 * np.exp(-t * 14)) * t) * env_ad(n, .003, .55)
    crack = filt(r.standard_normal(n), "low", 3000) * env_ad(n, .001, .05) * .6
    sub = np.sin(2 * np.pi * 32 * t) * env_ad(n, .01, .9) * .5
    return boom + crack + sub


def riser(dur=1.6, seed=0):
    r = np.random.default_rng(seed); n = int(dur * SR); t = np.arange(n) / SR
    f = np.geomspace(180, 1400, n)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * .4
    noise = filt(r.standard_normal(n), "high", 1500) * .5
    return (tone + noise) * (t / dur) ** 2.2


def shimmer(root, makam, seed=0):
    n = int(1.6 * SR); t = np.arange(n) / SR; sc = MAKAM.get(makam, MAKAM["hicaz"])
    x = sum(np.sin(2 * np.pi * hz(root * 8, s) * t * (1 + .002 * np.sin(2 * np.pi * 5 * t))) * env_ad(n, .005 + i * .03, .35)
            for i, s in enumerate([sc[0], sc[2], sc[4], 12]))
    return x * .25


# ---------------- miks ----------------
def _load_voice(path):
    sr, v = wavfile.read(path)
    v = v.astype(np.float32) / (32768 if v.dtype == np.int16 else 1)
    if v.ndim > 1:
        v = v.mean(1)
    if sr != SR:
        v = signal.resample_poly(v, SR, sr)
    return v


def build_mix(S, scenes, total, voice_clips, out_wav):
    rnd = np.random.default_rng(S.get("seed", 1))
    mu = S.get("music", {})
    root, makam, tempo = mu.get("root", 146.83), mu.get("scale", "hicaz"), mu.get("tempo", 76)
    T = total + .5; n = int(T * SR)
    print(f"Ses tasarımı: {makam} makamı, {tempo} BPM")

    music = pad(T, root, makam, scenes, rnd) * db(-24)
    music += melody(T, root, makam, tempo, scenes, rnd) * db(-12)
    music += drums(T, tempo, scenes[1]["start"] if len(scenes) > 1 else 2, rnd) * db(-21)
    music[: len(music)] += reverb(music, 2.8, 3500, 1)[:n] * .35
    amb = ambience(T, scenes, rnd)
    amb += reverb(amb, 3.5, 3000, 2)[:n] * .5
    amb *= db(-26)
    music = np.stack([filt(music[:, c], 'high', 38) for c in range(2)], 1)

    sfx = np.zeros((n, 2))
    place(sfx, impact(1), 0.05, db(-8))
    for k, sc in enumerate(scenes):
        if k > 0:
            place(sfx, whoosh(.75, seed=k), sc["start"] - .4, db(-11), pan=(-.4 if k % 2 else .4))
        if "impact" in sc.get("sfx", []) and k > 0:
            place(sfx, impact(k + 10), sc["start"] + .12, db(-9))
        if sc.get("chip"):
            place(sfx, shimmer(root, makam, k), sc["start"] + sc.get("chipAt", 1.2), db(-15), pan=-.3)
        if sc.get("label"):
            place(sfx, whoosh(.4, seed=k + 50) * .5, sc["start"] + (2.2 if sc.get("title") else .25), db(-20), pan=-.6)
    last = scenes[-1]["start"]
    place(sfx, riser(1.6, 3), last - 1.6, db(-14))
    sfx += reverb(sfx, 2.0, 5000, 3)[:n] * .3

    voice = np.zeros(n)
    for t0, path in voice_clips:
        v = _load_voice(path); i = int(t0 * SR); m = min(len(v), n - i)
        voice[i:i + m] += v[:m]
    # ducking
    if voice.any():
        e = signal.sosfiltfilt(sos("low", 6), np.abs(voice))
        e = np.clip(e / (np.percentile(e[e > 1e-4], 90) + 1e-9), 0, 1)
        duck = 1 - .6 * e
        music *= duck[:, None]; amb *= (1 - .4 * e)[:, None]; sfx *= (1 - .3 * e)[:, None]
        voice = filt(voice, "high", 70)
        voice = voice / (np.abs(voice).max() + 1e-9) * db(-3)

    mix = music + amb + sfx + voice[:, None]
    fade = int(.6 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    mix /= max(1.0, np.abs(mix).max() / db(-1))
    wavfile.write(out_wav, SR, mix.astype(np.float32))
    return out_wav
