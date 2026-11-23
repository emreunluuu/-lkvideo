"""Onaylanan videoyu platformlara yükler. ONAY OLMADAN HİÇBİR ŞEY YAYINLANMAZ.

    python -m pipeline.publish output/2026-11-23-istanbul-gizemi --approve   # izledim, onaylıyorum
    python -m pipeline.publish output/2026-11-23-istanbul-gizemi --upload youtube,instagram,tiktok

Kimlik bilgileri yalnızca ortam değişkenlerinden / GitHub Secrets'tan okunur:
  YouTube  : YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, [YOUTUBE_PRIVACY=public|unlisted|private]
  Instagram: INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN (profesyonel hesap, instagram_content_publish izni)
  TikTok   : TIKTOK_ACCESS_TOKEN (video.publish kapsamı), [TIKTOK_PRIVACY=SELF_ONLY|PUBLIC_TO_EVERYONE]
Bilgisi eksik platform atlanır; video o platforma elle yüklemeye hazır bırakılır.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import requests

GRAPH = "https://graph.facebook.com/v21.0"


def load(folder: Path) -> dict:
    return json.loads((folder / "metadata.json").read_text(encoding="utf-8"))


def save(folder: Path, meta: dict):
    (folder / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


# ----------------------------------------------------------------------------- YouTube
def youtube(folder: Path, meta: dict) -> str:
    cid, sec, ref = (os.environ.get(k) for k in ("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"))
    if not (cid and sec and ref):
        raise SkipPlatform("YOUTUBE_* bilgileri yok")
    tok = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": cid, "client_secret": sec, "refresh_token": ref, "grant_type": "refresh_token"}, timeout=30)
    tok.raise_for_status()
    auth = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    title = meta["title"]
    if meta["format"] == "short" and "#shorts" not in title.lower():
        title = (title + " #Shorts")[:100]
    body = {
        "snippet": {"title": title[:100], "description": meta["description"][:5000], "tags": meta["tags"],
                    "categoryId": meta.get("category_id", "27"), "defaultLanguage": "tr", "defaultAudioLanguage": "tr"},
        "status": {"privacyStatus": os.environ.get("YOUTUBE_PRIVACY", "public"), "selfDeclaredMadeForKids": False,
                   # "Değiştirilmiş veya sentetik içerik" beyanı (gerçekçi görünen sentetik içerik için)
                   "containsSyntheticMedia": bool(meta.get("synthetic_disclosure", True))},
    }
    video = folder / meta["files"]["video"]
    init = requests.post("https://www.googleapis.com/upload/youtube/v3/videos",
                         params={"uploadType": "resumable", "part": "snippet,status"},
                         headers={**auth, "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(video.stat().st_size)},
                         json=body, timeout=60)
    init.raise_for_status()
    with open(video, "rb") as f:
        up = requests.put(init.headers["Location"], data=f, headers={**auth, "Content-Type": "video/mp4"}, timeout=3600)
    up.raise_for_status()
    vid = up.json()["id"]
    # Altyazı (.srt)
    srt = folder / meta["files"]["srt"]
    if srt.exists():
        files = {"metadata": (None, json.dumps({"snippet": {"videoId": vid, "language": "tr", "name": "Türkçe"}}), "application/json"),
                 "file": ("altyazi.srt", srt.read_bytes(), "application/octet-stream")}
        r = requests.post("https://www.googleapis.com/upload/youtube/v3/captions", params={"part": "snippet", "uploadType": "multipart"},
                          headers=auth, files=files, timeout=120)
        if not r.ok:
            print("  [youtube] altyazı yüklenemedi:", r.status_code, r.text[:200])
    # Kapak (Shorts için özel kapak API'de desteklenmez; uzun videolarda yüklenir)
    cover = folder / meta["files"]["cover"]
    if meta["format"] == "long" and cover.exists():
        requests.post("https://www.googleapis.com/upload/youtube/v3/thumbnails/set", params={"videoId": vid},
                      headers={**auth, "Content-Type": "image/jpeg"}, data=cover.read_bytes(), timeout=120)
    return f"https://youtu.be/{vid}"


# ----------------------------------------------------------------------------- Instagram
def instagram(folder: Path, meta: dict) -> str:
    uid, token = os.environ.get("INSTAGRAM_USER_ID"), os.environ.get("INSTAGRAM_ACCESS_TOKEN")
    if not (uid and token):
        raise SkipPlatform("INSTAGRAM_* bilgileri yok")
    if meta["format"] != "short":
        raise SkipPlatform("Reels yalnızca kısa (dikey) video için")
    caption = meta["title"] + "\n\n" + meta["description"][:2000]
    c = requests.post(f"{GRAPH}/{uid}/media", data={"media_type": "REELS", "upload_type": "resumable", "caption": caption,
                                                     "share_to_feed": "true", "access_token": token}, timeout=60)
    c.raise_for_status()
    cid = c.json()["id"]
    video = folder / meta["files"]["video"]
    r = requests.post(f"https://rupload.facebook.com/ig-api-upload/v21.0/{cid}",
                      headers={"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(video.stat().st_size)},
                      data=video.read_bytes(), timeout=3600)
    r.raise_for_status()
    for _ in range(60):  # işleme bitene kadar bekle
        s = requests.get(f"{GRAPH}/{cid}", params={"fields": "status_code", "access_token": token}, timeout=30).json()
        if s.get("status_code") == "FINISHED":
            break
        if s.get("status_code") == "ERROR":
            raise RuntimeError(f"Instagram işleme hatası: {s}")
        time.sleep(10)
    p = requests.post(f"{GRAPH}/{uid}/media_publish", data={"creation_id": cid, "access_token": token}, timeout=60)
    p.raise_for_status()
    return f"instagram media id {p.json()['id']}"


# ----------------------------------------------------------------------------- TikTok
def tiktok(folder: Path, meta: dict) -> str:
    token = os.environ.get("TIKTOK_ACCESS_TOKEN")
    if not token:
        raise SkipPlatform("TIKTOK_ACCESS_TOKEN yok")
    video = folder / meta["files"]["video"]
    size = video.stat().st_size
    chunk = min(size, 10 * 1024 * 1024)
    n = max(1, size // chunk)
    title = (meta["title"] + " " + " ".join(meta.get("hashtags", [])))[:2200]
    init = requests.post("https://open.tiktokapis.com/v2/post/publish/video/init/",
                         headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8"},
                         json={"post_info": {"title": title, "privacy_level": os.environ.get("TIKTOK_PRIVACY", "SELF_ONLY"),
                                             "disable_comment": False, "disable_duet": False, "disable_stitch": False,
                                             "is_aigc": bool(meta.get("synthetic_disclosure", True))},
                               "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": chunk, "total_chunk_count": n}},
                         timeout=60)
    init.raise_for_status()
    d = init.json()["data"]
    data = video.read_bytes()
    for i in range(n):
        a = i * chunk
        b = size if i == n - 1 else a + chunk
        r = requests.put(d["upload_url"], data=data[a:b], timeout=600,
                         headers={"Content-Type": "video/mp4", "Content-Range": f"bytes {a}-{b - 1}/{size}"})
        r.raise_for_status()
    return f"tiktok publish_id {d['publish_id']}"


class SkipPlatform(Exception):
    pass


PLATFORMS = {"youtube": youtube, "instagram": instagram, "tiktok": tiktok}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path)
    ap.add_argument("--approve", action="store_true", help="Videoyu izledim ve onaylıyorum")
    ap.add_argument("--upload", help="virgülle: youtube,instagram,tiktok")
    a = ap.parse_args()
    meta = load(a.folder)
    if a.approve:
        if meta.get("tts", {}).get("engine") != "google":
            sys.exit("Bu video ÖNİZLEME sesiyle üretildi. GOOGLE_TTS_API_KEY ile yeniden üretip öyle onaylayın.")
        meta["approved"] = True
        meta["approved_at"] = dt.datetime.now().isoformat(timespec="seconds")
        save(a.folder, meta)
        print("Onaylandı:", a.folder)
    if a.upload:
        if not meta.get("approved"):
            sys.exit("Video onaylanmamış. Önce izleyin ve --approve ile onaylayın.")
        results = meta.setdefault("published", {})
        for name in a.upload.split(","):
            name = name.strip()
            if name in results:
                print(f"[{name}] zaten yüklendi: {results[name]}")
                continue
            try:
                results[name] = PLATFORMS[name](a.folder, meta)
                print(f"[{name}] yüklendi: {results[name]}")
            except SkipPlatform as e:
                print(f"[{name}] atlandı ({e}) — {a.folder / meta['files']['video']} elle yüklemeye hazır.")
            except requests.HTTPError as e:
                print(f"[{name}] HATA {e.response.status_code}: {e.response.text[:300]}")
            save(a.folder, meta)


if __name__ == "__main__":
    main()
