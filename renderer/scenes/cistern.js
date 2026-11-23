// Yerebatan Sarnıcı: 12 x 28 = 336 sütun, tuğla tonozlar, su yansıması, sıcak taban ışıkları.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CameraPath, rng, smooth } from '../lib/util.js';
import { makeWater, makeDust } from '../lib/env.js';

const ROWS = 12, COLS = 28, SX = 4.9, SZ = 4.9, COLH = 8.5, WATER_Y = 0.75;

function columnGeometry() {
  const parts = [];
  const plinth = new THREE.CylinderGeometry(0.62, 0.68, 0.7, 16); plinth.translate(0, 0.35, 0); parts.push(plinth);
  const shaft = new THREE.CylinderGeometry(0.42, 0.46, COLH - 1.7, 16, 1); shaft.translate(0, 0.7 + (COLH - 1.7) / 2, 0); parts.push(shaft);
  const neck = new THREE.TorusGeometry(0.44, 0.06, 6, 20); neck.rotateX(Math.PI / 2); neck.translate(0, COLH - 1.0, 0); parts.push(neck);
  const cap = new THREE.CylinderGeometry(0.74, 0.45, 0.8, 8, 1); cap.rotateY(Math.PI / 8); cap.translate(0, COLH - 0.6, 0); parts.push(cap);
  const abacus = new THREE.BoxGeometry(1.25, 0.22, 1.25); abacus.translate(0, COLH - 0.09, 0); parts.push(abacus);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

// Sütun tabanından yukarı sönen sıcak ışık (yer altında spot ışık hissi)
function glowMaterial(color, glow, strength) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = { value: new THREE.Color(glow) };
    sh.uniforms.uStr = { value: strength };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 wpp = vec4(transformed,1.0);\n #ifdef USE_INSTANCING\n wpp = instanceMatrix * wpp;\n #endif\n vWP = (modelMatrix * wpp).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH; varying vec3 vWP; uniform vec3 uGlow; uniform float uStr;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mv = sin(vWP.x*3.1 + vWP.z*2.3 + sin(vWP.y*1.7 + vWP.x)*2.0)*0.5+0.5;
        float sp = fract(sin(dot(floor(vWP.xz*9.0 + vWP.y*7.0), vec2(12.9898,78.233)))*43758.5453);
        diffuseColor.rgb *= 0.78 + 0.22*mv + (sp-0.5)*0.08;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uGlow * uStr * (exp(-max(vH-0.4,0.0)*0.22) * 0.6 + 0.06) * diffuseColor.rgb * 1.6;');
  };
  return m;
}

export function cistern(ctx, p) {
  const r = rng(p.seed || 7);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(p.fog || '#0d0705');
  scene.background = fogCol;
  scene.fog = new THREE.FogExp2(fogCol, p.fogDensity ?? 0.045);
  const glow = p.glow || '#ffa866';

  const world = new THREE.Group();
  scene.add(world);

  // Sütunlar
  const colMat = glowMaterial('#a39382', glow, p.glowStrength ?? 0.55);
  const cols = new THREE.InstancedMesh(columnGeometry(), colMat, ROWS * COLS);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  let k = 0;
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
    o.position.set((i - (ROWS - 1) / 2) * SX, 0, -j * SZ + 8);
    o.rotation.set(0, r() * Math.PI, 0);
    o.scale.set(1, 1, 1);
    o.updateMatrix(); cols.setMatrixAt(k, o.matrix);
    c.setHSL(0.075 + r() * 0.03, 0.10 + r() * 0.08, 0.40 + r() * 0.14); cols.setColorAt(k, c);
    k++;
  }
  world.add(cols);

  // Kemerler (iki yönde)
  const archMat = glowMaterial('#7a5040', glow, 0.45);
  const archGeo = new THREE.TorusGeometry(SX / 2, 0.32, 8, 16, Math.PI);
  const nA = (ROWS - 1) * COLS + ROWS * (COLS - 1);
  const arches = new THREE.InstancedMesh(archGeo, archMat, nA);
  k = 0;
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
    const x = (i - (ROWS - 1) / 2) * SX, z = -j * SZ + 8;
    if (i < ROWS - 1) { o.position.set(x + SX / 2, COLH, z); o.rotation.set(0, 0, 0); o.updateMatrix(); arches.setMatrixAt(k++, o.matrix); }
    if (j < COLS - 1) { o.position.set(x, COLH, z - SZ / 2); o.rotation.set(0, Math.PI / 2, 0); o.updateMatrix(); arches.setMatrixAt(k++, o.matrix); }
  }
  arches.count = k;
  world.add(arches);

  // Tonozlar (her hücreye bir sığ kubbe, içten görünür)
  const vaultGeo = new THREE.SphereGeometry(SX * 0.72, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const vaultMat = glowMaterial('#6a4030', glow, 0.4); vaultMat.side = THREE.BackSide;
  const vaults = new THREE.InstancedMesh(vaultGeo, vaultMat, (ROWS + 1) * (COLS + 1));
  k = 0;
  for (let i = -1; i < ROWS; i++) for (let j = -1; j < COLS; j++) {
    o.position.set((i - (ROWS - 1) / 2) * SX + SX / 2, COLH + 0.2, -j * SZ + 8 - SZ / 2);
    o.rotation.set(0, 0, 0); o.scale.set(1, 0.55, 1); o.updateMatrix(); vaults.setMatrixAt(k++, o.matrix);
  }
  o.scale.set(1, 1, 1);

  // Ahşap yürüme yolu (merkez koridor)
  if (p.walkway === true) {
    const wood = new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.8 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, COLS * SZ), wood);
    deck.position.set(0, 1.45, 8 - (COLS * SZ) / 2 + SZ); world.add(deck);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, COLS * SZ), wood);
    for (const x of [-1.05, 1.05]) { const rr = rail.clone(); rr.position.set(x, 2.45, deck.position.z); world.add(rr); }
    const postG = new THREE.BoxGeometry(0.08, 1.0, 0.08);
    const posts = new THREE.InstancedMesh(postG, wood, 2 * 60);
    k = 0;
    for (let j = 0; j < 60; j++) for (const x of [-1.05, 1.05]) { o.position.set(x, 1.95, 8 - j * 2.3); o.rotation.set(0, 0, 0); o.updateMatrix(); posts.setMatrixAt(k++, o.matrix); }
    world.add(posts);
  }

  // Yansıma: tüm dünyanın aynası su seviyesinin altında
  const mirror = world.clone();
  mirror.scale.y = -1; mirror.position.y = WATER_Y * 2;
  scene.add(mirror);
  scene.add(vaults); // tonozlar yansımada görünmüyor; aynaya eklenmez

  const water = makeWater({
    size: 400, deep: '#030806', shallow: '#0c1a14', skyHor: p.waterTint || '#3a1c0a', skyTop: '#0a0402',
    sunColor: '#ffb070', sunDir: [0, 0.35, -1], fogColor: fogCol.getStyle(), fogDensity: 0.03,
    waveScale: 0.6, speed: 0.3, sparkle: 0.12, opacity: 0.8,
  });
  water.position.y = WATER_Y;
  scene.add(water);

  // Damlama halkaları
  const rings = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb47a', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), ringMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.userData = { x: (r() - 0.5) * 14, z: -r() * 40, ph: r() * 4, per: 3 + r() * 3 };
    ring.position.y = WATER_Y + 0.02;
    scene.add(ring); rings.push(ring);
  }

  // Işıklar
  scene.add(new THREE.HemisphereLight('#6f7a86', '#1a0c06', 1.7));
  const lights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(glow, 14, 22, 1.6);
    l.position.set(i % 2 ? 2.45 : -2.45, 1.2, 4 - i * 14);
    scene.add(l); lights.push(l);
  }
  const key = new THREE.PointLight('#ffd3a0', 10, 30, 1.8); scene.add(key);

  scene.add(makeDust({ count: 500, box: [16, 9, 60], center: [0, 4.5, -18], color: '#ffbf80', size: 0.06, opacity: 0.55, seed: p.seed || 3 }));

  const camera = new THREE.PerspectiveCamera(p.fov || 62, ctx.aspect, 0.1, 400);
  const shots = {
    dolly: [
      { t: 0, pos: [0, 2.1, 9], look: [0, 3.0, -10], fov: 66, roll: 0.03 },
      { t: 0.5, pos: [0, 2.5, -6], look: [0.6, 4.2, -30], fov: 62, roll: -0.01 },
      { t: 1, pos: [0, 3.2, -22], look: [-0.5, 4.8, -50], fov: 58, roll: 0.0 },
    ],
    crane: [
      { t: 0, pos: [2.45 + 2.45, 1.15, -12.25], look: [4.9, 8.5, -24.5], fov: 70, roll: 0.0 },
      { t: 0.45, pos: [4.9, 4.6, -6], look: [2.45, 5.5, -30], fov: 64 },
      { t: 1, pos: [4.9, 7.0, 4], look: [-2.45, 3.0, -40], fov: 58, roll: -0.04 },
    ],
    low: [
      { t: 0, pos: [-4.9, 0.95, 2], look: [-4.9, 2.0, -40], fov: 60 },
      { t: 1, pos: [-4.9, 1.05, -16], look: [-3.0, 3.0, -50], fov: 56 },
    ],
  };
  const path = new CameraPath(shots[p.shot || 'dolly']);
  const dur = p.duration || 6;

  return {
    scene, camera, bloom: { strength: 0.7, radius: 0.6, threshold: 0.62 },
    anchors: {},
    update(t, g) {
      path.apply(camera, t / dur, 0.25, g);
      key.position.copy(camera.position).add(new THREE.Vector3(0.5, 0.4, -3));
      lights.forEach((l, i) => { l.intensity = 13 + Math.sin(g * 2.1 + i * 1.7) * 2.5; });
      for (const ring of rings) {
        const u = ring.userData;
        const q = ((g + u.ph) % u.per) / u.per;
        const s = 0.1 + q * 1.6;
        ring.scale.set(s, s, s);
        ring.position.x = u.x; ring.position.z = u.z + camera.position.z - 10;
        ring.material.opacity = (1 - smooth(q)) * 0.35;
      }
    },
  };
}
