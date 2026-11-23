// Ortak yardımcılar: easing, deterministik rastgelelik, gürültü, kamera yolları.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const easeOutBack = (t, s = 1.70158) => { t = clamp(t) - 1; return t * t * ((s + 1) * t + s) + 1; };
export const range = (t, a, b) => clamp((t - a) / (b - a));

// Mulberry32 — sahne üretimi her render'da aynı olsun diye tohumlu RNG.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Basit 2D value noise (arazi yükseklikleri için).
export function makeNoise2D(seed = 1) {
  const r = rng(seed);
  const p = new Float32Array(512);
  for (let i = 0; i < 512; i++) p[i] = r();
  const h = (x, y) => p[((x * 73856093) ^ (y * 19349663)) & 511];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}
export function fbm(noise, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); a *= 0.5; f *= 2.03; }
  return s;
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Kamera yolu: anahtar kareler [{t:0..1, pos:[x,y,z], look:[x,y,z], fov, roll}]
 * Catmull-Rom ile pürüzsüz, tüm yol tek bir easing ile zamanlanır.
 */
export class CameraPath {
  constructor(keys, ease = easeInOutCubic) {
    this.keys = keys.slice().sort((a, b) => a.t - b.t);
    this.ease = ease;
    this.posCurve = new THREE.CatmullRomCurve3(this.keys.map((k) => V(k.pos)), false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(this.keys.map((k) => V(k.look)), false, 'centripetal');
  }
  // Anahtar zamanlarını eğri parametresine eşle (parça parça doğrusal).
  _u(t) {
    const k = this.keys, n = k.length;
    if (n === 1) return 0;
    t = clamp(t, k[0].t, k[n - 1].t);
    for (let i = 0; i < n - 1; i++) {
      if (t <= k[i + 1].t) {
        const f = (t - k[i].t) / Math.max(1e-6, k[i + 1].t - k[i].t);
        return (i + f) / (n - 1);
      }
    }
    return 1;
  }
  _interp(t, prop, def) {
    const k = this.keys;
    for (let i = 0; i < k.length - 1; i++) {
      if (t <= k[i + 1].t) {
        const f = smooth((t - k[i].t) / Math.max(1e-6, k[i + 1].t - k[i].t));
        return lerp(k[i][prop] ?? def, k[i + 1][prop] ?? def, f);
      }
    }
    return k[k.length - 1][prop] ?? def;
  }
  apply(camera, tNorm, shake = 0, time = 0) {
    const t = this.ease(clamp(tNorm));
    const u = this._u(t);
    const p = this.posCurve.getPoint(u);
    const l = this.lookCurve.getPoint(u);
    if (shake > 0) {
      // El kamerası hissi: düşük frekanslı, deterministik sarsıntı.
      p.x += Math.sin(time * 1.3) * 0.6 * shake + Math.sin(time * 3.1) * 0.25 * shake;
      p.y += Math.sin(time * 1.7 + 1.2) * 0.4 * shake;
      l.x += Math.sin(time * 0.9 + 2.0) * 0.5 * shake;
    }
    camera.position.copy(p);
    camera.up.set(0, 1, 0);
    camera.lookAt(l);
    const roll = this._interp(t, 'roll', 0);
    if (roll) camera.rotateZ(roll);
    const fov = this._interp(t, 'fov', camera.fov);
    if (fov !== camera.fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
}

export const col = (c) => new THREE.Color(c);
