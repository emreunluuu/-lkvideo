// Ayasofya: alacakaranlıkta yörünge çekimi, cephe aydınlatması, 55 m ölçü çizgisi, martılar.
import * as THREE from 'three';
import { CameraPath, smooth, range, easeOutCubic } from '../lib/util.js';
import { makeSky, makeDust, makeWater } from '../lib/env.js';
import { materials, hagiaSophia, mosque } from '../lib/arch.js';
import { buildings, trees, gulls } from '../lib/city.js';

export function hagia(ctx, p) {
  const scene = new THREE.Scene();
  const sky = p.sky || {};
  const sunDir = sky.sunDir || [-0.6, 0.06, -1];
  const fogCol = new THREE.Color(sky.fog || '#2a2433');
  scene.fog = new THREE.Fog(fogCol, 250, 1100);
  scene.add(makeSky({ top: sky.top || '#101c3a', horizon: sky.horizon || '#e08a5c', bottom: '#1a1418', sunColor: sky.sun || '#ffcf96', sunDir, sunGlow: 0.6, clouds: 0.55, stars: 0.4 }));

  const mats = materials({ wall: '#b39c8c', lead: '#66737e', stone: '#a8968a', window: '#ffc27a' });
  const hs = hagiaSophia(mats);
  scene.add(hs);

  // Zemin ve uzakta deniz
  const ground = new THREE.Mesh(new THREE.CircleGeometry(620, 64), new THREE.MeshStandardMaterial({ color: '#221d1c', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(75, 48), new THREE.MeshStandardMaterial({ color: '#2e2b2a', roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.05; scene.add(plaza);
  const sea = makeWater({ size: 4000, deep: '#0a1626', shallow: '#253a55', skyHor: sky.horizon || '#e08a5c', skyTop: sky.top || '#101c3a', sunColor: sky.sun || '#ffcf96', sunDir, fogColor: fogCol.getStyle(), fogDensity: 0.0009, waveScale: 0.2 });
  sea.position.y = -0.6; scene.add(sea);

  const avoid = (x, z) => Math.hypot(x, z) < 85 || Math.hypot(x + 10, z + 260) < 95;
  scene.add(buildings({ count: 420, rMin: 95, rMax: 600, seed: 12, avoid }));
  scene.add(trees({ count: 90, rMin: 50, rMax: 88, seed: 4 }));
  // Karşıda büyük bir cami silueti (Sultanahmet yönü — stilize, 6 minare)
  const m6 = mosque({ domeR: 12, minarets: 6, semi: 2, seed: 8, mats: materials({ wall: '#b9a593', lead: '#5d6a74', window: '#ffc27a' }), minaretH: 64 });
  m6.position.set(-10, 0, -260); m6.rotation.y = 0.2; scene.add(m6);

  scene.add(gulls({ count: 12, center: [0, 75, 0], radius: 70, seed: 6 }));
  scene.add(makeDust({ count: 300, box: [300, 80, 300], center: [0, 40, 0], color: '#ffd8a8', size: 0.6, opacity: 0.35, seed: 2 }));

  // Işık: düşük güneş + gece cephe aydınlatması
  scene.add(new THREE.HemisphereLight('#7086b0', '#2a1c16', 0.8));
  const sun = new THREE.DirectionalLight(sky.sun || '#ffcf96', 1.4); sun.position.set(sunDir[0] * 300, 120, sunDir[2] * 300); scene.add(sun);
  for (const [x, z] of [[60, 60], [-60, 60], [60, -60], [-60, -60]]) {
    const s = new THREE.SpotLight('#ffc48a', 600, 220, 0.6, 0.7, 1.6); s.position.set(x, 4, z); s.target.position.set(0, 35, 0); scene.add(s, s.target);
  }

  // 55 m ölçü çizgisi
  const measure = new THREE.Group();
  const lineMat = new THREE.MeshBasicMaterial({ color: p.accent || '#f5c451' });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8), lineMat); bar.geometry.translate(0, 0.5, 0);
  measure.add(bar);
  const tickTop = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 0.8), lineMat); const tickBot = tickTop.clone();
  measure.add(tickTop, tickBot);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
  measure.add(dash);
  measure.position.set(48, 0, 0);
  scene.add(measure);

  const camera = new THREE.PerspectiveCamera(54, ctx.aspect, 1, 3000);
  const orbit = (a, rad, h, ly) => ({ pos: [Math.sin(a) * rad, h, Math.cos(a) * rad], look: [0, ly, 0] });
  const path = new CameraPath([
    { t: 0, ...orbit(0.9, 190, 12, 36), fov: 56 },
    { t: 0.5, ...orbit(0.45, 160, 30, 34), fov: 54 },
    { t: 1, ...orbit(0.05, 135, 46, 30), fov: 52 },
  ]);
  const dur = p.duration || 7;
  const mAt = p.cueTimes?.measure ?? dur * 0.55;
  return {
    scene, camera, bloom: { strength: 0.55, radius: 0.55, threshold: 0.9 },
    anchors: { domeTop: new THREE.Vector3(0, 57, 0), base: new THREE.Vector3(0, 10, 40) },
    update(t, g) {
      path.apply(camera, t / dur, 0.1, g);
      const q = easeOutCubic(range(t, mAt, mAt + 1.0));
      const h = Math.max(0.01, 55 * q);
      bar.scale.y = h; tickTop.position.y = h; tickBot.position.y = 0.4;
      tickTop.visible = tickBot.visible = q > 0.01; bar.visible = q > 0.001;
      dash.position.set(-20, 55, 0); dash.material.opacity = 0.6 * smooth(range(t, mAt + 0.8, mAt + 1.2));
      dash.scale.x = smooth(range(t, mAt + 0.8, mAt + 1.3)) + 0.001;
      dash.position.x = -20 * dash.scale.x;
    },
  };
}
