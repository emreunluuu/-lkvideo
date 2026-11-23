"""3D motoru headless Chrome'da çalıştırıp kareleri ffmpeg'e aktarır."""
import asyncio, base64, json, os, shutil, subprocess, sys, time
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent / "engine" / "render.html"
GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
           "--ignore-gpu-blocklist", "--disable-gpu-sandbox"]


def _chrome():
    for p in [os.environ.get("CHROME_PATH"), "/usr/bin/google-chrome", shutil.which("google-chrome"),
              shutil.which("chromium"), shutil.which("chromium-browser")]:
        if p and Path(p).exists():
            return p
    return None  # Playwright'ın kendi Chromium'u


async def _open(p, data):
    exe = _chrome()
    browser = await p.chromium.launch(executable_path=exe, args=GL_ARGS) if exe else await p.chromium.launch(args=GL_ARGS)
    page = await browser.new_page()
    page.on("console", lambda m: print("[chrome]", m.text) if m.type == "error" else None)
    await page.add_init_script(f"window.__DATA = {json.dumps(data, ensure_ascii=False)};")
    await page.goto(ENGINE.as_uri())
    for _ in range(600):
        st = await page.evaluate("[window.__ready||false, window.__error||null, window.__fontOK]")
        if st[1]:
            raise RuntimeError("Motor hatası:\n" + st[1])
        if st[0]:
            if not st[2]:
                print("UYARI: Montserrat yazı tipi bulunamadı, yedek yazı tipi kullanılıyor.")
            return browser, page
        await asyncio.sleep(0.1)
    raise TimeoutError("Motor hazır olmadı")


def _decode(url):
    return base64.b64decode(url.split(",", 1)[1])


async def _render(data, out_mp4, stills, frames):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser, page = await _open(p, data)
        for t, path, thumb in stills:
            url = await page.evaluate("([t,th])=>renderFrame(0,{t:t,thumb:th,q:.95})", [t, thumb])
            Path(path).write_bytes(_decode(url))
        if out_mp4:
            fps = data["fps"]
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(fps),
                   "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", str(out_mp4)]
            ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            t0 = time.time()
            for i in frames:
                url = await page.evaluate("i=>renderFrame(i)", i)
                ff.stdin.write(_decode(url))
                if i % (fps * 5) == 0:
                    el = time.time() - t0
                    print(f"  kare {i}/{frames[-1]}  ({el:.0f} sn)", flush=True)
            ff.stdin.close()
            if ff.wait() != 0:
                raise RuntimeError("ffmpeg kodlama hatası")
        await browser.close()


def render(data, out_mp4=None, stills=(), frames=None):
    """data: motor verisi; stills: [(zaman, dosya, kapak_mı)]"""
    if out_mp4 and frames is None:
        frames = list(range(int(round(data["total"] * data["fps"]))))
    asyncio.run(_render(data, out_mp4, list(stills), frames or []))


if __name__ == "__main__":
    d = json.load(open(sys.argv[1]))
    render(d, stills=[(float(x), f"/tmp/still_{x}.jpg", False) for x in sys.argv[2:]])
