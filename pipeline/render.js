#!/usr/bin/env node
// Manifest'ten videoyu kare kare render eder (headless Chromium + Three.js) ve ffmpeg ile kodlar.
//
// Kullanım:
//   node pipeline/render.js --manifest out/manifest.json --out out/video_noaudio.mp4 [--workers 3]
//   node pipeline/render.js --manifest out/manifest.json --stills 0.5,4,12 --stills-dir out/stills
//
// Not: Playwright'ın Chromium'u WebGL için SwiftShader (CPU) kullanır; GPU gerekmez.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));

const manifestPath = path.resolve(args.manifest);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const W = manifest.width, H = manifest.height, FPS = manifest.fps || 30;
const totalFrames = Math.round(manifest.duration * FPS);

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let file;
      if (p === '/manifest.json') file = manifestPath;
      else if (p.startsWith('/node_modules/') || p.startsWith('/renderer/')) file = path.join(ROOT, p);
      else { res.writeHead(404); return res.end(); }
      if (!file.startsWith(ROOT) && file !== manifestPath) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver/.test(t)) console.log('[page]', t); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/renderer/index.html?manifest=/manifest.json`);
  await page.waitForFunction('window.__ready || window.__error', null, { timeout: 300000 });
  const err = await page.evaluate('window.__error');
  if (err) throw new Error('Renderer hatası: ' + err);
  return page;
}

// Varsayılan: SwiftShader (CPU) — her makinede çalışır ama yavaştır (4K'da ~10-16 sn/kare).
// Ekran kartı olan makinede RENDER_GPU=1 ile donanım WebGL kullanılır (4K'da saniyede birkaç kare).
const launchOpts = process.env.RENDER_GPU === '1'
  ? { headless: true, args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] }
  : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] };

async function grab(page, t, frame) {
  await page.evaluate(([tt, f]) => window.renderFrame(tt, f), [t, frame]);
  // timeout: 0 — 4K'da geçiş kareleri (iki sahne) CPU'da 30 sn'yi aşabilir
  return page.screenshot({ type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: W, height: H }, timeout: 0 });
}

async function renderStills(port) {
  const browser = await chromium.launch(launchOpts);
  const page = await openPage(browser, port);
  const dir = path.resolve(args['stills-dir'] || path.dirname(manifestPath));
  fs.mkdirSync(dir, { recursive: true });
  for (const s of String(args.stills).split(',')) {
    const t = parseFloat(s);
    const buf = await grab(page, t, Math.round(t * FPS));
    const f = path.join(dir, `still_${t.toFixed(2)}.jpg`);
    fs.writeFileSync(f, buf);
    console.log('still', f);
  }
  await browser.close();
}

function encoder(outFile) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', args.preset || 'medium', '-crf', String(args.crf || 16), '-pix_fmt', 'yuv420p', '-r', String(FPS), outFile],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg çıkış kodu ' + c)))));
  return { ff, done };
}

const SEG = 30; // kare: devam ettirilebilir render için segment boyu

/** Bir worker: kuyruktan segment alır; tamamlanmış segmentleri atlar (çökme/yeniden başlatma sonrası devam). */
async function worker(port, queue, cacheDir, progress) {
  let browser = null, page = null;
  while (queue.length) {
    const sIdx = queue.shift();
    const file = path.join(cacheDir, `seg_${String(sIdx).padStart(4, '0')}.mp4`);
    const a = sIdx * SEG, b = Math.min(totalFrames, a + SEG);
    if (fs.existsSync(file)) { progress(b - a, true); continue; }
    if (!page) { browser = await chromium.launch(launchOpts); page = await openPage(browser, port); }
    const part = file + '.part.mp4';
    const { ff, done } = encoder(part);
    for (let f = a; f < b; f++) {
      const buf = await grab(page, f / FPS, f);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      progress(1);
    }
    ff.stdin.end();
    await done;
    fs.renameSync(part, file);
  }
  if (browser) await browser.close();
}

(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  try {
    if (args.stills) { await renderStills(port); return; }
    const outFile = path.resolve(args.out || path.join(path.dirname(manifestPath), 'video_noaudio.mp4'));
    const workers = Math.max(1, parseInt(args.workers || Math.max(1, Math.min(4, os.cpus().length - 1)), 10));
    // Önbellek klasörü manifest içeriğine bağlı: manifest değişirse eski kareler kullanılmaz
    const hashObj = require('crypto').createHash('sha1').update(fs.readFileSync(manifestPath)).update(fs.readFileSync(path.join(__dirname, 'render.js')));
    // Sahne kodu değişince de önbellek geçersiz olsun
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(path.join(ROOT, 'renderer')).sort()) if (/\.(js|html|css)$/.test(f)) hashObj.update(fs.readFileSync(f));
    const hash = hashObj.digest('hex').slice(0, 10);
    const cacheDir = path.join(path.dirname(outFile), `.render-${hash}`);
    fs.mkdirSync(cacheDir, { recursive: true });
    let doneFrames = 0, renderedFrames = 0; const t0 = Date.now();
    const progress = (n, cached = false) => {
      doneFrames += n; if (!cached) renderedFrames += n;
      if (doneFrames % 30 === 0 || doneFrames === totalFrames) {
        const el = (Date.now() - t0) / 1000, rate = renderedFrames / Math.max(el, 1e-3);
        const eta = rate > 0 ? (totalFrames - doneFrames) / rate : 0;
        process.stdout.write(`\rkare ${doneFrames}/${totalFrames}  ${rate.toFixed(2)} kare/sn  kalan ~${Math.round(eta)} sn   `);
      }
    };
    const nSeg = Math.ceil(totalFrames / SEG);
    const queue = [...Array(nSeg).keys()];
    await Promise.all([...Array(workers)].map(() => worker(port, queue, cacheDir, progress)));
    process.stdout.write('\n');
    const list = path.join(cacheDir, 'list.txt');
    fs.writeFileSync(list, [...Array(nSeg).keys()].map((i) => `file '${path.join(cacheDir, `seg_${String(i).padStart(4, '0')}.mp4`)}'`).join('\n'));
    await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outFile], { stdio: 'inherit' })
      .on('close', (c) => (c === 0 ? res() : rej(new Error('concat başarısız')))));
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('video:', outFile);
  } finally {
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
