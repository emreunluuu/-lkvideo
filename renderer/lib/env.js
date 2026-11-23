// Ortam öğeleri: gökyüzü kubbesi, su yüzeyi, toz/parçacık, ışık noktaları.
import * as THREE from 'three';
import { rng } from './util.js';

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`;

/** Gradyanlı gökyüzü + güneş/ay + bulut bantları + yıldızlar. */
export function makeSky({
  top = '#0b1530', horizon = '#d9774a', bottom = '#1a1010', sunColor = '#ffd59a',
  sunDir = [0.2, 0.08, -1], sunSize = 0.03, sunGlow = 0.35, clouds = 0.5, stars = 0.0, radius = 900,
} = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(horizon) },
      uBot: { value: new THREE.Color(bottom) }, uSun: { value: new THREE.Color(sunColor) },
      uSunDir: { value: new THREE.Vector3(...sunDir).normalize() }, uSunSize: { value: sunSize },
      uGlow: { value: sunGlow }, uClouds: { value: clouds }, uStars: { value: stars }, uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: NOISE_GLSL + /* glsl */ `
      uniform vec3 uTop,uHor,uBot,uSun,uSunDir; uniform float uSunSize,uGlow,uClouds,uStars,uTime;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(uHor, uTop, pow(clamp(h,0.0,1.0), 0.55)) : mix(uHor, uBot, pow(clamp(-h*4.0,0.0,1.0),0.6));
        float sd = max(dot(d, uSunDir), 0.0);
        c += uSun * pow(sd, 10.0) * uGlow * 0.45 + uSun * pow(sd, 120.0) * uGlow * 0.8;
        c = mix(c, uSun*1.25, smoothstep(1.0-uSunSize*0.35, 1.0-uSunSize*0.2, sd));
        if (uClouds > 0.0 && h > -0.02) {
          vec2 uv = d.xz / (h + 0.12) * 1.3 + vec2(uTime*0.004, 0.0);
          float n = fbm(uv*1.4) ;
          float band = smoothstep(0.45, 0.85, n) * smoothstep(0.0, 0.15, h) * (1.0 - smoothstep(0.35, 0.8, h));
          vec3 cc = mix(uHor*0.55, uSun*0.9, pow(sd,3.0));
          c = mix(c, cc, band * uClouds);
        }
        if (uStars > 0.0 && h > 0.05) {
          vec2 g = d.xz/(h+0.3)*220.0;
          float s = hash(floor(g)); float tw = 0.6+0.4*sin(uTime*2.0+s*40.0);
          c += vec3(step(0.997, s)) * uStars * tw * smoothstep(0.05,0.4,h);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  mesh.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

/** Stilize su: dalga normali, fresnel, güneş parıltısı, sis. */
export function makeWater({
  size = 2000, deep = '#06202e', shallow = '#1d5a6e', skyHor = '#d9774a', skyTop = '#0b1530',
  sunColor = '#ffd59a', sunDir = [0.2, 0.08, -1], fogColor = '#0b1530', fogDensity = 0.004,
  waveScale = 1.0, speed = 1.0, sparkle = 1.0, opacity = 1.0,
} = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: opacity < 1, depthWrite: opacity >= 1,
    uniforms: {
      uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) },
      uHor: { value: new THREE.Color(skyHor) }, uTop: { value: new THREE.Color(skyTop) },
      uSun: { value: new THREE.Color(sunColor) }, uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
      uFog: { value: new THREE.Color(fogColor) }, uFogD: { value: fogDensity },
      uTime: { value: 0 }, uScale: { value: waveScale }, uSpeed: { value: speed }, uSparkle: { value: sparkle }, uOpacity: { value: opacity },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE_GLSL + /* glsl */ `
      uniform vec3 uDeep,uShallow,uHor,uTop,uSun,uSunDir,uFog; uniform float uFogD,uTime,uScale,uSpeed,uSparkle,uOpacity;
      varying vec3 vW;
      float hgt(vec2 p){
        float t = uTime*uSpeed;
        float h = sin(p.x*0.35 + t*1.1)*0.5 + sin(p.y*0.27 - t*0.9)*0.5;
        h += sin((p.x+p.y)*0.6 + t*1.7)*0.25 + sin((p.x-p.y)*1.3 - t*2.3)*0.12;
        h += (vnoise(p*0.9 + t*0.3)-0.5)*0.6 + (vnoise(p*2.7 - t*0.5)-0.5)*0.25;
        return h;
      }
      void main(){
        vec2 p = vW.xz * uScale;
        float e = 0.08;
        vec3 n = normalize(vec3(hgt(p-vec2(e,0.0))-hgt(p+vec2(e,0.0)), 2.2/uScale*e*6.0, hgt(p-vec2(0.0,e))-hgt(p+vec2(0.0,e))));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uHor, uTop, pow(clamp(r.y,0.0,1.0),0.5));
        vec3 base = mix(uDeep, uShallow, clamp(n.y*0.0 + 0.25 + 0.4*(hgt(p)*0.25),0.0,1.0));
        vec3 c = mix(base, sky, clamp(0.15 + fres*0.85, 0.0, 1.0));
        float spec = pow(max(dot(r, uSunDir), 0.0), 300.0) * 2.5 + pow(max(dot(r, uSunDir), 0.0), 24.0) * 0.18;
        c += uSun * spec * uSparkle;
        float d = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(d*uFogD, 2.0));
        c = mix(c, uFog, clamp(f,0.0,1.0));
        gl_FragColor = vec4(c, uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

let _dot;
/** Yumuşak yuvarlak sprite dokusu (ışık noktaları, toz). */
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}

/** Havada süzülen toz / kıvılcım parçacıkları. */
export function makeDust({ count = 600, box = [40, 20, 60], center = [0, 8, -20], color = '#ffcc88', size = 0.12, opacity = 0.7, seed = 3, drift = [0.05, 0.12, 0.03] } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), base = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base[i * 3] = center[0] + (r() - 0.5) * box[0];
    base[i * 3 + 1] = center[1] + (r() - 0.5) * box[1];
    base[i * 3 + 2] = center[2] + (r() - 0.5) * box[2];
    ph[i] = r() * 100;
  }
  pos.set(base);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, map: dotTexture(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (t) => {
    for (let i = 0; i < count; i++) {
      const p = ph[i];
      pos[i * 3] = base[i * 3] + Math.sin(t * 0.3 + p) * drift[0] * 10;
      pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.21 + p * 1.7) * drift[1] * 10;
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.17 + p * 0.7) * drift[2] * 10;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

/** Şehir ışıkları gibi sabit parlak noktalar. */
export function makeLights(points, { color = '#ffc27a', size = 0.5, opacity = 0.9, twinkle = 0.0, seed = 5 } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3));
  const mat = new THREE.PointsMaterial({ color, size, map: dotTexture(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  if (twinkle > 0) pts.userData.update = (t) => { mat.opacity = opacity * (1 - twinkle * 0.5 + twinkle * 0.5 * Math.sin(t * 3 + seed)); };
  return pts;
}

/** Sahne içindeki tüm userData.update fonksiyonlarını çağırır. */
export function tickAll(root, t) {
  root.traverse((o) => { if (o.userData && typeof o.userData.update === 'function') o.userData.update(t); });
}
