// Prosedürel PBR dokuları (albedo + normal + pürüzlülük). Telifli doku kullanılmaz; hepsi koddan.
// Dokular döşenebilir (tileable) üretilir ve önbelleğe alınır.
import * as THREE from 'three';
import { rng } from './util.js';

const cache = new Map();

/** Döşenebilir value-noise alanı (periyot = P kafes hücresi). */
function makeTileNoise(P, seed) {
  const r = rng(seed);
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
    const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** size x size döşenebilir fbm alanı, [0,1]. base: en kaba frekansın periyodu (hücre). */
function fbmField(size, base, oct, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  const noises = [];
  for (let o = 0; o < oct; o++) noises.push(makeTileNoise(base << o, seed + o * 101));
  let norm = 0, a = 1;
  for (let o = 0; o < oct; o++) { norm += a; a *= gain; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0; a = 1;
    for (let o = 0; o < oct; o++) {
      const f = (base << o) / size;
      s += a * noises[o](x * f, y * f);
      a *= gain;
    }
    out[y * size + x] = s / norm;
  }
  return out;
}

function canvasTex(size, fill, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  fill(img.data);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function normalFromHeight(h, size, strength) {
  return canvasTex(size, (d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
      const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
      let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, false);
}

/**
 * Mermer/kireçtaşı: damarlı, aşınmış, gözenekli. Yerebatan sütunları farklı yapılardan devşirme
 * olduğundan tonlar değişken; örnek başına renk tonu ayrıca instanceColor ile verilir.
 */
export function marble({ size = 1024, seed = 3, base = [0.74, 0.70, 0.64], vein = [0.42, 0.38, 0.35] } = {}) {
  const key = `marble:${size}:${seed}:${base}:${vein}`;
  if (cache.has(key)) return cache.get(key);
  const warp = fbmField(size, 4, 5, seed);
  const fine = fbmField(size, 32, 4, seed + 7);
  const pits = rng(seed + 99);
  const h = new Float32Array(size * size);
  const alb = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const w = warp[i];
    // Damar: kıvrık sinüs bandı (döşenebilir olması için x üzerinden periyodik)
    const v = Math.abs(Math.sin((x / size) * Math.PI * 4 + w * 9.0 + (y / size) * Math.PI * 2));
    const veinAmt = Math.pow(1 - v, 46) * 0.45 + Math.pow(1 - v, 7) * 0.12;
    const cloud = (fine[i] - 0.5) * 0.18 + (w - 0.5) * 0.22;
    for (let c = 0; c < 3; c++) alb[i * 3 + c] = base[c] * (1 + cloud) * (1 - veinAmt) + vein[c] * veinAmt;
    h[i] = fine[i] * 0.6 + w * 0.4 - veinAmt * 0.15;
    rough[i] = 0.42 + fine[i] * 0.3 + veinAmt * 0.1;
  }
  // Gözenekler / küçük kırıklar
  for (let k = 0; k < size * 1.2; k++) {
    const px = Math.floor(pits() * size), py = Math.floor(pits() * size), rr = 1 + Math.floor(pits() * 2.5);
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      if (dx * dx + dy * dy > rr * rr) continue;
      const i = ((py + dy + size) % size) * size + ((px + dx + size) % size);
      h[i] -= 0.04; rough[i] = Math.min(1, rough[i] + 0.15);
      for (let c = 0; c < 3; c++) alb[i * 3 + c] *= 0.9;
    }
  }
  const map = canvasTex(size, (d) => { for (let i = 0; i < size * size; i++) { d[i * 4] = Math.min(255, alb[i * 3] * 255); d[i * 4 + 1] = Math.min(255, alb[i * 3 + 1] * 255); d[i * 4 + 2] = Math.min(255, alb[i * 3 + 2] * 255); d[i * 4 + 3] = 255; } }, true);
  const normalMap = normalFromHeight(h, size, 6.0);
  const roughnessMap = canvasTex(size, (d) => { for (let i = 0; i < size * size; i++) { const r = Math.min(255, rough[i] * 255); d[i * 4] = r; d[i * 4 + 1] = r; d[i * 4 + 2] = r; d[i * 4 + 3] = 255; } }, false);
  const res = { map, normalMap, roughnessMap };
  cache.set(key, res);
  return res;
}

/**
 * Bizans duvarcılığı: ince tuğlalar + kalın harç yatakları (tuğla ≈ harç kalınlığı).
 * Doku 1 birim = 1.2 m × 1.2 m kabul edilir.
 */
export function byzantineBrick({ size = 1024, seed = 5 } = {}) {
  const key = `brick:${size}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const r = rng(seed);
  const n1 = fbmField(size, 16, 4, seed);
  const n2 = fbmField(size, 64, 3, seed + 3);
  const rows = 12; // 1.2 m'de 12 sıra: 5 cm tuğla + 5 cm harç
  const bricksPerRow = 4; // ~30 cm tuğla boyu
  const rowH = size / rows;
  const tints = [];
  for (let i = 0; i < rows * bricksPerRow * 2; i++) tints.push([0.40 + r() * 0.16, 0.27 + r() * 0.09, 0.21 + r() * 0.06, r()]);
  const h = new Float32Array(size * size);
  const alb = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / rowH);
    const fy = (y % rowH) / rowH; // 0..1 sıra içinde
    const isBrickBand = fy > 0.22 && fy < 0.72; // ince tuğla, kalın harç
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const off = (row % 2) * 0.5;
      const bx = (x / size) * bricksPerRow + off;
      const bi = Math.floor(bx) % bricksPerRow;
      const fx = bx - Math.floor(bx);
      const joint = fx < 0.035 || fx > 0.965;
      const t = tints[(row * bricksPerRow + bi) % tints.length];
      const nn = (n1[i] - 0.5), ff = (n2[i] - 0.5);
      if (isBrickBand && !joint) {
        const edge = Math.min(fy - 0.22, 0.72 - fy, fx, 1 - fx) * 10;
        h[i] = 0.75 + Math.min(1, edge) * 0.15 + ff * 0.2;
        alb[i * 3] = t[0] * (1 + nn * 0.5 + ff * 0.3); alb[i * 3 + 1] = t[1] * (1 + nn * 0.5 + ff * 0.3); alb[i * 3 + 2] = t[2] * (1 + nn * 0.4);
        rough[i] = 0.75 + ff * 0.2;
      } else {
        // Kireç harcı (horasan): açık bej-gri, pürüzlü
        h[i] = 0.35 + nn * 0.25 + ff * 0.25;
        const m = 0.46 + nn * 0.22 + ff * 0.15;
        alb[i * 3] = m; alb[i * 3 + 1] = m * 0.93; alb[i * 3 + 2] = m * 0.84;
        rough[i] = 0.92;
      }
    }
  }
  const map = canvasTex(size, (d) => { for (let i = 0; i < size * size; i++) { d[i * 4] = Math.min(255, alb[i * 3] * 255); d[i * 4 + 1] = Math.min(255, alb[i * 3 + 1] * 255); d[i * 4 + 2] = Math.min(255, alb[i * 3 + 2] * 255); d[i * 4 + 3] = 255; } }, true);
  const normalMap = normalFromHeight(h, size, 9.0);
  const roughnessMap = canvasTex(size, (d) => { for (let i = 0; i < size * size; i++) { const v = Math.min(255, rough[i] * 255); d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }, false);
  const res = { map, normalMap, roughnessMap };
  cache.set(key, res);
  return res;
}

/** Su yüzeyi için döşenebilir dalgacık normal haritası. */
export function waterNormals({ size = 512, seed = 11 } = {}) {
  const key = `water:${size}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const a = fbmField(size, 8, 5, seed, 0.55);
  const t = normalFromHeight(a, size, 10.0);
  cache.set(key, t);
  return t;
}

/** Yumuşak, gürültülü sis bulutu sprite'ı (hacimsel pus için). */
export function hazeSprite({ size = 256, seed = 2 } = {}) {
  const key = `haze:${size}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const n = fbmField(size, 4, 5, seed);
  const t = canvasTex(size, (d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = x / size - 0.5, dy = y / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const fall = Math.max(0, 1 - r); const a = Math.pow(fall, 1.6) * (0.35 + 0.65 * n[i]);
      d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = a * 255;
    }
  }, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}
