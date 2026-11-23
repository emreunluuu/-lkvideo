// Final: tarihi yarımadanın siluetti — tepelerde camiler, minareler, karşıda Galata, uzakta asma köprü.
import * as THREE from 'three';
import { CameraPath, rng, makeNoise2D, fbm } from '../lib/util.js';
import { makeSky, makeWater, makeDust, makeLights } from '../lib/env.js';
import { materials, mosque, hagiaSophia, galataTower, suspensionBridge } from '../lib/arch.js';
import { gulls } from '../lib/city.js';

export function skyline(ctx, p) {
  const r = rng(p.seed || 61);
  const noise = makeNoise2D(p.seed || 61);
  const scene = new THREE.Scene();
  const sky = p.sky || {};
  const sunDir = sky.sunDir || [0.15, 0.05, -1];
  const fogCol = new THREE.Color(sky.fog || '#5a3a4a');
  scene.fog = new THREE.Fog(fogCol, 1100, 5200);
  scene.add(makeSky({ top: sky.top || '#121a3a', horizon: sky.horizon || '#ff8a4c', bottom: '#2a1a22', sunColor: sky.sun || '#ffcf86', sunDir, sunSize: 0.03, sunGlow: 0.7, clouds: 0.6, stars: 0.2, radius: 2800 }));
  const sea = makeWater({ size: 8000, deep: '#0b1426', shallow: '#3b2f48', skyHor: sky.horizon || '#ff8a4c', skyTop: sky.top || '#121a3a', sunColor: sky.sun || '#ffcf86', sunDir, fogColor: fogCol.getStyle(), fogDensity: 0.0005, waveScale: 0.3, speed: 0.7, sparkle: 1.6 });
  scene.add(sea);

  // Yarımada tepeleri (z = -650 civarında, x boyunca)
  const Z0 = -650;
  const geo = new THREE.PlaneGeometry(2600, 500, 260, 60); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const hill = (x, z) => {
    const u = (z - (Z0 + 250)) / -500; // 0 kıyı, 1 iç
    const ridge = 40 + 45 * Math.sin(x * 0.004 + 0.6) + fbm(noise, x * 0.006, 3.1, 4) * 60;
    return Math.max(-2, Math.min(1, u * 3.5) * ridge - 3);
  };
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i) + Z0; pos.setY(i, hill(x, z)); }
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#241c24', roughness: 1, flatShading: true }));
  land.position.z = Z0; scene.add(land);
  const lightPts = [];
  for (let i = 0; i < 2600; i++) { const x = (r() - 0.5) * 2400, z = Z0 + 230 - r() * 420; lightPts.push([x, hill(x, z) + 1, z]); }
  scene.add(makeLights(lightPts, { color: '#ffc27a', size: 3.2, opacity: 0.75 }));

  const siluet = materials({ wall: '#3a2f38', lead: '#2c2732', stone: '#3a3038', window: '#ffc27a', gold: '#d9a441' });
  const place = (obj, x, dz, s = 1, ry = 0) => { const z = Z0 + 150 - dz; obj.position.set(x, hill(x, z) - 2, z); obj.scale.setScalar(s); obj.rotation.y = ry; scene.add(obj); };
  place(hagiaSophia(siluet), -260, 40, 1.15, 0.3);
  place(mosque({ domeR: 13, minarets: 6, semi: 2, seed: 2, mats: siluet, minaretH: 64 }), -60, 70, 1.1, 0.1);
  place(mosque({ domeR: 14, minarets: 4, semi: 2, seed: 5, mats: siluet, minaretH: 72 }), 260, 140, 1.15, -0.2);
  place(mosque({ domeR: 9, minarets: 2, semi: 0, seed: 7, mats: siluet, minaretH: 48 }), 520, 60, 1.0, 0.4);
  place(mosque({ domeR: 8, minarets: 2, semi: 0, seed: 9, mats: siluet, minaretH: 44 }), -520, 90, 1.0, 0.0);

  // Sağ önde Galata (karşı kıyı) ve uzakta köprü
  const gal = galataTower(materials({ wall: '#4a3c40', stone: '#4a3c40', lead: '#2c2732', window: '#ffc27a' }));
  gal.position.set(820, 30, -260); gal.scale.setScalar(1.3); scene.add(gal);
  const gHill = new THREE.Mesh(new THREE.ConeGeometry(260, 60, 24), new THREE.MeshStandardMaterial({ color: '#201a22', roughness: 1, flatShading: true }));
  gHill.position.set(860, 0, -260); gHill.scale.y = 1; scene.add(gHill);
  const br = suspensionBridge({ mats: materials({ dark: '#1c1820', stone: '#2a2430' }), lightColor: '#ffd08a' });
  br.position.set(1300, 0, -1700); br.rotation.y = -0.9; br.scale.setScalar(0.9); scene.add(br);

  scene.add(gulls({ count: 16, center: [-40, 110, -280], radius: 160, seed: 3, scale: 3.2 }));
  scene.add(makeDust({ count: 250, box: [600, 120, 600], center: [0, 60, -200], color: '#ffd8a8', size: 1.2, opacity: 0.3, seed: 8 }));

  scene.add(new THREE.HemisphereLight('#7a6aa0', '#1a1214', 0.9));
  const sun = new THREE.DirectionalLight(sky.sun || '#ffcf86', 1.2); sun.position.set(sunDir[0] * 400, 80, sunDir[2] * 400); scene.add(sun);

  const camera = new THREE.PerspectiveCamera(48, ctx.aspect, 1, 9000);
  const path = new CameraPath([
    { t: 0, pos: [-140, 5, 120], look: [-60, 60, -600], fov: 44 },
    { t: 0.6, pos: [-40, 26, 40], look: [-20, 70, -600], fov: 46 },
    { t: 1, pos: [40, 55, -20], look: [0, 85, -600], fov: 50 },
  ]);
  const dur = p.duration || 9;
  return {
    scene, camera, bloom: { strength: 0.6, radius: 0.65, threshold: 0.9 },
    anchors: {},
    update(t, g) { path.apply(camera, t / dur, 0.15, g); },
  };
}
