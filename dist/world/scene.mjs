// جهانِ هزارآوا — the miniature world. One scene model, drawn by two backends: canvas (live) and SVG (static
// chapter illustrations). Pure data + maths: no DOM, no network. The layout follows the owner's hand-drawn plan of the
// academy (courtyard with café, pond and tables · veranda · hall, five classes and the studio · boulevard in front);
// sizes, furniture and people are illustration.
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
  // ---- placement offset: a furnished room is written once and set down where the plan puts it
  let OX = 0, OY = 0;
  const at = (dx, dy, fn) => { const px = OX, py = OY; OX += dx; OY += dy; fn(); OX = px; OY = py; };
  const mv = pts => (OX || OY) ? pts.map(p => [p[0] + OX, p[1] + OY]) : pts;
  const S = { ground: [], deco: [], lines: [], back: [], solids: [], pools: [], notes: [], steam: [], smoke: [], walkers: [], lights: [] };
  const flat = (pts, color, o = {}) => { S[o.on || 'deco'].push({ pts: mv(pts), color, z: o.z || 0, a: o.a }); };
  const prism = (pts, z0, z1, color, o = {}) => { const ob = { k: 'prism', pts: mv(pts), z0, z1, color, top: o.top, decals: o.decals, shadow: o.shadow !== false && z0 === 0, bias: o.bias || 0 }; (o.back ? S.back : S.solids).push(ob); return ob; };
  const box = (x0, y0, x1, y1, z0, z1, color, o) => prism(rect(x0, y0, x1, y1), z0, z1, color, o);
  const slab = (pts, z, color, o = {}) => S.solids.push({ k: 'flat', pts: mv(pts), z, color, x: (o.x ?? pts[0][0]) + OX, y: (o.y ?? pts[0][1]) + OY, bias: o.bias || 0, a: o.a });
  const sprite = (x, y, z, shapes, o = {}) => S.solids.push({ k: 'sprite', x: x + OX, y: y + OY, z, shapes, bias: o.bias || 0 });
  const ball = (x, y, z, r, color, o = {}) => S.solids.push({ k: 'ball', x: x + OX, y: y + OY, z, r, color, dots: o.dots, back: o.back });
  const cone = (x, y, r, h, color, o = {}) => (o.back ? S.back : S.solids).push({ k: 'cone', x: x + OX, y: y + OY, r, h, z0: o.z0 || 0, color, shadow: true });
  const pawn = (x, y, o) => S.solids.push({ k: 'pawn', h: 1, ...o, x: x + OX, y: y + OY });
  const line = (pts, color, w, o = {}) => S.lines.push({ pts: mv(pts), color, w, z: o.z || 0.01, a: o.a });
  const note = (x, y, z, ph) => S.notes.push([x + OX, y + OY, z, ph]);
  const steam = (x, y, z) => S.steam.push([x + OX, y + OY, z]);
  const glowAt = (x, y, r, key) => S.pools.push({ x: x + OX, y: y + OY, r, key });
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
  const foam = (i, len) => [0, 1, 2].flatMap(r => [0.14, 0.14 + (len - 0.28) / 2].map((u, c) => ({ pts: [[u, 0.4 + r * 0.42], [u + (len - 0.28) / 2 - 0.06, 0.4 + r * 0.42], [u + (len - 0.28) / 2 - 0.06, 0.76 + r * 0.42], [u, 0.76 + r * 0.42]], color: (r + c + i) % 2 ? PAL.tealD : PAL.walnut })))
    .concat([{ pts: [[0, 1.68], [len, 1.68], [len, 1.71], [0, 1.71]], color: PAL.brassL }]);

  // ---- props
  const GUITAR = (t, sc = 1) => { const c = Math.cos(t), s = Math.sin(t), R = (u, v) => [(u * c - v * s) * sc, (u * s + v * c) * sc]; return [
    { pts: [R(-0.045, 0.3), R(0.045, 0.3), R(0.04, 1.02), R(-0.04, 1.02)], color: PAL.walnutD },
    { pts: [R(-0.07, 1.0), R(0.07, 1.0), R(0.06, 1.2), R(-0.06, 1.2)], color: PAL.walnutD },
    { ell: [...R(0, 0.2), 0.24 * sc, 0.2 * sc], color: PAL.wood }, { ell: [...R(0, 0.44), 0.17 * sc, 0.15 * sc], color: PAL.wood },
    { ell: [...R(0, 0.33), 0.07 * sc, 0.07 * sc], color: PAL.walnutD } ]; };
  const STAND = [{ pts: [[-0.02, 0], [0.02, 0], [0.02, 1.0], [-0.02, 1.0]], color: PAL.ink }, { pts: [[-0.22, 0], [0, 0.12], [0.22, 0], [0.2, -0.02], [0, 0.08], [-0.2, -0.02]], color: PAL.ink },
    { pts: [[-0.3, 0.92], [0.3, 0.92], [0.3, 1.36], [-0.3, 1.36]], color: PAL.walnutD }, { pts: [[-0.25, 0.97], [0.25, 0.97], [0.25, 1.32], [-0.25, 1.32]], color: PAL.ivory },
    { pts: [[-0.2, 1.24], [0.2, 1.24], [0.2, 1.26], [-0.2, 1.26]], color: PAL.ink }, { pts: [[-0.2, 1.16], [0.2, 1.16], [0.2, 1.18], [-0.2, 1.18]], color: PAL.ink }, { pts: [[-0.2, 1.08], [0.12, 1.08], [0.12, 1.1], [-0.2, 1.1]], color: PAL.ink }];
  const EASEL = c => [{ pts: [[-0.3, 0], [-0.26, 0], [0.02, 1.5], [-0.02, 1.5]], color: PAL.walnut }, { pts: [[0.3, 0], [0.26, 0], [-0.02, 1.5], [0.02, 1.5]], color: PAL.walnut },
    { pts: [[-0.36, 0.55], [0.36, 0.55], [0.36, 1.3], [-0.36, 1.3]], color: PAL.ivory }, { pts: [[-0.3, 0.61], [0.3, 0.61], [0.3, 1.24], [-0.3, 1.24]], color: c },
    { ell: [0.05, 1.0, 0.13, 0.13], color: PAL.brassL }, { pts: [[-0.3, 0.61], [0.3, 0.61], [0.3, 0.8], [-0.3, 0.86]], color: PAL.teal }];
  const DRUM = (c = PAL.rugB) => [{ ell: [0, 0.3, 0.3, 0.3], color: PAL.walnut }, { ell: [0, 0.3, 0.25, 0.25], color: c }];
  const MIC = [{ pts: [[-0.02, 0], [0.02, 0], [0.02, 1.05], [-0.02, 1.05]], color: PAL.ink }, { pts: [[-0.2, 0], [0, 0.1], [0.2, 0], [0.18, -0.02], [0, 0.06], [-0.18, -0.02]], color: PAL.ink },
    { ell: [0, 1.12, 0.07, 0.1], color: PAL.brass }, { ell: [0.16, 1.12, 0.1, 0.13], color: PAL.ink }, { ell: [0.16, 1.12, 0.075, 0.105], color: '#6f6a62' }];
  S.GUITAR = GUITAR; S.STAND = STAND;
  const table = (x, y, r = 0.36, top = PAL.ivory) => { prism(ngon(x, y, 0.07, 6), 0, 0.5, PAL.walnutD); prism(ngon(x, y, r, 10), 0.5, 0.56, PAL.walnutL, { top, bias: 0.03 }); };
  const stool = (x, y, c = PAL.walnutL) => prism(ngon(x, y, 0.17, 8), 0, 0.3, c, { top: mix(c, '#ffffff', 0.25) });
  const chair = (x, y, c = PAL.walnutL) => { box(x - 0.19, y - 0.17, x + 0.19, y + 0.17, 0, 0.3, c, { top: mix(c, '#ffffff', 0.22) }); box(x - 0.19, y - 0.25, x + 0.19, y - 0.18, 0.3, 0.78, shade(c, 0.9), { shadow: false, top: c }); };
  const cup = (x, y, z) => { prism(ngon(x, y, 0.055, 6), z, z + 0.09, PAL.ivory, { bias: 0.08, shadow: false }); };
  const sit = (x, y, color, head, o = {}) => pawn(x, y, { color, head, h: 0.92, seat: true, ...o });
  const pot = (x, y, r = 0.26, leaf = 0.48, o = {}) => { prism(ngon(x, y, r, 8), 0, r * 1.7, PAL.terra); ball(x, y, r * 1.7 + leaf, leaf, PAL.leaf, o); };
  const SK = ['#e6c6a0', '#edd0ac', '#dcb88f', '#e9c9a4', '#e2bf98', '#d3a985', '#f0d2ad'];

  const CX1 = 11.4, VX1 = 14.6, BX1 = 30, BY1 = 16.5;   // courtyard | veranda | building; the boulevard runs along y = BY1
  // ---- ground: the plot, the boulevard in front, gardens behind and beside
  flat(rect(-40, -30, 80, 60), PAL.ground, { on: 'ground' });
  flat(rect(-2.4, -3.2, BX1 + 1.2, BY1 + 0.4), mix(PAL.ground, '#ffffff', 0.25), { on: 'ground' });
  flat(rect(-2.2, -3, BX1 + 1, -0.5), PAL.garden, { on: 'ground' });
  for (const gdn of [[[30.9, 0.4], [39.6, -0.2], [40.4, 7.3], [31.2, 7.6]], [[38.9, 8.2], [41.6, 8], [42, 15.6], [39, 15.9]], [[30.9, 14.6], [34.1, 14.6], [34.1, 16.4], [30.9, 16.4]], [[-5.6, 1], [-2.9, 0.6], [-2.9, 15.8], [-5.2, 16.2]]]) flat(gdn, PAL.garden, { on: 'ground' });
  const ROAD = mix(PAL.ground, '#6f6a62', 0.32), PAVE = BY1 + 1.7;
  flat(rect(-14, BY1 + 0.4, 54, BY1 + 2.95), PAL.path, { on: 'ground' });
  flat(rect(-14, BY1 + 2.95, 54, BY1 + 3.15), PAL.stone, { on: 'ground' });
  flat(rect(-14, BY1 + 3.15, 54, BY1 + 7.3), ROAD, { on: 'ground' });
  for (let i = 0; i < 28; i++) flat(rect(-13 + i * 2.4, BY1 + 5.15, -11.8 + i * 2.4, BY1 + 5.3), PAL.stone, { on: 'ground' });
  flat(rect(-14, BY1 + 7.3, 54, BY1 + 7.5), PAL.stone, { on: 'ground' }); flat(rect(-14, BY1 + 7.5, 54, BY1 + 12), PAL.garden, { on: 'ground' });
  for (let i = 0; i < 44; i++) { const x = -9 + i * 1.12; flat(rect(x, PAVE - 0.42, x + 0.9, PAVE + 0.42), PAL.stone, { on: 'ground' }); }
  flat(rect(34.7, 14, 36.3, BY1 + 0.5), PAL.path, { on: 'ground' }); for (let i = 0; i < 4; i++) flat(rect(35.15, 14.25 + i * 0.68, 35.85, 14.7 + i * 0.68), PAL.stone, { on: 'ground' });

  // ---- floors
  const F = (x0, y0, x1, y1, c) => flat(rect(x0, y0, x1, y1), c, { on: 'ground' });
  F(0, 0, CX1, BY1, PAL.court);
  for (let i = 0; i < 10; i++) for (let j = 0; j < 15; j++) if ((i + j) % 2) flat(rect(i * 1.14, j * 1.1, (i + 1) * 1.14, (j + 1) * 1.1), PAL.courtB, { on: 'ground' });
  F(CX1, 0, VX1, BY1, PAL.wood);                                              // the veranda (ایوان): a deck between courtyard and building
  for (let j = 1; j < 30; j++) line([[CX1 + 0.16, j * 0.55], [VX1, j * 0.55]], PAL.woodD, 0.028);
  flat(rect(CX1, 0, CX1 + 0.18, BY1), PAL.brassL); flat(rect(12.2, 0.6, 13.8, 15.9), PAL.rug, { a: 0.9 }); flat(rect(12.36, 0.76, 13.64, 15.74), PAL.rugB, { a: 0.9 }); flat(rect(12.52, 0.92, 13.48, 15.58), PAL.terra, { a: 0.92 });
  for (let j = 0; j < 9; j++) flat(ngon(13, 1.8 + j * 1.62, 0.3, 4), PAL.rugB);
  F(VX1, 0, 20, 5, PAL.floor); F(20, 0, 23.4, 5, PAL.floorB); F(23.4, 0, BX1, 5.2, '#d9c7a4'); F(23.4, 5.2, BX1, 9.7, PAL.floor);
  F(VX1, 5, 23.4, 10, PAL.stone); F(19.3, 10, 21.9, BY1, PAL.stone); F(21.9, 9.7, BX1, BY1, PAL.floorB); F(VX1, 10, 19.3, BY1, PAL.floor);
  for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) if ((i + j) % 2) flat(rect(VX1 + i * 0.88, 5 + j * 0.834, VX1 + (i + 1) * 0.88, 5 + (j + 1) * 0.834), PAL.court, { on: 'ground' });
  for (let j = 0; j < 8; j++) for (let i = 0; i < 3; i++) if ((i + j) % 2) flat(rect(19.3 + i * 0.867, 10 + j * 0.8125, 19.3 + (i + 1) * 0.867, 10 + (j + 1) * 0.8125), PAL.court, { on: 'ground' });
  // turquoise tile border of the courtyard, and the star around the pond
  for (const r of [rect(0.35, 5.95, 11.05, 6.13), rect(0.35, 15.9, 11.05, 16.08), rect(0.35, 5.95, 0.53, 16.08), rect(10.87, 5.95, 11.05, 16.08)]) flat(r, PAL.tealL);
  const HX = 8, HY = 10.6; S.pond = [HX, HY];
  flat(ngon(HX, HY, 2.75, 4, 0), PAL.brassL); flat(ngon(HX, HY, 2.75, 4, Math.PI / 4), PAL.brassL);
  flat(ngon(HX, HY, 2.52, 4, 0), PAL.teal); flat(ngon(HX, HY, 2.52, 4, Math.PI / 4), PAL.teal);
  flat(ngon(HX, HY, 1.9, 8, Math.PI / 8), PAL.ivory);
  prism(ngon(HX, HY, 1.5, 8, Math.PI / 8), 0, 0.3, PAL.plaster, { top: PAL.ivory });
  slab(ngon(HX, HY, 1.24, 8, Math.PI / 8), 0.31, PAL.water, { x: HX, y: HY, bias: 0.02 });
  slab(ngon(HX - 0.22, HY - 0.18, 0.64, 8, 0.2), 0.312, PAL.waterL, { x: HX, y: HY, bias: 0.03, a: 0.55 });
  prism(ngon(HX, HY, 0.18, 8), 0.3, 0.62, PAL.brass, { bias: 0.05 }); prism(ngon(HX, HY, 0.38, 8), 0.62, 0.72, PAL.brassL, { bias: 0.06 });
  for (const [px, py] of [[5.5, 7.2], [10.3, 14.4], [5.6, 14.6]]) { box(px - 0.5, py - 0.5, px + 0.5, py + 0.5, 0, 0.42, PAL.terra, { top: PAL.walnutD }); prism(ngon(px, py, 0.09, 6), 0.42, 1.25, PAL.walnut, { bias: 0.02 }); ball(px, py, 1.55, 0.62, PAL.leaf, { dots: PAL.orange }); }
  for (let i = 0; i < 6; i++) pot(0.62, 6.6 + i * 1.72, 0.2, 0.3 + (i % 2) * 0.06, i % 3 === 1 ? { dots: PAL.terra } : {});          // flower pots along the west wall

  // ---- tall back walls (north and west), with niches and a tile band; trees behind
  wall(-T / 2, -T / 2, 23.4, -T / 2, HB, { back: true, decal: niche, top: PAL.ivory });
  wall(23.4, -T / 2, BX1 + T / 2, -T / 2, HB, { back: true, decal: foam, top: PAL.ivory, seg: 1.1 });
  wall(-T / 2, 0, -T / 2, BY1, HB, { back: true, decal: niche, top: PAL.ivory });
  box(-1.9, -1.9, -0.45, -0.45, 0, 3.3, PAL.plaster, { back: true, top: PAL.ivory, decals: [1, 2].flatMap(e => [0.22, 0.6, 0.98].map(u => ({ edge: e, pts: [[u, 2.2], [u + 0.24, 2.2], [u + 0.24, 3.05], [u, 3.05]], color: PAL.walnutD }))).concat([1, 2].map(e => ({ edge: e, pts: [[0, 1.95], [1.45, 1.95], [1.45, 2.08], [0, 2.08]], color: PAL.teal }))) });
  for (const [tx, ty, r, h] of [[3.5, -1.6, 0.55, 3.1], [9, -1.9, 0.6, 3.4], [14.5, -1.5, 0.5, 2.8], [19.5, -1.9, 0.6, 3.3], [25, -1.6, 0.55, 3], [29.4, -1.9, 0.6, 3.3], [-1.6, 3.5, 0.55, 3], [-1.8, 8.5, 0.6, 3.3], [-1.7, 13.6, 0.55, 3.1]]) cone(tx, ty, r, h, PAL.cypress, { back: true });

  // ---- the building's walls: low towards the viewer, so every room is open to the eye
  wall(VX1, 0, VX1, BY1, 1.25, { gaps: [[6.5, 8.7]], decal: band });                       // façade on the veranda, with the hall door
  wall(20, 0, 20, 5, 1.25, { decal: band }); wall(23.4, 0, 23.4, 5.2, 1.25, { decal: band });
  wall(VX1, 5, 23.4, 5, 1.0, { gaps: [[18.5, 19.9], [21.2, 22.4]], decal: band });         // class 1 and class 2 open onto the hall
  wall(23.4, 5.2, BX1, 5.2, 1.0, { gaps: [[25.9, 27.1]], decal: band });                   // studio
  wall(23.4, 5.2, 23.4, 9.7, 1.05, { gaps: [[7.8, 9.2]], decal: band });                   // class 3
  wall(21.9, 9.7, BX1, 9.7, 1.0, { decal: band });
  wall(21.9, 9.7, 21.9, BY1, 1.05, { gaps: [[11, 12.4]], decal: band });                   // class 4, from the entrance corridor
  wall(VX1, 10, 19.3, 10, 1.0, { gaps: [[17.5, 18.9]], decal: band }); wall(19.3, 10, 19.3, BY1, 1.05, { decal: band });   // class 5
  wall(VX1, BY1, 19.3, BY1, 0.36, { color: PAL.plasterD }); wall(21.9, BY1, BX1, BY1, 0.36, { color: PAL.plasterD });
  wall(19.3, BY1, 21.9, BY1, 0.36, { gaps: [[19.85, 21.35]], color: PAL.plasterD });       // entrance 1, on the boulevard
  wall(BX1, 0, BX1, BY1, 0.3, { color: PAL.plasterD });
  for (const gx of [19.7, 21.5]) { box(gx - 0.26, BY1 - 0.26, gx + 0.26, BY1 + 0.26, 0, 1.9, PAL.plaster, { top: PAL.ivory, decals: [{ edge: 2, pts: [[0.07, 1.45], [0.45, 1.45], [0.45, 1.65], [0.07, 1.65]], color: PAL.teal }] }); ball(gx, BY1, 2.06, 0.17, PAL.brass); }
  // courtyard: street wall with the courtyard gate; veranda columns
  wall(0, BY1, CX1, BY1, 0.6, { gaps: [[7.2, 9.8]], color: PAL.plaster, top: PAL.tealL }); wall(CX1, BY1, VX1, BY1, 0.6, { color: PAL.plaster, top: PAL.tealL });
  for (const gx of [7.05, 9.95]) { box(gx - 0.3, BY1 - 0.3, gx + 0.3, BY1 + 0.3, 0, 2, PAL.plaster, { top: PAL.ivory, decals: [{ edge: 2, pts: [[0.08, 1.55], [0.52, 1.55], [0.52, 1.75], [0.08, 1.75]], color: PAL.teal }] }); ball(gx, BY1, 2.18, 0.2, PAL.brass); }
  for (const cy of [1.1, 3.75, 6.4, 9.05, 11.7, 14.35]) { prism(ngon(CX1 + 0.09, cy, 0.17, 8), 0, 1.5, PAL.ivory); box(CX1 - 0.15, cy - 0.24, CX1 + 0.33, cy + 0.24, 1.5, 1.62, PAL.brassL, { bias: 0.02 }); }
  box(13.95, 10.6, 14.4, 13.4, 0, 0.42, PAL.walnutL, { top: PAL.terra });                  // a bench on the veranda
  sit(14.12, 11.3, PAL.teal, SK[1], { play: 'guitar', collar: PAL.brassL }); sit(14.12, 12.7, PAL.brassL, SK[3], { h: 0.8 });
  pot(11.95, 0.75, 0.24, 0.42); pot(14.05, 5.6, 0.22, 0.4, { dots: PAL.orange }); pot(14.05, 9.6, 0.22, 0.4);
  note(14.1, 11.3, 1.3, 0.15);

  // ---- WC (north-west corner of the courtyard): a small closed room
  box(0.15, 0.15, 3.2, 4.3, 0, 1.72, PAL.plaster, { top: PAL.ivory, decals: [
    { edge: 2, pts: [[0.95, 0], [1.9, 0], [1.9, 1.38], [0.95, 1.38]], color: PAL.walnutD }, { edge: 2, pts: [[1.03, 0.06], [1.82, 0.06], [1.82, 1.3], [1.03, 1.3]], color: PAL.teal }, { edge: 2, pts: [[1.1, 0.62], [1.18, 0.62], [1.18, 0.74], [1.1, 0.74]], color: PAL.brassL },
    { edge: 2, pts: [[0, 1.5], [3.05, 1.5], [3.05, 1.62], [0, 1.62]], color: PAL.tealL }, { edge: 1, pts: [[0, 1.5], [4.15, 1.5], [4.15, 1.62], [0, 1.62]], color: PAL.tealL },
    { edge: 1, pts: [[1.5, 0.95], [2.6, 0.95], [2.6, 1.35], [1.5, 1.35]], color: PAL.walnutD }, { edge: 1, pts: [[1.56, 1.0], [2.54, 1.0], [2.54, 1.3], [1.56, 1.3]], color: PAL.waterL }] });
  box(0, 0, 3.36, 4.46, 1.72, 1.84, PAL.terra, { top: mix(PAL.terra, PAL.plaster, 0.35), bias: 0.02, shadow: false });
  pot(3.6, 4.7, 0.2, 0.34);

  // ---- café (north side of the courtyard): shelves under a striped canopy, a long counter, bar stools
  flat(rect(4.7, 0.15, 10.9, 5.75), mix(PAL.court, PAL.brassL, 0.4), { a: 0.7 }); for (const r of [rect(4.7, 5.63, 10.9, 5.75), rect(4.7, 0.15, 4.82, 5.75), rect(10.78, 0.15, 10.9, 5.75)]) flat(r, PAL.terra);
  box(5.2, 0.16, 10.4, 0.6, 0, 1.3, PAL.walnutD, { top: PAL.walnut, decals: [0.2, 0.62].flatMap((z, r) => Array.from({ length: 12 }, (_, c) => ({ edge: 2, pts: [[0.2 + c * 0.41, z], [0.48 + c * 0.41, z], [0.48 + c * 0.41, z + 0.3], [0.2 + c * 0.41, z + 0.3]], color: [PAL.terra, PAL.brassL, PAL.tealL, PAL.ivory, PAL.rug, PAL.teal][(r * 2 + c) % 6] }))) });
  for (const [j, c] of [PAL.terra, PAL.brassL, PAL.tealL, PAL.ivory, PAL.terra, PAL.brass, PAL.tealL].entries()) prism(ngon(5.6 + j * 0.74, 0.38, 0.09, 6), 1.3, 1.5, c, { bias: 0.05, shadow: false });
  for (const [ax, ay] of [[5.05, 0.75], [10.55, 0.75], [5.05, 2.25], [10.55, 2.25]]) prism(ngon(ax, ay, 0.045, 6), 0, 2.02, PAL.walnutD);
  for (let i = 0; i < 10; i++) box(4.9 + i * 0.58, 0.05, 5.48 + i * 0.58, 2.4, 2.02, 2.08, i % 2 ? PAL.ivory : PAL.terra, { bias: 0.02, shadow: i === 0 });
  box(5.3, 2.75, 10.3, 3.3, 0, 0.95, PAL.walnut, { top: PAL.walnutL, decals: [{ edge: 2, pts: [[0.14, 0.12], [4.86, 0.12], [4.86, 0.8], [0.14, 0.8]], color: PAL.walnutD }, { edge: 2, pts: [[0, 0.86], [5, 0.86], [5, 0.95], [0, 0.95]], color: PAL.brass }, { edge: 1, pts: [[0, 0.86], [0.55, 0.86], [0.55, 0.95], [0, 0.95]], color: PAL.brass }] });
  box(5.6, 2.84, 6.25, 3.2, 0.95, 1.3, PAL.brass, { top: PAL.brassL, bias: 0.05, shadow: false }); prism(ngon(5.76, 3.0, 0.06, 6), 1.3, 1.42, PAL.ink, { bias: 0.06, shadow: false });
  cup(6.7, 3.02, 0.95); cup(7.0, 3.08, 0.95); cup(8.7, 3.05, 0.95); prism(ngon(9.6, 3.02, 0.14, 8), 0.95, 1.0, PAL.ivory, { bias: 0.06, shadow: false }); ball(9.6, 3.02, 1.08, 0.1, PAL.orange);
  pawn(7.3, 1.9, { color: PAL.ivory, head: SK[4], collar: PAL.terra, h: 1.0, pose: 'fwd' }); pawn(9.2, 1.75, { color: PAL.cypress, head: SK[1], collar: PAL.ivory, h: 0.96 });
  for (const [i, sx] of [6.4, 7.6, 8.8, 9.9].entries()) { stool(sx, 3.85, PAL.terra); if (i !== 2) sit(sx, 3.85, [PAL.tealL, PAL.brass, 0, PAL.terraD][i], SK[i + 2], i === 0 ? { collar: PAL.ivory } : {}); }
  steam(5.76, 3.0, 1.48); steam(6.85, 3.05, 1.05); glowAt(7.8, 2.6, 3, 'cafe');
  // tables and chairs (صندلی‌ها) on the west side of the courtyard
  table(2.2, 7.0); chair(1.62, 6.95, PAL.terra); chair(2.78, 7.1, PAL.terra); cup(2.1, 6.92, 0.56); cup(2.32, 7.08, 0.56);
  sit(1.62, 6.95, PAL.tealL, SK[1], { pose: 'cup' }); sit(2.78, 7.1, PAL.brass, SK[2]);
  table(3.75, 9.0); chair(3.15, 9.05, PAL.terra); chair(4.35, 8.95, PAL.terra); cup(3.65, 9.05, 0.56); sit(3.15, 9.05, PAL.terraD, SK[0]); sit(4.35, 8.95, PAL.cypress, SK[1], { collar: PAL.brassL });
  table(3.7, 11.6, 0.34); chair(3.1, 11.6, PAL.terra); chair(4.3, 11.65, PAL.terra);                       // a free table: the bird lands here
  table(1.95, 10.5, 0.32); chair(1.4, 10.5, PAL.terra); cup(1.95, 10.42, 0.56); sit(1.4, 10.5, PAL.walnutL, SK[3], { pose: 'cup' });
  // someone alone at the last table, with a glass of tea, smoking
  table(2.15, 13.7, 0.34); chair(1.55, 13.7, PAL.terra); chair(2.75, 13.75, PAL.terra); cup(2.28, 13.62, 0.56); prism(ngon(2.02, 13.82, 0.075, 8), 0.56, 0.6, PAL.ink, { bias: 0.08, shadow: false });
  sit(1.55, 13.7, PAL.walnut, SK[4], { pose: 'smoke', collar: PAL.ivory, h: 1.0, seed: 11, id: 'smoker' });
  S.smoke.push([1.55, 13.7, 1.18, -0.2]);
  steam(2.2, 7.0, 0.7); steam(3.67, 9.04, 0.7); steam(1.95, 10.44, 0.7); steam(2.28, 13.64, 0.7);
  // friends on a bench by the pond
  box(6.9, 13.25, 8.9, 13.75, 0, 0.36, PAL.walnutL, { top: PAL.wood }); sit(7.4, 13.5, PAL.terra, SK[0]); sit(8.3, 13.5, PAL.teal, SK[1], { collar: PAL.brassL });
  glowAt(3, 10, 3.2, 'cafe');

  // ---- hall (سالن) with the secretary's desk (منشی)
  flat(rect(18.1, 6.5, 22.6, 9.2), PAL.teal); flat(rect(18.3, 6.7, 22.4, 9.0), PAL.tealL); flat(rect(18.55, 6.95, 22.15, 8.75), PAL.teal); flat(ngon(20.35, 7.85, 0.5, 4), PAL.brassL);
  box(15.2, 5.95, 17.6, 6.7, 0, 0.78, PAL.walnut, { top: PAL.walnutL, decals: [{ edge: 2, pts: [[0.15, 0.2], [2.25, 0.2], [2.25, 0.6], [0.15, 0.6]], color: PAL.walnutD }, { edge: 2, pts: [[0, 0.7], [2.4, 0.7], [2.4, 0.78], [0, 0.78]], color: PAL.brass }, { edge: 1, pts: [[0, 0.7], [0.75, 0.7], [0.75, 0.78], [0, 0.78]], color: PAL.brass }] });
  box(15.75, 6.02, 16.45, 6.1, 0.78, 1.2, PAL.ink, { bias: 0.05, shadow: false, decals: [{ edge: 2, pts: [[0.05, 0.05], [0.65, 0.05], [0.65, 0.37], [0.05, 0.37]], color: PAL.tealL }] });
  box(15.45, 6.3, 16.0, 6.6, 0.78, 0.82, PAL.ivory, { bias: 0.04 }); box(16.75, 6.08, 16.91, 6.24, 0.78, 1.06, PAL.brass, { bias: 0.04 }); ball(16.83, 6.16, 1.14, 0.13, PAL.glow);
  chair(16.1, 5.5, PAL.tealD); sit(16.1, 5.5, PAL.walnutL, SK[3], { collar: PAL.brassL, h: 0.98, pose: 'fwd', seed: 5 });
  box(VX1 + 0.14, 8.85, VX1 + 0.66, 9.86, 0, 1.45, PAL.walnut, { top: PAL.walnutL, decals: [0.25, 0.65, 1.05].flatMap((z, r) => [0.1, 0.4, 0.7].map((u, c) => ({ edge: 1, pts: [[u, z], [u + 0.2, z], [u + 0.2, z + 0.3], [u, z + 0.3]], color: [PAL.teal, PAL.terra, PAL.brassL, PAL.ivory, PAL.tealL, PAL.rug][(r * 2 + c) % 6] }))) });
  box(15.6, 9.25, 17.2, 9.82, 0, 0.42, PAL.walnutL, { top: PAL.terra }); sit(16.0, 9.5, PAL.tealL, SK[1]); sit(16.75, 9.5, PAL.terraD, SK[2], { h: 0.62, kid: true });
  pot(22.8, 5.65, 0.26, 0.46); pot(VX1 + 0.5, 5.6, 0.22, 0.4);
  pawn(21.4, 7.6, { color: PAL.walnutL, head: SK[3], collar: PAL.ivory, h: 0.96 });
  // entrance 1 from the boulevard: a runner and two plants
  flat(rect(20.05, 10.5, 21.15, 16.1), PAL.rug); flat(rect(20.2, 10.65, 21.0, 15.95), PAL.rugB); flat(rect(20.35, 10.8, 20.85, 15.8), PAL.terra);
  pot(19.75, 15.6, 0.2, 0.36); pot(21.5, 15.6, 0.2, 0.36, { dots: PAL.orange });

  // ---- class 1: guitar lesson (x 14.6..20, y 0..5)
  at(8.9, 0, () => {
    flat(rect(7, 1.3, 10.4, 4.3), PAL.terraD); flat(rect(7.2, 1.5, 10.2, 4.1), PAL.rugB); flat(rect(7.4, 1.7, 10, 3.9), PAL.terra); flat(ngon(8.7, 2.8, 0.55, 8), PAL.rugB);
    box(9.3, 0, 10.7, 0.5, 0, 0.95, PAL.walnut, { top: PAL.walnutL, decals: [{ edge: 2, pts: [[0.1, 0.12], [0.65, 0.12], [0.65, 0.85], [0.1, 0.85]], color: PAL.walnutD }, { edge: 2, pts: [[0.75, 0.12], [1.3, 0.12], [1.3, 0.85], [0.75, 0.85]], color: PAL.walnutD }] });
    prism(ngon(9.6, 0.25, 0.14, 8), 0.95, 1.15, PAL.teal, { bias: 0.04 }); ball(9.6, 0.25, 1.36, 0.24, PAL.leaf);
    stool(7.5, 2.9); stool(9.55, 3.35); stool(9.9, 1.9);
    pawn(7.5, 2.9, { color: PAL.teal, head: SK[0], collar: PAL.brassL, h: 1.08, id: 'teacher', seat: true, play: 'guitar', seed: 2 });
    sit(9.9, 1.9, PAL.brassL, SK[1], { h: 0.8, play: 'guitar' });
    sprite(8.55, 3.75, 0, STAND);
    sprite(6.55, 0.42, 0, GUITAR(0.12, 0.95)); sprite(7.2, 0.42, 0, GUITAR(-0.1, 0.85));                    // two guitars leaning on the back wall
    note(8.6, 2.9, 1.4, 0.2);
  });
  S.teacher = [16.4, 2.9]; S.seat = [18.45, 3.35];
  // ---- class 2: santoor (x 20..23.4)
  flat(rect(20.45, 1.4, 22.95, 4.3), PAL.tealD); flat(rect(20.62, 1.57, 22.78, 4.13), PAL.tealL); flat(rect(20.8, 1.75, 22.6, 3.95), PAL.teal);
  box(21.15, 2.5, 22.25, 3.2, 0, 0.42, PAL.walnutD); prism([[21.2, 2.5], [22.2, 2.5], [22.42, 3.2], [20.98, 3.2]], 0.42, 0.56, PAL.walnutL, { bias: 0.03, top: PAL.wood });
  for (let i = 0; i < 5; i++) slab(rect(21.1 + i * 0.05, 2.62 + i * 0.12, 22.3 - i * 0.05, 2.65 + i * 0.12), 0.565, PAL.brassL, { x: 21.7, y: 2.9, bias: 0.06 });
  stool(21.7, 1.95); sit(21.7, 1.95, PAL.tealD, SK[2], { collar: PAL.brass, h: 1.04, pose: 'fwd' }); stool(21.7, 3.95, PAL.terra); sit(21.7, 3.95, PAL.terraD, SK[1], { h: 0.8, pose: 'fwd' });
  box(20.14, 0.3, 20.58, 1.5, 0, 1.1, PAL.walnut, { top: PAL.walnutL }); ball(20.36, 0.6, 1.26, 0.16, PAL.terra); ball(20.36, 1.15, 1.24, 0.14, PAL.brass);
  note(21.7, 2.9, 1.3, 0.7);
  // ---- studio: recording and arrangement (x 23.4..30, y 0..5.2): control desk, monitors, vocal booth
  at(2.4, 0.1, () => {
    flat(rect(21.5, 1.1, 23.6, 4.5), '#3b4a48'); flat(rect(21.65, 1.25, 23.45, 4.35), '#4b5d5a');
    box(21.55, 1.5, 23.45, 2.25, 0, 0.74, PAL.walnutD, { top: PAL.walnut, decals: [{ edge: 2, pts: [[0, 0.66], [1.9, 0.66], [1.9, 0.74], [0, 0.74]], color: PAL.brass }] });
    slab(rect(21.85, 1.72, 23.15, 2.16), 0.745, PAL.ink, { x: 22.5, y: 1.95, bias: 0.05 });
    for (let i = 0; i < 9; i++) { slab(rect(21.93 + i * 0.135, 1.78, 21.96 + i * 0.135, 2.1), 0.75, '#6f6a62', { x: 22.5, y: 1.95, bias: 0.06 });
      const k = 1.82 + ((i * 7) % 5) * 0.055; slab(rect(21.905 + i * 0.135, k, 21.985 + i * 0.135, k + 0.07), 0.755, i % 3 ? PAL.ivory : PAL.terra, { x: 22.5, y: 1.95, bias: 0.07 }); }
    const LV = [0.06, 0.14, 0.09, 0.18, 0.12, 0.16, 0.07];
    box(22.05, 1.52, 22.95, 1.62, 0.74, 1.28, PAL.ink, { bias: 0.05, shadow: false, decals: [{ edge: 2, pts: [[0.05, 0.05], [0.85, 0.05], [0.85, 0.49], [0.05, 0.49]], color: '#27403d' }]
      .concat([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((u, i) => ({ edge: 2, pts: [[u, 0.27 - LV[i]], [u + 0.06, 0.27 - LV[i]], [u + 0.06, 0.27 + LV[i]], [u, 0.27 + LV[i]]], color: i % 2 ? PAL.tealL : PAL.brassL }))) });
    for (const sx of [21.55, 23.1]) box(sx, 1.5, sx + 0.36, 1.82, 0.74, 1.3, '#2e2925', { bias: 0.05, shadow: false, decals: [{ edge: 2, pts: [[0.08, 0.3], [0.28, 0.3], [0.28, 0.5], [0.08, 0.5]], color: PAL.brass }, { edge: 2, pts: [[0.1, 0.06], [0.26, 0.06], [0.26, 0.22], [0.1, 0.22]], color: '#6f6a62' }] });
    prism(ngon(22.5, 2.85, 0.24, 8), 0, 0.4, PAL.ink, { top: '#4b4640' }); sit(22.5, 2.85, PAL.tealD, SK[4], { h: 0.84, collar: PAL.ink, pose: 'fwd' });
    box(21.5, 3.95, 23.3, 4.55, 0, 0.4, PAL.terraD, { top: PAL.terra }); sit(22.9, 4.2, PAL.brassL, SK[1], { h: 0.8, play: 'guitar' });
    // vocal booth with a low sill, corner posts and a top rail (reads as glass)
    wall(23.9, 0, 23.9, 3.5, 0.42, { color: PAL.plasterD, top: PAL.tealL }); wall(23.9, 3.5, 25.6, 3.5, 0.42, { gaps: [[24.3, 25.1]], color: PAL.plasterD, top: PAL.tealL }); wall(25.6, 0, 25.6, 3.5, 0.42, { color: PAL.plasterD, top: PAL.tealL });
    for (const [qx, qy] of [[23.9, 0.1], [23.9, 3.5], [25.6, 3.5]]) prism(ngon(qx, qy, 0.06, 6), 0.42, 1.62, PAL.walnutD, { bias: 0.02, shadow: false });
    box(23.84, 0.1, 23.96, 3.5, 1.56, 1.64, PAL.walnutD, { bias: 0.03, shadow: false }); box(23.9, 3.44, 25.6, 3.56, 1.56, 1.64, PAL.walnutD, { bias: 0.03, shadow: false });
    flat(ngon(24.75, 1.75, 0.8, 16), PAL.rug); flat(ngon(24.75, 1.75, 0.62, 16), PAL.rugB);
    sprite(24.5, 1.45, 0, MIC); pawn(24.9, 1.9, { color: PAL.terra, head: SK[0], collar: PAL.ivory, h: 0.98 });
    ball(23.9, 3.5, 1.76, 0.1, '#d2453a'); S.rec = [23.9 + OX, 3.5 + OY, 1.76];
    note(24.75, 1.6, 1.5, 0.1); note(22.5, 1.9, 1.5, 0.6);
    // the east end: a keyboard on its stand and a rack of instruments
    box(26.2, 1.7, 27.35, 2.12, 0.62, 0.7, PAL.ink, { bias: 0.04 }); slab(rect(26.24, 1.94, 27.31, 2.1), 0.705, PAL.ivory, { x: 26.8, y: 2, bias: 0.06 });
    for (const kx of [26.3, 27.25]) prism(ngon(kx, 1.9, 0.04, 6), 0, 0.62, PAL.ink);
    stool(26.8, 2.6, PAL.ink); sit(26.8, 2.6, PAL.tealL, SK[2], { h: 0.86, pose: 'fwd' });
    sprite(26.25, 0.42, 0, GUITAR(0.1, 0.9)); sprite(26.85, 0.42, 0, GUITAR(-0.12, 0.9));
    glowAt(23.2, 2.6, 3, 'studio');
  });
  // ---- class 3: atelier (x 23.4..30, y 5.2..9.7)
  at(7.4, 5.1, () => {
    flat(rect(17, 1.5, 21.6, 4.1), PAL.rugB); flat(rect(17.2, 1.7, 21.4, 3.9), PAL.ivory);
    sprite(18.1, 2.2, 0, EASEL(PAL.tealL)); sprite(19.5, 3.2, 0, EASEL(PAL.terra)); sprite(21.0, 2.3, 0, EASEL(PAL.brassL));
    pawn(18.3, 3.2, { color: PAL.walnut, head: SK[0], collar: PAL.brassL, h: 1.02 }); pawn(19.7, 4.1, { color: PAL.tealL, head: SK[1], h: 0.8, kid: true });
    pawn(17.4, 3.9, { color: PAL.terra, head: SK[2], h: 0.84 }); pawn(21.2, 3.35, { color: PAL.cypress, head: SK[3], h: 0.9, collar: PAL.ivory });
    box(16.14, 0.5, 16.6, 2.2, 0, 0.9, PAL.walnut, { top: PAL.walnutL }); for (const [j, c] of [PAL.terra, PAL.teal, PAL.brass].entries()) prism(ngon(16.37, 0.85 + j * 0.5, 0.13, 8), 0.9, 1.12, c, { bias: 0.04 });
    table(22.0, 3.7, 0.3, PAL.rugB); prism(ngon(22.0, 3.7, 0.09, 8), 0.56, 0.78, PAL.teal, { bias: 0.05, shadow: false }); ball(22.0, 3.7, 0.92, 0.15, PAL.orange);
  });
  // ---- class 4: percussion circle (x 21.9..30, y 9.7..16.5)
  at(17.2, -1.7, () => {
    flat(ngon(8.8, 14.8, 1.9, 24), PAL.rug); flat(ngon(8.8, 14.8, 1.62, 24), PAL.rugB); flat(ngon(8.8, 14.8, 0.7, 12), PAL.rug);
    const who = [PAL.teal, PAL.terra, PAL.brass, PAL.tealL, PAL.walnutL, PAL.cypress];
    for (const [i, c] of who.entries()) { const t = -0.5 + i * 1.047, x = 8.8 + Math.cos(t) * 1.5, y = 14.8 + Math.sin(t) * 1.2;
      stool(x, y, PAL.walnut); sit(x, y, c, SK[i], { ...(i === 0 ? { h: 0.98, collar: PAL.brassL } : i === 3 ? { h: 0.7, kid: true } : {}), pose: 'fwd' });
      const dx = 8.8 + Math.cos(t) * 0.92, dy = 14.8 + Math.sin(t) * 0.74;
      if (i % 2) sprite(dx, dy, 0.42, DRUM(i === 1 ? PAL.ivory : PAL.rugB), { bias: 0.25 }); else prism(ngon(dx, dy, 0.17, 8), 0, 0.5, PAL.walnutL, { top: PAL.ivory }); }
    box(11.9, 12.0, 12.45, 14.0, 0, 1.0, PAL.walnut, { top: PAL.walnutL }); for (const [j, c] of [PAL.rugB, PAL.ivory, PAL.brassL].entries()) prism(ngon(12.17, 12.4 + j * 0.6, 0.2, 10), 1.0, 1.16, PAL.walnutD, { top: c, bias: 0.04 });
    box(5.1, 16.9, 5.6, 17.6, 0, 0.85, PAL.walnut, { top: PAL.walnutL }); pot(12.1, 17.5, 0.24, 0.42);
    note(8.8, 14.8, 1.2, 0.45); note(8, 14.2, 1.2, 0.95);
  });
  // ---- class 5: piano and voice (x 14.6..19.3, y 10..16.5)
  at(14.6, -1.0, () => {
    flat(rect(1.5, 12.5, 4.35, 15.9), PAL.tealD); flat(rect(1.7, 12.7, 4.15, 15.7), PAL.rugB); flat(rect(1.9, 12.9, 3.95, 15.5), PAL.teal);
    box(0.15, 13, 0.8, 15, 0, 1.18, '#2e2925', { top: '#4b4640', decals: [{ edge: 1, pts: [[0.08, 0.72], [1.92, 0.72], [1.92, 1.1], [0.08, 1.1]], color: '#3b3530' }] });
    box(0.8, 13.08, 1.14, 14.92, 0.6, 0.68, PAL.ivory, { bias: 0.04, shadow: false });
    for (let i = 0; i < 11; i++) slab(rect(0.82, 13.16 + i * 0.16, 1.02, 13.25 + i * 0.16), 0.685, PAL.ink, { x: 0.97, y: 14, bias: 0.08 });
    box(1.5, 13.7, 1.95, 14.3, 0, 0.42, PAL.walnut, { top: PAL.rug }); sit(1.72, 14, PAL.teal, SK[0], { h: 0.9, collar: PAL.brassL, pose: 'fwd' });
    pawn(3.1, 13.5, { color: PAL.terra, head: SK[1], h: 0.86, collar: PAL.ivory }); pawn(3.75, 14.35, { color: PAL.brass, head: SK[2], h: 0.92, collar: PAL.ivory }); pawn(3.05, 15.2, { color: PAL.tealL, head: SK[3], h: 0.8 });
    sprite(2.5, 14.5, 0, STAND);
    pot(4.2, 16.9, 0.24, 0.44);
    note(1.4, 14, 1.4, 0.3); note(3.4, 14.3, 1.3, 0.8);
  });

  // ---- home practice corner, east of the academy along the boulevard
  at(5.6, 2.1, () => {
    const HX0 = 27, HY0 = 6.5, HX1 = 32.6, HY1 = 11.6;
    flat(rect(HX0 - 0.6, HY0 - 0.6, HX1 + 0.5, HY1 + 0.4), mix(PAL.ground, '#ffffff', 0.25), { on: 'ground' });
    flat(rect(HX0, HY0, HX1, HY1), PAL.wood, { on: 'ground' });
    for (let i = 1; i < 8; i++) line([[HX0, HY0 + i * 0.64], [HX1, HY0 + i * 0.64]], PAL.woodD, 0.035);
    wall(HX0 - T / 2, HY0 - T / 2, HX1, HY0 - T / 2, 1.85, { back: true, seg: 1.4, top: PAL.ivory, decal: (i, len) => i === 1 || i === 2 ? [
      { pts: [[0.12, 0.62], [len - 0.12, 0.62], [len - 0.12, 1.6], [0.12, 1.6]], color: PAL.walnut }, { pts: [[0.2, 0.7], [len - 0.2, 0.7], [len - 0.2, 1.52], [0.2, 1.52]], color: PAL.glow },
      { pts: [[len / 2 - 0.03, 0.7], [len / 2 + 0.03, 0.7], [len / 2 + 0.03, 1.52], [len / 2 - 0.03, 1.52]], color: PAL.walnut }, { pts: [[0.2, 1.08], [len - 0.2, 1.08], [len - 0.2, 1.13], [0.2, 1.13]], color: PAL.walnut }]
      : i === 3 ? [{ pts: [[0.3, 0.85], [1.0, 0.85], [1.0, 1.45], [0.3, 1.45]], color: PAL.walnutD }, { pts: [[0.37, 0.92], [0.93, 0.92], [0.93, 1.38], [0.37, 1.38]], color: PAL.tealL }] : [] });
    wall(HX0 - T / 2, HY0, HX0 - T / 2, HY1, 1.85, { back: true, seg: 1.3, top: PAL.ivory, decal: (i, len) => i === 1 ? [{ pts: [[0.1, 1.0], [len - 0.1, 1.0], [len - 0.1, 1.07], [0.1, 1.07]], color: PAL.walnut }, { pts: [[0.25, 1.07], [0.5, 1.07], [0.5, 1.42], [0.25, 1.42]], color: PAL.teal }, { pts: [[0.55, 1.07], [0.72, 1.07], [0.72, 1.36], [0.55, 1.36]], color: PAL.terra }, { pts: [[0.8, 1.07], [1.05, 1.07], [1.05, 1.3], [0.8, 1.3]], color: PAL.brassL }] : [] });
    glowAt(30.4, 8.3, 3.2, 'home');
    flat(rect(28.4, 8.1, 31.9, 10.9), PAL.tealD); flat(rect(28.6, 8.3, 31.7, 10.7), PAL.rugB); flat(rect(28.8, 8.5, 31.5, 10.5), PAL.teal); flat(ngon(30.15, 9.5, 0.5, 8), PAL.rugB);
    box(27, 7.2, 27.9, 9.6, 0, 0.42, PAL.terra, { top: PAL.terraD }); box(27, 7.2, 27.28, 9.6, 0.42, 0.85, PAL.terraD, { bias: 0.02 }); box(27.3, 7.5, 27.85, 8.1, 0.42, 0.56, PAL.rugB, { bias: 0.03 });
    prism(ngon(31.9, 7.2, 0.05, 6), 0, 1.45, PAL.brass); cone(31.9, 7.2, 0.3, 0.52, PAL.ivory, { z0: 1.28 }); prism(ngon(31.9, 7.2, 0.2, 8), 0, 0.05, PAL.brass, { shadow: false });
    pot(28.6, 7.1, 0.27, 0.48);
    stool(29.2, 9.3);
    sprite(30.6, 9.9, 0, STAND);
    box(31.5, 9.6, 32.2, 10.3, 0, 0.5, PAL.walnut, { top: PAL.walnutL }); box(31.62, 9.75, 32.05, 10.1, 0.5, 0.53, PAL.tealD, { bias: 0.04 });
  });
  S.homeSeat = [34.8, 11.4];
  // lanterns, shrubs and trees along the boulevard and around the house
  for (const [lx, ly] of [[23.4, 17.25], [28.6, 17.25], [33.6, 17.25]]) { prism(ngon(lx, ly, 0.06, 6), 0, 0.75, PAL.walnutD); box(lx - 0.14, ly - 0.14, lx + 0.14, ly + 0.14, 0.75, 1.02, PAL.glow, { bias: 0.02, top: PAL.brass }); glowAt(lx, ly, 1.3, 'way'); }
  for (const [bx, by, r] of [[32.4, 15.5, 0.6], [33.5, 4.4, 0.7], [37.4, 2.6, 0.75], [39.9, 12.4, 0.6], [-4.2, 4, 0.7], [-4, 11.5, 0.6], [4, 25.1, 0.7], [13, 25.4, 0.6], [22.5, 25.2, 0.75], [31, 25.5, 0.6], [38.5, 25.2, 0.7]]) ball(bx, by, r * 0.8, r, PAL.leaf);
  for (const [tx, ty, r, h] of [[35.6, 4.8, 0.55, 3], [39.4, 5.6, 0.5, 2.7], [40.6, 13.8, 0.5, 2.6], [8.5, 25.6, 0.5, 2.5], [27, 25.8, 0.5, 2.6], [-3.6, 14.6, 0.5, 2.6]]) cone(tx, ty, r, h, PAL.cypress);

  // ---- people who move (time-driven; they stand still in the static pictures)
  S.walkers.push(
    { pts: [[5.4, 8.3], [10.4, 8.2], [10.5, 12.9], [5.6, 13]], loop: true, speed: 0.55, phase: 0.1, pawn: { color: PAL.cypress, head: SK[0], collar: PAL.brassL, h: 0.92 }, carry: true },
    { pts: [[13, 1.6], [13, 15.2]], speed: 0.42, phase: 0.55, pawn: { color: PAL.walnut, head: SK[2], collar: PAL.ivory, h: 1.0 } },
    { pts: [[6.3, 4.3], [4.7, 6.4], [3.3, 7.9], [4.6, 10.3]], speed: 0.5, phase: 0.3, pawn: { color: PAL.ivory, head: SK[3], collar: PAL.terra, h: 0.95, pose: 'tray' } },
    { pts: [[31, PAVE], [9.4, PAVE], [8.5, 16.5], [9.6, 12.6], [12.6, 7.6]], speed: 0.6, phase: 0.75, pawn: { color: PAL.terraD, head: SK[1], h: 0.8 }, carry: true },
    { pts: [[16.6, 8.5], [22.3, 8.3], [20.6, 12.6]], speed: 0.4, phase: 0.2, pawn: { color: PAL.brass, head: SK[4], h: 0.8 } });
  // warm light that comes up room by room at the start: [x, y, radius, when]
  S.lights = [[6, 10, 6.4, 0], [7.8, 2.8, 3.6, 0.1], [19, 7.6, 4.2, 0.2], [17.3, 2.6, 3.6, 0.35], [21.7, 2.6, 2.6, 0.4], [26.7, 2.6, 3.6, 0.45], [26.7, 7.4, 3.4, 0.5], [26, 13.1, 3.8, 0.55], [17, 13.2, 3.4, 0.6]];
  // everything the bird is tied to at the end: café, courtyard tables, secretary, the five classes, studio, home
  S.nodes = [[7.8, 3.9], [3, 10.2], [16.4, 7.0], [17.3, 2.9], [21.7, 3.0], [26.2, 3.0], [26.7, 7.5], [26, 13.1], [17, 13.3], [35.3, 11.3]];
  S.rooms = { court: [6.2, 15.1], cafe: [7.8, 4.7], porch: [13, 11.6], hall: [20.4, 8.6], reception: [16.3, 7.2], c1: [17.3, 2.6], c2: [21.7, 2.6], classes: [19.4, 2.6], studio: [26.7, 2.9], c3: [26.7, 7.5], c4: [26, 14.9], c5: [17, 15.4], street: [15, 21.3], home: [35.4, 12.6] };
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
  arrive: [[8.5, 19.4], [8.5, 15.3]],                                                             // off the boulevard, through the courtyard gate
  toReception: [[8.5, 15.3], [10.2, 12.4], [11.9, 7.7], [14.6, 7.6], [16.4, 7.3]],                // across the courtyard and the veranda to the secretary's desk
  toClass: [[16.4, 7.3], [18.6, 7.3], [19.2, 5.7], [19.2, 4.5], [18.45, 3.35]],                   // into class 1
  toHome: [[18.45, 3.35], [19.2, 4.5], [19.2, 6], [20.6, 9.4], [20.6, 18.2], [35.5, 18.2], [35.5, 14.2], [34.8, 11.4]],   // out by entrance 1, along the boulevard, home
  admin: [[16.4, 7.3], [18.5, 8.3], [20.2, 7.4], [19, 6.1], [17.35, 6.32]],                       // the request on its way to be reviewed
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
  { p: 0, at: [8.5, 17.8, 2.4], air: 1 },                                     // arriving over the courtyard gate
  { p: 0.42, at: [3.7, 11.6, 0.56] }, { p: 0.6, at: [3.7, 11.6, 0.56] },      // a café table in the courtyard
  { p: 0.86, at: [17.3, 6.32, 0.78], flip: true }, { p: 1.54, at: [17.3, 6.32, 0.78], flip: true },   // the secretary's desk in the hall
  { p: 1.84, at: [19.25, 0.25, 0.95], flip: true }, { p: 2.08, at: [19.25, 0.25, 0.95], flip: true }, // shelf in the guitar class
  { p: 2.24, at: [23.4, 3.6, 2.3], air: 1 },                                                         // gliding over the other classes
  { p: 2.36, at: [24.9, 1.67, 1.28] }, { p: 2.48, at: [24.9, 1.67, 1.28] },                          // on the studio screen
  { p: 2.68, follow: [0.55, -0.5, 1.7], air: 1 }, { p: 2.92, follow: [0.55, -0.5, 1.7], air: 1 },    // flying home with the learner
  { p: 3.04, at: [36.2, 12, 1.36], flip: true }, { p: 3.52, at: [36.2, 12, 1.36], flip: true },     // on the music stand at home
  { p: 3.92, at: [29, 9.6, 5], air: 1 }, { p: 4.4, at: [24.6, 8.6, 5.4], air: 1 },                 // riding the sound back to class
  { p: 4.84, at: [19.5, -4.6, 4.2], air: 1 }, { p: 5, at: [19.5, -4.6, 4.2], air: 1 },             // above everything, holding it together
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
  { p: 0, tx: 15.2, ty: 10.4, w: 39.5, h: 27.5, e: 90, a: 0, dim: 0, m: { tx: 15, ty: 10.2, w: 34.6, h: 27 } },
  { p: 0.4, tx: 6.2, ty: 9.4, w: 17.5, h: 14.5, e: 55, a: 32, dim: 0, m: { tx: 4.6, ty: 10.4, w: 11.5, h: 11 } },
  { p: 0.6, tx: 6.2, ty: 9.4, w: 17.5, h: 14.5, e: 55, a: 32, dim: 0, m: { tx: 4.6, ty: 10.4, w: 11.5, h: 11 } },
  { p: 0.86, tx: 17.6, ty: 7.4, w: 12, h: 9, e: 50, a: 34, dim: 0.3, m: { tx: 17, ty: 7.2, w: 9.5, h: 7.4 } },
  { p: 1.12, tx: 17.6, ty: 7.4, w: 12, h: 9, e: 50, a: 34, dim: 0.3, m: { tx: 17, ty: 7.2, w: 9.5, h: 7.4 } },
  { p: 1.36, tx: 18.9, ty: 8, w: 13.5, h: 10, e: 52, a: 31, dim: 0.24, m: { tx: 18.2, ty: 7.7, w: 10.5, h: 8.4 } },
  { p: 1.54, tx: 18.9, ty: 8, w: 13.5, h: 10, e: 52, a: 31, dim: 0.24, m: { tx: 18.2, ty: 7.7, w: 10.5, h: 8.4 } },
  { p: 1.84, tx: 17.5, ty: 2.9, w: 9.2, h: 7, e: 48, a: 36, dim: 0.32, m: { w: 7.6, h: 6 } },
  { p: 2.08, tx: 17.5, ty: 2.9, w: 9.2, h: 7, e: 48, a: 36, dim: 0.32, m: { w: 7.6, h: 6 } },
  { p: 2.24, tx: 23, ty: 4.8, w: 16, h: 10.5, e: 52, a: 30, dim: 0.12, m: { w: 12, h: 8.6 } },       // over the classes
  { p: 2.36, tx: 26.5, ty: 2.9, w: 10, h: 7.2, e: 50, a: 30, dim: 0.3, m: { w: 8, h: 6.4 } },        // the studio
  { p: 2.48, tx: 26.5, ty: 2.9, w: 10, h: 7.2, e: 50, a: 30, dim: 0.3, m: { w: 8, h: 6.4 } },
  { p: 2.68, rel: [-0.4, 0.5], w: 15, h: 10.5, e: 52, a: 33, dim: 0.14, m: { w: 11.5, h: 8.6 } },
  { p: 2.92, rel: [-0.4, 0.5], w: 16, h: 11, e: 54, a: 31, dim: 0.14, m: { w: 12, h: 8.8 } },
  { p: 3.04, tx: 35.5, ty: 11.1, w: 10, h: 7.6, e: 48, a: 34, dim: 0.32, m: { w: 8.2, h: 6.4 } },
  { p: 3.52, tx: 35.5, ty: 11.1, w: 10, h: 7.6, e: 48, a: 34, dim: 0.32, m: { w: 8.2, h: 6.4 } },
  { p: 3.92, tx: 20.6, ty: 11, w: 43, h: 25, e: 56, a: 30, dim: 0, m: { w: 41, h: 25 } },
  { p: 4.4, tx: 20.4, ty: 11, w: 43, h: 25, e: 56, a: 30, dim: 0, m: { w: 41, h: 25 } },
  { p: 4.84, tx: 19.6, ty: 9, w: 46, h: 33, e: 68, a: 14, dim: 0, m: { tx: 19.6, ty: 8.8, w: 44.5, h: 36 } },   // the view rises
  { p: 5, tx: 19.6, ty: 9, w: 46, h: 33, e: 68, a: 14, dim: 0, m: { tx: 19.6, ty: 8.8, w: 44.5, h: 36 } },
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
    back: ss((p - 3.85) / 0.45), home: ss((p - 2.8) / 0.25), student: studentAt(p), withGuitar: true,
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
  for (const L of S.lights) pool(L[0], L[1], L[2], 0.52 * ss((rv - L[3]) / 0.35));
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
  dyn.push({ k: 'pawn', x: stu[0], y: stu[1], h: 0.86, color: PAL.terra, head: '#f0d2ad', collar: PAL.ivory, seed: 3, step: st.moving ? st.stride : null, seat: st.seated, play: st.seated && st.withGuitar ? 'guitar' : null, carry: !st.seated && st.withGuitar });
  for (const w of walk) dyn.push(w);
  const keyOf = o => o.k === 'prism' ? (() => { let x = 0, y = 0; for (const p of o.pts) { x += p[0]; y += p[1]; } return D(x / o.pts.length, y / o.pts.length, (o.z0 + o.z1) / 2); })()
    : o.k === 'ball' ? D(o.x, o.y, o.z) : o.k === 'flat' ? D(o.x, o.y, o.z) : o.k === 'cone' ? D(o.x, o.y, o.z0 + o.h * 0.35) : o.k === 'pawn' ? D(o.x, o.y, 0.6) : D(o.x, o.y, o.z + 0.5);
  const draw = o => DRAW[o.k](g, o, api, cam, sa, ca);
  const backs = S.back.filter(seen).map(o => [keyOf(o), o]).sort((u, v) => u[0] - v[0]); for (const b of backs) draw(b[1]);
  const all = S.solids.filter(seen).concat(dyn).map(o => [keyOf(o) + (o.bias || 0), o]).sort((u, v) => u[0] - v[0]); for (const b of all) draw(b[1]);

  // ---- ambient life (time-driven; frozen at time 0 in the static pictures)
  for (let i = 0; i < 2; i++) { const u = (sec * 0.22 + i * 0.5) % 1, ring = ngon(S.pond[0], S.pond[1], 0.22 + u * 0.9, 18); ring.push(ring[0]);   // ripples on the pool
    g.line(flatPts(ring, 0.32), '#e8fbf6', Math.max(1, 0.03 * s), { alpha: 0.6 * (1 - u) }); }
  for (const [i, n] of S.notes.entries()) { // notes drifting up from the rooms where music is being made
    const u = (sec * 0.16 + n[3]) % 1, q = P(n[0] + Math.sin(u * 6.3 + i) * 0.16, n[1], n[2] + u * 1.5), al = Math.sin(Math.PI * u) * 0.85, r = Math.max(2.2, 0.085 * s);
    if (al < 0.05) continue; const col = i % 2 ? PAL.brass : PAL.teal;
    g.line([q[0] + r * 0.85, q[1], q[0] + r * 0.85, q[1] - r * 2.7, q[0] + r * 2, q[1] - r * 2.1], col, Math.max(1, r * 0.34), { alpha: al, cap: 'round' }); g.ellipse(q[0], q[1], r, r * 0.78, rgba(col, al.toFixed(2))); }
  for (const [i, c] of S.steam.entries()) { const u = (sec * 0.3 + i * 0.37) % 1, q = [];   // steam over the coffee
    for (let k = 0; k <= 6; k++) { const v = k / 6, w = P(c[0], c[1], c[2] + (u * 0.5 + v * 0.42)); q.push(w[0] + Math.sin(v * 5 + sec * 2 + i) * 0.05 * s, w[1]); }
    g.line(q, '#ffffff', Math.max(1, 0.035 * s), { alpha: 0.5 * Math.sin(Math.PI * u), cap: 'round' }); }
  for (const [i, c] of S.smoke.entries()) for (let j = 0; j < 2; j++) { const u = (sec * 0.2 + i * 0.3 + j * 0.5) % 1, q = [];        // a thin thread of smoke
    for (let k = 0; k <= 7; k++) { const v = k / 7, w = P(c[0], c[1], c[2] + (u * 0.7 + v * 0.5)); q.push(w[0] + (c[3] + Math.sin(v * 4 + sec * 1.4 + j * 2) * (0.03 + 0.09 * (u + v * 0.4))) * s, w[1]); }
    g.line(q, '#f3f0ea', Math.max(1, (0.03 + 0.03 * u) * s), { alpha: 0.55 * Math.sin(Math.PI * u), cap: 'round' }); }
  if (S.rec) { const q = P(S.rec[0], S.rec[1], S.rec[2]), on = time ? 0.5 + 0.5 * Math.sin(sec * 4) : 1; g.glow(q[0], q[1], 0.45 * s, 0.45 * s, '#ff5a48', 0.25 + 0.5 * on); }
  if (st.trail) for (const t of st.trail) { const q = P(t[0], t[1], t[2]), r = Math.max(2, t[3] * 0.2 * s); g.glow(q[0], q[1], r * 2.4, r * 2.4, PAL.glow, 0.55 * t[3]); g.ellipse(q[0], q[1], r * 0.4, r * 0.4, rgba('#fff8e4', (0.9 * t[3]).toFixed(2))); }
  // lesson: a small sound wave from teacher to student
  if (st.lesson > 0.01) { const A = P(S.teacher[0] + 0.25, S.teacher[1] + 0.05, 1.0), B = P(stu[0] - 0.1, stu[1], 0.95), q = [], n = 26;
    for (let i = 0; i <= n * st.lesson; i++) { const t = i / n, env = Math.sin(Math.PI * t); q.push(lerp(A[0], B[0], t), lerp(A[1], B[1], t) + Math.sin(t * 16 - time * 0.006) * env * 0.16 * s); }
    if (q.length >= 4) { g.line(q, PAL.glow, Math.max(3, 0.2 * s), { alpha: 0.35, cap: 'round' }); g.line(q, PAL.brassL, Math.max(1.4, 0.06 * s), { cap: 'round' }); } }
  // feedback: an arc of sound from home back to the teacher
  if (st.back > 0.01) { const q = [], n = 70, A0 = [S.homeSeat[0], S.homeSeat[1], 1.2], B0 = [S.teacher[0], S.teacher[1], 1.3];
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
  const style = h % 7, f = (o.kid ? 0.74 : o.h < 0.75 ? 0.78 : o.h < 0.9 ? 0.92 : 1) * 1.12;   // 0,3,4: short hair · 1: long · 2: bun · 5,6: headscarf
  return (o._d = { f, style, hair: HAIR[(h >>> 3) % HAIR.length], legs: LEGS[(h >>> 6) % LEGS.length], shoe: (h >>> 9) % 2 ? '#2e2925' : '#6d4731', scarf: style >= 5 ? SCARF[(h >>> 11) % SCARF.length] : null, tall: (o.seat ? 1.2 : 1.52) * f });
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
  // A small person, drawn with rounded limbs. Standing, walking (o.step) or seated (o.seat); o.play 'guitar' holds a
  // guitar across the lap; o.carry wears one on the back; o.pose: 'fwd' (hands on a desk or drum), 'cup', 'smoke', 'tray'.
  // Seen from straight above it is shoulders and a head.
  pawn(g, o, { P, s, se, ce }) {
    const d = dress(o), f = d.f, b = P(o.x, o.y, 0), k = s * f, kz = k * ce, skin = o.head || '#e6c6a0', shirt = o.color;
    if (ce < 0.16) { g.ellipse(b[0], b[1], 0.2 * k, 0.125 * k, shirt); g.ellipse(b[0], b[1], 0.115 * k, 0.115 * k, d.scarf || d.hair); return; }
    const q = (u, v, fw = 0) => [b[0] + u * k, b[1] - v * kz + fw * k * se];
    const poly = (pts, c) => { const t = []; for (const w of pts) { const c2 = q(w[0], w[1], w[2]); t.push(c2[0], c2[1]); } g.poly(t, c); };
    const limb = (pts, w, c) => { const t = []; for (const w2 of pts) { const c2 = q(w2[0], w2[1], w2[2]); t.push(c2[0], c2[1]); } g.line(t, c, Math.max(1, w * k), { cap: 'round' }); };
    const dot = (u, v, r, c, fw = 0, ry = r) => { const c2 = q(u, v, fw); g.ellipse(c2[0], c2[1], r * k, ry * k, c); };
    const far = k < 12.5;
    const seat = !!o.seat, guitar = seat && o.play === 'guitar', pose = guitar ? 'guitar' : o.pose, sw = o.step != null ? Math.sin(o.step) : 0;
    const hip = seat ? 0.37 : 0.74, sh = hip + 0.45, hd = sh + 0.21;
    const lit = mix(shirt, '#ffffff', 0.16), dark = shade(shirt, 0.8), legD = shade(d.legs, 0.82);
    const body = g.lin(b[0] - 0.2 * k, 0, b[0] + 0.2 * k, 0, [[0, mix(shirt, '#ffffff', 0.2)], [0.55, shirt], [1, shade(shirt, 0.76)]]);
    // ---- behind the body: long hair, a guitar bag on the back
    if (d.style === 1) limb([[0, hd + 0.02], [0, sh - 0.1]], 0.3, d.hair);
    if (o.carry && !seat) { const bag = '#34403f';
      limb([[0.05, sh - 0.12], [-0.17, sh + 0.36]], 0.1, bag); limb([[-0.17, sh + 0.36], [-0.2, sh + 0.44]], 0.13, bag);
      dot(0.1, hip + 0.2, 0.2, bag, 0, 0.24 * ce + 0.02); dot(0.04, hip + 0.42, 0.16, bag, 0, 0.19 * ce + 0.02); }
    // ---- legs
    const thigh = mix(d.legs, '#ffffff', 0.13);
    if (seat) { for (const m of [-1, 1]) {                                                                 // shins drop to the floor from knees that come forward and apart
        limb([[m * 0.135, hip + 0.015, 0.25], [m * 0.1, 0.085, 0.27]], 0.11, m < 0 ? shade(d.legs, 0.9) : shade(d.legs, 0.74));
        limb([[m * 0.1, 0.04, 0.27], [m * 0.115, 0.04, 0.35]], 0.085, d.shoe); } }
    else for (const m of [-1, 1]) { const a = sw * m * 0.14, lift = Math.max(0, sw * m) * 0.06, c = m < 0 ? d.legs : legD;   // legs swing when walking
      limb([[m * 0.075, hip, 0], [m * 0.082, hip * 0.5 + lift * 0.7, a * 0.55 + lift * 0.6], [m * 0.085, 0.09 + lift, a]], 0.125, c);
      if (!far) limb([[m * 0.085, 0.045 + lift, a], [m * 0.092, 0.045 + lift, a + 0.075]], 0.085, d.shoe); }
    // ---- body
    if (d.scarf && !seat) poly([[-0.16, hip + 0.1], [0.16, hip + 0.1], [0.185, hip - 0.24], [-0.185, hip - 0.24]], body);      // a longer coat
    poly([[-0.15, hip - 0.03], [0.15, hip - 0.03], [0.185, sh - 0.07], [0.12, sh + 0.02], [-0.12, sh + 0.02], [-0.185, sh - 0.07]], body);
    if (!far) dot(-0.135, sh - 0.045, 0.066, mix(shirt, '#ffffff', 0.18), 0, 0.066 * ce + 0.012); if (!far) dot(0.135, sh - 0.045, 0.066, shade(shirt, 0.79), 0, 0.066 * ce + 0.012);
    if (seat) for (const m of [-1, 1]) limb([[m * 0.08, hip + 0.01, 0.02], [m * 0.135, hip + 0.02, 0.25]], 0.135, m < 0 ? thigh : mix(d.legs, '#ffffff', 0.04));   // thighs: lit from above, over the hem of the shirt
    if (o.carry && !seat) limb([[-0.12, sh], [0.13, hip + 0.1]], 0.035, '#232b2a');
    if (o.collar) poly([[-0.07, sh + 0.035], [0.07, sh + 0.035], [0, sh - 0.075]], o.collar);
    // ---- what the hands hold, then the arms
    const arm = (m, el, hand, c) => { limb([[m * 0.185, sh - 0.05, 0], el, hand], 0.088, c || (m < 0 ? lit : dark)); if (!far) dot(hand[0], hand[1], 0.046, skin, hand[2]); };
    if (pose === 'guitar') { const W = PAL.wood, rim = PAL.walnut, fw = 0.25, v0 = hip + 0.14, ey = ce * 0.75 + 0.2;
      limb([[0.18, v0 + 0.06, fw], [0.53, v0 + 0.25, fw]], 0.05, PAL.walnutD); limb([[0.53, v0 + 0.25, fw], [0.6, v0 + 0.29, fw]], 0.075, PAL.walnutD);   // neck and head
      dot(-0.04, v0, 0.19, rim, fw, 0.165 * ey); dot(0.12, v0 + 0.045, 0.145, rim, fw, 0.13 * ey);
      dot(-0.04, v0, 0.165, W, fw, 0.14 * ey); dot(0.12, v0 + 0.045, 0.12, W, fw, 0.105 * ey);
      dot(0.03, v0 + 0.02, 0.05, PAL.walnutD, fw, 0.045 * ey); limb([[-0.12, v0 - 0.02, fw], [-0.1, v0 - 0.06, fw]], 0.03, PAL.walnutD);
      const a = q(-0.11, v0 - 0.04, fw), e2 = q(0.56, v0 + 0.27, fw); g.line([a[0], a[1], e2[0], e2[1]], PAL.brassL, Math.max(0.6, 0.012 * k), { alpha: 0.9 });
      arm(1, [0.3, hip + 0.16, 0.12], [0.4, v0 + 0.18, fw + 0.02]); arm(-1, [-0.29, hip + 0.3, 0.12], [-0.02, v0 + 0.03, fw + 0.03]);
    } else if (pose === 'smoke') {
      arm(1, [0.24, hip + 0.2, 0.08], [0.12, hip + 0.07, 0.24]);
      const hx = -0.2, hy = sh + 0.1; limb([[hx - 0.01, hy + 0.01, 0.1], [hx - 0.1, hy + 0.045, 0.1]], 0.02, '#fbf5e8'); dot(hx - 0.105, hy + 0.047, 0.014, '#e8743a', 0.1);
      arm(-1, [-0.3, hip + 0.16, 0.1], [hx, hy, 0.1]);
    } else if (pose === 'cup') {
      arm(1, [0.24, hip + 0.2, 0.08], [0.12, hip + 0.07, 0.24]); dot(-0.13, sh - 0.12, 0.045, '#fbf5e8', 0.14, 0.05); arm(-1, [-0.28, hip + 0.14, 0.1], [-0.13, sh - 0.16, 0.14]);
    } else if (pose === 'tray') {
      arm(1, [0.24, sh - 0.27, -sw * 0.06], [0.225, hip + 0.02, -sw * 0.1 + 0.03]);
      dot(-0.3, sh - 0.06, 0.15, PAL.brassL, 0.12, 0.05); dot(-0.34, sh - 0.01, 0.035, '#fbf5e8', 0.12, 0.04); dot(-0.26, sh - 0.01, 0.035, '#fbf5e8', 0.12, 0.04); arm(-1, [-0.27, sh - 0.3, 0.06], [-0.3, sh - 0.09, 0.12]);
    } else if (pose === 'fwd') { for (const m of [-1, 1]) arm(m, [m * 0.25, hip + 0.19, 0.1], [m * 0.13, hip + 0.17, 0.36]);
    } else if (seat) { for (const m of [-1, 1]) arm(m, [m * 0.25, hip + 0.2, 0.07], [m * 0.125, hip + 0.085, 0.2]);
    } else for (const m of [-1, 1]) { const a = -sw * m * 0.13; arm(m, [m * 0.235, sh - 0.27, a * 0.5], [m * 0.225, hip + 0.02, a + 0.03]); }
    // ---- neck, head, hair
    if (!far) limb([[0, sh - 0.01], [0, sh + 0.085]], 0.085, shade(skin, 0.88));
    const hc = q(0, hd), r = 0.128 * k, eyes = () => { if (r < 5.2) return; const er = Math.max(0.8, r * 0.085); g.ellipse(hc[0] - r * 0.3, hc[1] + r * 0.34, er, er * 1.15, '#3a2a1e'); g.ellipse(hc[0] + r * 0.3, hc[1] + r * 0.34, er, er * 1.15, '#3a2a1e');
      if (r > 9) { g.ellipse(hc[0] - r * 0.47, hc[1] + r * 0.58, r * 0.13, r * 0.09, 'rgba(214,120,96,0.28)'); g.ellipse(hc[0] + r * 0.47, hc[1] + r * 0.58, r * 0.13, r * 0.09, 'rgba(214,120,96,0.28)');
        g.line([hc[0] - r * 0.15, hc[1] + r * 0.66, hc[0], hc[1] + r * 0.72, hc[0] + r * 0.15, hc[1] + r * 0.66], shade(skin, 0.66), Math.max(0.8, r * 0.06), { cap: 'round' }); } };
    const face = g.rad(hc[0] - r * 0.2, hc[1], r, [[0, mix(skin, '#ffffff', 0.22)], [1, skin]]);
    if (d.scarf) { poly([[-0.14, hd], [0.14, hd], [0.19, sh - 0.05], [-0.19, sh - 0.05]], d.scarf); g.ellipse(hc[0], hc[1], r * 1.12, r * 1.12, d.scarf); g.ellipse(hc[0], hc[1] + r * 0.2, r * 0.72, r * 0.78, face); eyes(); return; }
    g.ellipse(hc[0], hc[1] - r * 0.06, r * 1.05, r * 1.05, d.hair);
    if (d.style === 2) g.ellipse(hc[0], hc[1] - r * 1.08, r * 0.46, r * 0.46, d.hair);                                                // a bun
    g.ellipse(hc[0], hc[1] + r * 0.2, r * 0.8, r * 0.82, face);
    g.ellipse(hc[0] + (d.style % 2 ? 0.16 : -0.16) * r, hc[1] - r * 0.52, r * 0.86, r * 0.36, d.hair);                                // the fringe, parted to one side
    eyes();
  },
  sprite(g, o, { P, s, ce }) { const c = P(o.x, o.y, o.z), k = Math.max(ce, 0.0);
    if (k < 0.08) return;
    for (const sh of o.shapes) { if (sh.ell) g.ellipse(c[0] + sh.ell[0] * s, c[1] - sh.ell[1] * s * k, sh.ell[2] * s, sh.ell[3] * s * k, sh.color);
      else { const pts = []; for (const [u, v] of sh.pts) pts.push(c[0] + u * s, c[1] - v * s * k); g.poly(pts, sh.color); } } },
};
