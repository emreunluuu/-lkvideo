// Kız Kulesi: gün batımında denizin ortasında kule; efsane anında kulenin etrafında altın bir iz kıvrılır.
import * as THREE from 'three';
import { CameraPath, rng, smooth, range, easeInOutCubic, makeNoise2D, fbm } from '../lib/util.js';
import { makeSky, makeWater, makeDust, makeLights } from '../lib/env.js';
import { materials, maidenTower, mosque } from '../lib/arch.js';
import { gulls } from '../lib/city.js';

export function shoreline({ x0 = 320, depth = 220, length = 1600, seed = 5, color = '#1c1a22', lights = 1800, lightColor = '#ffc17a' }) {
  const noise = makeNoise2D(seed), r = rng(seed);
  const geo = new THREE.PlaneGeometry(depth, length, 60, 240); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const hAt = (x, z) => { const u = (x + depth / 2) / depth; return Math.max(0, u * 1.2 - 0.05) * (18 + fbm(noise, z * 0.006, x * 0.01, 4) * 70); };
  for (let i = 0; i < pos.count; i++) pos.setY(i, hAt(pos.getX(i), pos.getZ(i)) - 1);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  mesh.position.x = x0 + depth / 2;
  const g = new THREE.Group(); g.add(mesh);
  const pts = [];
  for (let i = 0; i < lights; i++) {
    const x = (r() - 0.5) * depth * 0.9, z = (r() - 0.5) * length;
    pts.push([x + x0 + depth / 2, hAt(x, z) + 0.5, z]);
  }
  g.add(makeLights(pts, { color: lightColor, size: 2.2, opacity: 0.8 }));
  g.userData.heightAt = (wx, z) => hAt(wx - x0 - depth / 2, z) - 1;
  return g;
}

export function maiden(ctx, p) {
  const scene = new THREE.Scene();
  const sky = p.sky || {};
  const sunDir = sky.sunDir || [1, 0.045, 0.18];
  const fogCol = new THREE.Color(sky.fog || '#6a4048');
  scene.fog = new THREE.Fog(fogCol, 300, 1500);
  scene.add(makeSky({ top: sky.top || '#1a1f45', horizon: sky.horizon || '#ff9a5a', bottom: '#2a1a22', sunColor: sky.sun || '#ffd08a', sunDir, sunSize: 0.025, sunGlow: 0.8, clouds: 0.7 }));
  const sea = makeWater({ size: 5000, deep: '#0d1a2e', shallow: '#3a3048', skyHor: sky.horizon || '#ff9a5a', skyTop: sky.top || '#1a1f45', sunColor: sky.sun || '#ffd08a', sunDir, fogColor: fogCol.getStyle(), fogDensity: 0.0008, waveScale: 0.45, speed: 0.8, sparkle: 1.4 });
  scene.add(sea);

  const mats = materials({ wall: '#d9c2a8', lead: '#5f6b75', stone: '#9c8c7c', dark: '#2a2420', window: '#ffcf8a' });
  const tower = maidenTower(mats, 4);
  scene.add(tower);

  const shore = shoreline({ x0: 420, seed: 8 });
  scene.add(shore);
  const m = mosque({ domeR: 9, minarets: 2, semi: 0, seed: 3, mats: materials({ wall: '#2d2830', lead: '#24222a', window: '#ffc27a' }), minaretH: 42 });
  m.position.set(470, shore.userData.heightAt(470, -120), -120); scene.add(m);

  scene.add(gulls({ count: 9, center: [0, 45, 0], radius: 45, seed: 11, scale: 1.2 }));
  scene.add(makeDust({ count: 200, box: [120, 40, 120], center: [0, 20, 0], color: '#ffe0b0', size: 0.35, opacity: 0.35, seed: 5 }));

  scene.add(new THREE.HemisphereLight('#8e7fb0', '#2a1c1c', 1.1));
  const sun = new THREE.DirectionalLight(sky.sun || '#ffd08a', 1.8); sun.position.set(sunDir[0] * 300, 60, sunDir[2] * 300); scene.add(sun);
  const fill = new THREE.DirectionalLight('#7f8fd0', 0.7); fill.position.set(-200, 80, 100); scene.add(fill);

  // Efsane izi: kuleyi saran altın sarmal
  const pts = [];
  for (let i = 0; i <= 140; i++) {
    const u = i / 140, a = u * Math.PI * 2 * 3.2;
    const rad = 13 - u * 7 + Math.sin(u * 30) * 0.6;
    pts.push(new THREE.Vector3(7 + Math.cos(a) * rad, 1.5 + u * 34, Math.sin(a) * rad));
  }
  const ribbonGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.28, 6);
  const ribbon = new THREE.Mesh(ribbonGeo, new THREE.MeshBasicMaterial({ color: p.accent || '#ffcf6a' }));
  scene.add(ribbon);
  const total = ribbonGeo.index.count; ribbonGeo.setDrawRange(0, 0);
  const head = new THREE.PointLight('#ffcf6a', 0, 40, 1.5); scene.add(head);
  const headCurve = new THREE.CatmullRomCurve3(pts);

  const camera = new THREE.PerspectiveCamera(50, ctx.aspect, 1, 6000);
  const path = new CameraPath([
    { t: 0, pos: [-190, 6, 70], look: [10, 20, 0], fov: 46 },
    { t: 0.5, pos: [-120, 12, 40], look: [8, 20, 0], fov: 44 },
    { t: 1, pos: [-62, 22, 10], look: [6, 20, 0], fov: 46, roll: 0.02 },
  ]);
  const dur = p.duration || 8;
  const lAt = p.cueTimes?.legend ?? dur * 0.35;
  return {
    scene, camera, bloom: { strength: 0.6, radius: 0.6, threshold: 0.9 },
    anchors: { top: new THREE.Vector3(7, 36, 0) },
    update(t, g) {
      path.apply(camera, t / dur, 0.12, g);
      const q = easeInOutCubic(range(t, lAt, lAt + 3.0));
      ribbonGeo.setDrawRange(0, Math.floor((total * q) / 3) * 3);
      head.position.copy(headCurve.getPoint(Math.max(0.001, q)));
      head.intensity = q > 0 && q < 1 ? 900 : 0;
    },
  };
}
