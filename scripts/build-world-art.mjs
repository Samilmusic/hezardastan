#!/usr/bin/env node
// Renders the static chapter illustrations of «جهانِ هزارآوا» (dist/world/ch1…6.svg, teaser.svg) from the same
// scene model the live canvas uses. No dependencies. Usage: node scripts/build-world-art.mjs
import { writeFileSync } from 'node:fs';
import { buildScene, drawScene, cameraAt, storyState, PERCHES, perchFor } from '../dist/world/scene.mjs';

const r1 = v => Math.round(v * 2) / 2;
class Svg {
  constructor(W, H) { this.W = W; this.H = H; this.out = []; this.defs = []; this.n = 0; this.last = null; }
  flush() { if (this.last) { const { fill, d, a } = this.last; this.out.push(`<path fill="${fill}" stroke="${fill}"${a != null ? ` opacity="${a}"` : ''} d="${d}"/>`); this.last = null; } }
  d(pts) { let s = 'M' + r1(pts[0]) + ' ' + r1(pts[1]); for (let i = 2; i < pts.length; i += 2) s += 'L' + r1(pts[i]) + ' ' + r1(pts[i + 1]); return s + 'Z'; }
  poly(pts, fill, a) {
    if (fill.startsWith('url(')) { this.flush(); this.out.push(`<path fill="${fill}" stroke="none" d="${this.d(pts)}"/>`); return; }
    if (this.last && this.last.fill === fill && this.last.a === a && a == null) { this.last.d += this.d(pts); return; }
    this.flush(); this.last = { fill, d: this.d(pts), a };
  }
  polys(list, fill) { this.flush(); this.out.push(`<path fill="${fill}" stroke="none" d="${list.map(p => this.d(p)).join('')}"/>`); }
  ellipse(cx, cy, rx, ry, fill) { this.flush(); this.out.push(`<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${fill}" stroke="none"/>`); }
  glow(cx, cy, rx, ry, color, alpha) { this.flush(); const id = 'w' + (this.n++); this.defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${r1(alpha * 10) / 10}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`);
    this.out.push(`<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="url(#${id})" stroke="none"/>`); }
  line(pts, color, w, o = {}) { this.flush(); let s = ''; for (let i = 0; i < pts.length; i += 2) s += (i ? 'L' : 'M') + r1(pts[i]) + ' ' + r1(pts[i + 1]);
    this.out.push(`<path fill="none" stroke="${color}" stroke-width="${r1(w)}"${o.alpha != null ? ` opacity="${o.alpha}"` : ''}${o.cap ? ' stroke-linecap="round"' : ''}${o.dash ? ` stroke-dasharray="${o.dash.map(r1).join(' ')}"` : ''} d="${s}"/>`); }
  stops(st) { return st.map(([o, c]) => { const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c); return m ? `<stop offset="${o}" stop-color="rgb(${m[1]},${m[2]},${m[3]})" stop-opacity="${m[4]}"/>` : `<stop offset="${o}" stop-color="${c}"/>`; }).join(''); }
  lin(x0, y0, x1, y1, st) { const id = 'w' + (this.n++); this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r1(x0)}" y1="${r1(y0)}" x2="${r1(x1)}" y2="${r1(y1)}">${this.stops(st)}</linearGradient>`); return `url(#${id})`; }
  rad(cx, cy, r, st) { const id = 'w' + (this.n++); this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}">${this.stops(st)}</radialGradient>`); return `url(#${id})`; }
  rect(x, y, w, h, fill) { this.flush(); this.out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="none"/>`); }
  raw(s) { this.flush(); this.out.push(s); }
  toString(title) { this.flush(); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}" width="${this.W}" height="${this.H}" role="img"><title>${title}</title><defs>${this.defs.join('')}</defs><g stroke-width=".7" stroke-linejoin="round">${this.out.join('')}</g></svg>`; }
}

// the existing HezarAva bird (same drawing as the homepage), feet at (86, 111) in a 160 × 124 box
export const BIRD = `<linearGradient id="hb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f7f77"/><stop offset=".55" stop-color="#1f524d"/><stop offset="1" stop-color="#123633"/></linearGradient><linearGradient id="hw" x1="0" y1="0" x2="1" y2=".6"><stop offset="0" stop-color="#f0e2bf"/><stop offset=".5" stop-color="#c7a46a"/><stop offset="1" stop-color="#8f6d3b"/></linearGradient><linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf5e8"/><stop offset="1" stop-color="#e5d6b8"/></linearGradient>
<path d="M80 95v16m-5 0h12M92 93v18m-5 0h11" stroke="#4a2f20" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M46 74 8 96l5 5 10-3-6 8 36-21Z" fill="url(#hb)"/><path d="M40 72c0-19 19-32 41-32 17 0 29 7 35 17 4 8 2 19-7 27-12 11-37 13-53 7-10-4-16-10-16-19Z" fill="url(#hb)"/><path d="M70 93c17 2 34-4 42-15-3 11-16 20-33 21-4 0-7-2-9-6Z" fill="url(#hl)"/><circle cx="112" cy="47" r="17" fill="url(#hb)"/><path d="M104 58c6 5 15 5 21-1-2 8-9 12-16 11-4-1-6-5-5-10Z" fill="url(#hl)"/><path d="m127 44 18 3.5-18 4.5Z" fill="url(#hw)"/><circle cx="117" cy="43" r="3" fill="#0d211f"/><circle cx="118" cy="42" r="1" fill="#fff"/><path d="M54 58c15-12 39-11 51 3-12 6-29 12-49 15-6-5-7-13-2-18Z" fill="url(#hw)"/><path d="M62 66c10-3 22-4 32-3M60 72c11-1 23-4 33-7" stroke="#7d5c31" stroke-opacity=".45" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;

const S = buildScene();
export function still(p, W, H, title, o = {}) {
  const g = new Svg(W, H), cam = { ...cameraAt(p, false), ...(o.cam || {}) }, st = storyState(p), perch = PERCHES[perchFor(p)].at;
  st.bird = { gx: perch[0], gy: perch[1], gz: perch[2], shadow: 1 };
  if (o.state) Object.assign(st, o.state);
  const view = { W, H, cx: W * (o.cx ?? 0.5), cy: H * (o.cy ?? 0.52), fitW: W * (o.fit ?? 0.94), fitH: H * (o.fit ?? 0.94) };
  const api = drawScene(g, S, cam, view, st, 0);
  const b = api.P(perch[0], perch[1], perch[2]), w = Math.max(54, 1.25 * api.s), k = Math.round(w / 160 * 1000) / 1000, flip = PERCHES[perchFor(p)].flip;
  g.raw(`<g transform="translate(${r1(b[0] + (flip ? 86 : -86) * k)} ${r1(b[1] - 111 * k)}) scale(${flip ? -k : k} ${k})">${BIRD}</g>`);
  return g.toString(title);
}
const out = new URL('../dist/world/', import.meta.url);
const CH = [
  [0.5, 'تصویرسازی خیالی از آموزشگاهی کوچک با حیاط و حوض'], [1.4, 'پذیرش و اتاق مدیریت، با مسیری روشن میان آن‌ها'], [2.2, 'کلاس: استاد و هنرجو با گیتار'],
  [3.25, 'گوشهٔ تمرین در خانه'], [4.15, 'کمانی از صدا که خانه را به کلاس استاد وصل می‌کند'], [5, 'آموزشگاه و خانه در یک نگاه، با مسیرهای روشن'],
];
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  CH.forEach(([p, t], i) => { const svg = still(p, 1200, 800, t); writeFileSync(new URL(`ch${i + 1}.svg`, out), svg); console.log(`ch${i + 1}.svg`, svg.length); });
  if (process.argv.includes('--test')) { writeFileSync('/tmp/top.svg', still(0, 1200, 800, 'top')); writeFileSync('/tmp/mid.svg', still(0.18, 1200, 800, 'mid')); writeFileSync('/tmp/walk.svg', still(2.75, 1200, 800, 'walk')); }
  const t = still(0.5, 1200, 620, 'تصویرسازی خیالی از آموزشگاهی کوچک با حیاط و حوض', { cam: { tx: 12.2, ty: 6.9, w: 26.5, h: 15.5 }, fit: 1, cy: 0.5 });
  writeFileSync(new URL('teaser.svg', out), t); console.log('teaser.svg', t.length);
}
