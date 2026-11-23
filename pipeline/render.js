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

const launchOpts = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] };

async function grab(page, t, frame) {
  await page.evaluate(([tt, f]) => window.renderFrame(tt, f), [t, frame]);
  return page.screenshot({ type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: W, height: H } });
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

async function renderChunk(port, idx, a, b, tmpDir, progress) {
  const browser = await chromium.launch(launchOpts);
  const page = await openPage(browser, port);
  const out = path.join(tmpDir, `chunk_${String(idx).padStart(2, '0')}.mp4`);
  const { ff, done } = encoder(out);
  for (let f = a; f < b; f++) {
    const buf = await grab(page, f / FPS, f);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    progress(1);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  return out;
}

(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  try {
    if (args.stills) { await renderStills(port); return; }
    const outFile = path.resolve(args.out || path.join(path.dirname(manifestPath), 'video_noaudio.mp4'));
    const workers = Math.max(1, parseInt(args.workers || Math.max(1, Math.min(4, os.cpus().length - 1)), 10));
    const tmpDir = fs.mkdtempSync(path.join(path.dirname(outFile), '.chunks-'));
    let doneFrames = 0; const t0 = Date.now();
    const progress = (n) => {
      doneFrames += n;
      if (doneFrames % 30 === 0 || doneFrames === totalFrames) {
        const el = (Date.now() - t0) / 1000, eta = (el / doneFrames) * (totalFrames - doneFrames);
        process.stdout.write(`\rkare ${doneFrames}/${totalFrames}  ${(doneFrames / el).toFixed(2)} kare/sn  kalan ~${Math.round(eta)} sn   `);
      }
    };
    const per = Math.ceil(totalFrames / workers);
    const jobs = [];
    for (let i = 0; i < workers; i++) {
      const a = i * per, b = Math.min(totalFrames, (i + 1) * per);
      if (a < b) jobs.push(renderChunk(port, i, a, b, tmpDir, progress));
    }
    const chunks = await Promise.all(jobs);
    process.stdout.write('\n');
    const list = path.join(tmpDir, 'list.txt');
    fs.writeFileSync(list, chunks.map((c) => `file '${c}'`).join('\n'));
    await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outFile], { stdio: 'inherit' })
      .on('close', (c) => (c === 0 ? res() : rej(new Error('concat başarısız')))));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('video:', outFile);
  } finally {
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
