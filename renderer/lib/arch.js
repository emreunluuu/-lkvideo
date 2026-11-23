// Prosedürel mimari: kubbe, minare, cami, Ayasofya, Galata, Kız Kulesi, asma köprü.
// Birimler metre. Telifli model/görsel kullanılmaz; her şey kodla üretilir.
import * as THREE from 'three';
import { rng } from './util.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...o });

export function materials(pal = {}) {
  return {
    wall: std(pal.wall || '#c8a487'),
    lead: std(pal.lead || '#6f7c86', { roughness: 0.55, metalness: 0.35 }),
    stone: std(pal.stone || '#b9a68f'),
    dark: std(pal.dark || '#2a2522'),
    window: new THREE.MeshBasicMaterial({ color: pal.window || '#ffbf70' }),
    gold: std(pal.gold || '#d9a441', { metalness: 0.8, roughness: 0.3, emissive: '#3a2200' }),
  };
}

export function dome(r, hScale = 1, mat, seg = 32) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.scale.y = hScale;
  return m;
}

/** Alem (tepe süsü): küçük küre dizisi + ince çubuk. */
export function finial(h, mat) {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.03, h * 0.03, h, 6), mat);
  rod.position.y = h / 2; g.add(rod);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(h * (0.12 - i * 0.025), 10, 8), mat);
    s.position.y = h * (0.25 + i * 0.22); g.add(s);
  }
  return g;
}

/** Osmanlı minaresi: gövde, şerefeler, kurşun külah. */
export function minaret({ height = 60, radius = 1.6, balconies = 2, mats }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.25, radius * 1.3, height * 0.12, 12), mats.wall);
  base.position.y = height * 0.06; g.add(base);
  const shaftH = height * 0.72;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius, shaftH, 16), mats.wall);
  shaft.position.y = height * 0.12 + shaftH / 2; g.add(shaft);
  for (let i = 0; i < balconies; i++) {
    const y = height * 0.12 + shaftH * (0.55 + (0.42 * i) / Math.max(1, balconies - 0.5));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.55, radius * 1.05, radius * 0.9, 16), mats.stone);
    b.position.y = y; g.add(b);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.5, radius * 0.12, 6, 20), mats.stone);
    rail.rotation.x = Math.PI / 2; rail.position.y = y + radius * 0.7; g.add(rail);
  }
  const top = height * 0.84;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.9, height * 0.05, 12), mats.wall);
  upper.position.y = top + height * 0.025; g.add(upper);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.95, height * 0.16, 16), mats.lead);
  cone.position.y = top + height * 0.05 + height * 0.08; g.add(cone);
  const f = finial(height * 0.05, mats.gold);
  f.position.y = top + height * 0.21; g.add(f);
  return g;
}

/** Klasik Osmanlı camisi silueti (parametrik). */
export function mosque({ domeR = 13, minarets = 4, semi = 2, seed = 1, mats, minaretH }) {
  const r = rng(seed);
  const g = new THREE.Group();
  const w = domeR * 2.6;
  const baseH = domeR * 1.15;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, w * (semi ? 1.35 : 1.0)), mats.wall);
  base.position.y = baseH / 2; g.add(base);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(domeR * 1.02, domeR * 1.06, domeR * 0.35, 32), mats.wall);
  drum.position.y = baseH + domeR * 0.175; g.add(drum);
  const d = dome(domeR, 0.85, mats.lead); d.position.y = baseH + domeR * 0.35; g.add(d);
  const fin = finial(domeR * 0.35, mats.gold); fin.position.y = baseH + domeR * 0.35 + domeR * 0.85; g.add(fin);
  // Pencere halkası
  const winGeo = new THREE.BoxGeometry(domeR * 0.09, domeR * 0.18, 0.3);
  const n = 20;
  const wins = new THREE.InstancedMesh(winGeo, mats.window, n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    o.position.set(Math.cos(a) * domeR * 1.07, baseH + domeR * 0.17, Math.sin(a) * domeR * 1.07);
    o.rotation.set(0, -a + Math.PI / 2, 0); o.updateMatrix(); wins.setMatrixAt(i, o.matrix);
  }
  g.add(wins);
  // Yarım kubbeler
  for (let s = 0; s < semi; s++) {
    const sd = dome(domeR * 0.72, 0.8, mats.lead, 24);
    sd.position.set(0, baseH * 0.98, (s === 0 ? 1 : -1) * domeR * 0.95);
    g.add(sd);
  }
  // Köşe kubbecikleri
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const sm = dome(domeR * 0.28, 0.9, mats.lead, 16);
    sm.position.set(x * w * 0.36, baseH, z * w * 0.45);
    g.add(sm);
  }
  // Avlu revak kubbeleri
  const court = Math.floor(3 + r() * 3);
  for (let i = 0; i < court; i++) {
    for (const side of [-1, 1]) {
      const c = dome(domeR * 0.18, 0.9, mats.lead, 12);
      c.position.set(side * w * 0.45, baseH * 0.45, w * 0.7 + i * domeR * 0.42);
      const cb = new THREE.Mesh(new THREE.BoxGeometry(domeR * 0.4, baseH * 0.45, domeR * 0.42), mats.wall);
      cb.position.set(side * w * 0.45, baseH * 0.225, w * 0.7 + i * domeR * 0.42);
      g.add(c, cb);
    }
  }
  const mh = minaretH || domeR * 4.6;
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 2.2], [-1, 2.2]].slice(0, minarets);
  corners.forEach(([x, z], i) => {
    const m = minaret({ height: mh * (i < 4 ? 1 : 0.85), radius: domeR * 0.12, balconies: i < 2 ? 3 : 2, mats });
    m.position.set(x * w * 0.58, 0, z * w * 0.6);
    g.add(m);
  });
  return g;
}

/**
 * Ayasofya (stilize): ana kubbe çapı ~31 m, tepe ~55 m. 4 minare, payandalar, 40 pencereli kasnak.
 */
export function hagiaSophia(mats) {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(70, 30, 76), mats.wall); main.position.y = 15; g.add(main);
  // Kubbeyi taşıyan kare kule (kemer duvarları)
  const sq = new THREE.Mesh(new THREE.BoxGeometry(36, 12, 36), mats.wall); sq.position.y = 36; g.add(sq);
  // Pandantif + kasnak
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(16.2, 17, 4.5, 40), mats.wall); drum.position.y = 44.2; g.add(drum);
  const wg = new THREE.BoxGeometry(1.1, 2.4, 0.5);
  const wins = new THREE.InstancedMesh(wg, mats.window, 40);
  const o = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    o.position.set(Math.cos(a) * 16.6, 44.4, Math.sin(a) * 16.6); o.rotation.set(0, -a + Math.PI / 2, 0);
    o.updateMatrix(); wins.setMatrixAt(i, o.matrix);
  }
  g.add(wins);
  const d = dome(15.6, 0.55, mats.lead, 48); d.position.y = 46.4; g.add(d); // tepe ≈ 46.4+8.6 = 55
  const fin = finial(3, mats.gold); fin.position.y = 54.8; g.add(fin);
  // Kaburgalar
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 15.5), mats.stone);
    rib.position.set(Math.cos(a) * 7.5, 51.5, Math.sin(a) * 7.5);
    rib.lookAt(0, 55.5, 0); g.add(rib);
  }
  // Doğu-batı yarım kubbeleri ve eksedralar
  for (const s of [-1, 1]) {
    const sd = dome(15.5, 0.6, mats.lead, 32); sd.position.set(0, 36, s * 20); g.add(sd);
    for (const x of [-1, 1]) { const ex = dome(6.5, 0.7, mats.lead, 16); ex.position.set(x * 11, 31, s * 30); g.add(ex); }
  }
  // Kuzey-güney payandaları
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, 38, 12), mats.wall);
    b.position.set(x * 24, 19, z * 14); g.add(b);
  }
  // Minareler (köşelerde)
  const pos = [[-38, 40], [38, 40], [-38, -40], [38, -40]];
  pos.forEach(([x, z], i) => {
    const m = minaret({ height: i < 2 ? 60 : 56, radius: 1.8, balconies: i < 2 ? 2 : 1, mats });
    m.position.set(x, 0, z); g.add(m);
  });
  return g;
}

/** Galata Kulesi (stilize, ~67 m). */
export function galataTower(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.6, 50, 32), mats.stone); body.position.y = 25; g.add(body);
  const gal = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 8.2, 3, 32), mats.stone); gal.position.y = 51.5; g.add(gal);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 5, 32), mats.wall); top.position.y = 55.5; g.add(top);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(8.2, 10.5, 32), mats.lead); cone.position.y = 63.2; g.add(cone);
  const wg = new THREE.BoxGeometry(1.0, 2.2, 0.4);
  const wins = new THREE.InstancedMesh(wg, mats.window, 48);
  const o = new THREE.Object3D(); let k = 0;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + row * 0.2;
    const y = row === 2 ? 55.5 : 20 + row * 16;
    const rr = row === 2 ? 7.7 : 8.5;
    o.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); o.rotation.set(0, -a + Math.PI / 2, 0);
    o.updateMatrix(); wins.setMatrixAt(k++, o.matrix);
  }
  g.add(wins);
  return g;
}

/** Kız Kulesi: kayalık adacık + yapı + ince kule. */
export function maidenTower(mats, seed = 4) {
  const r = rng(seed);
  const g = new THREE.Group();
  const rocks = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + r() * 4, 0), mats.dark);
    const a = r() * Math.PI * 2, d = 6 + r() * 10;
    rk.position.set(Math.cos(a) * d, -1.5 + r() * 1.5, Math.sin(a) * d * 0.8);
    rk.scale.y = 0.45; rk.rotation.set(r(), r(), r());
    rocks.add(rk);
  }
  g.add(rocks);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 3, 7), mats.stone); plat.position.y = 0.5; g.add(plat);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 10), mats.wall); hall.position.set(-2, 5.5, 0); g.add(hall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.8, 10.6), mats.lead); roof.position.set(-2, 9.3, 0); g.add(roof);
  const towerB = new THREE.Mesh(new THREE.BoxGeometry(7, 14, 7), mats.wall); towerB.position.set(7, 9, 0); g.add(towerB);
  const towerC = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 8, 12), mats.wall); towerC.position.set(7, 20, 0); g.add(towerC);
  const gal = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 3.4, 1.0, 12), mats.stone); gal.position.set(7, 24.5, 0); g.add(gal);
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 3.2, 12), mats.wall); cupola.position.set(7, 26.6, 0); g.add(cupola);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.0, 6.5, 12), mats.lead); cone.position.set(7, 31.4, 0); g.add(cone);
  const fin = finial(2, mats.gold); fin.position.set(7, 34.4, 0); g.add(fin);
  const wg = new THREE.BoxGeometry(0.9, 1.8, 0.3);
  const wins = new THREE.InstancedMesh(wg, mats.window, 28);
  const o = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; o.position.set(7 + Math.cos(a) * 3.35, 20.5, Math.sin(a) * 3.35); o.rotation.set(0, -a + Math.PI / 2, 0); o.updateMatrix(); wins.setMatrixAt(k++, o.matrix); }
  for (let i = 0; i < 8; i++) { o.position.set(-9.5 + i * 2.1, 5.5, 5.05); o.rotation.set(0, 0, 0); o.updateMatrix(); wins.setMatrixAt(k++, o.matrix); }
  for (let i = 0; i < 8; i++) { o.position.set(-9.5 + i * 2.1, 5.5, -5.05); o.updateMatrix(); wins.setMatrixAt(k++, o.matrix); }
  g.add(wins);
  const beacon = new THREE.PointLight('#ffb46b', 60, 60, 1.6); beacon.position.set(7, 22, 6); g.add(beacon);
  return g;
}

/** Asma köprü: iki kule, zincir eğrisi kablolar, askılar, tabliye ışıkları. */
export function suspensionBridge({ span = 1074, towerH = 165, deckH = 64, mats, lightColor = '#ffd08a' }) {
  const g = new THREE.Group();
  const half = span / 2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 1.5, 3, 33), mats.dark); deck.position.y = deckH; g.add(deck);
  for (const x of [-half, half]) {
    for (const z of [-14, 14]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(6, towerH, 5), mats.stone);
      leg.position.set(x, towerH / 2, z); g.add(leg);
    }
    for (const y of [deckH + 10, towerH - 6]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 33), mats.stone); beam.position.set(x, y, 0); g.add(beam);
    }
  }
  const cableMat = new THREE.MeshBasicMaterial({ color: lightColor });
  for (const z of [-14, 14]) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const x = -half * 1.5 + (i / 60) * span * 1.5;
      let y;
      if (Math.abs(x) <= half) y = deckH + 6 + (towerH - deckH - 6) * Math.pow(x / half, 2);
      else y = towerH - (Math.abs(x) - half) / (half * 0.5) * (towerH - deckH - 2);
      pts.push(new THREE.Vector3(x, y, z));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 1.2, 6), cableMat);
    g.add(tube);
    // Askılar
    const hg = new THREE.CylinderGeometry(0.25, 0.25, 1, 4);
    const n = 40;
    const hangers = new THREE.InstancedMesh(hg, cableMat, n);
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const x = -half + ((i + 0.5) / n) * span;
      const top = deckH + 6 + (towerH - deckH - 6) * Math.pow(x / half, 2);
      const h = top - deckH;
      o.position.set(x, deckH + h / 2, z); o.scale.set(1, h, 1); o.updateMatrix(); hangers.setMatrixAt(i, o.matrix);
    }
    g.add(hangers);
  }
  return g;
}
