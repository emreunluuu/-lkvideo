"""Ses tasarımı — tamamen sentez (telifli ses/müzik yok).

Katmanlar:
  * Müzik yatağı: makam tabanlı drone + pad (ör. Hicaz), ney benzeri ezgi, bendir/kudüm benzeri vuruş
  * Ortam: mağara uğultusu, su damlaları, deniz, rüzgâr, martı
  * Efektler: whoosh, riser, impact/boom, shimmer
  * Miks: seslendirme ducking'i, -14 LUFS, -1 dBTP tavan
"""
from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000

# Makamlar: kök notadan yarım ses aralıkları (12-TET yaklaşık). Komalar için cent sapması eklenebilir.
MAKAMS = {
    "hicaz": [0, 1, 4, 5, 7, 8, 10, 12],
    "kurdi": [0, 1, 3, 5, 7, 8, 10, 12],
    "nihavend": [0, 2, 3, 5, 7, 8, 11, 12],
    "rast": [0, 2, 4, 5, 7, 9, 10, 12],
    "ussak": [0, 2, 3, 5, 7, 8, 10, 12],
    "huseyni": [0, 2, 3, 5, 7, 9, 10, 12],
}
NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def root_midi(name: str, octave: int = 2) -> int:
    return 12 * (octave + 1) + NOTE[name]


def t_axis(n: int) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / SR


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def pink(n, rng):
    w = rng.standard_normal(n)
    f = np.fft.rfft(w)
    k = np.arange(len(f)); k[0] = 1
    return np.fft.irfft(f / np.sqrt(k), n) * 6


def brown(n, rng):
    b = np.cumsum(rng.standard_normal(n))
    b = hp(b, 20)
    return b / (np.abs(b).max() + 1e-9)


def env_adsr(n, a, d, s, r, sustain_level=0.7):
    e = np.ones(n) * sustain_level
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A, endpoint=False) if A else e[:A]
    D2 = min(D, n - A)
    if D2 > 0:
        e[A:A + D2] = np.linspace(1, sustain_level, D2)
    R2 = min(R, n)
    if R2 > 0:
        e[n - R2:] *= np.linspace(1, 0, R2)
    return e


def reverb_ir(seconds=2.5, seed=1, bright=0.5, predelay=0.02):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = t_axis(n)
    decay = np.exp(-6.9 * t / seconds)
    irs = []
    for ch in range(2):
        noise = rng.standard_normal(n) * decay
        noise = lp(noise, 2000 + 9000 * bright)
        pd = np.zeros(int(predelay * SR))
        irs.append(np.concatenate([pd, noise]))
    ir = np.stack(irs, 1)
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


def apply_reverb(x, ir, wet=0.3):
    """x: (n,) veya (n,2) → (n,2)"""
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    out = np.zeros_like(x)
    for c in range(2):
        out[:, c] = fftconvolve(x[:, c], ir[:, c])[: len(x)]
    return x * (1 - wet) + out * wet


def pan(x, p):
    """p: -1 (sol) .. 1 (sağ); skaler veya dizi."""
    a = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


def place(buf, sig, t0):
    i = int(round(t0 * SR))
    if i >= len(buf):
        return
    if i < 0:
        sig = sig[-i:]; i = 0
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n]


# ============================================================================ Müzik
def pad_voice(freq, n, rng, cutoff_h, detune_cents=7, voices=3, harmonics=14):
    """Additif 'analog' pad: dedune edilmiş testere benzeri, harmonik alanda yumuşak alçak geçiren."""
    t = t_axis(n)
    out = np.zeros(n)
    for v in range(voices):
        cents = (v - (voices - 1) / 2) * detune_cents
        f = freq * 2 ** (cents / 1200)
        ph = rng.uniform(0, 2 * np.pi)
        for k in range(1, harmonics + 1):
            if f * k > 9000:
                break
            w = (1.0 / k) / (1 + (k / cutoff_h) ** 4)
            if np.isscalar(w):
                out += w * np.sin(2 * np.pi * f * k * t + ph * k)
            else:
                out += w * np.sin(2 * np.pi * f * k * t + ph * k)
    return out / voices


def ney_note(freq_from, freq_to, dur, rng, vib_rate=5.2, breath=0.22):
    n = int(dur * SR)
    t = t_axis(n)
    glide = np.minimum(1, t / 0.09)
    f = freq_from + (freq_to - freq_from) * glide
    vib_amt = np.clip((t - 0.25) / 0.5, 0, 1) * 0.012
    f = f * (1 + vib_amt * np.sin(2 * np.pi * vib_rate * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) + 0.22 * np.sin(2 * ph + 0.3) + 0.08 * np.sin(3 * ph + 0.7) + 0.03 * np.sin(4 * ph)
    noise = bp(rng.standard_normal(n), max(200, freq_to * 1.2), min(9000, freq_to * 4.5)) * breath
    e = env_adsr(n, 0.12, 0.2, 0.85, min(0.25, dur * 0.4), 0.85)
    chiff = np.exp(-t * 30) * bp(rng.standard_normal(n), 2000, 7000) * 0.3
    return (tone * 0.8 + noise + chiff) * e


def ney_phrase(scale_midi, rng, length=4.0):
    """Makam dizisinde, dominantten başlayıp karara inen kısa bir seyir."""
    deg = len(scale_midi) - 4 + rng.integers(0, 3)
    notes, t, out = [], 0.0, []
    cur = scale_midi[min(deg, len(scale_midi) - 1)]
    while t < length:
        step = rng.choice([-1, -1, -1, 1, 0, -2, 1])
        deg = int(np.clip(deg + step, 0, len(scale_midi) - 1))
        nxt = scale_midi[deg]
        d = float(rng.choice([0.35, 0.5, 0.5, 0.8, 1.2]))
        if t + d > length:
            d = max(0.6, length - t + 0.6)
            nxt = scale_midi[0] if rng.random() < 0.6 else scale_midi[4]
        notes.append((cur, nxt, t, d))
        cur = nxt
        t += d
    for a, b, t0, d in notes:
        out.append((t0, ney_note(midi_hz(a), midi_hz(b), d + 0.12, rng)))
    total = np.zeros(int((t + 1.0) * SR))
    for t0, s in out:
        place(total, s, t0)
    return total


def drum_hit(kind, rng):
    n = int(0.6 * SR)
    t = t_axis(n)
    if kind == "dum":
        f = 52 + 70 * np.exp(-t * 28)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
        skin = bp(rng.standard_normal(n), 100, 900) * np.exp(-t * 40) * 0.4
        return body + skin
    f = 220 + 140 * np.exp(-t * 50)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22) * 0.5
    slap = bp(rng.standard_normal(n), 1500, 6000) * np.exp(-t * 60) * 0.5
    return body + slap


def music_bed(dur, cfg, seg_starts, rng):
    n = int(dur * SR)
    makam = MAKAMS.get(cfg.get("makam", "hicaz"), MAKAMS["hicaz"])
    root = root_midi(cfg.get("root", "D"), 2)
    t = t_axis(n)
    out = np.zeros((n, 2))
    layers = set(cfg.get("layers", ["drone", "pad", "ney", "drum"]))

    if "drone" in layers:
        lfo = 4 + 2.5 * np.sin(2 * np.pi * t / 17.0)  # yavaş açılan filtre
        d = pad_voice(midi_hz(root), n, rng, 4.0) * 0.55 + pad_voice(midi_hz(root + 7), n, rng, 3.5) * 0.3
        d = d * (0.85 + 0.15 * np.sin(2 * np.pi * t / 9.0)) * np.clip(lfo / 6.5, 0.4, 1.0)
        out += pan(lp(d, 900), 0) * 0.6

    if "pad" in layers:
        # Her bölümde makama uygun bir akor rengi; 1.5 sn çapraz geçiş
        chords = cfg.get("chords") or [[12, 16, 19], [17, 20, 24], [15, 19, 22], [12, 13, 19], [10, 15, 19]]
        bounds = list(seg_starts) + [dur]
        for i in range(len(bounds) - 1):
            a, b = max(0, bounds[i] - 0.8), min(dur, bounds[i + 1] + 0.8)
            m = int((b - a) * SR)
            ch = chords[(i + cfg.get("seed", 0)) % len(chords)]
            s = sum(pad_voice(midi_hz(root + 12 + iv), m, rng, 3.0, voices=2, harmonics=8) for iv in ch) / len(ch)
            e = env_adsr(m, 1.2, 0.5, 1.0, 1.2, 1.0)
            seg = pan(lp(s * e, 2200), np.sin(i * 1.3) * 0.4) * 0.38
            i0 = int(a * SR)
            out[i0:i0 + m] += seg[: n - i0]

    if "ney" in layers:
        scale = [root + 24 + iv for iv in makam] + [root + 36 + iv for iv in makam[1:4]]
        ir = reverb_ir(3.2, seed=5, bright=0.4)
        ney = np.zeros(n)
        for i, s0 in enumerate(seg_starts):
            if i % 2 == 0 or i == len(seg_starts) - 1:
                ph = ney_phrase(scale, rng, length=float(rng.uniform(3.0, 5.0)))
                place(ney, ph * 0.5, s0 + 0.2)
        out += apply_reverb(pan(ney, -0.2)[:, 0] * 1.4, ir, 0.45) * 0.55

    if "drum" in layers:
        bpm = cfg.get("bpm", 76)
        beat = 60 / bpm
        # Sofyan usulü (4/4): DÜM - te ke
        pattern = [(0, "dum"), (2, "tek"), (3, "tek")]
        drums = np.zeros(n)
        start = seg_starts[min(len(seg_starts) - 1, cfg.get("drum_from", 3))]
        bar = 0
        tb = start
        while tb < dur - 3:
            for b, k in pattern:
                place(drums, drum_hit(k, rng) * (0.9 if k == "dum" else 0.35), tb + b * beat)
            tb += 4 * beat
            bar += 1
        fade = np.clip((t - start) / 4.0, 0, 1) * np.clip((dur - 2.5 - t) / 2.0, 0, 1)
        out += apply_reverb(drums * fade * 0.5, reverb_ir(1.4, seed=8, bright=0.3), 0.25)

    # Giriş/çıkış
    out *= np.clip(t / 0.4, 0, 1)[:, None]
    out *= np.clip((dur - t) / 1.6, 0, 1)[:, None]
    return out


# ============================================================================ Ortam
def amb_cave(n, rng):
    rumble = lp(brown(n, rng), 220) * 0.5
    air = bp(pink(n, rng), 300, 1800) * 0.03
    return pan(rumble + air, 0)


def amb_drips(n, rng, rate=0.9):
    out = np.zeros(n)
    t = 0.3
    while t < n / SR:
        f0 = rng.uniform(900, 2400)
        m = int(0.25 * SR)
        tt = t_axis(m)
        f = f0 * (1 + 0.8 * np.exp(-tt * 60))
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 25) * rng.uniform(0.2, 0.6)
        place(out, s, t)
        t += rng.exponential(1 / rate) + 0.25
    st = pan(out, np.sin(t_axis(n) * 0.7) * 0.6)
    return apply_reverb(st, reverb_ir(3.5, seed=3, bright=0.6), 0.6)


def amb_sea(n, rng):
    t = t_axis(n)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * 0.11 * t + 1) * np.sin(2 * np.pi * 0.047 * t)
    body = bp(brown(n, rng), 120, 900) * swell
    hiss = hp(pink(n, rng), 2500) * np.clip(swell - 0.6, 0, 1) * 0.15
    l = body + hiss
    r = np.roll(body, int(0.3 * SR)) + hiss
    return np.stack([l, r], 1) * 0.9


def amb_wind(n, rng):
    t = t_axis(n)
    lo = bp(pink(n, rng), 250, 700)
    hi = bp(pink(n, rng), 700, 1800)
    m = 0.5 + 0.5 * np.sin(2 * np.pi * t / 7.3)
    g = 0.6 + 0.4 * np.sin(2 * np.pi * t / 4.1 + 2)
    w = (lo * (1 - m) + hi * m * 0.6) * g * 0.25
    return pan(w, np.sin(2 * np.pi * t / 11) * 0.5)


def amb_gulls(n, rng, count=3):
    out = np.zeros(n)
    for _ in range(count):
        t0 = rng.uniform(0.5, max(0.6, n / SR - 1.5))
        for j in range(int(rng.integers(2, 4))):
            m = int(0.22 * SR)
            tt = t_axis(m)
            f = 1500 + 700 * np.exp(-tt * 12) - 300 * tt
            mod = np.sin(2 * np.pi * 380 * tt) * 0.4
            s = np.sin(2 * np.pi * np.cumsum(f * (1 + mod * 0.1)) / SR) * np.sin(np.pi * tt / tt[-1]) ** 2
            place(out, bp(s, 900, 4500) * 0.08, t0 + j * 0.26)
    return apply_reverb(pan(out, rng.uniform(-0.6, 0.6)), reverb_ir(2.0, seed=4), 0.4)


AMBIENCES = {"cave": amb_cave, "drips": amb_drips, "sea": amb_sea, "wind": amb_wind, "gulls": amb_gulls}


# ============================================================================ Efektler
def sfx_whoosh(rng, dur=0.7, direction=1):
    n = int(dur * SR)
    t = t_axis(n)
    x = rng.standard_normal(n)
    bands = [bp(x, lo, hi) for lo, hi in [(200, 600), (600, 1800), (1800, 5000)]]
    u = t / dur
    w = [np.exp(-((u - c) ** 2) / 0.04) for c in (0.2, 0.5, 0.75)]
    s = sum(b * ww for b, ww in zip(bands, w))
    e = np.sin(np.pi * u) ** 2
    return pan(s * e * 0.9, direction * (u * 2 - 1) * 0.8)


def sfx_riser(rng, dur=1.6):
    n = int(dur * SR)
    t = t_axis(n)
    u = t / dur
    noise = hp(rng.standard_normal(n), 800) * u ** 2 * 0.25
    f = 180 * 2 ** (u * 2.2)
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(4 + 18 * u) / SR)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 1.5 * trem * 0.25
    s = (noise + tone) * np.clip((1 - u) * 30, 0, 1)
    return apply_reverb(pan(s, 0), reverb_ir(1.5, seed=2), 0.3)


def sfx_impact(rng, size=1.0):
    n = int(2.4 * SR)
    t = t_axis(n)
    f = 42 + 90 * np.exp(-t * 16)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    crack = lp(rng.standard_normal(n), 3500) * np.exp(-t * 30) * 0.6
    tail = lp(rng.standard_normal(n), 400) * np.exp(-t * 3) * 0.25
    s = (sub * 1.0 + crack + tail) * size
    return apply_reverb(pan(s, 0), reverb_ir(2.8, seed=7, bright=0.3), 0.35)


def sfx_shimmer(rng, root_m=62, makam="hicaz", dur=1.6):
    n = int(dur * SR)
    out = np.zeros(n)
    sc = MAKAMS.get(makam, MAKAMS["hicaz"])
    picks = [root_m + 36 + sc[i] for i in rng.choice(len(sc), 4, replace=False)]
    for j, m in enumerate(sorted(picks)):
        k = int(j * 0.06 * SR)
        tt = t_axis(n - k)
        f = midi_hz(m)
        s = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2.01 * tt)) * np.exp(-tt * 2.6) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * tt))
        out[k:] += s * 0.18
    return apply_reverb(pan(out, 0.2), reverb_ir(2.5, seed=9, bright=0.9), 0.55)


def sfx_flash(rng):
    n = int(0.9 * SR)
    t = t_axis(n)
    tss = hp(rng.standard_normal(n), 3000) * np.exp(-t * 9) * 0.25
    thump = np.sin(2 * np.pi * (60 + 60 * np.exp(-t * 30)) * t) * np.exp(-t * 10) * 0.6
    return apply_reverb(pan(tss + thump, 0), reverb_ir(1.2, seed=11), 0.3)


# ============================================================================ Miks
def voice_chain(v):
    v = hp(v, 75)
    # hafif presence (+2 dB 3 kHz civarı) ve yumuşak kompresyon
    v = v + bp(v, 2200, 4500) * 0.25
    env = np.convolve(np.abs(v), np.ones(int(0.01 * SR)) / int(0.01 * SR), mode="same")
    thr = 0.25
    gain = np.where(env > thr, (thr + (env - thr) / 3) / (env + 1e-9), 1.0)
    v = v * gain
    return apply_reverb(v, reverb_ir(0.6, seed=21, bright=0.4, predelay=0.01), 0.08)


def duck_envelope(voice_mono, depth=0.62, attack=0.04, release=0.45):
    env = np.sqrt(np.convolve(voice_mono ** 2, np.ones(int(0.03 * SR)) / int(0.03 * SR), mode="same"))
    act = np.clip(env / (env.max() * 0.15 + 1e-9), 0, 1)
    out = np.zeros_like(act)
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    y = 0.0
    # tek kutuplu attack/release takipçisi (vektörize edilemediği için seyrek örnekleyip enterpole et)
    step = 64
    xs = act[::step]
    ys = np.zeros_like(xs)
    a, r = np.exp(-step / (attack * SR)), np.exp(-step / (release * SR))
    for i, x in enumerate(xs):
        c = a if x > y else r
        y = c * y + (1 - c) * x
        ys[i] = y
    out = np.interp(np.arange(len(act)), np.arange(len(xs)) * step, ys)
    return 1 - depth * out


def loudness_normalize(x, target=-14.0, ceiling_db=-1.0):
    import pyloudnorm as pyln

    meter = pyln.Meter(SR)
    lufs = meter.integrated_loudness(x)
    x = x * 10 ** ((target - lufs) / 20)
    # Yumuşak sınırlayıcı (4x aşırı örneklemeli tepe tahminiyle)
    ceil = 10 ** (ceiling_db / 20)
    for _ in range(3):
        from scipy.signal import resample_poly

        peak = max(np.abs(resample_poly(x[:, c], 4, 1)).max() for c in range(x.shape[1]))
        if peak <= ceil:
            break
        k = 0.98 * ceil
        x = np.where(np.abs(x) > k * 0.7, np.sign(x) * (k * 0.7 + (k * 0.3) * np.tanh((np.abs(x) - k * 0.7) / (k * 0.3))), x)
    final = meter.integrated_loudness(x)
    return x, lufs, final
