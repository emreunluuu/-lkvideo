// Yerebatan Sarnıcı — gerçekçi sürüm.
// 12 x 28 = 336 sütun, Korint ve sade başlıklar, Bizans tuğla çapraz tonozlar, gerçek düzlemsel su yansıması,
// her sütunun dibindeki lambadan analitik aydınlatma, ıslaklık/yosun lekeleri, hacimsel pus ve ışık hüzmeleri.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CameraPath, rng, easeOutCubic, easeInOutCubic, smooth, range, clamp } from '../lib/util.js';
import { marble, byzantineBrick, waterNormals, hazeSprite } from '../lib/textures.js';
import { dotTexture } from '../lib/env.js';

const ROWS = 12, COLS = 28, SX = 4.9, SZ = 4.9;
const X0 = -((ROWS - 1) / 2) * SX, Z0 = 8; // sütun (i,j) = (X0 + i*SX, Z0 - j*SZ)
const SHAFT_H = 7.2, BASE_H = 0.0, CAP_H = 1.0, IMPOST_H = 0.55;
const SPRING = BASE_H + 0.55 + SHAFT_H + CAP_H + IMPOST_H; // kemer başlangıcı ≈ 9.3 m
const R = SX / 2;
const colX = (i) => X0 + i * SX, colZ = (j) => Z0 - j * SZ;

// ---------------------------------------------------------------- Geometri
function lathe(points, seg = 24) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function acanthusLeaf(h, w, curl) {
  // Kıvrık yaprak: yaprak şekli, yukarıda dışa ve aşağı kıvrılır
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 0.7, h * 0.15, w * 0.6, h * 0.7, w * 0.18, h);
  s.lineTo(0, h * 0.92); s.lineTo(-w * 0.18, h);
  s.bezierCurveTo(-w * 0.6, h * 0.7, -w * 0.7, h * 0.15, 0, 0);
  const g = new THREE.ShapeGeometry(s, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = y / h;
    const out = Math.pow(u, 2.2) * curl; // dışa açılma
    const droop = u > 0.75 ? -(u - 0.75) * h * 0.9 * curl : 0;
    p.setXYZ(i, x, y + droop, out + Math.abs(x) * -0.25 + Math.sin(x * 40) * 0.01);
  }
  g.computeVertexNormals();
  return g;
}

function corinthianCapital() {
  const parts = [];
  const bell = lathe([[0.40, 0], [0.42, 0.05], [0.44, 0.25], [0.52, 0.6], [0.62, 0.86], [0.64, 0.9]], 24);
  parts.push(bell);
  for (let ring = 0; ring < 2; ring++) {
    for (let k = 0; k < 8; k++) {
      const leaf = acanthusLeaf(ring ? 0.5 : 0.36, 0.2, 0.22);
      const a = (k / 8) * Math.PI * 2 + (ring ? Math.PI / 8 : 0);
      const r0 = ring ? 0.45 : 0.43;
      leaf.translate(0, 0, r0);
      leaf.rotateY(a);
      leaf.translate(0, ring ? 0.12 : 0.0, 0);
      parts.push(leaf);
    }
  }
  for (let k = 0; k < 4; k++) { // köşe volütleri
    const v = new THREE.TorusGeometry(0.09, 0.035, 6, 10);
    v.rotateY(Math.PI / 4 + (k * Math.PI) / 2);
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    v.translate(Math.sin(a) * 0.6, 0.82, Math.cos(a) * 0.6);
    parts.push(v);
  }
  const abacus = new THREE.BoxGeometry(1.32, 0.12, 1.32); abacus.translate(0, 0.96, 0); parts.push(abacus);
  return parts;
}

function plainCapital() {
  return [lathe([[0.40, 0], [0.42, 0.08], [0.47, 0.18], [0.66, 0.62], [0.68, 0.84]], 24), (() => { const b = new THREE.BoxGeometry(1.32, 0.16, 1.32); b.translate(0, 0.92, 0); return b; })()];
}

function columnGeometry(kind, seed) {
  const r = rng(seed);
  const parts = [];
  // Kaide (attik profil) — su altında kısmen
  parts.push(lathe([[0, -0.6], [0.66, -0.6], [0.66, 0.12], [0.60, 0.18], [0.62, 0.26], [0.54, 0.34], [0.50, 0.42], [0.51, 0.5], [0.46, 0.55]], 24));
  // Gövde (hafif entasis); bazıları yivli değil, düz
  const shaftPts = [];
  for (let k = 0; k <= 8; k++) { const u = k / 8; shaftPts.push([0.46 - 0.05 * u + 0.012 * Math.sin(u * Math.PI), 0.55 + u * SHAFT_H]); }
  parts.push(lathe(shaftPts, 24));
  const neck = new THREE.TorusGeometry(0.42, 0.045, 6, 24); neck.rotateX(Math.PI / 2); neck.translate(0, 0.55 + SHAFT_H - 0.12, 0); parts.push(neck);
  const cap = kind === 'corinthian' ? corinthianCapital() : plainCapital();
  for (const g of cap) { g.translate(0, 0.55 + SHAFT_H, 0); parts.push(g); }
  // Bizans impost bloğu (kesik piramit)
  const imp = new THREE.CylinderGeometry(0.95, 0.68, IMPOST_H, 4, 1); imp.rotateY(Math.PI / 4); imp.translate(0, 0.55 + SHAFT_H + CAP_H + IMPOST_H / 2, 0); parts.push(imp);
  const merged = mergeGeometries(parts.map((g) => { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g; }));
  return merged;
}

/** Çapraz tonoz hücresi: iki yarım silindirin kesişimi; y = min(√(1-u²), √(1-v²)). Aşağı bakar. */
function groinVault(seg = 16) {
  const g = new THREE.PlaneGeometry(SX, SZ, seg, seg);
  g.rotateX(Math.PI / 2); // normal aşağı
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const u = clamp(x / R, -1, 1), v = clamp(z / R, -1, 1);
    const y = R * Math.min(Math.sqrt(Math.max(0, 1 - u * u)), Math.sqrt(Math.max(0, 1 - v * v)));
    p.setY(i, y);
    // Tuğla dokusu yaklaşık dünya ölçeğinde (1 doku = 1.2 m); yaya göre uzunluk
    const su = Math.asin(u) * R, sv = Math.asin(v) * R;
    uv.setXY(i, (Math.abs(u) > Math.abs(v) ? su : x) / 1.2, (Math.abs(u) > Math.abs(v) ? z : sv) / 1.2);
  }
  g.computeVertexNormals();
  return g;
}

function arch() {
  const g = new THREE.TorusGeometry(R, 0.34, 8, 20, Math.PI);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * R) / 1.2, uv.getY(i) * 1.8);
  return g;
}

// ---------------------------------------------------------------- Malzeme enjeksiyonu
const NOISE = /* glsl */`
float hd_h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float hd_n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hd_h(i),hd_h(i+vec2(1,0)),u.x), mix(hd_h(i+vec2(0,1)),hd_h(i+vec2(1,1)),u.x), u.y); }
`;

/**
 * Standart PBR malzemeye: dünya konumu, örnek başına UV kaydırma, ıslaklık/leke ve
 * ızgara lambalarından analitik aydınlatma ekler.
 */
function cisternMaterial(params, lamp, { wet = true, wetH = 1.4, uvJitter = true, gain = 1.0 } = {}) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lamp.uniforms);
    sh.uniforms.uWetH = { value: wetH };
    sh.uniforms.uLampGain = { value: gain };
    sh.uniforms.uWet = { value: wet ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\n#if defined(USE_INSTANCING) && ' + (uvJitter ? 1 : 0) + '\nattribute float iSeed;\n#endif')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #if defined(USE_INSTANCING) && ${uvJitter ? 1 : 0}
          vec2 iofs = vec2(fract(iSeed * 0.6180339), fract(iSeed * 0.3819660));
          #ifdef USE_MAP
            vMapUv += iofs;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv += iofs;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv += iofs;
          #endif
        #endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 hdPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hdPos = instanceMatrix * hdPos;
        #endif
        vWP = (modelMatrix * hdPos).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP;
        uniform float uLampGain;
        uniform float uWetH, uWet, uLampInt, uLampRange, uSpecialMix, uFlicker;
        uniform vec3 uLampCol, uLampOff, uSpecialCol;
        uniform vec2 uGridO, uGridS, uGridN, uSpecialIJ;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hdWet = 0.0;
        if (uWet > 0.5) {
          float wn = hd_n(vWP.xz * 3.0 + vWP.y * 0.5) * 0.35 + hd_n(vec2(atan(vWP.x, vWP.z) * 6.0, vWP.y * 0.6)) * 0.4;
          hdWet = 1.0 - smoothstep(0.0, uWetH + wn, vWP.y);
          // Su çizgisi lekesi ve aşağı akan izler
          float streak = smoothstep(0.62, 0.9, hd_n(vec2(vWP.x * 7.0 + vWP.z * 7.0, vWP.y * 0.25))) * (1.0 - smoothstep(0.0, 4.5, vWP.y));
          diffuseColor.rgb *= mix(1.0, 0.42, hdWet);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.8, 0.62), hdWet * 0.6 + streak * 0.35);
          diffuseColor.rgb *= 1.0 - streak * 0.25;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.16, hdWet);`)
      .replace('#include <lights_fragment_end>', `
        {
          // 3x3 komşu lamba: ucuz difüz toplamı + tek birleşik GGX parlama lobu
          vec2 g = (vWP.xz - uGridO) / uGridS;
          vec2 c0 = floor(g + 0.5);
          vec3 accD = vec3(0.0), accDir = vec3(0.0), accC = vec3(0.0);
          for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) {
            vec2 ij = c0 + vec2(float(dx), float(dz));
            if (ij.x < 0.0 || ij.y < 0.0 || ij.x > uGridN.x - 1.0 || ij.y > uGridN.y - 1.0) continue;
            vec3 lw = vec3(uGridO.x + ij.x * uGridS.x, 0.0, uGridO.y + ij.y * uGridS.y) + uLampOff;
            vec3 L = lw - vWP; float d2 = dot(L, L);
            float rr = d2 / (uLampRange * uLampRange);
            float win = clamp(1.0 - rr * rr, 0.0, 1.0); win *= win;
            float cone = smoothstep(-0.3, 0.45, -L.y * inversesqrt(max(d2, 1e-6)));
            float hh = hd_h(ij + 3.7);
            vec3 col = uLampCol * (0.7 + 0.6 * hh) * mix(vec3(1.0), vec3(1.0, 0.82, 0.62), hh);
            float isSp = step(length(ij - uSpecialIJ), 0.1) * uSpecialMix;
            col = mix(col * uLampInt, uSpecialCol * uFlicker, isSp);
            vec3 c = col * (win * cone / (d2 * 0.12 + 0.35)) * uLampGain;
            vec3 Lv = normalize(mat3(viewMatrix) * L);
            accD += c * saturate(dot(geometryNormal, Lv));
            accDir += Lv * dot(c, vec3(0.333)); accC += c;
          }
          reflectedLight.directDiffuse += accD * BRDF_Lambert(material.diffuseColor);
          if (accC.r + accC.g + accC.b > 1e-5) {
            vec3 Ld = normalize(accDir + vec3(0.0, 1e-5, 0.0));
            reflectedLight.directSpecular += accC * saturate(dot(geometryNormal, Ld)) * BRDF_GGX(Ld, geometryViewDir, geometryNormal, material);
          }
        }
        #include <lights_fragment_end>`);
  };
  return m;
}

// ---------------------------------------------------------------- Su
const WaterShader = {
  name: 'CisternWater',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    tNormal: { value: null }, uTime: { value: 0 }, uDeep: { value: new THREE.Color('#020504') },
    uFog: { value: new THREE.Color('#0b0705') }, uFogD: { value: 0.05 },
    uDrips: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uDistort: { value: 0.03 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWP;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tNormal; uniform float uTime, uFogD, uDistort; uniform vec3 uDeep, uFog; uniform vec4 uDrips[4];
    varying vec4 vUv; varying vec3 vWP;
    void main(){
      vec2 p = vWP.xz;
      vec3 n1 = texture2D(tNormal, p * 0.11 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(tNormal, p * 0.29 - vec2(uTime * 0.016, -uTime * 0.011)).xyz * 2.0 - 1.0;
      vec2 d = (n1.xy + n2.xy * 0.6) * uDistort;
      float ringLight = 0.0;
      for (int i = 0; i < 4; i++) {
        vec4 dr = uDrips[i];
        if (dr.w <= 0.0) continue;
        float age = mod(uTime - dr.z, dr.w);
        float r = length(p - dr.xy);
        float front = age * 0.9;
        float env = exp(-age * 1.1) * smoothstep(0.5, 0.0, abs(r - front)) * smoothstep(0.0, 0.05, age);
        float wave = sin((r - front) * 34.0) * env;
        d += normalize(p - dr.xy + 1e-4) * wave * 0.05;
        ringLight += max(0.0, wave) * env;
      }
      vec4 uvp = vUv; uvp.xy += d * uvp.w;
      vec3 refl = texture2DProj(tDiffuse, uvp).rgb;
      vec3 V = normalize(cameraPosition - vWP);
      float fres = 0.55 + 0.45 * pow(1.0 - max(V.y, 0.0), 3.0);
      vec3 col = mix(uDeep, refl, fres) + refl * ringLight * 0.6;
      float dist = length(cameraPosition - vWP);
      col = mix(col, uFog, 1.0 - exp(-dist * uFogD));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
};

// ---------------------------------------------------------------- Hacimsel pus
function hazePoints(count, lampAt, seed, box) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = box.x0 + r() * (box.x1 - box.x0), z = box.z0 + r() * (box.z1 - box.z0), y = 0.4 + Math.pow(r(), 1.6) * 8.5;
    pos.set([x, y, z], i * 3);
    const b = lampAt(x, y, z);
    col.set([b * 1.0, b * 0.62, b * 0.34], i * 3);
    rnd[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tMap: { value: hazeSprite() }, uTime: { value: 0 }, uScale: { value: 1000 }, uSize: { value: 5.0 }, uOpacity: { value: 0.11 } },
    vertexShader: `attribute vec3 color; attribute float rnd; uniform float uTime, uScale, uSize; varying vec3 vC; varying float vA; varying float vRot;
      void main(){ vec3 p = position; p.x += sin(uTime * 0.11 + rnd * 40.0) * 0.6; p.y += sin(uTime * 0.07 + rnd * 17.0) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
        gl_PointSize = min(uSize * (0.6 + rnd) * uScale / max(d, 0.1), uScale * 0.22);
        vA = smoothstep(1.2, 4.5, d) * (1.0 - smoothstep(35.0, 70.0, d)); vC = color; vRot = rnd * 6.283 + uTime * 0.03 * (rnd - 0.5); }`,
    fragmentShader: `uniform sampler2D tMap; uniform float uOpacity; varying vec3 vC; varying float vA; varying float vRot;
      void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot); c = mat2(co, -s, s, co) * c;
        float a = texture2D(tMap, c + 0.5).a * vA * uOpacity; if (a < 0.002) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  pts.userData.mat = mat;
  return pts;
}

function lightBeams(lamps, intensity) {
  const geo = new THREE.CylinderGeometry(1.25, 0.16, 6.5, 24, 1, true); geo.translate(0, 3.25, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uInt: { value: intensity }, uTime: { value: 0 } },
    vertexShader: `attribute float iSeed; varying float vY; varying vec3 vN; varying vec3 vV; varying float vI;
      void main(){ vY = position.y / 6.5; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vI = iSeed;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uInt, uTime; varying float vY; varying vec3 vN; varying vec3 vV; varying float vI;
      void main(){ float edge = pow(abs(dot(normalize(vN), vV)), 2.0); float fall = pow(1.0 - vY, 2.2) * smoothstep(0.0, 0.06, vY);
        float fl = 0.85 + 0.15 * sin(uTime * 3.0 + vI * 1.7); // vI: kararlı örnek tohumu
        float a = edge * fall * uInt * fl; gl_FragColor = vec4(vec3(1.0, 0.62, 0.32) * a, 1.0); }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, lamps.length);
  const o = new THREE.Object3D();
  lamps.forEach((l, k) => { o.position.set(l[0], l[1], l[2]); o.rotation.set(0.08, 0, 0); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); });
  mesh.frustumCulled = false;
  mesh.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

// ---------------------------------------------------------------- Örnek ayıklama (culling)
/** Kameraya uzak/arkada kalan örnekleri atar, kalanları önden arkaya sıralar (aşırı çizimi azaltır). */
class Culled {
  constructor(mesh, items) {
    this.mesh = mesh; this.items = items;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const seeds = new Float32Array(items.length);
    this.seedAttr = new THREE.InstancedBufferAttribute(seeds, 1);
    mesh.geometry.setAttribute('iSeed', this.seedAttr);
    mesh.frustumCulled = false;
  }
  update(cam, maxDist) {
    const cp = cam.position, f = cam.getWorldDirection(new THREE.Vector3());
    const vis = [];
    for (const it of this.items) {
      const dx = it.p.x - cp.x, dy = it.p.y - cp.y, dz = it.p.z - cp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxDist * maxDist) continue;
      if (dx * f.x + dy * f.y + dz * f.z < -(it.r || 4)) continue;
      vis.push([d2, it]);
    }
    vis.sort((a, b) => a[0] - b[0]);
    vis.forEach(([, it], k) => { this.mesh.setMatrixAt(k, it.m); if (it.c) this.mesh.setColorAt(k, it.c); this.seedAttr.array[k] = it.s; });
    this.mesh.count = vis.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.seedAttr.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- Çekimler
const C = (i, j, dx = 0, y = 0, dz = 0) => [colX(i) + dx, y, colZ(j) + dz];
const SHOTS = {
  // Su yüzeyine çok yakın, iki sütun sırası arasında hızla ilerleyip yavaşlayan (speed ramp) giriş
  push: { ease: easeOutCubic, shake: 0.05, keys: [
    { t: 0, pos: [colX(5) + SX / 2, 0.55, colZ(0) + 3.5], look: [colX(5) + SX / 2 + 0.3, 1.6, colZ(6)], fov: 74, roll: 0.05 },
    { t: 1, pos: [colX(5) + SX / 2, 0.95, colZ(3)], look: [colX(5) + SX / 2 - 0.4, 2.9, colZ(9)], fov: 60, roll: -0.01 },
  ] },
  // Bir sütunun dibinden başlığına yükselen vinç; başlık ve tonozlar ortaya çıkar
  crane: { ease: easeInOutCubic, shake: 0.02, keys: [
    { t: 0, pos: C(6, 4, -1.55, 1.0, 1.2), look: C(6, 4, 0, 3.2, 0), fov: 58 },
    { t: 0.6, pos: C(6, 4, -1.7, 6.0, 1.6), look: C(6, 4, 0, 8.6, -0.4), fov: 56 },
    { t: 1, pos: C(6, 4, -2.2, 7.6, 2.6), look: C(6, 9, -0.5, 8.6, 0), fov: 62, roll: -0.03 },
  ] },
  // Tonoz hizasından derinliğe: dolly-zoom ile 336 sütunluk orman açılır
  reveal: { ease: easeInOutCubic, shake: 0.0, keys: [
    { t: 0, pos: [colX(5) + SX / 2, 8.4, colZ(0) + 2.4], look: [colX(5) + SX / 2, 4.2, colZ(14)], fov: 42 },
    { t: 1, pos: [colX(5) + SX / 2, 7.4, colZ(2)], look: [colX(5) + SX / 2, 3.4, colZ(14)], fov: 78 },
  ] },
  // Bir sütun dibine yakın plan; yanal kayma (paralaks), arkada bulanık lambalar
  macro: { ease: (t) => t, shake: 0.015, keys: [
    { t: 0, pos: C(4, 6, 1.9, 0.75, 2.4), look: C(4, 6, 0, 1.3, 0), fov: 40 },
    { t: 1, pos: C(4, 6, 0.7, 0.85, 2.9), look: C(4, 6, 0, 1.45, 0), fov: 38 },
  ] },
  // Karanlığa doğru yavaş ilerleme; en dipte titreyen tek kırmızı ışık
  abyss: { ease: (t) => t, shake: 0.03, keys: [
    { t: 0, pos: [colX(5) + SX / 2, 1.3, colZ(8)], look: [colX(5) + SX / 2, 1.4, colZ(20)], fov: 50 },
    { t: 1, pos: [colX(5) + SX / 2, 1.2, colZ(10)], look: [colX(5) + SX / 2, 1.3, colZ(20)], fov: 44 },
  ] },
};

export function cistern_hd(ctx, p) {
  const shot = SHOTS[p.shot || 'push'];
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(p.fog || '#120b08');
  scene.background = fogCol;
  scene.fog = new THREE.FogExp2(fogCol, p.fogDensity ?? 0.046);

  const lampOff = new THREE.Vector3(0, 0.22, 0.62);
  if (p.simpleMat) cisternMaterial.simple = true; // lamba sütunun önünde, su seviyesinde
  const lamp = {
    uniforms: {
      uLampInt: { value: p.lampIntensity ?? 4.2 }, uLampRange: { value: 15.0 }, uLampCol: { value: new THREE.Color(p.lampColor || '#ffc68e') },
      uLampOff: { value: lampOff }, uGridO: { value: new THREE.Vector2(X0, Z0) }, uGridS: { value: new THREE.Vector2(SX, -SZ) },
      uGridN: { value: new THREE.Vector2(ROWS, COLS) }, uSpecialIJ: { value: new THREE.Vector2(p.specialI ?? 5, p.specialJ ?? 16) },
      uSpecialCol: { value: new THREE.Color(p.specialColor || '#ff2a10').multiplyScalar(14) }, uSpecialMix: { value: p.special ? 1 : 0 },
      uFlicker: { value: 1 },
    },
  };

  // --- Malzemeler
  const mt = marble({ size: 1024, seed: 3 });
  const mt2 = marble({ size: 1024, seed: 17, base: [0.62, 0.6, 0.56], vein: [0.32, 0.3, 0.3] });
  const bt = byzantineBrick({ size: 1024, seed: 5 });
  const rep = (tex, x, y) => { const c = tex.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const colMat = (t) => cisternMaterial({ map: rep(t.map, 1, 3), normalMap: rep(t.normalMap, 1, 3), roughnessMap: rep(t.roughnessMap, 1, 3), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, metalness: 0 }, lamp, { wetH: 1.5 });
  const brickMat = cisternMaterial({ map: bt.map, normalMap: bt.normalMap, roughnessMap: bt.roughnessMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, metalness: 0, side: THREE.DoubleSide }, lamp, { wetH: 1.0, gain: 2.0 });

  const culled = [];
  // --- Sütunlar: iki başlık türü, iki mermer tonu, örnek başına renk
  const r = rng(p.seed || 7);
  const kinds = [['corinthian', mt], ['plain', mt2]];
  const o = new THREE.Object3D(); const c = new THREE.Color();
  const lamps = [];
  for (let ki = 0; ki < 2; ki++) {
    const [kind, tex] = kinds[ki];
    const ids = [];
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (((i * 7 + j * 13) % 10 < 7) === (ki === 0)) ids.push([i, j]);
    const mesh = new THREE.InstancedMesh(columnGeometry(kind, 11 + ki), colMat(tex), ids.length);
    const items = ids.map(([i, j]) => {
      o.position.set(colX(i), 0, colZ(j)); o.rotation.set(0, Math.floor(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.1, (r() - 0.5) * 0.01);
      o.scale.setScalar(1); o.updateMatrix();
      return { m: o.matrix.clone(), c: new THREE.Color().setHSL(0.09 + r() * 0.04, 0.04 + r() * 0.08, 0.6 + r() * 0.3), p: new THREE.Vector3(colX(i), 4.5, colZ(j)), s: i * 31 + j * 7.3, r: 6 };
    });
    mesh.setColorAt(0, c);
    culled.push(new Culled(mesh, items));
    scene.add(mesh);
  }
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) lamps.push([colX(i) + lampOff.x, lampOff.y, colZ(j) + lampOff.z]);

  // --- Kemerler ve tonozlar
  const archGeo = arch();
  const nA = (ROWS + 1) * COLS + ROWS * (COLS + 1);
  const arches = new THREE.InstancedMesh(archGeo, brickMat, nA);
  const archItems = [];
  const pushItem = (list, x, y, z, ry, sd) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.setScalar(1); o.updateMatrix(); list.push({ m: o.matrix.clone(), p: new THREE.Vector3(x, y, z), s: sd, r: 6 }); };
  for (let i = -1; i < ROWS; i++) for (let j = 0; j < COLS; j++) pushItem(archItems, colX(i) + SX / 2, SPRING, colZ(j), 0, i * 13 + j * 5.1);
  for (let i = 0; i < ROWS; i++) for (let j = -1; j < COLS; j++) pushItem(archItems, colX(i), SPRING, colZ(j) - SZ / 2, Math.PI / 2, i * 17 + j * 3.3);
  culled.push(new Culled(arches, archItems));
  scene.add(arches);
  const vaultGeo = groinVault();
  const vaults = new THREE.InstancedMesh(vaultGeo, brickMat, (ROWS + 1) * (COLS + 1));
  const vaultItems = [];
  for (let i = -1; i < ROWS; i++) for (let j = -1; j < COLS; j++) pushItem(vaultItems, colX(i) + SX / 2, SPRING, colZ(j) - SZ / 2, 0, i * 11 + j * 2.7);
  culled.push(new Culled(vaults, vaultItems));
  scene.add(vaults);

  // --- Çevre duvarları
  const wallMat = cisternMaterial({ map: rep(bt.map, 1, 1), normalMap: rep(bt.normalMap, 1, 1), roughnessMap: bt.roughnessMap, roughness: 1 }, lamp, { wetH: 1.2, uvJitter: false, gain: 1.8 });
  const W = (ROWS + 1) * SX, L = (COLS + 1) * SZ, H = SPRING + R + 0.5, MIDZ = (colZ(0) + colZ(COLS - 1)) / 2;
  const mkWall = (w, h, x, z, ry) => {
    const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * w / 1.2, uv.getY(q) * h / 1.2);
    const m = new THREE.Mesh(g, wallMat); m.position.set(x, h / 2 - 0.6, z); m.rotation.y = ry; scene.add(m);
  };
  mkWall(L, H, colX(0) - SX, MIDZ, Math.PI / 2);
  mkWall(L, H, colX(ROWS - 1) + SX, MIDZ, -Math.PI / 2);
  mkWall(W, H, 0, colZ(0) + SZ, Math.PI);
  mkWall(W, H, 0, colZ(COLS - 1) - SZ, 0);

  // --- Lamba gövdeleri (koyu metal) ve parlak ağızları
  const housing = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.14, 0.2, 12), new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 0.5, metalness: 0.6 }), lamps.length);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.lampColor || '#ffc68e').multiplyScalar(6), fog: false });
  const bulbs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 16), bulbMat, lamps.length);
  const hItems = [], bItems = [];
  lamps.forEach((l, q) => {
    o.position.set(l[0], l[1] - 0.1, l[2]); o.rotation.set(0, 0, 0); o.updateMatrix(); hItems.push({ m: o.matrix.clone(), p: new THREE.Vector3(...l), s: q, r: 3 });
    o.position.set(l[0], l[1] + 0.005, l[2]); o.rotation.set(-Math.PI / 2, 0, 0); o.updateMatrix(); bItems.push({ m: o.matrix.clone(), p: new THREE.Vector3(...l), s: q, r: 3 });
  });
  culled.push(new Culled(housing, hItems), new Culled(bulbs, bItems));
  scene.add(housing, bulbs);
  // Özel (kırmızı) lamba için ayrı parlak nokta
  const sp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3018').multiplyScalar(20), fog: false }));
  sp.position.set(colX(lamp.uniforms.uSpecialIJ.value.x) + lampOff.x, lampOff.y + 0.05, colZ(lamp.uniforms.uSpecialIJ.value.y) + lampOff.z);
  sp.visible = !!p.special; scene.add(sp);
  const spGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color('#ff4a20').multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  spGlow.scale.setScalar(2.2); spGlow.position.copy(sp.position); spGlow.visible = !!p.special; scene.add(spGlow);

  // --- Hacimsel ışık: hüzmeler ve pus
  const beams = lightBeams(lamps, p.beamIntensity ?? 0.05);
  culled.push(new Culled(beams, lamps.map((l, q) => { o.position.set(l[0], l[1], l[2]); o.rotation.set(0.08, 0, 0); o.updateMatrix(); return { m: o.matrix.clone(), p: new THREE.Vector3(l[0], 3, l[2]), s: q, r: 4 }; })));
  if (!p.noBeams) scene.add(beams);
  const lampAt = (x, y, z) => {
    let s = 0;
    for (const l of lamps) { const d2 = (l[0] - x) ** 2 + ((l[1] - y) * 0.7) ** 2 + (l[2] - z) ** 2; if (d2 < 60) s += 1 / (d2 + 2.5); }
    return Math.min(1.6, s * 2.2);
  };
  const haze = hazePoints(p.hazeCount ?? 240, lampAt, (p.seed || 7) + 1, { x0: colX(0) - 2, x1: colX(ROWS - 1) + 2, z0: colZ(14), z1: colZ(0) + 4 });
  haze.userData.mat.uniforms.uScale.value = ctx.H / 2;
  haze.userData.mat.uniforms.uOpacity.value = p.haze ?? 0.16;
  if (!p.noHaze) scene.add(haze);
  // Toz zerrecikleri
  const dustN = 700, dpos = new Float32Array(dustN * 3), dbase = new Float32Array(dustN * 3), dr = rng(31);
  for (let q = 0; q < dustN; q++) dbase.set([colX(2) + dr() * SX * 7, 0.3 + dr() * 8, colZ(12) + dr() * SZ * 13], q * 3);
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: '#ffd2a0', size: 0.022, map: dotTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  // --- Su
  const wn = waterNormals();
  const water = new Reflector(new THREE.PlaneGeometry(W + 10, L + 10), {
    textureWidth: Math.round(ctx.W * (p.reflScale ?? 0.33)), textureHeight: Math.round(ctx.H * (p.reflScale ?? 0.33)), clipBias: 0.003, multisample: 0, shader: WaterShader,
  });
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, MIDZ);
  water.material.uniforms.tNormal.value = wn;
  water.material.uniforms.uFog.value = fogCol;
  water.material.uniforms.uFogD.value = (p.fogDensity ?? 0.046) * 0.9;
  if (!p.noWater) scene.add(water);
  // Damlalar: kameranın görüş alanına yakın 3 nokta
  const drips = (p.drips || [[colX(5) + SX / 2 + 0.6, colZ(2) + 0.5, 0.3, 2.4], [colX(5) + SX / 2 - 1.1, colZ(4), 1.1, 3.1], [colX(6) + 1.2, colZ(3) - 1.5, 1.8, 2.7]]);
  drips.forEach((d, q) => water.material.uniforms.uDrips.value[q].set(d[0], d[1], d[2], d[3]));
  const streakMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9b0').multiplyScalar(2.5), transparent: true, opacity: 0.7, fog: false });
  const streaks = drips.map(() => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6), streakMat); scene.add(s); return s; });

  scene.add(new THREE.HemisphereLight('#4a5260', '#3a1e0e', p.ambient ?? 0.55));

  // --- Kamera
  const camera = new THREE.PerspectiveCamera(60, ctx.aspect, 0.05, 400);
  const path = new CameraPath(shot.keys, shot.ease);
  const dur = p.duration || 2.2;
  return {
    scene, camera,
    bloom: { strength: p.bloom ?? 0.75, radius: 0.7, threshold: 0.9 },
    dof: p.dof || null,
    anchors: {},
    update(t, g) {
      path.apply(camera, t / dur, shot.shake, g);
      camera.updateMatrixWorld();
      for (const cu of culled) cu.update(camera, p.cullDist ?? 52);
      water.material.uniforms.uTime.value = g;
      haze.userData.update(g);
      // Lambaları karart (sondaki karanlık çekim için)
      const dim = p.dimTo != null ? 1 + (p.dimTo - 1) * smooth(range(t, 0, dur)) : 1;
      lamp.uniforms.uLampInt.value = (p.lampIntensity ?? 4.2) * dim;
      bulbMat.color.set(p.lampColor || '#ffc68e').multiplyScalar(6 * dim);
      const fl = 0.75 + 0.25 * Math.sin(g * 23.0) * Math.sin(g * 7.3) + 0.1 * Math.sin(g * 51.0);
      lamp.uniforms.uFlicker.value = fl;
      sp.material.color.set('#ff3018').multiplyScalar(20 * fl);
      spGlow.material.opacity = 0.55 + 0.45 * fl;
      // Damla izleri: halkadan 0.45 sn önce tavandan düşer
      drips.forEach((d, q) => {
        const age = ((g - d[2]) % d[3] + d[3]) % d[3];
        const fallT = d[3] - age; // halkaya kalan süre
        const s = streaks[q];
        if (fallT < 0.45) { const y = 0.2 + (fallT / 0.45) ** 2 * 9; s.visible = true; s.position.set(d[0], y, d[1]); } else s.visible = false;
      });
      for (let q = 0; q < dustN; q++) {
        dpos[q * 3] = dbase[q * 3] + Math.sin(g * 0.2 + q) * 0.25;
        dpos[q * 3 + 1] = dbase[q * 3 + 1] + Math.sin(g * 0.13 + q * 1.7) * 0.2;
        dpos[q * 3 + 2] = dbase[q * 3 + 2] + Math.cos(g * 0.11 + q * 0.3) * 0.25;
      }
      dgeo.attributes.position.needsUpdate = true;
    },
  };
}
