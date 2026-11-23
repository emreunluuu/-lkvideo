// Stilize 3B harita: iki kıta arasında kıvrılan boğaz, şehir ışıkları, ışıkla çizilen boğaz hattı.
// Genel amaçlı: params ile kanal şekli, isimler ve renkler değişir (başka boğaz/nehir konuları için de kullanılabilir).
import * as THREE from 'three';
import { CameraPath, rng, makeNoise2D, fbm, smooth, range, easeInOutCubic } from '../lib/util.js';
import { makeWater, makeLights, makeSky } from '../lib/env.js';

export function strait_map(ctx, p) {
  const seed = p.seed || 21;
  const r = rng(seed);
  const noise = makeNoise2D(seed);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(p.fog || '#070b14');
  scene.background = fogCol;
  scene.fog = new THREE.Fog(fogCol, 180, 520);

  const NORTH = -110, SOUTH = 105;
  const cx = (z) => 14 * Math.sin(z * 0.032) + 7 * Math.sin(z * 0.085 + 1.0);
  const halfW = (z) => 4.2 + 2.4 * (0.5 + 0.5 * Math.sin(z * 0.05 + 2.0));
  // Haliç: güney ucuna yakın batıya açılan koy
  const hornA = new THREE.Vector2(cx(70), 70), hornB = new THREE.Vector2(-75, 38);
  const distSeg = (x, z, a, b) => {
    const ab = b.clone().sub(a), ap = new THREE.Vector2(x, z).sub(a);
    const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
    return new THREE.Vector2(x, z).distanceTo(a.clone().addScaledVector(ab, t));
  };
  // Pozitif = kara, negatif = su (kıyıya işaretli uzaklık)
  const landField = (x, z) => {
    const n = (fbm(noise, x * 0.03, z * 0.03, 4) - 0.5) * 18;
    const coastN = NORTH + n * 0.8, coastS = SOUTH + n * 0.8;
    let d = Math.abs(x - cx(z)) - halfW(z) - n * 0.15;
    d = Math.min(d, z - coastN); // kuzeyde Karadeniz
    d = Math.min(d, coastS - z); // güneyde Marmara
    d = Math.min(d, distSeg(x, z, hornA, hornB) - 2.6);
    return d;
  };

  const SX = 300, SZ = 340, NX = 240, NZ = 270;
  const geo = new THREE.PlaneGeometry(SX, SZ, NX, NZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(p.landLow || '#2a2a2e'), cHigh = new THREE.Color(p.landHigh || '#55504c'), cCoast = new THREE.Color(p.coast || '#6a5a48');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = landField(x, z);
    let h;
    if (d > 0) {
      const hill = fbm(noise, x * 0.02 + 10, z * 0.02 - 4, 5);
      h = 0.6 + smooth(d / 14) * (hill * 16 + 1.5);
      c.copy(cLow).lerp(cHigh, Math.min(1, h / 12));
      if (d < 2.0) c.lerp(cCoast, 1 - d / 2.0);
    } else {
      h = -2 - Math.min(6, -d * 0.6);
      c.set('#0b1622');
    }
    pos.setY(i, h);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  scene.add(land);

  const water = makeWater({ size: 1200, deep: '#04101c', shallow: '#0d2a40', skyHor: '#1d3550', skyTop: '#070b14', sunColor: '#bcd8ff', sunDir: [0.3, 0.35, -1], fogColor: fogCol.getStyle(), fogDensity: 0.0022, waveScale: 0.8, speed: 0.4, sparkle: 0.12 });
  water.position.y = 0.0; scene.add(water);

  // Şehir ışıkları: boğaza yakın yoğun, uzaklaştıkça seyrek
  const pts = [];
  let tries = 0;
  while (pts.length < (p.lights || 5200) && tries < 200000) {
    tries++;
    const z = NORTH + 10 + r() * (SOUTH - NORTH + 5);
    const x = cx(z) + (r() - 0.5) * 2 * (8 + Math.pow(r(), 2.2) * 110);
    const d = landField(x, z);
    if (d < 0.6) continue;
    const dens = Math.exp(-Math.abs(x - cx(z)) / 45) * (z > -40 ? 1 : 0.45);
    if (r() > dens) continue;
    const i = Math.round(((x + SX / 2) / SX) * NX), j = Math.round(((z + SZ / 2) / SZ) * NZ);
    const y = pos.getY(Math.min(pos.count - 1, j * (NX + 1) + i));
    pts.push([x, y + 0.6, z]);
  }
  scene.add(makeLights(pts, { color: p.lightColor || '#ffc477', size: 1.1, opacity: 0.85 }));

  // Işıkla çizilen boğaz hattı
  const linePts = [];
  for (let z = NORTH - 6; z <= SOUTH + 6; z += 3) linePts.push(new THREE.Vector3(cx(z), 0.4, z));
  const curve = new THREE.CatmullRomCurve3(linePts);
  const tubeGeo = new THREE.TubeGeometry(curve, 200, 0.55, 8, false);
  const tubeMat = new THREE.MeshBasicMaterial({ color: p.accent || '#7fd6ff', transparent: true, opacity: 0.95 });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  scene.add(tube);
  const total = tubeGeo.index.count;
  tubeGeo.setDrawRange(0, 0);
  // Uç noktalarda işaretçi halkalar
  const mk = (z) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 40), new THREE.MeshBasicMaterial({ color: p.accent || '#7fd6ff' }));
    m.rotation.x = -Math.PI / 2; m.position.set(cx(z), 0.6, z); scene.add(m); return m;
  };
  const m1 = mk(NORTH - 4), m2 = mk(SOUTH + 4);

  scene.add(new THREE.HemisphereLight('#8fb0d8', '#0a0d12', 2.0));
  const moon = new THREE.DirectionalLight('#c9dcff', 1.6); moon.position.set(80, 120, -60); scene.add(moon);

  const camera = new THREE.PerspectiveCamera(50, ctx.aspect, 1, 2000);
  const path = new CameraPath([
    { t: 0, pos: [0, 300, 60], look: [0, 0, 0], fov: 50, roll: 0 },
    { t: 0.55, pos: [-25, 210, 120], look: [2, 0, -5], fov: 50, roll: 0.02 },
    { t: 1, pos: [-55, 120, 175], look: [5, 0, -25], fov: 48, roll: 0.04 },
  ], easeInOutCubic);
  const dur = p.duration || 7;
  const drawAt = p.cueTimes?.draw ?? dur * 0.35;
  return {
    scene, camera, bloom: { strength: 0.9, radius: 0.5, threshold: 0.6 },
    anchors: {
      europe: new THREE.Vector3(-42, 12, 10), asia: new THREE.Vector3(48, 12, -10),
      blacksea: new THREE.Vector3(0, 0, NORTH - 35), marmara: new THREE.Vector3(10, 0, SOUTH + 25),
      mid: new THREE.Vector3(cx(-10), 1, -10),
    },
    update(t, g) {
      path.apply(camera, t / dur, 0.0, g);
      const q = easeInOutCubic(range(t, drawAt, drawAt + 1.8));
      tubeGeo.setDrawRange(0, Math.floor((total * q) / 3) * 3);
      const s1 = smooth(range(t, drawAt - 0.2, drawAt + 0.3)), s2 = smooth(range(t, drawAt + 1.6, drawAt + 2.1));
      m1.scale.setScalar(Math.max(0.001, s1 * (1 + 0.08 * Math.sin(g * 5))));
      m2.scale.setScalar(Math.max(0.001, s2 * (1 + 0.08 * Math.sin(g * 5 + 1))));
    },
  };
}
