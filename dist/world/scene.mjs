// جهانِ هزارآوا — the miniature world. One scene model, drawn by two backends: canvas (live) and SVG (static
// chapter illustrations). Pure data + maths: no DOM, no network. The building is imaginary, not a floor plan.
// World axes: x east, y south, z up (units ≈ metres). Orthographic camera with azimuth a and elevation e.

export const PAL = {
  ground: '#efe5d0', garden: '#dde2cb', gardenD: '#c9d3b6', path: '#e6d6b6', stone: '#f4ead6',
  plaster: '#f3ead8', plasterD: '#e6d8bd', court: '#ecdfc5', courtB: '#e2d2b3', floor: '#e9d6b4', floorB: '#dfc9a2', wood: '#c99f6c', woodD: '#b78a58',
  teal: '#2c6a63', tealD: '#1b4743', tealL: '#5c9d92', water: '#3f8f85', waterL: '#7cc0b3',
  walnut: '#6d4731', walnutD: '#4f3122', walnutL: '#8c6044', brass: '#c3a063', brassL: '#e6cf98', terra: '#b65f3f', terraD: '#96482e',
  ivory: '#fbf5e8', rug: '#8f3f30', rugB: '#d9b77c', cypress: '#3e6455', leaf: '#6b8a5f', orange: '#d98a3d', ink: '#3a2a1e', glow: '#ffe9b8',
};
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hx = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export const shade = (h, f) => { const c = rgb(h); return '#' + hx(c[0] * f) + hx(c[1] * f) + hx(c[2] * f); };
export const mix = (a, b, t) => { const p = rgb(a), q = rgb(b); return '#' + hx(p[0] + (q[0] - p[0]) * t) + hx(p[1] + (q[1] - p[1]) * t) + hx(p[2] + (q[2] - p[2]) * t); };
const rgba = (h, a) => { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const LIGHT = [-0.45, 0.89], SHADOW = [0.42, -0.36];

function hull(points) { // monotone chain; returns one consistent winding
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
const ngon = (cx, cy, r, n, rot = 0) => Array.from({ length: n }, (_, i) => { const t = rot + i / n * Math.PI * 2; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function arch(u0, u1, zb, zs, za, n = 7) { // pointed arch outline in a wall plane: [u, z]
  const um = (u0 + u1) / 2, pts = [[u0, zb], [u0, zs]];
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([u0 + (um - u0) * t, zs + (za - zs) * (1 - (1 - t) * (1 - t))]); }
  pts.push([um, za]);
  for (let i = n - 1; i >= 1; i--) { const t = i / n; pts.push([u1 - (u1 - um) * t, zs + (za - zs) * (1 - (1 - t) * (1 - t))]); }
  pts.push([u1, zs], [u1, zb]); return pts;
}

// ======================================================================= the scene
export function buildScene() {
  const S = { ground: [], deco: [], lines: [], back: [], solids: [], pools: [] };
  const flat = (pts, color, o = {}) => { S[o.on || 'deco'].push({ pts, color, z: o.z || 0, a: o.a }); };
  const prism = (pts, z0, z1, color, o = {}) => { const ob = { k: 'prism', pts, z0, z1, color, top: o.top, decals: o.decals, shadow: o.shadow !== false && z0 === 0, bias: o.bias || 0 }; (o.back ? S.back : S.solids).push(ob); return ob; };
  const box = (x0, y0, x1, y1, z0, z1, color, o) => prism(rect(x0, y0, x1, y1), z0, z1, color, o);
  const sprite = (x, y, z, shapes, o = {}) => S.solids.push({ k: 'sprite', x, y, z, shapes, bias: o.bias || 0 });
  const ball = (x, y, z, r, color, o = {}) => S.solids.push({ k: 'ball', x, y, z, r, color, dots: o.dots, back: o.back });
  const cone = (x, y, r, h, color, o = {}) => (o.back ? S.back : S.solids).push({ k: 'cone', x, y, r, h, z0: o.z0 || 0, color, shadow: true });
  const pawn = (x, y, o) => S.solids.push({ k: 'pawn', x, y, h: 1, rb: 0.3, rt: 0.13, rh: 0.18, ...o });
  const line = (pts, color, w, o = {}) => S.lines.push({ pts, color, w, z: o.z || 0.01, a: o.a });
  const T = 0.28;
  // wall along an axis; split into short pieces so depth sorting stays correct. decal(i, len) → decals for the lit face.
  function wall(x0, y0, x1, y1, h, o = {}) {
    const horiz = y0 === y1, a0 = horiz ? x0 : y0, a1 = horiz ? x1 : y1, color = o.color || PAL.plaster;
    const spans = []; let cur = a0;
    for (const [g0, g1] of (o.gaps || [])) { if (g0 > cur) spans.push([cur, g0]); cur = g1; }
    if (a1 > cur) spans.push([cur, a1]);
    let idx = 0;
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.round((s1 - s0) / (o.seg || 1.25))), len = (s1 - s0) / n;
      for (let i = 0; i < n; i++, idx++) {
        const b0 = s0 + i * len, b1 = b0 + len;
        const decals = o.decal ? o.decal(idx, len).map(d => ({ ...d, edge: horiz ? 2 : 1 })) : undefined;
        if (horiz) box(b0, y0 - T / 2, b1, y0 + T / 2, 0, h, color, { back: o.back, top: o.top, decals });
        else box(x0 - T / 2, b0, x0 + T / 2, b1, 0, h, color, { back: o.back, top: o.top, decals });
      }
    }
  }
  const HB = 1.9; // tall back walls
  const niche = (i, len) => [
    { pts: arch(0.22, len - 0.22, 0.3, 0.85, 1.32), color: shade(PAL.plaster, 0.9) },
    { pts: arch(0.34, len - 0.34, 0.36, 0.85, 1.22), color: shade(PAL.plaster, 0.84) },
    { pts: [[0, 1.5], [len, 1.5], [len, 1.68], [0, 1.68]], color: PAL.teal },
    { pts: [[0, 1.46], [len, 1.46], [len, 1.5], [0, 1.5]], color: PAL.brass },
    { pts: [[0, 1.68], [len, 1.68], [len, 1.71], [0, 1.71]], color: PAL.brassL },
  ];
  const band = (i, len) => [{ pts: [[0, 0.78], [len, 0.78], [len, 0.9], [0, 0.9]], color: PAL.teal }];

  // ---- ground, garden and the way home
  flat(rect(-30, -30, 70, 50), PAL.ground, { on: 'ground' });
  flat([[-3, -3.2], [26.9, -3.2], [26.9, 5.7], [24.2, 5.7], [24.2, 15.6], [16, 15.6], [16, 14.2], [12.5, 14.2], [12.5, 17.8], [-3, 17.8]], mix(PAL.ground, '#ffffff', 0.25), { on: 'ground' });
  for (const g of [[[27.4, 1.6], [36, 1], [37.5, 5], [27.6, 5.2]], [[15.2, 16.6], [26.5, 16.6], [26.5, 19.6], [14, 19.8]], [[-1.5, 18.5], [11.8, 18.4], [12.4, 21], [-2.2, 20.8]], [[33.8, 12.6], [38, 12], [39, 18], [32, 18.5]]])
    flat(g, PAL.garden, { on: 'ground' });
  const WAY = [[13.5, 13], [13.5, 15.4], [29.9, 15.4], [29.9, 11.6]];
  flat([[12.7, 13], [14.3, 13], [14.3, 14.6], [29.1, 14.6], [29.1, 11.6], [30.7, 11.6], [30.7, 16.2], [12.7, 16.2]], PAL.path, { on: 'ground' });
  for (let i = 0; i < 20; i++) { const x = 14.6 + i * 0.78; flat(rect(x, 15.05, x + 0.56, 15.75), PAL.stone, { on: 'ground' }); }
  for (let i = 0; i < 3; i++) { flat(rect(13.15, 13.35 + i * 0.6, 13.85, 13.75 + i * 0.6), PAL.stone, { on: 'ground' }); flat(rect(29.55, 12 + i * 0.75, 30.25, 12.5 + i * 0.75), PAL.stone, { on: 'ground' }); }

  // ---- floors
  const F = (x0, y0, x1, y1, c) => flat(rect(x0, y0, x1, y1), c, { on: 'ground' });
  F(0, 0, 6, 5, PAL.floor); F(0, 5, 6, 11.5, PAL.floorB);
  F(6, 0, 11, 5, PAL.floorB); F(11, 0, 16, 5, PAL.floor); F(16, 0, 21, 5, PAL.floorB);
  F(21, 0, 25.6, 5, '#d9c7a4'); F(0, 11.5, 6, 16.5, PAL.floor); F(6, 13, 11.6, 16.5, PAL.floorB);
  F(6, 5, 21, 13, PAL.court);
  for (let i = 0; i < 15; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) flat(rect(6 + i, 5 + j, 7 + i, 6 + j), PAL.courtB, { on: 'ground' });
  // turquoise tile border and the star around the pool
  for (const r of [rect(6.25, 5.3, 20.75, 5.5), rect(6.25, 12.5, 20.75, 12.7), rect(6.25, 5.3, 6.45, 12.7), rect(20.55, 5.3, 20.75, 12.7)]) flat(r, PAL.tealL);
  const HX = 13.5, HY = 9;
  flat(ngon(HX, HY, 3.05, 4, 0), PAL.brassL); flat(ngon(HX, HY, 3.05, 4, Math.PI / 4), PAL.brassL);
  flat(ngon(HX, HY, 2.8, 4, 0), PAL.teal); flat(ngon(HX, HY, 2.8, 4, Math.PI / 4), PAL.teal);
  flat(ngon(HX, HY, 2.1, 8, Math.PI / 8), PAL.ivory);
  prism(ngon(HX, HY, 1.65, 8, Math.PI / 8), 0, 0.3, PAL.plaster, { top: PAL.ivory });
  S.solids.push({ k: 'flat', pts: ngon(HX, HY, 1.36, 8, Math.PI / 8), z: 0.31, color: PAL.water, x: HX, y: HY, bias: 0.02 });
  S.solids.push({ k: 'flat', pts: ngon(HX - 0.25, HY - 0.2, 0.7, 8, 0.2), z: 0.312, color: PAL.waterL, x: HX, y: HY, bias: 0.03, a: 0.55 });
  prism(ngon(HX, HY, 0.2, 8), 0.3, 0.62, PAL.brass, { bias: 0.05 }); prism(ngon(HX, HY, 0.42, 8), 0.62, 0.72, PAL.brassL, { bias: 0.06 });
  // planters with orange trees
  for (const [px, py] of [[8.2, 6.8], [8.2, 11.2]]) {
    box(px - 0.5, py - 0.5, px + 0.5, py + 0.5, 0, 0.42, PAL.terra, { top: PAL.walnutD });
    prism(ngon(px, py, 0.09, 6), 0.42, 1.25, PAL.walnut, { bias: 0.02 });
    ball(px, py, 1.55, 0.62, PAL.leaf, { dots: PAL.orange });
  }
  // ---- back walls (north, west) with niches and tile band; drawn before everything inside
  const foam = (i, len) => [0, 1, 2].flatMap(r => [0.14, 0.14 + (len - 0.28) / 2].map((u, c) => ({ pts: [[u, 0.4 + r * 0.42], [u + (len - 0.28) / 2 - 0.06, 0.4 + r * 0.42], [u + (len - 0.28) / 2 - 0.06, 0.76 + r * 0.42], [u, 0.76 + r * 0.42]], color: (r + c + i) % 2 ? PAL.tealD : PAL.walnut })))
    .concat([{ pts: [[0, 1.68], [len, 1.68], [len, 1.71], [0, 1.71]], color: PAL.brassL }]);
  wall(-T / 2, -T / 2, 21 + T / 2, -T / 2, HB, { back: true, decal: niche, top: PAL.ivory });
  wall(21 + T / 2, -T / 2, 25.6 + T / 2, -T / 2, HB, { back: true, decal: foam, top: PAL.ivory, seg: 1.15 });
  wall(-T / 2, 0, -T / 2, 16.5, HB, { back: true, decal: niche, top: PAL.ivory });
  // wind tower and cypress trees behind
  box(-1.9, -1.9, -0.45, -0.45, 0, 3.3, PAL.plaster, { back: true, top: PAL.ivory, decals: [1, 2].flatMap(e => [0.22, 0.6, 0.98].map(u => ({ edge: e, pts: [[u, 2.2], [u + 0.24, 2.2], [u + 0.24, 3.05], [u, 3.05]], color: PAL.walnutD }))).concat([1, 2].map(e => ({ edge: e, pts: [[0, 1.95], [1.45, 1.95], [1.45, 2.08], [0, 2.08]], color: PAL.teal }))) });
  for (const [tx, ty, r, h] of [[3.5, -1.6, 0.55, 3.1], [9, -1.9, 0.6, 3.4], [14.5, -1.5, 0.5, 2.8], [19.5, -1.9, 0.6, 3.3], [-1.6, 3.5, 0.55, 3], [-1.8, 8.5, 0.6, 3.3], [-1.7, 13.6, 0.55, 3.1], [24.2, -1.7, 0.55, 3]]) cone(tx, ty, r, h, PAL.cypress, { back: true });
  // ---- partitions and low front walls
  wall(0, 5, 6, 5, 1.05, { gaps: [[2.3, 3.7]], decal: band });
  wall(6, 0, 6, 5, 1.25, { decal: band }); wall(11, 0, 11, 5, 1.25, { decal: band }); wall(16, 0, 16, 5, 1.25, { decal: band });
  wall(21, 0, 21, 5, 1.25, { decal: band }); wall(21, 5, 21, 13, 0.36, { color: PAL.plasterD });
  wall(25.6, 0, 25.6, 5, 0.3, { color: PAL.plasterD }); wall(21, 5, 25.6, 5, 0.3, { gaps: [[21.6, 22.9]], color: PAL.plasterD });
  wall(6, 13, 21, 13, 0.36, { gaps: [[8.1, 9.5], [12.5, 14.5]], color: PAL.plasterD });
  wall(0, 11.5, 6, 11.5, 0.6, { gaps: [[2.3, 3.7]], color: PAL.plaster, top: PAL.tealL });
  wall(6, 13, 6, 16.5, 1.05, { decal: band }); wall(0, 16.5, 11.6, 16.5, 0.3, { color: PAL.plasterD }); wall(11.6, 13, 11.6, 16.5, 0.3, { color: PAL.plasterD });
  wall(6, 5, 6, 13, 0.3, { gaps: [[8.6, 10.4]], color: PAL.plasterD });
  // columns of the north arcade
  for (const cx of [6, 8.5, 11, 13.5, 16, 18.5, 21]) { prism(ngon(cx, 5, 0.17, 8), 0, 1.5, PAL.ivory); box(cx - 0.24, 4.76, cx + 0.24, 5.24, 1.5, 1.62, PAL.brassL, { bias: 0.02 }); }
  // gate
  for (const gx of [12.25, 14.75]) { box(gx - 0.3, 12.7, gx + 0.3, 13.3, 0, 2, PAL.plaster, { top: PAL.ivory, decals: [{ edge: 2, pts: [[0.08, 1.55], [0.52, 1.55], [0.52, 1.75], [0.08, 1.75]], color: PAL.teal }] }); ball(gx, 13, 2.18, 0.2, PAL.brass); }

  // ---- reception (x 0..6, y 5..11.5)
  flat(rect(1.1, 8.9, 4.7, 10.9), PAL.teal); flat(rect(1.3, 9.1, 4.5, 10.7), PAL.tealL); flat(rect(1.55, 9.35, 4.25, 10.45), PAL.teal); flat(ngon(2.9, 9.9, 0.42, 4), PAL.brassL);
  box(1.3, 7.5, 3.9, 8.3, 0, 0.78, PAL.walnut, { top: PAL.walnutL, decals: [{ edge: 2, pts: [[0.15, 0.2], [2.45, 0.2], [2.45, 0.6], [0.15, 0.6]], color: PAL.walnutD }, { edge: 2, pts: [[0, 0.7], [2.6, 0.7], [2.6, 0.78], [0, 0.78]], color: PAL.brass }] });
  box(1.6, 7.65, 2.2, 8.05, 0.78, 0.82, PAL.ivory, { bias: 0.04 }); box(3.2, 7.62, 3.36, 7.78, 0.78, 1.06, PAL.brass, { bias: 0.04 }); ball(3.28, 7.7, 1.14, 0.13, PAL.glow);
  box(0, 5.5, 0.55, 7.4, 0, 1.45, PAL.walnut, { top: PAL.walnutL, decals: [0.25, 0.65, 1.05].flatMap((z, r) => [0.12, 0.42, 0.72, 1.02, 1.32, 1.6].map((u, c) => ({ edge: 1, pts: [[u, z], [u + 0.2, z], [u + 0.2, z + 0.3], [u, z + 0.3]], color: [PAL.teal, PAL.terra, PAL.brassL, PAL.ivory, PAL.tealL, PAL.rug][(r * 2 + c) % 6] }))) });
  box(4.4, 10.5, 5.6, 11.05, 0, 0.42, PAL.walnutL, { top: PAL.terra });
  prism(ngon(5.2, 5.9, 0.3, 8), 0, 0.5, PAL.terra); ball(5.2, 5.9, 0.95, 0.5, PAL.leaf);
  pawn(2.5, 6.95, { color: PAL.walnutL, head: '#e9c9a4', collar: PAL.brassL, h: 0.98 });
  // ---- management (x 0..6, y 0..5)
  flat(rect(1.2, 1.2, 5, 4.2), PAL.rug); flat(rect(1.4, 1.4, 4.8, 4), PAL.rugB); flat(rect(1.6, 1.6, 4.6, 3.8), PAL.rug); flat(ngon(3.1, 2.7, 0.5, 4), PAL.rugB);
  box(1.9, 2.3, 4.3, 3.1, 0, 0.78, PAL.walnutD, { top: PAL.walnut, decals: [{ edge: 2, pts: [[0, 0.7], [2.4, 0.7], [2.4, 0.78], [0, 0.78]], color: PAL.brass }] });
  box(2.3, 2.45, 3, 2.9, 0.78, 0.81, PAL.ivory, { bias: 0.04 }); box(3.7, 2.42, 3.86, 2.58, 0.78, 1.08, PAL.brass, { bias: 0.04 }); ball(3.78, 2.5, 1.16, 0.13, PAL.glow);
  box(0.7, 0, 2.7, 0.5, 0, 1.5, PAL.walnut, { top: PAL.walnutL, decals: [0.25, 0.68, 1.1].flatMap((z, r) => [0.12, 0.44, 0.76, 1.08, 1.4, 1.7].map((u, c) => ({ edge: 2, pts: [[u, z], [u + 0.2, z], [u + 0.2, z + 0.3], [u, z + 0.3]], color: [PAL.terra, PAL.teal, PAL.ivory, PAL.brassL, PAL.rug, PAL.tealL][(r + c) % 6] }))) });
  box(2.3, 3.6, 2.8, 4.1, 0, 0.45, PAL.terra); box(3.5, 3.6, 4, 4.1, 0, 0.45, PAL.terra);
  pawn(3.1, 1.75, { color: PAL.tealD, head: '#e2bf98', collar: PAL.brass, h: 1.05, seat: true });
  // ---- class A: guitar lesson (x 6..11, y 0..5)
  flat(rect(7, 1.3, 10.4, 4.3), PAL.terraD); flat(rect(7.2, 1.5, 10.2, 4.1), PAL.rugB); flat(rect(7.4, 1.7, 10, 3.9), PAL.terra); flat(ngon(8.7, 2.8, 0.55, 8), PAL.rugB);
  box(9.3, 0, 10.7, 0.5, 0, 0.95, PAL.walnut, { top: PAL.walnutL, decals: [{ edge: 2, pts: [[0.1, 0.12], [0.65, 0.12], [0.65, 0.85], [0.1, 0.85]], color: PAL.walnutD }, { edge: 2, pts: [[0.75, 0.12], [1.3, 0.12], [1.3, 0.85], [0.75, 0.85]], color: PAL.walnutD }] });
  prism(ngon(9.6, 0.25, 0.14, 8), 0.95, 1.15, PAL.teal, { bias: 0.04 }); ball(9.6, 0.25, 1.36, 0.24, PAL.leaf);
  prism(ngon(7.5, 2.9, 0.26, 8), 0, 0.4, PAL.walnutL); prism(ngon(9.55, 3.35, 0.26, 8), 0, 0.4, PAL.walnutL);
  const GUITAR = (t, sc = 1) => { const c = Math.cos(t), s = Math.sin(t), R = (u, v) => [(u * c - v * s) * sc, (u * s + v * c) * sc]; return [
    { pts: [R(-0.045, 0.3), R(0.045, 0.3), R(0.04, 1.02), R(-0.04, 1.02)], color: PAL.walnutD },
    { pts: [R(-0.07, 1.0), R(0.07, 1.0), R(0.06, 1.2), R(-0.06, 1.2)], color: PAL.walnutD },
    { ell: [...R(0, 0.2), 0.24 * sc, 0.2 * sc], color: PAL.wood }, { ell: [...R(0, 0.44), 0.17 * sc, 0.15 * sc], color: PAL.wood },
    { ell: [...R(0, 0.33), 0.07 * sc, 0.07 * sc], color: PAL.walnutD } ]; };
  const STAND = [{ pts: [[-0.02, 0], [0.02, 0], [0.02, 1.0], [-0.02, 1.0]], color: PAL.ink }, { pts: [[-0.22, 0], [0, 0.12], [0.22, 0], [0.2, -0.02], [0, 0.08], [-0.2, -0.02]], color: PAL.ink },
    { pts: [[-0.3, 0.92], [0.3, 0.92], [0.3, 1.36], [-0.3, 1.36]], color: PAL.walnutD }, { pts: [[-0.25, 0.97], [0.25, 0.97], [0.25, 1.32], [-0.25, 1.32]], color: PAL.ivory },
    { pts: [[-0.2, 1.24], [0.2, 1.24], [0.2, 1.26], [-0.2, 1.26]], color: PAL.ink }, { pts: [[-0.2, 1.16], [0.2, 1.16], [0.2, 1.18], [-0.2, 1.18]], color: PAL.ink }, { pts: [[-0.2, 1.08], [0.12, 1.08], [0.12, 1.1], [-0.2, 1.1]], color: PAL.ink }];
  S.GUITAR = GUITAR; S.STAND = STAND;
  pawn(7.5, 2.9, { color: PAL.teal, head: '#e6c6a0', collar: PAL.brassL, h: 1.08, id: 'teacher', seat: true });
  sprite(7.78, 3.05, 0.25, GUITAR(-0.9, 0.95), { bias: 0.3 });
  sprite(8.55, 3.75, 0, STAND);
  // ---- class B: santoor (x 11..16)
  flat(rect(12, 1.4, 15, 4.2), PAL.tealD); flat(rect(12.2, 1.6, 14.8, 4), PAL.tealL); flat(rect(12.4, 1.8, 14.6, 3.8), PAL.teal);
  box(12.9, 2.5, 14.1, 3.2, 0, 0.42, PAL.walnutD); prism([[12.95, 2.5], [14.05, 2.5], [14.3, 3.2], [12.7, 3.2]], 0.42, 0.56, PAL.walnutL, { bias: 0.03, top: PAL.wood });
  for (let i = 0; i < 5; i++) S.solids.push({ k: 'flat', pts: rect(12.85 + i * 0.05, 2.62 + i * 0.12, 14.15 - i * 0.05, 2.65 + i * 0.12), z: 0.565, color: PAL.brassL, x: 13.5, y: 2.9, bias: 0.06 });
  pawn(13.5, 1.95, { color: PAL.tealD, head: '#dcb88f', collar: PAL.brass, h: 1.04, seat: true }); pawn(13.5, 3.9, { color: PAL.terraD, head: '#edd0ac', h: 0.8, seat: true });
  box(11.14, 0.4, 11.6, 1.9, 0, 1.1, PAL.walnut, { top: PAL.walnutL }); ball(11.37, 0.8, 1.26, 0.16, PAL.terra); ball(11.37, 1.45, 1.24, 0.14, PAL.brass);
  // ---- class C: atelier (x 16..21)
  flat(rect(17, 1.5, 20, 4.1), PAL.rugB); flat(rect(17.2, 1.7, 19.8, 3.9), PAL.ivory);
  const EASEL = c => [{ pts: [[-0.3, 0], [-0.26, 0], [0.02, 1.5], [-0.02, 1.5]], color: PAL.walnut }, { pts: [[0.3, 0], [0.26, 0], [-0.02, 1.5], [0.02, 1.5]], color: PAL.walnut },
    { pts: [[-0.36, 0.55], [0.36, 0.55], [0.36, 1.3], [-0.36, 1.3]], color: PAL.ivory }, { pts: [[-0.3, 0.61], [0.3, 0.61], [0.3, 1.24], [-0.3, 1.24]], color: c },
    { ell: [0.05, 1.0, 0.13, 0.13], color: PAL.brassL }, { pts: [[-0.3, 0.61], [0.3, 0.61], [0.3, 0.8], [-0.3, 0.86]], color: PAL.teal }];
  sprite(18.1, 2.2, 0, EASEL(PAL.tealL)); sprite(19.5, 3.2, 0, EASEL(PAL.terra));
  pawn(18.3, 3.2, { color: PAL.walnut, head: '#e6c6a0', collar: PAL.brassL, h: 1.02 }); pawn(19.7, 4.1, { color: PAL.tealL, head: '#edd0ac', h: 0.8, rb: 0.25, rh: 0.16 });
  box(16.14, 0.5, 16.6, 2.2, 0, 0.9, PAL.walnut, { top: PAL.walnutL }); for (const [j, c] of [PAL.terra, PAL.teal, PAL.brass].entries()) prism(ngon(16.37, 0.85 + j * 0.5, 0.13, 8), 0.9, 1.12, c, { bias: 0.04 });

  // ---- home practice corner (x 27..32.6, y 6.5..11.6)
  const HX0 = 27, HY0 = 6.5, HX1 = 32.6, HY1 = 11.6;
  flat(rect(HX0 - 0.6, HY0 - 0.6, HX1 + 0.5, HY1 + 0.4), mix(PAL.ground, '#ffffff', 0.25), { on: 'ground' });
  flat(rect(HX0, HY0, HX1, HY1), PAL.wood, { on: 'ground' });
  for (let i = 1; i < 8; i++) line([[HX0, HY0 + i * 0.64], [HX1, HY0 + i * 0.64]], PAL.woodD, 0.035);
  wall(HX0 - T / 2, HY0 - T / 2, HX1, HY0 - T / 2, 1.85, { back: true, seg: 1.4, top: PAL.ivory, decal: (i, len) => i === 1 || i === 2 ? [
    { pts: [[0.12, 0.62], [len - 0.12, 0.62], [len - 0.12, 1.6], [0.12, 1.6]], color: PAL.walnut }, { pts: [[0.2, 0.7], [len - 0.2, 0.7], [len - 0.2, 1.52], [0.2, 1.52]], color: PAL.glow },
    { pts: [[len / 2 - 0.03, 0.7], [len / 2 + 0.03, 0.7], [len / 2 + 0.03, 1.52], [len / 2 - 0.03, 1.52]], color: PAL.walnut }, { pts: [[0.2, 1.08], [len - 0.2, 1.08], [len - 0.2, 1.13], [0.2, 1.13]], color: PAL.walnut }]
    : i === 3 ? [{ pts: [[0.3, 0.85], [1.0, 0.85], [1.0, 1.45], [0.3, 1.45]], color: PAL.walnutD }, { pts: [[0.37, 0.92], [0.93, 0.92], [0.93, 1.38], [0.37, 1.38]], color: PAL.tealL }] : [] });
  wall(HX0 - T / 2, HY0, HX0 - T / 2, HY1, 1.85, { back: true, seg: 1.3, top: PAL.ivory, decal: (i, len) => i === 1 ? [{ pts: [[0.1, 1.0], [len - 0.1, 1.0], [len - 0.1, 1.07], [0.1, 1.07]], color: PAL.walnut }, { pts: [[0.25, 1.07], [0.5, 1.07], [0.5, 1.42], [0.25, 1.42]], color: PAL.teal }, { pts: [[0.55, 1.07], [0.72, 1.07], [0.72, 1.36], [0.55, 1.36]], color: PAL.terra }, { pts: [[0.8, 1.07], [1.05, 1.07], [1.05, 1.3], [0.8, 1.3]], color: PAL.brassL }] : [] });
  S.pools.push({ x: 30.4, y: 8.3, r: 3.2, key: 'home' });
  flat(rect(28.4, 8.1, 31.9, 10.9), PAL.tealD); flat(rect(28.6, 8.3, 31.7, 10.7), PAL.rugB); flat(rect(28.8, 8.5, 31.5, 10.5), PAL.teal); flat(ngon(30.15, 9.5, 0.5, 8), PAL.rugB);
  box(27, 7.2, 27.9, 9.6, 0, 0.42, PAL.terra, { top: PAL.terraD }); box(27, 7.2, 27.28, 9.6, 0.42, 0.85, PAL.terraD, { bias: 0.02 }); box(27.3, 7.5, 27.85, 8.1, 0.42, 0.56, PAL.rugB, { bias: 0.03 });
  prism(ngon(31.9, 7.2, 0.05, 6), 0, 1.45, PAL.brass); cone(31.9, 7.2, 0.3, 0.52, PAL.ivory, { z0: 1.28 }); prism(ngon(31.9, 7.2, 0.2, 8), 0, 0.05, PAL.brass, { shadow: false });
  prism(ngon(28.6, 7.1, 0.28, 8), 0, 0.46, PAL.terra); ball(28.6, 7.1, 0.92, 0.48, PAL.leaf);
  prism(ngon(29.2, 9.3, 0.26, 8), 0, 0.42, PAL.walnutL);
  sprite(30.6, 9.9, 0, STAND);
  box(31.5, 9.6, 32.2, 10.3, 0, 0.5, PAL.walnut, { top: PAL.walnutL }); box(31.62, 9.75, 32.05, 10.1, 0.5, 0.53, PAL.tealD, { bias: 0.04 });
  // lanterns and shrubs along the way
  for (const [lx, ly] of [[14.9, 14.3], [21.5, 16.5], [28.6, 14.3]]) { prism(ngon(lx, ly, 0.06, 6), 0, 0.75, PAL.walnutD); box(lx - 0.14, ly - 0.14, lx + 0.14, ly + 0.14, 0.75, 1.02, PAL.glow, { bias: 0.02, top: PAL.brass }); S.pools.push({ x: lx, y: ly, r: 1.3, key: 'way' }); }
  for (const [bx, by, r] of [[17.5, 17.6, 0.55], [24, 17.3, 0.7], [28.4, 2.6, 0.6], [34.5, 3.4, 0.75], [4, 19.4, 0.7], [9, 19.7, 0.55], [35.5, 15, 0.7]]) ball(bx, by, r * 0.8, r, PAL.leaf);
  for (const [tx, ty, r, h] of [[22.8, 16.9, 0.5, 2.6], [31.8, 3.6, 0.55, 3], [36.2, 13.6, 0.5, 2.7], [1.2, 19.3, 0.5, 2.6], [29.6, 3.2, 0.45, 2.4]]) cone(tx, ty, r, h, PAL.cypress);

  // small helpers for furniture
  const table = (x, y, r = 0.36, top = PAL.ivory) => { prism(ngon(x, y, 0.07, 6), 0, 0.5, PAL.walnutD); prism(ngon(x, y, r, 10), 0.5, 0.56, PAL.walnutL, { top, bias: 0.03 }); };
  const stool = (x, y, c = PAL.walnutL) => prism(ngon(x, y, 0.17, 8), 0, 0.3, c, { top: mix(c, '#ffffff', 0.25) });
  const cup = (x, y, z) => { prism(ngon(x, y, 0.055, 6), z, z + 0.09, PAL.ivory, { bias: 0.08, shadow: false }); };
  const sit = (x, y, color, head, o = {}) => pawn(x, y, { color, head, h: 0.92, seat: true, ...o });
  const DRUM = (c = PAL.rugB) => [{ ell: [0, 0.3, 0.3, 0.3], color: PAL.walnut }, { ell: [0, 0.3, 0.25, 0.25], color: c }];
  const MIC = [{ pts: [[-0.02, 0], [0.02, 0], [0.02, 1.05], [-0.02, 1.05]], color: PAL.ink }, { pts: [[-0.2, 0], [0, 0.1], [0.2, 0], [0.18, -0.02], [0, 0.06], [-0.18, -0.02]], color: PAL.ink },
    { ell: [0, 1.12, 0.07, 0.1], color: PAL.brass }, { ell: [0.16, 1.12, 0.1, 0.13], color: PAL.ink }, { ell: [0.16, 1.12, 0.075, 0.105], color: '#6f6a62' }];
  S.notes = []; S.steam = []; S.walkers = [];

  // ---- café in the courtyard (east side): kiosk under a striped awning, tables, parasol
  flat(rect(17.1, 6.1, 20.5, 12.3), mix(PAL.court, PAL.brassL, 0.35), { a: 0.55 }); for (const r of [rect(17.1, 6.1, 20.5, 6.22), rect(17.1, 12.18, 20.5, 12.3), rect(17.1, 6.1, 17.22, 12.3)]) flat(r, PAL.terra);
  box(19.45, 8, 19.95, 10.8, 0, 0.95, PAL.walnut, { top: PAL.walnutL, decals: [{ edge: 3, pts: [[0.12, 0.12], [2.68, 0.12], [2.68, 0.8], [0.12, 0.8]], color: PAL.walnutD }, { edge: 2, pts: [[0, 0.85], [0.5, 0.85], [0.5, 0.95], [0, 0.95]], color: PAL.brass }] });
  box(20.62, 8.1, 20.86, 10.7, 0, 1.3, PAL.walnutD, { top: PAL.walnut }); for (const [j, c] of [PAL.terra, PAL.brassL, PAL.tealL, PAL.ivory, PAL.terra].entries()) prism(ngon(20.74, 8.45 + j * 0.47, 0.09, 6), 1.3, 1.5, c, { bias: 0.05, shadow: false });
  box(19.52, 8.25, 19.9, 8.85, 0.95, 1.3, PAL.brass, { top: PAL.brassL, bias: 0.05, shadow: false }); prism(ngon(19.7, 8.4, 0.06, 6), 1.3, 1.42, PAL.ink, { bias: 0.06, shadow: false });
  cup(19.7, 9.3, 0.95); cup(19.7, 9.6, 0.95); cup(19.72, 10.4, 0.95); prism(ngon(19.7, 10.05, 0.13, 8), 0.95, 1.0, PAL.ivory, { bias: 0.06, shadow: false }); ball(19.7, 10.05, 1.08, 0.1, PAL.orange);
  for (const [ax, ay] of [[20.05, 7.75], [20.98, 7.75], [20.05, 11.05], [20.98, 11.05]]) prism(ngon(ax, ay, 0.045, 6), 0, 2.0, PAL.walnutD);
  for (let i = 0; i < 7; i++) box(19.85, 7.6 + i * 0.52, 21.12, 8.12 + i * 0.52, 2.0, 2.06, i % 2 ? PAL.ivory : PAL.terra, { bias: 0.02, shadow: i === 0 });
  pawn(20.3, 9.4, { color: PAL.ivory, head: '#e2bf98', collar: PAL.terra, h: 1.0 });
  table(17.9, 7.3); stool(17.35, 7.25, PAL.terra); stool(18.45, 7.4, PAL.terra); cup(17.8, 7.2, 0.56); cup(18.02, 7.38, 0.56);
  sit(17.35, 7.25, PAL.tealL, '#edd0ac'); sit(18.45, 7.4, PAL.brass, '#dcb88f');
  prism(ngon(17.9, 7.3, 0.035, 6), 0.56, 1.75, PAL.walnutD, { bias: 0.02, shadow: false }); cone(17.9, 7.3, 0.95, 0.42, PAL.teal, { z0: 1.6 });
  table(17.75, 10.4); stool(17.2, 10.45, PAL.terra); stool(18.3, 10.3, PAL.terra); cup(17.65, 10.45, 0.56); sit(17.2, 10.45, PAL.terraD, '#e6c6a0'); sit(18.3, 10.3, PAL.cypress, '#edd0ac', { collar: PAL.brassL });
  table(18.6, 11.75, 0.32); stool(18.1, 11.75, PAL.terra); cup(18.6, 11.7, 0.56); sit(18.1, 11.75, PAL.walnutL, '#e9c9a4');
  prism(ngon(20.3, 6.5, 0.26, 8), 0, 0.42, PAL.terra); ball(20.3, 6.5, 0.95, 0.5, PAL.leaf, { dots: PAL.orange }); prism(ngon(20.3, 11.85, 0.24, 8), 0, 0.4, PAL.terra); ball(20.3, 11.85, 0.88, 0.44, PAL.leaf);
  S.steam.push([17.9, 7.3, 0.7], [17.72, 10.42, 0.7], [19.7, 8.4, 1.48], [18.6, 11.72, 0.7]);
  S.pools.push({ x: 19.4, y: 9.4, r: 2.6, key: 'cafe' });

  // ---- recording and arrangement studio (x 21..25.6, y 0..5): control desk, monitors, vocal booth
  flat(rect(21.5, 1.1, 23.6, 4.5), '#3b4a48'); flat(rect(21.65, 1.25, 23.45, 4.35), '#4b5d5a');
  box(21.55, 1.5, 23.45, 2.25, 0, 0.74, PAL.walnutD, { top: PAL.walnut, decals: [{ edge: 2, pts: [[0, 0.66], [1.9, 0.66], [1.9, 0.74], [0, 0.74]], color: PAL.brass }] });
  S.solids.push({ k: 'flat', pts: rect(21.85, 1.72, 23.15, 2.16), z: 0.745, color: PAL.ink, x: 22.5, y: 1.95, bias: 0.05 });
  for (let i = 0; i < 9; i++) { S.solids.push({ k: 'flat', pts: rect(21.93 + i * 0.135, 1.78, 21.96 + i * 0.135, 2.1), z: 0.75, color: '#6f6a62', x: 22.5, y: 1.95, bias: 0.06 });
    const k = 1.82 + ((i * 7) % 5) * 0.055; S.solids.push({ k: 'flat', pts: rect(21.905 + i * 0.135, k, 21.985 + i * 0.135, k + 0.07), z: 0.755, color: i % 3 ? PAL.ivory : PAL.terra, x: 22.5, y: 1.95, bias: 0.07 }); }
  box(22.05, 1.52, 22.95, 1.62, 0.74, 1.28, PAL.ink, { bias: 0.05, shadow: false, decals: [{ edge: 2, pts: [[0.05, 0.05], [0.85, 0.05], [0.85, 0.49], [0.05, 0.49]], color: '#27403d' }]
    .concat([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((u, i) => ({ edge: 2, pts: [[u, 0.27 - [0.06, 0.14, 0.09, 0.18, 0.12, 0.16, 0.07][i]], [u + 0.06, 0.27 - [0.06, 0.14, 0.09, 0.18, 0.12, 0.16, 0.07][i]], [u + 0.06, 0.27 + [0.06, 0.14, 0.09, 0.18, 0.12, 0.16, 0.07][i]], [u, 0.27 + [0.06, 0.14, 0.09, 0.18, 0.12, 0.16, 0.07][i]]], color: i % 2 ? PAL.tealL : PAL.brassL }))) });
  for (const sx of [21.55, 23.1]) box(sx, 1.5, sx + 0.36, 1.82, 0.74, 1.3, '#2e2925', { bias: 0.05, shadow: false, decals: [{ edge: 2, pts: [[0.08, 0.3], [0.28, 0.3], [0.28, 0.5], [0.08, 0.5]], color: PAL.brass }, { edge: 2, pts: [[0.1, 0.06], [0.26, 0.06], [0.26, 0.22], [0.1, 0.22]], color: '#6f6a62' }] });
  prism(ngon(22.5, 2.85, 0.24, 8), 0, 0.4, PAL.ink, { top: '#4b4640' }); sit(22.5, 2.85, PAL.tealD, '#e2bf98', { h: 0.84, collar: PAL.ink });
  box(21.5, 3.95, 23.3, 4.55, 0, 0.4, PAL.terraD, { top: PAL.terra }); sit(22.9, 4.2, PAL.brassL, '#edd0ac', { h: 0.72 });
  sprite(21.75, 4.15, 0.4, GUITAR(0.5, 0.8), { bias: 0.3 });
  // vocal booth with a low sill, corner posts and a top rail (reads as glass)
  wall(23.9, 0, 23.9, 3.5, 0.42, { color: PAL.plasterD, top: PAL.tealL }); wall(23.9, 3.5, 25.6, 3.5, 0.42, { gaps: [[24.3, 25.1]], color: PAL.plasterD, top: PAL.tealL });
  for (const [qx, qy] of [[23.9, 0.1], [23.9, 3.5], [25.5, 3.5]]) prism(ngon(qx, qy, 0.06, 6), 0.42, 1.62, PAL.walnutD, { bias: 0.02, shadow: false });
  box(23.84, 0.1, 23.96, 3.5, 1.56, 1.64, PAL.walnutD, { bias: 0.03, shadow: false }); box(23.9, 3.44, 25.5, 3.56, 1.56, 1.64, PAL.walnutD, { bias: 0.03, shadow: false });
  flat(ngon(24.8, 1.75, 0.95, 16), PAL.rug); flat(ngon(24.8, 1.75, 0.75, 16), PAL.rugB);
  sprite(24.55, 1.45, 0, MIC); pawn(24.95, 1.9, { color: PAL.terra, head: '#e6c6a0', collar: PAL.ivory, h: 0.98 });
  ball(23.9, 3.5, 1.76, 0.1, '#d2453a'); S.rec = [23.9, 3.5, 1.76];
  S.notes.push([24.8, 1.6, 1.5, 0.1], [22.5, 1.9, 1.5, 0.6]);
  S.pools.push({ x: 23.2, y: 2.6, r: 3, key: 'studio' });

  // ---- class D: piano and voice (x 0..6, y 11.5..16.5)
  flat(rect(1.5, 12.5, 5.2, 15.7), PAL.tealD); flat(rect(1.7, 12.7, 5, 15.5), PAL.rugB); flat(rect(1.9, 12.9, 4.8, 15.3), PAL.teal);
  box(0.15, 13, 0.8, 15, 0, 1.18, '#2e2925', { top: '#4b4640', decals: [{ edge: 1, pts: [[0.08, 0.72], [1.92, 0.72], [1.92, 1.1], [0.08, 1.1]], color: '#3b3530' }] });
  box(0.8, 13.08, 1.14, 14.92, 0.6, 0.68, PAL.ivory, { bias: 0.04, shadow: false });
  for (let i = 0; i < 11; i++) S.solids.push({ k: 'flat', pts: rect(0.82, 13.16 + i * 0.16, 1.02, 13.25 + i * 0.16), z: 0.685, color: PAL.ink, x: 0.97, y: 14, bias: 0.08 });
  box(1.5, 13.7, 1.95, 14.3, 0, 0.42, PAL.walnut, { top: PAL.rug }); sit(1.72, 14, PAL.teal, '#e6c6a0', { h: 0.9, collar: PAL.brassL });
  pawn(3.4, 13.4, { color: PAL.terra, head: '#edd0ac', h: 0.86, rb: 0.26, rh: 0.165, collar: PAL.ivory }); pawn(4.1, 14.2, { color: PAL.brass, head: '#dcb88f', h: 0.92, rb: 0.27, collar: PAL.ivory }); pawn(3.5, 15, { color: PAL.tealL, head: '#e9c9a4', h: 0.8, rb: 0.25, rh: 0.16 });
  sprite(2.75, 14.25, 0, STAND);
  prism(ngon(5.3, 12.15, 0.26, 8), 0, 0.46, PAL.terra); ball(5.3, 12.15, 0.92, 0.46, PAL.leaf);
  S.notes.push([1.4, 14, 1.4, 0.3], [3.7, 14.2, 1.3, 0.8]);

  // ---- class E: percussion circle (x 6..11.6, y 13..16.5)
  flat(ngon(8.8, 14.8, 1.55, 20), PAL.rug); flat(ngon(8.8, 14.8, 1.3, 20), PAL.rugB); flat(ngon(8.8, 14.8, 0.6, 12), PAL.rug);
  for (const [i, c] of [PAL.teal, PAL.terra, PAL.brass, PAL.tealL, PAL.walnutL].entries()) { const t = -0.5 + i * 1.257, x = 8.8 + Math.cos(t) * 1.25, y = 14.8 + Math.sin(t) * 1.0;
    stool(x, y, PAL.walnut); sit(x, y, c, ['#e6c6a0', '#edd0ac', '#dcb88f', '#e9c9a4', '#e2bf98'][i], i === 0 ? { h: 0.92, collar: PAL.brassL } : {});
    const dx = 8.8 + Math.cos(t) * 0.72, dy = 14.8 + Math.sin(t) * 0.58;
    if (i % 2) sprite(dx, dy, 0.42, DRUM(i === 1 ? PAL.ivory : PAL.rugB), { bias: 0.25 }); else prism(ngon(dx, dy, 0.17, 8), 0, 0.5, PAL.walnutL, { top: PAL.ivory }); }
  box(10.6, 13.3, 11.3, 13.8, 0, 0.5, PAL.wood, { top: PAL.woodD }); box(6.3, 15.6, 6.8, 16.2, 0, 0.85, PAL.walnut, { top: PAL.walnutL });
  S.notes.push([8.8, 14.8, 1.2, 0.45], [8, 14.2, 1.2, 0.95]);

  // ---- more people: a second learner in each class, someone waiting at reception, friends by the pool
  sit(9.9, 1.9, PAL.brassL, '#edd0ac', { h: 0.74 }); stool(9.9, 1.9);
  sit(12.6, 3.75, PAL.brass, '#e9c9a4'); sit(14.5, 3.7, PAL.tealL, '#e6c6a0');
  pawn(17.4, 3.9, { color: PAL.terra, head: '#dcb88f', h: 0.84, rb: 0.25, rh: 0.16 });
  box(4.4, 6.1, 5.6, 6.6, 0, 0.42, PAL.walnutL, { top: PAL.terra }); sit(4.75, 6.35, PAL.tealL, '#edd0ac'); sit(5.25, 6.35, PAL.terraD, '#dcb88f', { h: 0.62, rb: 0.2, rh: 0.14 });
  pawn(4.6, 3.9, { color: PAL.walnutL, head: '#e9c9a4', collar: PAL.ivory, h: 0.96 });
  sit(11.75, 9.9, PAL.terra, '#e6c6a0'); sit(12.1, 10.65, PAL.teal, '#edd0ac', { collar: PAL.brassL });
  S.notes.push([8.6, 2.9, 1.4, 0.2], [13.5, 2.9, 1.3, 0.7]);
  // people who move (time-driven; they stand still in the static pictures)
  S.walkers.push(
    { pts: [[9.4, 6.3], [16.6, 6.2], [16.9, 11.9], [9.6, 12]], loop: true, speed: 0.55, phase: 0.1, pawn: { color: PAL.cypress, head: '#e6c6a0', collar: PAL.brassL, h: 0.92, rb: 0.26, rt: 0.12, rh: 0.17 }, carry: true },
    { pts: [[7.2, 5.75], [15.4, 5.75]], speed: 0.42, phase: 0.55, pawn: { color: PAL.walnut, head: '#dcb88f', collar: PAL.ivory, h: 1.0, rb: 0.28, rt: 0.12, rh: 0.175 } },
    { pts: [[19.1, 9.5], [18.4, 9.3], [18.2, 10.9], [18.9, 11.3]], speed: 0.5, phase: 0.3, pawn: { color: PAL.ivory, head: '#e9c9a4', collar: PAL.terra, h: 0.95, rb: 0.26, rt: 0.12, rh: 0.17 } },
    { pts: [[26.5, 15.45], [14.6, 15.45], [13.5, 15], [13.5, 12.2], [11.2, 8.2]], speed: 0.6, phase: 0.75, pawn: { color: PAL.terraD, head: '#edd0ac', h: 0.8, rb: 0.24, rt: 0.11, rh: 0.16 }, carry: true },
    { pts: [[3, 9.2], [3, 12.6], [2.6, 14.6]], speed: 0.4, phase: 0.2, pawn: { color: PAL.brass, head: '#e2bf98', h: 0.78, rb: 0.24, rt: 0.11, rh: 0.155 } });
  // everything the bird is tied to at the end: management, reception, classes, studio, café, the two south classes, home
  S.nodes = [[3, 2.6], [3, 8.4], [8.7, 2.8], [13.5, 2.8], [18.5, 2.8], [23, 2.8], [19.2, 9.4], [3.2, 14.2], [8.8, 14.8], [29.6, 9.2]];
  S.WAY = WAY; S.rooms = { court: [12.2, 8.6], reception: [3, 8.4], management: [3, 2.6], classes: [13.5, 2.6], cafe: [19.3, 9.4], studio: [23.2, 2.7], home: [29.9, 9] };
  return S;
}

// ======================================================================= story timeline (p: 0 … 5, one unit per chapter)
const lerp = (a, b, t) => a + (b - a) * t, ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function along(pts, t) { // point at fraction t of a polyline
  let total = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let d = Math.max(0, Math.min(1, t)) * total; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? d / seg[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]; } d -= seg[i]; }
  return pts[pts.length - 1];
}
export const ROUTES = {
  arrive: [[13.5, 16.2], [13.5, 11.9]],
  toReception: [[13.5, 11.9], [9.4, 9.6], [6, 9.5], [2.7, 9.35]],
  toClass: [[2.7, 9.35], [6, 9.5], [7.4, 8], [9.55, 5.2], [9.55, 3.35]],
  toHome: [[9.55, 3.35], [9.55, 5.3], [10.6, 7.2], [10.8, 10.6], [13.5, 12.2], [13.5, 15.4], [29.9, 15.4], [29.9, 11.2], [29.2, 9.3]],
  admin: [[2.6, 8.6], [4.6, 8.9], [4.9, 6.2], [3, 5], [3.1, 3.4]],
};
/** Where the student is at story position p. */
export function studentAt(p) {
  if (p < 0.5) return along(ROUTES.arrive, ss((p - 0.08) / 0.4));
  if (p < 1.45) return along(ROUTES.toReception, ss((p - 0.56) / 0.3));
  if (p < 2.56) return along(ROUTES.toClass, ss((p - 1.45) / 0.35));
  return along(ROUTES.toHome, ss((p - 2.56) / 0.44));
}
/**
 * The bird is the viewer: scrolling flies it through the story and the camera travels with it.
 * Keys: p, then either a fixed spot `at` [x, y, z] or `follow` [dx, dy, dz] (an offset from the student).
 * air: hovering (wings keep moving). flip: which way it faces while perched.
 */
const BIRD = [
  { p: 0, at: [13.5, 14.4, 2.4], air: 1 },                                   // arriving over the gate
  { p: 0.42, at: [17.75, 10.4, 0.56] }, { p: 0.6, at: [17.75, 10.4, 0.56] }, // a café table in the courtyard
  { p: 0.86, at: [3.62, 7.9, 0.78], flip: true }, { p: 1.12, at: [3.62, 7.9, 0.78], flip: true },   // reception desk
  { p: 1.36, at: [4.05, 2.9, 0.78], flip: true }, { p: 1.54, at: [4.05, 2.9, 0.78], flip: true },   // management desk
  { p: 1.84, at: [10.35, 0.25, 0.95], flip: true }, { p: 2.08, at: [10.35, 0.25, 0.95], flip: true }, // shelf in the guitar class
  { p: 2.24, at: [16.4, 3.1, 2.3], air: 1 },                                                         // gliding over the other classes
  { p: 2.36, at: [22.5, 1.57, 1.28] }, { p: 2.48, at: [22.5, 1.57, 1.28] },                          // on the studio screen
  { p: 2.68, follow: [0.55, -0.5, 1.7], air: 1 }, { p: 2.92, follow: [0.55, -0.5, 1.7], air: 1 },    // flying home with the learner
  { p: 3.04, at: [30.6, 9.9, 1.36], flip: true }, { p: 3.52, at: [30.6, 9.9, 1.36], flip: true },   // on the music stand at home
  { p: 3.92, at: [21.5, 7.4, 5], air: 1 }, { p: 4.4, at: [18.4, 6.6, 5.4], air: 1 },               // riding the sound back to class
  { p: 4.84, at: [15.4, -4.6, 4.2], air: 1 }, { p: 5, at: [15.4, -4.6, 4.2], air: 1 },             // above everything, holding it together
];
const spot = (k, p) => { if (!k.follow) return k.at; const s = studentAt(p); return [s[0] + k.follow[0], s[1] + k.follow[1], k.follow[2]]; };
/** Where the bird is at story position p. Returns { pos: [x, y, z], fly: 0…1 (in the air), flip }. */
export function birdAt(p) {
  p = Math.max(0, Math.min(5, p)); let i = 0; while (i < BIRD.length - 2 && p > BIRD[i + 1].p) i++;
  const A = BIRD[i], B = BIRD[i + 1], t = ss((p - A.p) / (B.p - A.p)), a = spot(A, p), b = spot(B, p);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), arc = Math.sin(Math.PI * t), lift = A.air && B.air ? 0 : Math.min(3.2, d * 0.17);
  const air = lerp(A.air || 0, B.air || 0, t), moving = d > 0.01 ? Math.min(1, arc * 3) : 0;
  return { pos: [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) + arc * lift], fly: Math.max(air, moving), flip: !!(t < 0.5 ? A.flip : B.flip), hop: d > 2.5 && !(A.follow && B.follow) ? arc : 0 };
}
/** Does the bird face left on screen? P: the projection returned by drawScene; dir: +1 scrolling forward, −1 back. */
export function birdFaces(p, P, dir = 1) {
  const a = birdAt(Math.max(0, p - 0.012)).pos, b = birdAt(Math.min(5, p + 0.012)).pos, dx = (P(b[0], b[1], b[2])[0] - P(a[0], a[1], a[2])[0]) * dir;
  const far = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return far > 0.03 && Math.abs(dx) > 0.2 ? dx < 0 : birdAt(p).flip;
}

/** Camera keys. w/h: world units that must fit; e elevation, a azimuth (degrees); dim: spotlight strength. m: phone overrides.
 *  tx, ty say how the stop is framed; between stops the camera keeps its place relative to the bird (rel: explicit offset). */
const KEYS = [
  { p: 0, tx: 11.9, ty: 7.6, w: 30.5, h: 21, e: 90, a: 0, dim: 0, m: { w: 29.5, h: 21 } },
  { p: 0.4, tx: 15.2, ty: 8.9, w: 19.5, h: 13.5, e: 55, a: 32, dim: 0, m: { tx: 16.4, ty: 9.2, w: 12.5, h: 10 } },
  { p: 0.6, tx: 15.2, ty: 8.9, w: 19.5, h: 13.5, e: 55, a: 32, dim: 0, m: { tx: 16.4, ty: 9.2, w: 12.5, h: 10 } },
  { p: 0.86, tx: 3.1, ty: 8.9, w: 12, h: 9, e: 50, a: 34, dim: 0.3, m: { w: 9.5, h: 7.4 } },
  { p: 1.12, tx: 3.1, ty: 8.9, w: 12, h: 9, e: 50, a: 34, dim: 0.3, m: { w: 9.5, h: 7.4 } },
  { p: 1.36, tx: 3.1, ty: 3.4, w: 11.5, h: 8.6, e: 52, a: 34, dim: 0.28, m: { w: 9.5, h: 7.4 } },
  { p: 1.54, tx: 3.1, ty: 3.4, w: 11.5, h: 8.6, e: 52, a: 34, dim: 0.28, m: { w: 9.5, h: 7.4 } },
  { p: 1.84, tx: 8.6, ty: 2.9, w: 9.2, h: 7, e: 48, a: 36, dim: 0.32, m: { w: 7.6, h: 6 } },
  { p: 2.08, tx: 8.6, ty: 2.9, w: 9.2, h: 7, e: 48, a: 36, dim: 0.32, m: { w: 7.6, h: 6 } },
  { p: 2.24, tx: 16, ty: 3.2, w: 15, h: 9.5, e: 52, a: 30, dim: 0.12, m: { w: 11.5, h: 8 } },       // over the classes
  { p: 2.36, tx: 23.2, ty: 2.7, w: 9, h: 7, e: 50, a: 30, dim: 0.3, m: { w: 7.4, h: 6.2 } },        // the studio
  { p: 2.48, tx: 23.2, ty: 2.7, w: 9, h: 7, e: 50, a: 30, dim: 0.3, m: { w: 7.4, h: 6.2 } },
  { p: 2.68, rel: [-0.4, 0.5], w: 15, h: 10.5, e: 52, a: 33, dim: 0.14, m: { w: 11.5, h: 8.6 } },
  { p: 2.92, rel: [-0.4, 0.5], w: 16, h: 11, e: 54, a: 31, dim: 0.14, m: { w: 12, h: 8.8 } },
  { p: 3.04, tx: 29.9, ty: 9, w: 10, h: 7.6, e: 48, a: 34, dim: 0.32, m: { w: 8.2, h: 6.4 } },
  { p: 3.52, tx: 29.9, ty: 9, w: 10, h: 7.6, e: 48, a: 34, dim: 0.32, m: { w: 8.2, h: 6.4 } },
  { p: 3.92, tx: 17, ty: 9.2, w: 33.5, h: 20, e: 56, a: 30, dim: 0, m: { w: 31.5, h: 20 } },
  { p: 4.4, tx: 16.8, ty: 9.2, w: 33.5, h: 20, e: 56, a: 30, dim: 0, m: { w: 31.5, h: 20 } },
  { p: 4.84, tx: 16, ty: 6.6, w: 36.5, h: 27, e: 68, a: 14, dim: 0, m: { tx: 16, ty: 6.4, w: 35, h: 29 } },   // the view rises
  { p: 5, tx: 16, ty: 6.6, w: 36.5, h: 27, e: 68, a: 14, dim: 0, m: { tx: 16, ty: 6.4, w: 35, h: 29 } },
];
const framed = phone => KEYS.map(k => { const b = phone && k.m ? { ...k, ...k.m } : { ...k }; if (!k.rel) { const g = birdAt(k.p).pos; b.rel = [b.tx - g[0], b.ty - g[1]]; } return b; });
const KD = framed(false), KM = framed(true);
export function cameraAt(p, phone = false) {
  const K = phone ? KM : KD; let i = 0; while (i < K.length - 2 && p > K[i + 1].p) i++;
  const A = K[i], B = K[i + 1], t = ss((p - A.p) / (B.p - A.p)), out = {}, bs = birdAt(p), g = bs.pos;
  for (const k of ['w', 'h', 'e', 'a', 'dim']) out[k] = lerp(A[k], B[k], t);
  const pull = 1 + 0.16 * bs.hop * (Math.max(A.w, B.w) < 20 ? 1 : 0); out.w *= pull; out.h *= pull;   // the camera pulls back a little in the middle of a flight
  out.tx = g[0] + lerp(A.rel[0], B.rel[0], t); out.ty = g[1] + lerp(A.rel[1], B.rel[1], t);
  return out;
}
/** Reveal amounts (0…1) of everything that changes with the story. */
export function storyState(p) {
  const b = birdAt(p);
  return {
    reveal: ss(p / 0.34), labels: Math.max(1 - ss((p - 0.28) / 0.14), ss((p - 4.72) / 0.2)),
    admin: ss((p - 1.08) / 0.3) * (1 - ss((p - 1.7) / 0.15)) + ss((p - 4.7) / 0.25),
    lesson: ss((p - 1.86) / 0.14) * (1 - ss((p - 2.56) / 0.08)),
    way: ss((p - 2.56) / 0.46), wayFade: 1 - 0.45 * ss((p - 3.1) / 0.3) + 0.45 * ss((p - 4.6) / 0.3),
    back: ss((p - 3.85) / 0.45), home: ss((p - 2.8) / 0.25), student: studentAt(p), withGuitar: p > 1.76,
    moving: Math.hypot(studentAt(p + 0.004)[0] - studentAt(p - 0.004)[0], studentAt(p + 0.004)[1] - studentAt(p - 0.004)[1]) > 0.004, stride: p * 150, seated: (p > 1.8 && p < 2.56) || p > 3,
    connect: ss((p - 4.5) / 0.42),
    bird: { gx: b.pos[0], gy: b.pos[1], gz: b.fly > 0.05 ? 0.02 : b.pos[2], x: b.pos[0], y: b.pos[1], z: b.pos[2], shadow: Math.max(0.3, 1 - b.pos[2] / 9) * (b.fly > 0.05 ? 0.85 : 1) },
  };
}

// ======================================================================= drawing
/**
 * Draw one frame. g: backend (poly, polys, ellipse, line, lin, rad, rect). view: {W, H, cx, cy} — cx, cy is the
 * screen point the camera target lands on, and W × H the area the framing must fit into.
 */
export function drawScene(g, S, cam, view, st, time = 0) {
  const a = cam.a * Math.PI / 180, e = cam.e * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), se = Math.sin(e), ce = Math.cos(e);
  const s = Math.min(view.fitW / cam.w, view.fitH / cam.h);
  const P = (x, y, z = 0) => { const dx = x - cam.tx, dy = y - cam.ty, xr = dx * ca - dy * sa, yr = dx * sa + dy * ca; return [view.cx + s * xr, view.cy + s * (yr * se - z * ce)]; };
  const D = (x, y, z = 0) => { const dx = x - cam.tx, dy = y - cam.ty; return (dx * sa + dy * ca) * ce + z * se; };
  const flatPts = (pts, z) => { const o = []; for (const p of pts) { const q = P(p[0], p[1], z); o.push(q[0], q[1]); } return o; };
  const api = { P, D, s, ce, se };
  // skip what is far outside the picture (close-ups draw a fraction of the world)
  const mg = 3 * s, near = (x, y, r = 0) => { const q = P(x, y, 0), m = mg + r * s; return q[0] > -m && q[0] < view.W + m && q[1] > -m && q[1] < view.H + m + 1.5 * s; };
  const ref = o => o.x != null ? [o.x, o.y] : o.pts[0], size = o => o.rad ?? (o.rad = o.pts ? Math.max(...o.pts.map(q => Math.hypot(q[0] - o.pts[0][0], q[1] - o.pts[0][1]))) : 0);
  const seen = o => { const c = ref(o); return near(c[0], c[1], size(o)); };

  g.rect(0, 0, view.W, view.H, g.lin(0, 0, 0, view.H, [[0, '#f4ecdb'], [1, '#eadfc8']]));
  for (const f of S.ground) if (seen(f)) g.poly(flatPts(f.pts, f.z), f.color);
  // warm light pools: rooms being revealed, lanterns, the home lamp
  const pool = (x, y, r, alpha, c = PAL.glow) => { if (alpha <= 0.01) return; const q = P(x, y, 0); g.glow(q[0], q[1], r * s, r * s * Math.max(0.2, se), c, alpha); };
  const rv = st.reveal;
  pool(13.5, 9, 6.5, 0.5 * ss(rv / 0.4)); pool(3, 8.4, 4.2, 0.55 * ss((rv - 0.2) / 0.3)); pool(3, 2.6, 4, 0.55 * ss((rv - 0.35) / 0.3));
  for (const cx of [8.5, 13.5, 18.5]) pool(cx, 2.6, 3.6, 0.55 * ss((rv - 0.5) / 0.4));
  for (const pl of S.pools) pool(pl.x, pl.y, pl.r, pl.key === 'home' ? 0.75 * Math.max(st.home, 0.35) : 0.5);
  // shadows as one union
  const sh = [];
  const shadowOf = (pts, h) => hull(pts.concat(pts.map(p => [p[0] + SHADOW[0] * h, p[1] + SHADOW[1] * h])));
  for (const list of [S.back, S.solids]) for (const o of list) {
    if (!seen(o)) continue;
    if (o.k === 'prism' && o.shadow) sh.push(flatPts(shadowOf(o.pts, o.z1), 0));
    else if (o.k === 'cone') sh.push(flatPts(shadowOf(ngon(o.x, o.y, o.r * 0.8, 8), (o.h + o.z0) * 0.7), 0));
    else if (o.k === 'pawn') sh.push(flatPts(shadowOf(ngon(o.x, o.y, 0.2 * dress(o).f, 8), dress(o).tall * 0.92), 0));
    else if (o.k === 'ball' && !o.back) sh.push(flatPts(ngon(o.x + SHADOW[0] * o.z, o.y + SHADOW[1] * o.z, o.r * 0.9, 10), 0));
  }
  const stu = st.student, sec = time / 1000, walk = [];
  for (const w of S.walkers) { // people who stroll: there and back, or round a loop
    const pts = w.loop ? w.pts.concat([w.pts[0]]) : w.pts; let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let u = (sec * w.speed / L + w.phase) % (w.loop ? 1 : 2); if (u > 1) u = 2 - u; const q = along(pts, w.loop ? u : ss(u));
    walk.push({ k: 'pawn', x: q[0], y: q[1], ...w.pawn, seed: w.phase, step: time ? sec * 6.5 * w.speed / 0.5 + w.phase * 9 : 0.6, carry: w.carry });
    sh.push(flatPts(shadowOf(ngon(q[0], q[1], 0.2, 8), 1.4), 0)); }
  sh.push(flatPts(shadowOf(ngon(stu[0], stu[1], 0.2, 8), 1.25), 0));
  if (st.bird && st.bird.shadow) { const b = st.bird, r = 0.42 * b.shadow; sh.push(flatPts(ngon(b.gx, b.gy, r, 10), b.gz)); }
  g.polys(sh, 'rgba(74,48,26,0.16)');
  for (const f of S.deco) if (seen(f)) g.poly(flatPts(f.pts, f.z), f.color, f.a);
  for (const l of S.lines) g.line(flatPts(l.pts, l.z), l.color, Math.max(0.6, l.w * s), { alpha: l.a });

  // light paths on the floor
  const pathLine = (pts, amount, o = {}) => {
    if (amount <= 0.005) return; const n = Math.max(2, Math.round(60 * (o.len || 1))), q = [];
    for (let i = 0; i <= n * amount; i++) { const t = i / n, w = along(pts, t); let ox = 0, oy = 0;
      if (o.wave) { const w2 = along(pts, Math.min(1, t + 0.004)), dx = w2[0] - w[0], dy = w2[1] - w[1], d = Math.hypot(dx, dy) || 1, env = Math.min(1, t * 14, (1 - t) * 14 + 0.15), k = o.wave * env * Math.sin(t * (o.freq || 60) - time * 0.004); ox = -dy / d * k; oy = dx / d * k; }
      const sp = P(w[0] + ox, w[1] + oy, o.z || 0.02); q.push(sp[0], sp[1]); }
    if (q.length < 4) return;
    g.line(q, PAL.glow, Math.max(3, 0.3 * s), { alpha: 0.42 * (o.alpha ?? 1), cap: 'round' });
    g.line(q, o.color || '#f7e3ae', Math.max(1.4, 0.09 * s), { alpha: 0.95 * (o.alpha ?? 1), cap: 'round', dash: o.dash ? [0.22 * s, 0.2 * s] : null });
    if (amount < 0.995 || o.head) g.ellipse(q[q.length - 2], q[q.length - 1], Math.max(3, 0.16 * s), Math.max(3, 0.16 * s), '#fff6dc');
  };
  pathLine(ROUTES.admin, st.admin, { dash: true, color: '#fff1c9', len: 0.5 });
  pathLine(ROUTES.toHome, st.way, { wave: 0.13, freq: 150, len: 2.6, alpha: st.wayFade });

  // solids: back layer first, then depth-sorted
  const dyn = [];
  dyn.push({ k: 'pawn', x: stu[0], y: stu[1], h: 0.84, color: PAL.terra, head: '#f0d2ad', collar: PAL.ivory, seed: 3, step: st.moving ? st.stride : null, seat: st.seated });
  if (st.withGuitar) dyn.push({ k: 'sprite', x: stu[0] + 0.24, y: stu[1] + 0.12, z: 0.22, shapes: S.GUITAR(0.85, 0.82), bias: 0.3 });
  for (const w of walk) { dyn.push(w); if (w.carry) dyn.push({ k: 'sprite', x: w.x + 0.22, y: w.y + 0.1, z: 0.2, shapes: S.GUITAR(0.7, 0.72), bias: 0.3 }); }
  const keyOf = o => o.k === 'prism' ? (() => { let x = 0, y = 0; for (const p of o.pts) { x += p[0]; y += p[1]; } return D(x / o.pts.length, y / o.pts.length, (o.z0 + o.z1) / 2); })()
    : o.k === 'ball' ? D(o.x, o.y, o.z) : o.k === 'flat' ? D(o.x, o.y, o.z) : o.k === 'cone' ? D(o.x, o.y, o.z0 + o.h * 0.35) : o.k === 'pawn' ? D(o.x, o.y, 0.6) : D(o.x, o.y, o.z + 0.5);
  const draw = o => DRAW[o.k](g, o, api, cam, sa, ca);
  const backs = S.back.filter(seen).map(o => [keyOf(o), o]).sort((u, v) => u[0] - v[0]); for (const b of backs) draw(b[1]);
  const all = S.solids.filter(seen).concat(dyn).map(o => [keyOf(o) + (o.bias || 0), o]).sort((u, v) => u[0] - v[0]); for (const b of all) draw(b[1]);

  // ---- ambient life (time-driven; frozen at time 0 in the static pictures)
  for (let i = 0; i < 2; i++) { const u = (sec * 0.22 + i * 0.5) % 1, ring = ngon(13.5, 9, 0.22 + u * 1.0, 18); ring.push(ring[0]);   // ripples on the pool
    g.line(flatPts(ring, 0.32), '#e8fbf6', Math.max(1, 0.03 * s), { alpha: 0.6 * (1 - u) }); }
  for (const [i, n] of S.notes.entries()) { // notes drifting up from the rooms where music is being made
    const u = (sec * 0.16 + n[3]) % 1, q = P(n[0] + Math.sin(u * 6.3 + i) * 0.16, n[1], n[2] + u * 1.5), al = Math.sin(Math.PI * u) * 0.85, r = Math.max(2.2, 0.085 * s);
    if (al < 0.05) continue; const col = i % 2 ? PAL.brass : PAL.teal;
    g.line([q[0] + r * 0.85, q[1], q[0] + r * 0.85, q[1] - r * 2.7, q[0] + r * 2, q[1] - r * 2.1], col, Math.max(1, r * 0.34), { alpha: al, cap: 'round' }); g.ellipse(q[0], q[1], r, r * 0.78, rgba(col, al.toFixed(2))); }
  for (const [i, c] of S.steam.entries()) { const u = (sec * 0.3 + i * 0.37) % 1, q = [];   // steam over the coffee
    for (let k = 0; k <= 6; k++) { const v = k / 6, w = P(c[0], c[1], c[2] + (u * 0.5 + v * 0.42)); q.push(w[0] + Math.sin(v * 5 + sec * 2 + i) * 0.05 * s, w[1]); }
    g.line(q, '#ffffff', Math.max(1, 0.035 * s), { alpha: 0.5 * Math.sin(Math.PI * u), cap: 'round' }); }
  if (S.rec) { const q = P(S.rec[0], S.rec[1], S.rec[2]), on = time ? 0.5 + 0.5 * Math.sin(sec * 4) : 1; g.glow(q[0], q[1], 0.45 * s, 0.45 * s, '#ff5a48', 0.25 + 0.5 * on); }
  if (st.trail) for (const t of st.trail) { const q = P(t[0], t[1], t[2]), r = Math.max(2, t[3] * 0.2 * s); g.glow(q[0], q[1], r * 2.4, r * 2.4, PAL.glow, 0.55 * t[3]); g.ellipse(q[0], q[1], r * 0.4, r * 0.4, rgba('#fff8e4', (0.9 * t[3]).toFixed(2))); }
  // lesson: a small sound wave from teacher to student
  if (st.lesson > 0.01) { const A = P(7.75, 2.95, 1.0), B = P(stu[0] - 0.1, stu[1], 0.95), q = [], n = 26;
    for (let i = 0; i <= n * st.lesson; i++) { const t = i / n, env = Math.sin(Math.PI * t); q.push(lerp(A[0], B[0], t), lerp(A[1], B[1], t) + Math.sin(t * 16 - time * 0.006) * env * 0.16 * s); }
    if (q.length >= 4) { g.line(q, PAL.glow, Math.max(3, 0.2 * s), { alpha: 0.35, cap: 'round' }); g.line(q, PAL.brassL, Math.max(1.4, 0.06 * s), { cap: 'round' }); } }
  // feedback: an arc of sound from home back to the teacher
  if (st.back > 0.01) { const q = [], n = 70, A0 = [29.2, 9.3, 1.2], B0 = [7.5, 2.9, 1.3];
    for (let i = 0; i <= n * st.back; i++) { const t = i / n, env = Math.sin(Math.PI * t), sp = P(lerp(A0[0], B0[0], t), lerp(A0[1], B0[1], t), lerp(A0[2], B0[2], t) + env * 5.2); q.push(sp[0], sp[1] + Math.sin(t * 46 - time * 0.005) * Math.min(1, env * 3) * 0.12 * s); }
    if (q.length >= 4) { g.line(q, PAL.glow, Math.max(3, 0.3 * s), { alpha: 0.32, cap: 'round' }); g.line(q, PAL.tealL, Math.max(1.5, 0.085 * s), { cap: 'round' }); if (st.back < 0.995) g.ellipse(q[q.length - 2], q[q.length - 1], Math.max(3, 0.15 * s), Math.max(3, 0.15 * s), '#eafaf5'); } }
  // the end: threads of light from the bird to every place
  if (st.connect > 0.01 && st.bird) { const b0 = P(st.bird.x, st.bird.y, st.bird.z + 0.2);
    S.nodes.forEach((nd, i) => { const amt = ss((st.connect - i * 0.07) / 0.55); if (amt <= 0.01) return;
      const e1 = P(nd[0], nd[1], 0.05), mx = (b0[0] + e1[0]) / 2, my = (b0[1] + e1[1]) / 2 + Math.abs(e1[0] - b0[0]) * 0.12, n = 22, q = [];
      const at = t => { const u = 1 - t; return [u * u * b0[0] + 2 * u * t * mx + t * t * e1[0], u * u * b0[1] + 2 * u * t * my + t * t * e1[1]]; };
      for (let k = 0; k <= Math.round(n * amt); k++) { const c = at(k / n); q.push(c[0], c[1]); }
      if (q.length < 4) return;
      g.line(q, PAL.glow, Math.max(7, 0.5 * s), { alpha: 0.4, cap: 'round' }); g.line(q, PAL.brassL, Math.max(2.6, 0.13 * s), { alpha: 0.95, cap: 'round' }); g.line(q, '#fffaf0', Math.max(1, 0.05 * s), { alpha: 0.95, cap: 'round' });
      if (amt > 0.97) { const r = Math.max(4, 0.42 * s); g.glow(e1[0], e1[1], r * 2.6, r * 2.6 * Math.max(0.35, se), PAL.glow, 0.7); g.ellipse(e1[0], e1[1], r * 0.55, r * 0.55 * Math.max(0.5, se), '#fff6dc');
        if (time) { const c = at((time * 0.00032 + i * 0.19) % 1), d = Math.max(2.4, 0.13 * s); g.ellipse(c[0], c[1], d, d, '#fffaf0'); } }
    }); }
  // spotlight
  if (cam.dim > 0.01) { const r = Math.max(view.fitW, view.fitH) * 0.62; g.rect(0, 0, view.W, view.H, g.rad(view.cx, view.cy, r * 1.5, [[0, 'rgba(58,38,20,0)'], [0.46, 'rgba(58,38,20,0)'], [1, `rgba(58,38,20,${(cam.dim * 0.8).toFixed(3)})`]])); }
  return api;
}

const HAIR = ['#2b211c', '#3a2a1e', '#5a3b28', '#1f1a18', '#4a3426', '#2f2622'], LEGS = ['#3a3f4a', '#4f3122', '#2c3f3c', '#5b5248', '#33302c'], SCARF = ['#e8dcc8', '#7c9a92', '#c98f6b', '#5c7d8c'];
function dress(o) {
  if (o._d) return o._d;
  let h = 7; for (const c of (o.color + (o.head || '') + (o.seed ?? Math.round((o.x || 0) * 31 + (o.y || 0) * 17)))) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const style = h % 7, f = (o.kid ? 0.72 : o.h < 0.75 ? 0.76 : o.h < 0.9 ? 0.9 : 1) * 1.12;   // 0,3,4: short hair · 1: long · 2: bun · 5,6: headscarf
  return (o._d = { f, style, hair: HAIR[(h >>> 3) % HAIR.length], legs: LEGS[(h >>> 6) % LEGS.length], shoe: (h >>> 9) % 2 ? '#2e2925' : '#6d4731', scarf: style >= 5 ? SCARF[(h >>> 11) % SCARF.length] : null, tall: (o.seat ? 1.24 : 1.5) * f });
}
const faceShade = (nx, ny) => 0.7 + 0.22 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1]);
const DRAW = {
  prism(g, o, { P, ce }, cam, sa, ca) {
    const n = o.pts.length;
    if (ce > 0.03) for (let i = 0; i < n; i++) {
      const p = o.pts[i], q = o.pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), nx = dy / len, ny = -dx / len;
      if (nx * sa + ny * ca <= 0.012) continue;
      const a0 = P(p[0], p[1], o.z0), a1 = P(q[0], q[1], o.z0), b1 = P(q[0], q[1], o.z1), b0 = P(p[0], p[1], o.z1);
      g.poly([a0[0], a0[1], a1[0], a1[1], b1[0], b1[1], b0[0], b0[1]], shade(o.color, faceShade(nx, ny)));
      if (o.decals) for (const d of o.decals) if (d.edge === i) { const pts = []; for (const [u, z] of d.pts) { const w = P(p[0] + dx / len * u, p[1] + dy / len * u, o.z0 + z); pts.push(w[0], w[1]); } g.poly(pts, shade(d.color, 0.86 + 0.14 * faceShade(nx, ny))); }
    }
    const t = []; for (const p of o.pts) { const w = P(p[0], p[1], o.z1); t.push(w[0], w[1]); } g.poly(t, o.top || mix(o.color, '#ffffff', 0.18));
  },
  flat(g, o, { P }) { const t = []; for (const p of o.pts) { const w = P(p[0], p[1], o.z); t.push(w[0], w[1]); } g.poly(t, o.color, o.a); },
  ball(g, o, { P, s }) { const c = P(o.x, o.y, o.z), r = o.r * s; g.ellipse(c[0], c[1], r, r, g.rad(c[0] - r * 0.3, c[1] - r * 0.35, r * 1.25, [[0, mix(o.color, '#ffffff', 0.3)], [0.6, o.color], [1, shade(o.color, 0.72)]]));
    if (o.dots && r > 7) for (const [u, v] of [[-0.35, 0.1], [0.3, -0.25], [0.15, 0.4], [-0.1, -0.45], [0.5, 0.2]]) g.ellipse(c[0] + u * r, c[1] + v * r, r * 0.11, r * 0.11, o.dots); },
  cone(g, o, { P, s, se }) { const b = P(o.x, o.y, o.z0), top = P(o.x, o.y, o.z0 + o.h), rx = o.r * s, ry = rx * se, pts = [];
    const dxv = top[0] - b[0], dyv = top[1] - b[1], d = Math.hypot(dxv / rx, dyv / ry);
    if (d <= 1.02) { g.ellipse(b[0], b[1], rx, ry, o.color); g.ellipse(top[0], top[1], rx * 0.12, ry * 0.12, mix(o.color, '#ffffff', 0.3)); return; }
    const phi = Math.atan2(dyv / ry, dxv / rx), al = Math.acos(1 / d);
    for (let i = 0; i <= 12; i++) { const t = phi + al + (2 * Math.PI - 2 * al) * i / 12; pts.push(b[0] + Math.cos(t) * rx, b[1] + Math.sin(t) * ry); }
    pts.push(top[0], top[1]); g.poly(pts, g.lin(b[0] - rx, 0, b[0] + rx, 0, [[0, mix(o.color, '#ffffff', 0.16)], [0.55, o.color], [1, shade(o.color, 0.72)]])); },
  // a small person: legs, body, arms, head and hair; standing, walking (o.step) or seated (o.seat). Seen from above it is shoulders and a head.
  pawn(g, o, { P, s, se, ce }) {
    const d = dress(o), f = d.f, b = P(o.x, o.y, 0), k = s * f, kz = s * f * ce, skin = o.head || '#e6c6a0', shirt = o.color;
    if (ce < 0.16) { g.ellipse(b[0], b[1], 0.2 * k, 0.125 * k, shirt); g.ellipse(b[0], b[1], 0.115 * k, 0.115 * k, d.scarf || d.hair); return; }
    const q = (u, v, fw = 0) => [b[0] + u * k, b[1] - v * kz + fw * k * se], poly = (pts, c) => { const t = []; for (const w of pts) { const c2 = q(w[0], w[1], w[2]); t.push(c2[0], c2[1]); } g.poly(t, c); };
    const dot = (u, v, r, c, fw = 0, ry = r) => { const c2 = q(u, v, fw); g.ellipse(c2[0], c2[1], r * k, ry * k, c); };
    const sw = o.step != null ? Math.sin(o.step) : 0, dn = o.seat ? 0.27 : 0, hip = 0.7 - dn, sh = 1.16 - dn, hd = 1.35 - dn;
    const body = g.lin(b[0] - 0.2 * k, 0, b[0] + 0.2 * k, 0, [[0, mix(shirt, '#ffffff', 0.2)], [0.55, shirt], [1, shade(shirt, 0.76)]]), legD = shade(d.legs, 0.82);
    if (d.style === 1) poly([[-0.135, hd + 0.02], [0.135, hd + 0.02], [0.15, sh - 0.12], [-0.15, sh - 0.12]], d.hair);                // long hair falls behind the shoulders
    if (o.seat) { // thighs come forward, shins drop to the floor
      for (const m of [-1, 1]) { poly([[m * 0.02, hip + 0.06, 0], [m * 0.15, hip + 0.06, 0], [m * 0.15, hip, 0.3], [m * 0.03, hip, 0.3]], m < 0 ? d.legs : legD);
        poly([[m * 0.035, hip, 0.3], [m * 0.145, hip, 0.3], [m * 0.135, 0.05, 0.33], [m * 0.045, 0.05, 0.33]], m < 0 ? d.legs : legD); dot(m * 0.09, 0.035, 0.07, d.shoe, 0.36, 0.04); }
    } else for (const m of [-1, 1]) { const a = sw * m * 0.1, lift = Math.max(0, sw * m) * 0.05;                                         // legs swing when walking
      poly([[m * 0.015, hip + 0.04, 0], [m * 0.145, hip + 0.04, 0], [m * 0.125, 0.05 + lift, a], [m * 0.035, 0.05 + lift, a]], m < 0 ? d.legs : legD); dot(m * 0.08, 0.035 + lift, 0.07, d.shoe, a + 0.03, 0.04); }
    poly([[-0.15, hip - 0.02], [0.15, hip - 0.02], [0.2, sh - 0.06], [0.14, sh + 0.03], [-0.14, sh + 0.03], [-0.2, sh - 0.06]], body);
    for (const m of [-1, 1]) { const a = o.seat ? 0.16 : -sw * m * 0.09, e = o.seat ? hip + 0.1 : hip + 0.02;                            // arms and hands
      poly([[m * 0.19, sh - 0.02, 0], [m * 0.255, sh - 0.07, 0], [m * 0.265, e + 0.03, a], [m * 0.2, e + 0.03, a]], m < 0 ? mix(shirt, '#ffffff', 0.12) : shade(shirt, 0.8)); dot(m * 0.233, e, 0.042, skin, a); }
    if (o.collar) poly([[-0.07, sh + 0.035], [0.07, sh + 0.035], [0, sh - 0.07]], o.collar);
    poly([[-0.045, sh], [0.045, sh], [0.045, sh + 0.09], [-0.045, sh + 0.09]], shade(skin, 0.9));
    const hc = q(0, hd), r = 0.128 * k;
    if (d.scarf) { poly([[-0.15, hd], [0.15, hd], [0.19, sh - 0.04], [-0.19, sh - 0.04]], d.scarf); g.ellipse(hc[0], hc[1], r * 1.1, r * 1.1, d.scarf); g.ellipse(hc[0], hc[1] + r * 0.2, r * 0.7, r * 0.76, skin); return; }
    g.ellipse(hc[0], hc[1], r, r, d.hair);
    if (d.style === 2) g.ellipse(hc[0], hc[1] - r * 1.05, r * 0.46, r * 0.46, d.hair);                                                // a bun
    g.ellipse(hc[0], hc[1] + r * 0.26, r * 0.78, r * 0.74, g.rad(hc[0] - r * 0.2, hc[1], r, [[0, mix(skin, '#ffffff', 0.25)], [1, skin]]));
  },
  sprite(g, o, { P, s, ce }) { const c = P(o.x, o.y, o.z), k = Math.max(ce, 0.0);
    if (k < 0.08) return;
    for (const sh of o.shapes) { if (sh.ell) g.ellipse(c[0] + sh.ell[0] * s, c[1] - sh.ell[1] * s * k, sh.ell[2] * s, sh.ell[3] * s * k, sh.color);
      else { const pts = []; for (const [u, v] of sh.pts) pts.push(c[0] + u * s, c[1] - v * s * k); g.poly(pts, sh.color); } } },
};
