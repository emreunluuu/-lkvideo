// Render motoru: manifest'i okur, sahneleri kurar, her kareyi deterministik çizer.
// window.renderFrame(t) => verilen saniyedeki kareyi çizer (Playwright ekran görüntüsü alır).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { tickAll } from './lib/env.js';
import { clamp } from './lib/util.js';
import { Overlay } from './overlay.js';
import { SCENES } from './scenes/index.js';

const params = new URLSearchParams(location.search);
const manifest = await (await fetch(params.get('manifest') || 'manifest.json')).json();
const W = manifest.width, H = manifest.height;
document.documentElement.style.setProperty('--w', W + 'px');
document.documentElement.style.setProperty('--h', H + 'px');
const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.NoToneMapping; // ton eşleme son geçişte yapılır
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
stage.prepend(renderer.domElement);

// --- Sahneleri kur -------------------------------------------------------------
const ctx = { THREE, W, H, aspect: W / H, renderer, manifest, vertical: H > W };
const built = manifest.scenes.map((s, i) => {
  const fn = SCENES[s.type];
  if (!fn) throw new Error('Bilinmeyen sahne türü: ' + s.type);
  const inst = fn(ctx, { ...(s.params || {}), seed: (s.params && s.params.seed) || i * 17 + 3, cueTimes: s.cueTimes || {}, duration: s.end - s.start });
  inst.def = s;
  return inst;
});

// --- İki slotlu kompozisyon (geçişlerde iki sahne aynı anda) ------------------
function makeSlot() {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: manifest.msaa ?? 0 });
  const comp = new EffectComposer(renderer, rt);
  comp.renderToScreen = false;
  const rp = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.55, 0.82);
  comp.addPass(rp); comp.addPass(bloom);
  return { comp, rp, bloom };
}
const slots = [makeSlot(), makeSlot()];

const grade = manifest.grade || {};
const finalMat = new THREE.ShaderMaterial({
  uniforms: {
    tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uType: { value: 0 }, uHasB: { value: 0 },
    uExposure: { value: grade.exposure ?? 1.0 }, uContrast: { value: grade.contrast ?? 1.08 }, uSat: { value: grade.saturation ?? 1.05 },
    uLift: { value: new THREE.Color(grade.lift || '#05060a') }, uGain: { value: new THREE.Color(grade.gain || '#fff4e6') },
    uTintS: { value: new THREE.Color(grade.shadows || '#0d2a3a') }, uTintH: { value: new THREE.Color(grade.highlights || '#ffb070') },
    uSplit: { value: grade.split ?? 0.18 }, uVig: { value: grade.vignette ?? 0.42 }, uGrain: { value: grade.grain ?? 0.05 },
    uCA: { value: grade.aberration ?? 0.0015 }, uFlash: { value: 0 }, uFade: { value: 1 }, uSeed: { value: 0 },
    uRes: { value: new THREE.Vector2(W, H) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tA, tB; uniform float uMix, uType, uHasB, uExposure, uContrast, uSat, uSplit, uVig, uGrain, uCA, uFlash, uFade, uSeed;
    uniform vec3 uLift, uGain, uTintS, uTintH; uniform vec2 uRes;
    varying vec2 vUv;
    vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 tapCA(sampler2D t, vec2 uv, float ca){
      vec2 d = (uv - 0.5) * ca;
      return vec3(texture2D(t, uv + d).r, texture2D(t, uv).g, texture2D(t, uv - d).b);
    }
    // Yönlü bulanıklık (whip) ve radyal bulanıklık (zoom) için örnekleyiciler
    vec3 dirBlur(sampler2D t, vec2 uv, vec2 dir){ vec3 s = vec3(0.0); for(int i=0;i<12;i++){ float k = float(i)/11.0 - 0.5; s += texture2D(t, uv + dir*k).rgb; } return s/12.0; }
    vec3 radBlur(sampler2D t, vec2 uv, float amt, float scale){ vec2 c = vec2(0.5); vec2 u = c + (uv - c)/scale; vec3 s = vec3(0.0); for(int i=0;i<12;i++){ float k = float(i)/11.0; s += texture2D(t, c + (u - c)*(1.0 - amt*k)).rgb; } return s/12.0; }
    // FXAA (hafif): MSAA yerine kenar yumuşatma — CPU render süresini yarıya indirir
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 fxaa(sampler2D t, vec2 uv){
      vec2 px = 1.0 / uRes;
      vec3 rgbM = texture2D(t, uv).rgb;
      float lM = lum(rgbM);
      float lNW = lum(texture2D(t, uv + vec2(-1.0,-1.0)*px).rgb), lNE = lum(texture2D(t, uv + vec2(1.0,-1.0)*px).rgb);
      float lSW = lum(texture2D(t, uv + vec2(-1.0,1.0)*px).rgb), lSE = lum(texture2D(t, uv + vec2(1.0,1.0)*px).rgb);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2(-8.0), vec2(8.0)) * px;
      vec3 a = 0.5 * (texture2D(t, uv + dir * (1.0/3.0 - 0.5)).rgb + texture2D(t, uv + dir * (2.0/3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(t, uv - dir * 0.5).rgb + texture2D(t, uv + dir * 0.5).rgb);
      float lB = lum(b);
      return (lB < lMin || lB > lMax) ? a : b;
    }
    void main(){
      vec2 uv = vUv;
      vec3 col;
      float m = uMix;
      if (uHasB < 0.5) {
        col = fxaa(tA, uv);
        vec2 dca = (uv - 0.5) * uCA;
        col.r = mix(col.r, texture2D(tA, uv + dca).r, 0.6);
        col.b = mix(col.b, texture2D(tA, uv - dca).b, 0.6);
      } else if (uType < 0.5) { // cut / crossfade
        col = mix(tapCA(tA, uv, uCA), tapCA(tB, uv, uCA), m);
      } else if (uType < 1.5) { // whip pan
        float e = m < 0.5 ? pow(m*2.0, 2.0) : 1.0 - pow((1.0-m)*2.0, 2.0);
        float blur = sin(m*3.14159) * 0.35;
        if (m < 0.5) col = dirBlur(tA, uv + vec2(e*0.5, 0.0), vec2(blur, 0.0));
        else col = dirBlur(tB, uv - vec2((1.0-e)*0.5, 0.0), vec2(blur, 0.0));
      } else if (uType < 2.5) { // zoom through
        float amt = sin(m*3.14159) * 0.45;
        if (m < 0.5) col = radBlur(tA, uv, amt, 1.0 + m*1.6);
        else col = radBlur(tB, uv, amt, 1.0 - (1.0-m)*0.5);
      } else if (uType < 3.5) { // flash
        col = mix(tapCA(tA, uv, uCA), tapCA(tB, uv, uCA), smoothstep(0.35, 0.65, m));
      } else { // dip to black
        col = m < 0.5 ? tapCA(tA, uv, uCA) * (1.0 - m*2.0) : tapCA(tB, uv, uCA) * (m*2.0 - 1.0);
      }
      col = aces(col * uExposure);
      // Renk düzenlemesi: lift/gain, split-toning, kontrast, doygunluk
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(col, col * uTintH * 1.15, uSplit * smoothstep(0.35, 1.0, l));
      col = mix(col, col + uTintS * 0.25, uSplit * (1.0 - smoothstep(0.0, 0.45, l)));
      col = uLift + col * (uGain - uLift);
      col = (col - 0.5) * uContrast + 0.5;
      l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSat);
      // Vinyet
      vec2 q = uv - 0.5; q.x *= uRes.x/uRes.y;
      col *= 1.0 - uVig * smoothstep(0.25, 0.95, length(q) * 1.25);
      col = clamp(col, 0.0, 1.0);
      col = pow(col, vec3(1.0/2.2)); // doğrusal -> ekran
      // Film greni (ekran uzayında, gölgelerde daha belirgin)
      float g = h12(uv * uRes + uSeed * 91.7) - 0.5;
      col += g * uGrain * (1.2 - dot(col, vec3(0.33)));
      col = mix(col, vec3(1.0), uFlash);
      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const fsScene = new THREE.Scene();
fsScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalMat));
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const TRANS = { cut: 0, crossfade: 0, whip: 1, zoom: 2, flash: 3, dip: 4 };
const TRANS_DUR = { cut: 0, crossfade: 0.8, whip: 0.45, zoom: 0.6, flash: 0.5, dip: 0.8 };

function renderScene(slot, inst, globalT) {
  const local = globalT - inst.def.start;
  inst.update(local, globalT);
  tickAll(inst.scene, globalT);
  slot.rp.scene = inst.scene; slot.rp.camera = inst.camera;
  slot.bloom.strength = inst.bloom?.strength ?? 0.6;
  slot.bloom.radius = inst.bloom?.radius ?? 0.55;
  slot.bloom.threshold = inst.bloom?.threshold ?? 0.82;
  slot.comp.render();
  return slot.comp.readBuffer.texture;
}

const overlay = new Overlay(document.getElementById('overlay'), manifest);

function activeAt(t) {
  // Geçiş penceresini de hesaba katarak aktif sahne(ler)i bul.
  let i = 0;
  while (i + 1 < built.length && built[i + 1].def.start <= t) i++;
  const win = (k) => { const tr = built[k].def.transition || 'cut'; return { tr, d: TRANS_DUR[tr] ?? 0 }; };
  if (i + 1 < built.length) {
    const { tr, d } = win(i + 1);
    const b = built[i + 1].def.start;
    if (d > 0 && t >= b - d / 2) return { a: built[i], b: built[i + 1], mix: (t - (b - d / 2)) / d, type: tr };
  }
  if (i > 0) {
    const { tr, d } = win(i);
    const b = built[i].def.start;
    if (d > 0 && t < b + d / 2) return { a: built[i - 1], b: built[i], mix: (t - (b - d / 2)) / d, type: tr };
  }
  return { a: built[i] };
}

window.renderFrame = (t, frameIndex = 0) => {
  const act = activeAt(t);
  const ta = renderScene(slots[0], act.a, t);
  finalMat.uniforms.tA.value = ta;
  finalMat.uniforms.uHasB.value = 0;
  let flash = 0;
  if (act.b) {
    const tb = renderScene(slots[1], act.b, t);
    finalMat.uniforms.tB.value = tb;
    finalMat.uniforms.uHasB.value = 1;
    finalMat.uniforms.uMix.value = clamp(act.mix);
    finalMat.uniforms.uType.value = TRANS[act.type] ?? 0;
    if (act.type === 'flash') flash = Math.pow(Math.sin(clamp(act.mix) * Math.PI), 3) * 0.9;
  }
  // Açılış: siyahtan hızlı giriş; kapanış: son 0.6 sn kararma
  const D = manifest.duration;
  const fadeIn = clamp(t / 0.25), fadeOut = clamp((D - t) / 0.6);
  finalMat.uniforms.uFade.value = Math.min(fadeIn, fadeOut);
  finalMat.uniforms.uFlash.value = Math.max(flash, overlay.flashAt(t));
  finalMat.uniforms.uSeed.value = frameIndex % 97;
  renderer.setRenderTarget(null);
  renderer.render(fsScene, fsCam);
  const active = act.b && act.mix > 0.5 ? act.b : act.a;
  overlay.update(t, active);
  return true;
};

await document.fonts.ready;
// Shader derlemelerini ve doku yüklemelerini ısıt
for (const b of built) { window.renderFrame(b.def.start + 0.01); }
window.renderFrame(0);
window.__ready = true;
