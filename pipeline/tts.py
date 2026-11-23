"""Google Cloud Text-to-Speech (REST, ek paket gerekmez).

Anahtar GOOGLE_TTS_API_KEY ortam değişkeninden okunur. Anahtar yoksa ya da
ağ erişimi yoksa None döner; pipeline sessiz anlatımla (tahmini sürelerle)
devam eder.
"""
import base64, json, os, urllib.request, urllib.error, wave
from pathlib import Path

API = "https://texttospeech.googleapis.com/v1/text:synthesize?key={key}"
VOICES = "https://texttospeech.googleapis.com/v1/voices?languageCode=tr-TR&key={key}"


def available():
    return bool(os.environ.get("GOOGLE_TTS_API_KEY"))


def list_voices():
    key = os.environ["GOOGLE_TTS_API_KEY"]
    with urllib.request.urlopen(VOICES.format(key=key), timeout=30) as r:
        return [(v["name"], v.get("ssmlGender")) for v in json.load(r).get("voices", [])]


def synthesize(text, out_wav, voice):
    """text -> 48 kHz mono WAV. Başarılıysa süreyi (sn) döndürür, değilse None."""
    key = os.environ.get("GOOGLE_TTS_API_KEY")
    if not key:
        return None
    name = voice.get("name", "tr-TR-Wavenet-E")
    cfg = {"audioEncoding": "LINEAR16", "sampleRateHertz": 48000, "speakingRate": voice.get("rate", 0.95)}
    if "Chirp" not in name:                       # Chirp3-HD sesleri perde ayarını desteklemez
        cfg["pitch"] = voice.get("pitch", -2.0)
    body = {"input": {"text": text}, "voice": {"languageCode": "tr-TR", "name": name}, "audioConfig": cfg}
    req = urllib.request.Request(API.format(key=key), data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            audio = base64.b64decode(json.load(r)["audioContent"])
    except (urllib.error.URLError, KeyError, TimeoutError) as e:
        print(f"  TTS hatası ({e}); sessiz anlatıma geçiliyor.")
        return None
    Path(out_wav).write_bytes(audio)
    with wave.open(str(out_wav)) as w:
        return w.getnframes() / w.getframerate()


def estimate_duration(text, rate=0.95):
    """TTS yokken Türkçe anlatım süresi tahmini (Wavenet ~2.4 kelime/sn @1.0)."""
    words = len(text.split())
    return words * 0.40 / rate + 0.2
