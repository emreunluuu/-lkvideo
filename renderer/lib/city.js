// Şehir dokusu: zemin, alçak binalar (pencere ışıklı), ağaçlar, martılar.
import * as THREE from 'three';
import { rng } from './util.js';
import { makeLights } from './env.js';

let _winTex;
function windowTexture() {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  const r = rng(77);
  for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 14) {
    if (r() < 0.45) { g.fillStyle = r() < 0.7 ? '#ffb866' : '#ffe3b0'; g.fillRect(x, y, 7, 9); }
  }
  _winTex = new THREE.CanvasTexture(c);
  _winTex.wrapS = _winTex.wrapT = THREE.RepeatWrapping;
  _winTex.colorSpace = THREE.SRGBColorSpace;
  return _winTex;
}

/** Halka şeklinde dağılmış binalar. avoid(x,z) true dönerse oraya bina koyulmaz. */
export function buildings({ count = 500, rMin = 90, rMax = 520, hMin = 6, hMax = 22, seed = 3, color = '#3a3330', avoid = null, windows = 1.0 }) {
  const r = rng(seed);
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: '#ffffff', emissiveMap: windowTexture(), emissiveIntensity: 0.9 * windows });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const o = new THREE.Object3D(); let k = 0;
  const roofs = [];
  for (let i = 0; i < count * 3 && k < count; i++) {
    const a = r() * Math.PI * 2, d = rMin + Math.pow(r(), 0.8) * (rMax - rMin);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid && avoid(x, z)) continue;
    const w = 8 + r() * 14, h = hMin + r() * (hMax - hMin), dd = 8 + r() * 14;
    o.position.set(x, 0, z); o.rotation.y = r() * Math.PI; o.scale.set(w, h, dd); o.updateMatrix();
    mesh.setMatrixAt(k++, o.matrix);
    if (r() < 0.5) roofs.push([x, h + 1, z]);
  }
  mesh.count = k;
  const g = new THREE.Group(); g.add(mesh);
  g.add(makeLights(roofs, { color: '#ffcf8a', size: 3, opacity: 0.5 }));
  return g;
}

export function trees({ count = 80, rMin = 50, rMax = 90, seed = 9, avoid = null }) {
  const r = rng(seed);
  const geo = new THREE.ConeGeometry(3, 11, 7); geo.translate(0, 5.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#1e2b1f', roughness: 1 }), count);
  const o = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < count * 3 && k < count; i++) {
    const a = r() * Math.PI * 2, d = rMin + r() * (rMax - rMin);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid && avoid(x, z)) continue;
    const s = 0.7 + r() * 0.7;
    o.position.set(x, 0, z); o.scale.set(s, s * (0.8 + r() * 0.6), s); o.rotation.y = r() * 6; o.updateMatrix(); mesh.setMatrixAt(k++, o.matrix);
  }
  mesh.count = k;
  return mesh;
}

/** Daire çizerek süzülen martılar (kanat çırpma animasyonlu). */
export function gulls({ count = 14, center = [0, 70, 0], radius = 60, seed = 4, color = '#e8e2da', scale = 1.6 }) {
  const r = rng(seed);
  const g = new THREE.Group();
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.4, 0, 0, -0.4, 1.6, 0.2, 0]), 3));
  wingGeo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const L = new THREE.Mesh(wingGeo, mat), R = new THREE.Mesh(wingGeo, mat);
    R.scale.x = -1;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.7, 2, 6), mat); body.rotation.x = Math.PI / 2;
    b.add(L, R, body); b.scale.setScalar(scale * (0.8 + r() * 0.4));
    b.userData = { ph: r() * Math.PI * 2, rad: radius * (0.6 + r() * 0.6), h: (r() - 0.5) * 20, sp: 0.12 + r() * 0.08, flap: 6 + r() * 3, L, R };
    birds.push(b); g.add(b);
  }
  g.userData.update = (t) => {
    for (const b of birds) {
      const u = b.userData;
      const a = u.ph + t * u.sp;
      const x = center[0] + Math.cos(a) * u.rad, z = center[2] + Math.sin(a) * u.rad, y = center[1] + u.h + Math.sin(t * 0.5 + u.ph) * 3;
      b.position.set(x, y, z);
      b.lookAt(center[0] + Math.cos(a + 0.1) * u.rad, y, center[2] + Math.sin(a + 0.1) * u.rad);
      const f = Math.sin(t * u.flap + u.ph) * 0.6;
      u.L.rotation.z = f; u.R.rotation.z = -f;
    }
  };
  return g;
}
