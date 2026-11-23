// Yerebatan'daki iki Medusa başı: biri baş aşağı, biri yan. Prosedürel taş heykel.
import * as THREE from 'three';
import { CameraPath, rng } from '../lib/util.js';
import { makeWater, makeDust } from '../lib/env.js';

function taperedTube(curve, r0, r1, seg = 48) {
  const g = new THREE.TubeGeometry(curve, seg, 1, 8, false);
  const pos = g.attributes.position;
  // Her halka için merkezden uzaklığı yarıçapa göre ölçekle
  const ring = 9; // radialSegments + 1
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const c = curve.getPoint(u);
    const rad = r0 + (r1 - r0) * u;
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j;
      const v = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c).multiplyScalar(rad).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function medusaHead(mat, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const headGeo = new THREE.SphereGeometry(1, 64, 48);
  // Yüz hatları için vertex deformasyonu: alın, elmacık, çene
  const p = headGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0) {
      const front = z;
      z += 0.08 * Math.exp(-((x * x) / 0.02 + ((y - 0.05) * (y - 0.05)) / 0.12)) * front; // burun sırtı
      z -= 0.1 * Math.exp(-(((Math.abs(x) - 0.32) ** 2) / 0.02 + ((y - 0.12) ** 2) / 0.015)) * front; // göz çukuru
      z += 0.05 * Math.exp(-(((Math.abs(x) - 0.42) ** 2) / 0.03 + ((y + 0.15) ** 2) / 0.03)) * front; // elmacık
    }
    if (y < -0.4) { x *= 0.85 + 0.15 * (1 + y); }
    p.setXYZ(i, x * 0.84, y * 1.08, z * 0.86);
  }
  headGeo.computeVertexNormals();
  g.add(new THREE.Mesh(headGeo, mat));
  // Burun
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 12), mat);
  nose.position.set(0, -0.02, 0.86); nose.rotation.x = Math.PI * 0.62; g.add(nose);
  // Göz kapakları ve gözler
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), mat);
    eye.scale.set(1.3, 0.75, 0.6); eye.position.set(sx * 0.28, 0.12, 0.72); g.add(eye);
    const lid = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 20, Math.PI), mat);
    lid.position.set(sx * 0.28, 0.13, 0.74); lid.scale.set(1.2, 0.8, 1); g.add(lid);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), mat);
    brow.rotation.z = Math.PI / 2 + sx * 0.18; brow.position.set(sx * 0.3, 0.32, 0.74); g.add(brow);
  }
  // Dudaklar ve çene
  const lip1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), mat); lip1.scale.set(1.2, 0.35, 0.5); lip1.position.set(0, -0.36, 0.75); g.add(lip1);
  const lip2 = lip1.clone(); lip2.position.y = -0.45; lip2.scale.set(1.05, 0.38, 0.5); g.add(lip2);
  // Yılan saçlar
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2;
    const el = 0.15 + r() * 1.1; // yükseklik açısı
    const start = new THREE.Vector3(Math.cos(a) * Math.cos(el) * 0.82, Math.sin(el) * 0.95 - 0.05, Math.sin(a) * Math.cos(el) * 0.78 - 0.1);
    if (start.z > 0.45 && start.y < 0.6) start.y += 0.45; // yüzü kapatmasın
    const dir = start.clone().normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const pts = [];
    const L = 0.9 + r() * 0.8, waves = 1.5 + r() * 1.5, amp = 0.12 + r() * 0.1, ph = r() * 6;
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      const q = start.clone().addScaledVector(dir, u * L).addScaledVector(side, Math.sin(u * waves * Math.PI * 2 + ph) * amp * u);
      q.y += Math.sin(u * 3.0 + ph) * 0.1 * u - u * u * 0.25;
      pts.push(q);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(taperedTube(curve, 0.085, 0.03), mat));
    const end = curve.getPoint(1), tan = curve.getTangent(1);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat);
    sh.scale.set(1, 0.7, 1.6); sh.position.copy(end); sh.lookAt(end.clone().add(tan)); g.add(sh);
  }
  return g;
}

function plinthColumn(stone) {
  const g = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), stone); block.position.y = 1.2 + 0.6; g.add(block);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 9, 24), stone); shaft.position.y = 2.4 + 4.5; g.add(shaft);
  return g;
}

export function medusa(ctx, p) {
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(p.fog || '#0a0807');
  scene.background = fogCol;
  scene.fog = new THREE.FogExp2(fogCol, 0.07);

  const stone = new THREE.MeshStandardMaterial({ color: '#7f8580', roughness: 0.55, metalness: 0.0 });
  const colStone = new THREE.MeshStandardMaterial({ color: '#4a423c', roughness: 0.8 });

  // Baş aşağı Medusa
  const h1 = medusaHead(stone, 11);
  h1.rotation.z = Math.PI; h1.scale.setScalar(1.2); h1.position.set(0, 1.05, 0);
  const c1 = plinthColumn(colStone); c1.position.set(0, 1.0, -0.3);
  // Yan yatırılmış Medusa
  const h2 = medusaHead(stone, 29);
  h2.rotation.set(0, -0.5, Math.PI / 2); h2.scale.setScalar(1.2); h2.position.set(7.5, 1.05, -6);
  const c2 = plinthColumn(colStone); c2.position.set(7.5, 0.75, -6.3);
  scene.add(h1, c1, h2, c2);

  // Arka plan sütunları
  const bg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.5, 11, 16), colStone, 30);
  const o = new THREE.Object3D(); const r = rng(5); let k = 0;
  for (let i = -3; i < 3; i++) for (let j = 1; j < 6; j++) {
    o.position.set(i * 4.9 + 2.45, 5.5, -j * 4.9 - 4); o.rotation.y = r(); o.updateMatrix(); bg.setMatrixAt(k++, o.matrix);
  }
  scene.add(bg);

  const water = makeWater({ size: 300, deep: '#020605', shallow: '#0a1612', skyHor: '#3a2a1a', skyTop: '#050403', sunColor: '#ffb070', sunDir: [0, 0.3, -1], fogColor: fogCol.getStyle(), fogDensity: 0.045, waveScale: 0.9, speed: 0.25, sparkle: 0.15, opacity: 0.88 });
  water.position.y = 0.45; scene.add(water);

  // Işık: önden-alttan sıcak, arkadan soğuk kontur
  scene.add(new THREE.HemisphereLight('#5a6a78', '#1a0c06', 1.6));
  const warm = new THREE.SpotLight('#ffd6b0', 12, 30, 0.5, 0.7, 1.4); warm.position.set(1.5, 0.6, 5); warm.target = h1; scene.add(warm);
  const warm2 = new THREE.SpotLight('#ffd6b0', 11, 30, 0.5, 0.7, 1.4); warm2.position.set(9, 0.6, -1.5); warm2.target = h2; scene.add(warm2);
  const rim = new THREE.DirectionalLight('#7fc4e6', 2.4); rim.position.set(-4, 6, -8); scene.add(rim);
  const rim2 = new THREE.PointLight('#5fa8c8', 8, 14, 1.6); rim2.position.set(4, 4, -9); scene.add(rim2);
  scene.add(makeDust({ count: 300, box: [16, 7, 16], center: [3, 3, -3], color: '#ffcc99', size: 0.05, opacity: 0.6, seed: 9 }));

  const camera = new THREE.PerspectiveCamera(48, ctx.aspect, 0.1, 200);
  const path = new CameraPath([
    { t: 0, pos: [0.8, 1.6, 5.8], look: [0, 1.4, 0], fov: 44 },
    { t: 0.42, pos: [-2.6, 2.6, 7.0], look: [0.2, 2.2, 0], fov: 50 },
    { t: 0.62, pos: [3.0, 2.4, 5.5], look: [6.0, 1.6, -5], fov: 50 },
    { t: 1, pos: [5.6, 1.9, 0.2], look: [7.5, 1.3, -6], fov: 46 },
  ]);
  const dur = p.duration || 7;
  return {
    scene, camera, bloom: { strength: 0.5, radius: 0.5, threshold: 0.8 },
    anchors: { head1: new THREE.Vector3(0, 2.5, 0), head2: new THREE.Vector3(7.5, 2.6, -6) },
    update(t, g) {
      path.apply(camera, t / dur, 0.08, g);
      warm.intensity = 12 + Math.sin(g * 7.0) * 0.6 + Math.sin(g * 13.0) * 0.4; // titrek alev hissi
    },
  };
}
