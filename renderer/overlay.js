// Kinetik tipografi katmanı: başlıklar, bilgi etiketleri, kelime kelime altyazı, kapanış kartı.
// Tüm animasyonlar t (saniye) üzerinden hesaplanır — CSS animasyonu yok, her kare deterministik.
import * as THREE from 'three';
import { clamp, easeOutExpo, easeOutCubic, easeInCubic, easeOutBack, smooth, range } from './lib/util.js';

const up = (s) => s.toLocaleUpperCase('tr-TR');
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

export class Overlay {
  constructor(root, m) {
    this.root = root; this.m = m;
    root.style.setProperty('--accent', m.accent || '#f5c451');
    root.style.setProperty('--accent2', m.accent2 || '#7fd6ff');
    // Ölçek birimi: dikeyde genişlik 1080 referans, yatayda yükseklik 1080 referans (yatay için biraz küçült).
    const u = m.height > m.width ? m.width / 1080 : (m.height / 1080) * 0.82;
    root.style.setProperty('--u', u + 'px');
    this.titles = (m.titles || []).map((d) => this._mkTitle(d));
    this.labels = (m.labels || []).map((d) => this._mkLabel(d));
    this.subs = (m.subs || []).map((d) => this._mkSub(d));
    this.end = m.endcard ? this._mkEnd(m.endcard) : null;
    this._v = new THREE.Vector3();
  }

  // ---------------- Başlıklar ----------------
  _mkTitle(d) {
    const box = el('div', `title title-${d.style || 'impact'} pos-${d.pos || 'top'}`, this.root);
    const main = el('div', 'title-main', box);
    const words = up(d.text).split(' ');
    const letters = [];
    words.forEach((w, wi) => {
      const ws = el('span', 'tw', main);
      for (const ch of w) { const s = el('span', 'tl', ws); s.textContent = ch; letters.push(s); }
      if (wi < words.length - 1) { const sp = el('span', 'tsp', main); sp.textContent = ' '; }
      if (d.breakAfter && d.breakAfter.includes(wi)) el('br', null, main);
    });
    let sub = null;
    if (d.sub) { sub = el('div', 'title-sub', box); sub.textContent = up(d.sub); }
    let rule = null;
    if ((d.style || 'impact') !== 'impact') rule = el('div', 'title-rule', box);
    return { d, box, letters, sub, rule };
  }
  _updTitle(o, t) {
    const { d } = o;
    const style = d.style || 'impact';
    const vis = t >= d.start - 0.05 && t <= d.end + 0.5;
    o.box.style.display = vis ? '' : 'none';
    if (!vis) return;
    const out = easeInCubic(range(t, d.end - 0.05, d.end + 0.35));
    o.box.style.opacity = String(1 - out);
    if (style === 'impact') {
      o.letters.forEach((s, i) => {
        const p = range(t, d.start + i * 0.028, d.start + i * 0.028 + 0.38);
        const e = easeOutExpo(p);
        const sc = 2.4 - 1.4 * e + out * 0.25;
        s.style.opacity = String(clamp(p * 3));
        s.style.transform = `translateY(${(1 - e) * -40 - out * 30}px) scale(${sc})`;
        s.style.filter = `blur(${(1 - e) * 14 + out * 8}px)`;
      });
      o.box.style.transform = `scale(${1 + range(t, d.start, d.end) * 0.06})`;
    } else if (style === 'cinematic' || style === 'legend') {
      const p = easeOutCubic(range(t, d.start, d.start + 1.1));
      o.letters.forEach((s, i) => {
        const q = range(t, d.start + i * 0.035, d.start + i * 0.035 + 0.6);
        s.style.opacity = String(smooth(q));
        s.style.transform = `translateY(${(1 - easeOutCubic(q)) * 24}px)`;
        s.style.filter = `blur(${(1 - q) * 6}px)`;
      });
      o.box.style.letterSpacing = `${0.55 - 0.3 * p}em`;
      if (o.rule) o.rule.style.transform = `scaleX(${easeOutExpo(range(t, d.start + 0.2, d.start + 1.0))})`;
    }
    if (o.sub) {
      const q = easeOutCubic(range(t, d.start + 0.35, d.start + 0.9));
      o.sub.style.opacity = String(q);
      o.sub.style.transform = `translateY(${(1 - q) * 20}px)`;
      o.sub.style.letterSpacing = `${0.5 - 0.2 * q}em`;
    }
  }

  // ---------------- Bilgi etiketleri ----------------
  _mkLabel(d) {
    const box = el('div', `label label-${d.style || 'chip'} slot-${d.slot || 'tl'}`, this.root);
    if (d.style === 'map') {
      const v = el('div', 'map-text', box); v.textContent = up(d.value);
      return { d, box, v };
    }
    if (d.style === 'pin') {
      const dot = el('div', 'pin-dot', box);
      const line = el('div', 'pin-line', box);
      const card = el('div', 'pin-card', box);
      const v = el('div', 'pin-value', card); v.textContent = up(d.value);
      const c = el('div', 'pin-cap', card); c.textContent = d.caption ? up(d.caption) : '';
      return { d, box, dot, line, card, v, c };
    }
    const bar = el('div', 'label-bar', box);
    const body = el('div', 'label-body', box);
    const v = el('div', 'label-value', body);
    const c = el('div', 'label-cap', body);
    c.textContent = d.caption ? up(d.caption) : '';
    return { d, box, bar, v, c };
  }
  _fmtValue(d, p) {
    const val = up(String(d.value));
    if (!d.count) return val;
    const m = val.match(/^(\D*)(\d+)(.*)$/);
    if (!m) return val;
    const n = Math.round(parseInt(m[2], 10) * easeOutCubic(p));
    return m[1] + String(n) + m[3];
  }
  _project(anchor, inst) {
    if (!inst || !inst.anchors || !inst.anchors[anchor]) return null;
    this._v.copy(inst.anchors[anchor]).project(inst.camera);
    if (this._v.z > 1) return null;
    return [(this._v.x * 0.5 + 0.5) * this.m.width, (1 - (this._v.y * 0.5 + 0.5)) * this.m.height];
  }
  _updLabel(o, t, inst) {
    const { d } = o;
    const vis = t >= d.start - 0.05 && t <= d.end + 0.45;
    o.box.style.display = vis ? '' : 'none';
    if (!vis) return;
    const pin = d.anchor ? this._project(d.anchor, inst) : null;
    if (d.anchor && !pin) { o.box.style.display = 'none'; return; }
    if (pin) {
      // Güvenli alan içinde tut (sağ kenar ve alt %20 platform arayüzü için boş)
      const pinLike = d.style === 'pin' || d.style === 'map';
      const vx = Math.min(Math.max(pin[0], this.m.width * (pinLike ? 0.3 : 0.16)), this.m.width * (pinLike ? 0.6 : 0.72));
      const vy = Math.min(Math.max(pin[1], this.m.height * (d.style === 'pin' ? 0.3 : 0.12)), this.m.height * 0.62);
      o.box.style.left = vx + 'px'; o.box.style.top = vy + 'px';
    }
    const out = easeInCubic(range(t, d.end, d.end + 0.4));
    if (d.style === 'map') {
      const p = easeOutCubic(range(t, d.start, d.start + 0.8));
      o.box.style.opacity = String(p * (1 - out));
      o.v.style.letterSpacing = `${0.9 - 0.45 * p}em`;
      o.v.style.filter = `blur(${(1 - p) * 8}px)`;
      return;
    }
    if (d.style === 'pin') {
      const p1 = easeOutBack(range(t, d.start, d.start + 0.3));
      const p2 = easeOutExpo(range(t, d.start + 0.1, d.start + 0.55));
      const p3 = easeOutCubic(range(t, d.start + 0.35, d.start + 0.8));
      o.box.style.opacity = String(1 - out);
      o.dot.style.transform = `translate(-50%,-50%) scale(${p1})`;
      o.line.style.transform = `scaleY(${p2})`;
      o.card.style.opacity = String(p3);
      o.card.style.transform = `translate(-50%, ${(1 - p3) * 20}px)`;
      o.v.textContent = this._fmtValue(d, range(t, d.start + 0.3, d.start + 1.2));
      return;
    }
    const pBar = easeOutExpo(range(t, d.start, d.start + 0.45));
    const pVal = easeOutExpo(range(t, d.start + 0.12, d.start + 0.7));
    const pCap = easeOutCubic(range(t, d.start + 0.3, d.start + 0.9));
    o.bar.style.transform = `scaleY(${pBar})`;
    o.v.style.clipPath = `inset(${(1 - pVal) * 100}% 0 0 0)`;
    o.v.style.transform = `translateY(${(1 - pVal) * 40}px)`;
    o.v.textContent = this._fmtValue(d, range(t, d.start + 0.12, d.start + 1.1));
    o.c.style.opacity = String(pCap);
    o.c.style.transform = `translateX(${(1 - pCap) * -30}px)`;
    o.box.style.opacity = String(1 - out);
    o.box.style.transform = `translateX(${-out * 60}px)`;
  }

  // ---------------- Altyazı ----------------
  _mkSub(d) {
    const box = el('div', 'sub', this.root);
    const spans = d.words.map((w, i) => {
      const s = el('span', 'sw', box); s.textContent = up(w.w);
      if (i < d.words.length - 1) box.appendChild(document.createTextNode(' '));
      return s;
    });
    return { d, box, spans };
  }
  _updSub(o, t) {
    const { d } = o;
    const vis = t >= d.start && t < d.end;
    o.box.style.display = vis ? '' : 'none';
    if (!vis) return;
    const p = easeOutBack(range(t, d.start, d.start + 0.14), 2.2);
    o.box.style.transform = `translate(-50%, -50%) scale(${0.86 + 0.14 * p})`;
    o.box.style.opacity = String(clamp(range(t, d.start, d.start + 0.06)));
    d.words.forEach((w, i) => {
      const s = o.spans[i];
      const on = t >= w.start && t < (d.words[i + 1] ? d.words[i + 1].start : d.end);
      const said = t >= w.start;
      s.classList.toggle('on', on);
      s.style.opacity = said ? '1' : '0.55';
      const k = on ? easeOutBack(range(t, w.start, w.start + 0.12), 3) : 0;
      s.style.transform = on ? `scale(${1 + 0.1 * k})` : 'scale(1)';
    });
  }

  // ---------------- Kapanış kartı ----------------
  _mkEnd(d) {
    const box = el('div', 'endcard', this.root);
    const q = el('div', 'end-q', box);
    const words = up(d.text).split(' ');
    const spans = words.map((w) => { const s = el('span', 'ew', q); s.textContent = w + ' '; return s; });
    const cta = el('div', 'end-cta', box);
    cta.innerHTML = `<span class="cta-text">${up(d.cta || 'Yorumlara yaz')}</span><span class="cta-arrow"></span>`;
    return { d, box, spans, cta };
  }
  _updEnd(o, t) {
    const { d } = o;
    const vis = t >= d.start;
    o.box.style.display = vis ? '' : 'none';
    if (!vis) return;
    o.spans.forEach((s, i) => {
      const p = range(t, d.start + i * 0.07, d.start + i * 0.07 + 0.45);
      s.style.opacity = String(smooth(p));
      s.style.transform = `translateY(${(1 - easeOutCubic(p)) * 50}px)`;
      s.style.filter = `blur(${(1 - p) * 10}px)`;
    });
    const c = easeOutBack(range(t, d.start + 0.3 + o.spans.length * 0.07, d.start + 0.8 + o.spans.length * 0.07));
    o.cta.style.opacity = String(clamp(c));
    o.cta.style.transform = `scale(${0.6 + 0.4 * c})`;
    const bob = Math.sin(t * 6) * 8;
    const arrow = o.cta.querySelector('.cta-arrow');
    arrow.style.transform = `translateY(${bob}px) rotate(45deg)`;
  }

  flashAt(t) {
    let f = 0;
    for (const d of this.m.titles || []) {
      if ((d.style || 'impact') !== 'impact') continue;
      const dt = t - (d.start + 0.12);
      if (dt >= 0 && dt < 0.4) f = Math.max(f, 0.28 * Math.exp(-dt * 12));
    }
    return f;
  }

  update(t, inst) {
    for (const o of this.titles) this._updTitle(o, t);
    for (const o of this.labels) this._updLabel(o, t, inst);
    for (const o of this.subs) this._updSub(o, t);
    if (this.end) this._updEnd(this.end, t);
  }
}
