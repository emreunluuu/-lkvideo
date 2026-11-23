// Boğaz'ın kesit görünümü: üstte güneye akan yüzey akıntısı, altta kuzeye akan dip akıntısı.
import * as THREE from 'three';
import { CameraPath, rng, smooth, range, easeInOutCubic } from '../lib/util.js';
import { dotTexture, makeSky } from '../lib/env.js';

const X0 = -60, X1 = 60, ZD = 24;

function profileShape(topFn, botFn, n = 80) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) { const x = X0 + ((X1 - X0) * i) / n; i === 0 ? s.moveTo(x, topFn(x)) : s.lineTo(x, topFn(x)); }
  for (let i = n; i >= 0; i--) { const x = X0 + ((X1 - X0) * i) / n; s.lineTo(x, botFn(x)); }
  s.closePath();
  return s;
}

export function currents(ctx, p) {
  const r = rng(p.seed || 33);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(p.fog || '#050a12');
  scene.background = fogCol;
  scene.fog = new THREE.Fog(fogCol, 90, 260);

  const seabed = (x) => -34 + 6 * Math.sin(x * 0.07) + (x > 25 ? 14 * Math.exp(-((x - 38) ** 2) / 60) : 0) - 3 * Math.sin(x * 0.21);
  const iface = (x) => -11 - x * 0.03 + Math.sin(x * 0.12) * 0.8; // iki tabaka arası sınır
  const ext = { depth: ZD, bevelEnabled: false, steps: 1 };

  const topGeo = new THREE.ExtrudeGeometry(profileShape(() => 0, (x) => Math.max(iface(x), seabed(x) + 0.5)), ext);
  const botGeo = new THREE.ExtrudeGeometry(profileShape((x) => Math.max(iface(x), seabed(x) + 0.5), (x) => seabed(x) + 0.3), ext);
  const rockGeo = new THREE.ExtrudeGeometry(profileShape((x) => seabed(x), () => -52), ext);
  for (const g of [topGeo, botGeo, rockGeo]) g.translate(0, 0, -ZD / 2);
  const cTop = p.topColor || '#4fb3c8', cBot = p.bottomColor || '#2f4f96';
  const topMat = new THREE.MeshStandardMaterial({ color: cTop, transparent: true, opacity: 0.32, roughness: 0.2, depthWrite: false, emissive: cTop, emissiveIntensity: 0.15 });
  const botMat = new THREE.MeshStandardMaterial({ color: cBot, transparent: true, opacity: 0.42, roughness: 0.2, depthWrite: false, emissive: cBot, emissiveIntensity: 0.2 });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#6a5646', roughness: 0.95, flatShading: true });
  scene.add(new THREE.Mesh(rockGeo, rockMat));
  const topMesh = new THREE.Mesh(topGeo, topMat), botMesh = new THREE.Mesh(botGeo, botMat);
  topMesh.renderOrder = 2; botMesh.renderOrder = 1;
  scene.add(botMesh, topMesh);

  // Ara yüzey ve su yüzeyi için parlak çizgiler (ön yüzde)
  const lineAt = (fn, color, z) => {
    const pts = []; for (let i = 0; i <= 120; i++) { const x = X0 + ((X1 - X0) * i) / 120; pts.push(new THREE.Vector3(x, fn(x), z)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.22, 6), new THREE.MeshBasicMaterial({ color }));
    scene.add(m); return m;
  };
  lineAt((x) => Math.max(iface(x), seabed(x) + 0.5), '#bfefff', ZD / 2 + 0.05);
  lineAt(() => 0, '#e6fbff', ZD / 2 + 0.05);

  // Akıntı parçacıkları
  const mkStream = (n, yMin, yMax, speed, color, size) => {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { seed[i * 3] = r(); seed[i * 3 + 1] = r(); seed[i * 3 + 2] = r(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; pts.renderOrder = 3;
    pts.userData.update = (t) => {
      for (let i = 0; i < n; i++) {
        const span = X1 - X0;
        let x = X0 + ((((seed[i * 3] * span + t * speed * (0.7 + seed[i * 3 + 1] * 0.6)) % span) + span) % span);
        const lo = yMin(x), hi = yMax(x);
        pos[i * 3] = x; pos[i * 3 + 1] = lo + (hi - lo) * (0.1 + 0.8 * seed[i * 3 + 1]); pos[i * 3 + 2] = (seed[i * 3 + 2] - 0.5) * (ZD - 1);
      }
      geo.attributes.position.needsUpdate = true;
    };
    scene.add(pts);
    return pts;
  };
  const ifc = (x) => Math.max(iface(x), seabed(x) + 0.5);
  mkStream(900, ifc, () => -0.6, p.surfaceSpeed ?? 9, '#bff6ff', 0.7);
  mkStream(700, (x) => seabed(x) + 0.6, ifc, -(p.deepSpeed ?? 6), '#ffc27a', 0.75);

  // Yön okları (ön yüzde kayan şevronlar)
  const chevGeo = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-1.2, 1.6); s.lineTo(0.8, 0); s.lineTo(-1.2, -1.6); s.lineTo(-0.4, 0); s.closePath(); return s; })());
  const chevs = [];
  for (let i = 0; i < 6; i++) {
    const a = new THREE.Mesh(chevGeo, new THREE.MeshBasicMaterial({ color: '#dffaff', transparent: true, depthWrite: false }));
    a.userData = { dir: 1, y: -5.5, ph: i / 6 }; chevs.push(a); scene.add(a);
    const b = new THREE.Mesh(chevGeo, new THREE.MeshBasicMaterial({ color: '#ffcf8f', transparent: true, depthWrite: false }));
    b.rotation.z = Math.PI; b.userData = { dir: -1, y: -18, ph: i / 6 }; chevs.push(b); scene.add(b);
  }

  // Su yüzeyi üstünde alacakaranlık gökyüzü ve zemin ızgarası
  const grid = new THREE.GridHelper(400, 80, '#1d3346', '#122434'); grid.position.y = -52; scene.add(grid);

  scene.add(new THREE.HemisphereLight('#8fb8e0', '#100c08', 1.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.4); key.position.set(20, 40, 50); scene.add(key);

  const camera = new THREE.PerspectiveCamera(52, ctx.aspect, 0.5, 1500);
  const path = new CameraPath([
    { t: 0, pos: [-34, 4, 112], look: [-4, -24, 0], fov: 54 },
    { t: 0.5, pos: [-4, -6, 104], look: [0, -24, 0], fov: 54 },
    { t: 1, pos: [26, -12, 98], look: [-4, -24, 0], fov: 52, roll: -0.03 },
  ]);
  const dur = p.duration || 7;
  const topAt = p.cueTimes?.surface ?? dur * 0.3, botAt = p.cueTimes?.deep ?? dur * 0.6;
  return {
    scene, camera, bloom: { strength: 0.75, radius: 0.45, threshold: 0.7 },
    anchors: {
      surface: new THREE.Vector3(-8, -4, ZD / 2), deep: new THREE.Vector3(-8, -20, ZD / 2),
      north: new THREE.Vector3(X0 + 14, 6, ZD / 2), south: new THREE.Vector3(X1 - 14, 6, ZD / 2),
    },
    update(t, g) {
      path.apply(camera, t / dur, 0.05, g);
      topMat.emissiveIntensity = 0.15 + 0.35 * smooth(range(t, topAt, topAt + 0.5)) * (1 - smooth(range(t, botAt, botAt + 0.5))) ;
      botMat.emissiveIntensity = 0.2 + 0.45 * smooth(range(t, botAt, botAt + 0.5));
      for (const c of chevs) {
        const u = c.userData;
        const q = ((g * 0.12 + u.ph) % 1 + 1) % 1;
        const x = u.dir > 0 ? X0 + 6 + q * (X1 - X0 - 12) : X1 - 6 - q * (X1 - X0 - 12);
        c.position.set(x, u.y, ZD / 2 + 0.3);
        const show = u.dir > 0 ? smooth(range(t, topAt - 0.2, topAt + 0.4)) : smooth(range(t, botAt - 0.2, botAt + 0.4));
        c.material.opacity = show * Math.sin(q * Math.PI) * 0.95;
      }
    },
  };
}
