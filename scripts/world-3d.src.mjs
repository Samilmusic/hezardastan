// جهانِ هزارآوا — the 3D view (WebGL). The same scene model that the flat drawing uses (dist/world/scene.mjs) is
// turned into real geometry: walls, furniture and trees with light and cast shadows, a perspective camera, and
// small figures for the people. Bundled with Three.js into dist/world/view3d.mjs by scripts/build-world-3d.mjs.
// No network, no storage, no camera or microphone.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PAL, mix, dress, walkersAt, studentAt } from './scene.mjs';

const V3 = THREE.Vector3, UP = new V3(0, 1, 0), IDQ = new THREE.Quaternion(), ONE = new V3(1, 1, 1);
const colorOf = (() => { const m = new Map(); return h => { let c = m.get(h); if (!c) { c = new THREE.Color(h); m.set(h, c); } return c; }; })();
const SPH = new THREE.SphereGeometry(1, 10, 7), SPHS = new THREE.SphereGeometry(1, 7, 5);

/** Triangles with a colour per vertex, collected for one material. */
class Bucket {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, n, col) { // winding follows the normal
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    if ((uy * vz - uz * vy) * n.x + (uz * vx - ux * vz) * n.y + (ux * vy - uy * vx) * n.z < 0) { const t = b; b = c; c = t; }
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); for (let i = 0; i < 3; i++) { this.n.push(n.x, n.y, n.z); this.c.push(col.r, col.g, col.b); }
  }
  fan(pts, n, hex) { const col = colorOf(hex); for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], n, col); }
  add(geo, m, hex, jitter = 0) { // a ready geometry, moved by a matrix
    const g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position, nor = g.attributes.normal, col = colorOf(hex), nm = new THREE.Matrix3().getNormalMatrix(m), v = new V3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      const k = jitter ? 1 + jitter * (Math.sin(v.x * 12.9 + v.y * 78.2 + v.z * 37.7) * 0.5) : 1; this.c.push(col.r * k, col.g * k, col.b * k);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
    }
    if (g !== geo) g.dispose();
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    this.p = this.n = this.c = null; return new THREE.Mesh(g, material);
  }
  get empty() { return !this.p.length; }
}
const W = (x, y, z = 0) => new V3(x, z, y);   // scene axes (x east, y south, z up) → three (x, up, south)

// ---------------------------------------------------------------- small figures
const capsule = (sink, a, b, r, hex, part) => { const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), len = Math.max(0.001, d.length());
  const geo = new THREE.CapsuleGeometry(r, len, 2, 7); sink(geo, new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), ONE), hex, part); geo.dispose(); };
const blob = (sink, c, r, hex, part, small) => sink(small ? SPHS : SPH, new THREE.Matrix4().compose(new V3(...c), IDQ, new V3(...r)), hex, part);
const disc = (sink, c, r, depth, hex, part, rb = r, sz = 1) => { const geo = new THREE.CylinderGeometry(r, rb, depth, 18); sink(geo, new THREE.Matrix4().compose(new V3(...c), new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2), new V3(1, 1, sz)), hex, part); geo.dispose(); };
const tube = (sink, c, rt, rb, h, hex, part, sz = 1) => { const geo = new THREE.CylinderGeometry(rt, rb, h, 12); sink(geo, new THREE.Matrix4().compose(new V3(...c), IDQ, new V3(1, 1, sz)), hex, part); geo.dispose(); };
const limb = (sink, pts, r, hex, part) => { for (let i = 1; i < pts.length; i++) capsule(sink, pts[i - 1], pts[i], r, hex, part); };

/**
 * One person in local space: feet on y = 0, facing +z, about 1.62 tall standing. sink(geometry, matrix, colour, part)
 * receives the pieces; part is 'core', 'legL', 'legR', 'armL' or 'armR' (so a walker's limbs can swing).
 * mode: 'stand' | 'seat'. o: the pawn from the scene (colour, head, play, pose, carry …).
 */
function figure(o, sink, mode) {
  const d = dress(o), skin = o.head || '#e6c6a0', shirt = o.color, seat = mode === 'seat', pose = seat && o.play === 'guitar' ? 'guitar' : o.pose;
  const drop = seat ? 0.33 : 0, hipY = seat ? 0.47 : 0.8, sh = 1.31 - drop, hd = 1.515 - drop, R = 0.06;
  // legs
  for (const m of [-1, 1]) { const part = m < 0 ? 'legR' : 'legL';
    if (seat) { limb(sink, [[m * 0.085, hipY, 0], [m * 0.1, hipY, 0.38], [m * 0.1, 0.08, 0.4]], R, d.legs, 'core'); blob(sink, [m * 0.1, 0.04, 0.45], [0.05, 0.04, 0.1], d.shoe, 'core', true); }
    else { limb(sink, [[m * 0.085, hipY, 0], [m * 0.09, 0.43, 0.01], [m * 0.09, 0.08, 0]], R, d.legs, part); blob(sink, [m * 0.09, 0.04, 0.05], [0.05, 0.04, 0.105], d.shoe, part, true); } }
  blob(sink, [0, hipY + 0.03, 0], [0.15, 0.1, 0.1], d.legs, 'core');
  // body
  tube(sink, [0, sh - 0.25, 0], 0.158, 0.132, 0.46, shirt, 'core', 0.64); capsule(sink, [-0.135, sh - 0.02, 0], [0.135, sh - 0.02, 0], 0.07, shirt, 'core');
  if (d.scarf && !seat) tube(sink, [0, hipY - 0.03, 0], 0.14, 0.17, 0.3, shirt, 'core', 0.66);                 // a longer coat
  if (o.collar) blob(sink, [0, sh + 0.03, 0.045], [0.06, 0.035, 0.03], o.collar, 'core', true);
  if (o.carry && !seat) { const bag = '#2b3534'; blob(sink, [0.02, sh - 0.33, -0.135], [0.15, 0.24, 0.065], bag, 'core'); blob(sink, [-0.02, sh - 0.02, -0.14], [0.11, 0.16, 0.06], bag, 'core'); capsule(sink, [-0.04, sh + 0.1, -0.14], [-0.1, sh + 0.36, -0.15], 0.045, bag, 'core'); capsule(sink, [-0.13, sh + 0.03, 0.05], [0.12, sh - 0.4, 0.075], 0.016, '#1d2423', 'core'); }
  // arms and what they hold
  const arm = (m, el, wr, part = 'core') => { limb(sink, [[m * 0.2, sh - 0.03, 0], el, wr], 0.042, shirt, part); blob(sink, wr, [0.045, 0.05, 0.045], skin, part, true); };
  if (pose === 'guitar') { const gz = 0.2, wood = PAL.wood;
    disc(sink, [-0.05, 0.6, gz], 0.19, 0.09, PAL.walnut); disc(sink, [0.12, 0.65, gz], 0.145, 0.09, PAL.walnut); disc(sink, [-0.05, 0.6, gz + 0.003], 0.175, 0.09, wood); disc(sink, [0.12, 0.65, gz + 0.003], 0.13, 0.09, wood);
    disc(sink, [0.035, 0.625, gz + 0.008], 0.045, 0.09, PAL.walnutD); capsule(sink, [0.2, 0.675, gz + 0.02], [0.52, 0.79, gz], 0.022, PAL.walnutD); capsule(sink, [0.52, 0.79, gz], [0.6, 0.82, gz], 0.032, PAL.walnutD);
    capsule(sink, [-0.14, 0.565, gz + 0.047], [-0.1, 0.56, gz + 0.047], 0.012, PAL.walnutD);
    arm(-1, [-0.27, 0.74, 0.1], [-0.03, 0.64, gz + 0.09]); arm(1, [0.3, 0.68, 0.1], [0.4, 0.76, gz + 0.05]);
  } else if (pose === 'smoke') { arm(1, [0.22, sh - 0.27, 0.06], [0.13, 0.53, 0.26]); arm(-1, [-0.27, sh - 0.25, 0.1], [-0.2, sh + 0.05, 0.16]);
    capsule(sink, [-0.2, sh + 0.07, 0.2], [-0.2, sh + 0.1, 0.27], 0.008, '#fbf5e8'); blob(sink, [-0.2, sh + 0.103, 0.278], [0.011, 0.011, 0.011], '#ff7a3c', 'glow', true);
  } else if (pose === 'cup') { arm(1, [0.22, sh - 0.27, 0.06], [0.13, 0.53, 0.26]); arm(-1, [-0.25, sh - 0.26, 0.12], [-0.14, sh - 0.1, 0.22]); tube(sink, [-0.14, sh - 0.05, 0.25], 0.035, 0.028, 0.07, '#fbf5e8', 'core');
  } else if (pose === 'fwd') { for (const m of [-1, 1]) arm(m, [m * 0.22, sh - 0.24, 0.1], [m * 0.14, sh - 0.33, 0.36]);
  } else if (seat) { for (const m of [-1, 1]) arm(m, [m * 0.22, sh - 0.27, 0.06], [m * 0.13, 0.53, 0.26]);
  } else for (const m of [-1, 1]) arm(m, [m * 0.225, sh - 0.3, 0], [m * 0.22, sh - 0.55, 0.03], m < 0 ? 'armR' : 'armL');
  // neck, head, hair
  tube(sink, [0, sh + 0.085, 0], 0.043, 0.048, 0.1, skin, 'core'); blob(sink, [0, hd, 0], [0.093, 0.113, 0.103], skin, 'core');
  if (d.scarf) { blob(sink, [0, hd + 0.012, -0.028], [0.108, 0.124, 0.112], d.scarf, 'core'); blob(sink, [0, sh + 0.05, -0.01], [0.165, 0.085, 0.105], d.scarf, 'core'); }
  else { blob(sink, [0, hd + 0.03, -0.022], [0.1, 0.1, 0.106], d.hair, 'core');
    if (d.style === 1) blob(sink, [0, hd - 0.1, -0.07], [0.1, 0.17, 0.06], d.hair, 'core'); if (d.style === 2) blob(sink, [0, hd + 0.135, -0.05], [0.05, 0.05, 0.05], d.hair, 'core', true); }
}
const figScale = o => 0.82 * (o.kid ? 0.72 : o.h < 0.75 ? 0.8 : o.h < 0.9 ? 0.92 : 1);
const yawOf = face => Math.PI / 2 - (face ?? Math.PI / 2);

// ---------------------------------------------------------------- the ground, painted once into a texture
const GX0 = -16, GX1 = 56, GY0 = -8, GY1 = 30;
function groundTexture(S, width, maxAniso) {
  const cv = document.createElement('canvas'), k = width / (GX1 - GX0); cv.width = width; cv.height = Math.round((GY1 - GY0) * k);
  const c = cv.getContext('2d'), X = x => (x - GX0) * k, Y = y => (y - GY0) * k;
  const fill = f => { c.globalAlpha = f.a ?? 1; c.beginPath(); f.pts.forEach((p, i) => i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))); c.closePath(); c.fillStyle = f.color; c.fill(); };
  for (const f of S.ground) fill(f); for (const f of S.deco) fill(f); c.globalAlpha = 1;
  for (const l of S.lines) { c.globalAlpha = l.a ?? 1; c.beginPath(); l.pts.forEach((p, i) => i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))); c.strokeStyle = l.color; c.lineWidth = Math.max(1, l.w * k); c.stroke(); }
  if (S.solids) { const q = 6, ao = document.createElement('canvas'); ao.width = Math.ceil(cv.width / q); ao.height = Math.ceil(cv.height / q); const a = ao.getContext('2d'); a.fillStyle = '#2b1a0a';
    for (const list of [S.back, S.solids]) for (const o of list) { if (o.k === 'prism' && o.z0 === 0 && o.z1 > 0.25) { a.beginPath(); o.pts.forEach((p, i) => i ? a.lineTo(X(p[0]) / q, Y(p[1]) / q) : a.moveTo(X(p[0]) / q, Y(p[1]) / q)); a.closePath(); a.fill(); } }
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; const r = 0.16 * k;
    for (const [dx, dy, al] of [[0, 0, 0.1], [r, 0, 0.055], [-r, 0, 0.055], [0, r, 0.055], [0, -r, 0.055], [r * 1.6, r * 1.6, 0.03], [-r * 1.6, r * 1.6, 0.03], [r * 1.6, -r * 1.6, 0.03], [-r * 1.6, -r * 1.6, 0.03]]) { c.globalAlpha = al; c.drawImage(ao, dx, dy, cv.width, cv.height); } }
  // a little grain, so floors read as material and not as flat colour
  c.globalAlpha = 1; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0, n = Math.round(cv.width * cv.height / 260); i < n; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(70,45,20,0.04)'; const r = 1 + rnd() * 1.3 * (width / 4096 + 0.4); c.fillRect(rnd() * cv.width, rnd() * cv.height, r, r); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}

/** Is WebGL worth trying here? */
export function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; } }

/**
 * create({ canvas, S, phone }) → { render(cam, view, st, time, dpr) → { P, s, smoke }, setQuality(level), dispose() }
 * cam: the story camera from scene.mjs (tx, ty, w, h, e, a); view: { W, H, cx, cy, fitW, fitH } in CSS pixels.
 */
export function create({ canvas, S, phone = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const BG = '#ece2cd'; renderer.setClearColor(BG, 1);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(BG, 100, 300);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5; pm.dispose();
  const camera = new THREE.PerspectiveCamera(24, 1, 1, 400);
  scene.add(new THREE.HemisphereLight('#eef3fb', '#a08a6c', 1.0));
  const sun = new THREE.DirectionalLight('#fff3e0', 3.0); sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ---- materials
  // surfaces get a fine grain and darken a little where they meet the floor, so they read as plaster, wood and cloth
  const grain = (m, amount = 0.07, base = 0.8) => { m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <color_fragment>', `#include <color_fragment>
      vec3 gp = floor(vWp * 26.0); float gn = fract(sin(dot(gp, vec3(12.9898, 78.233, 37.719))) * 43758.5453), gm = fract(sin(dot(floor(vWp * 5.0), vec3(39.346, 11.135, 83.155))) * 43758.5453);
      diffuseColor.rgb *= (1.0 - ${amount.toFixed(3)} + ${(amount * 1.4).toFixed(3)} * gn + ${(amount * 0.5).toFixed(3)} * gm) * mix(${base.toFixed(2)}, 1.0, smoothstep(0.0, 0.45, vWp.y));`); }; return m; };
  const matte = grain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }));
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.75 });
  const leafM = grain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 0.16, 0.9);
  const water = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.35, envMapIntensity: 1.6 });
  const glowM = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const cloth = grain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), 0.05, 0.86);
  const B = { matte: new Bucket(), metal: new Bucket(), leaf: new Bucket(), water: new Bucket(), glow: new Bucket(), cloth: new Bucket() };
  const kind = hex => hex === PAL.brass || hex === PAL.brassL ? 'metal' : hex === PAL.glow ? 'glow' : hex === PAL.water || hex === PAL.waterL ? 'water' : 'matte';
  const UPN = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);

  // ---- ground
  const maxTex = renderer.capabilities.maxTextureSize, texW = Math.min(maxTex, phone ? 2048 : 4096);
  const gtex = groundTexture(S, texW, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GX1 - GX0, GY1 - GY0), new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.94, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((GX0 + GX1) / 2, 0, (GY0 + GY1) / 2); ground.receiveShadow = true; scene.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: PAL.ground, roughness: 1 })); far.rotation.x = -Math.PI / 2; far.position.set(20, -0.02, 11); far.receiveShadow = true; scene.add(far);

  // ---- solids from the scene model
  const smoke = [];
  const addPrism = o => {
    const n = o.pts.length, b = B[kind(o.color)], col = colorOf(o.color);
    for (let i = 0; i < n; i++) { const p = o.pts[i], q = o.pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy); if (len < 1e-6) continue;
      const nx = dy / len, ny = -dx / len, N = new V3(nx, 0, ny), a0 = W(p[0], p[1], o.z0), a1 = W(q[0], q[1], o.z0), b1 = W(q[0], q[1], o.z1), b0 = W(p[0], p[1], o.z1);
      b.tri(a0, a1, b1, N, col); b.tri(a0, b1, b0, N, col);
      if (o.decals) { let layer = 0; for (const dcl of o.decals) if (dcl.edge === i) { layer++; const off = 0.004 * layer, pts = dcl.pts.map(([u, z]) => W(p[0] + dx / len * u + nx * off, p[1] + dy / len * u + ny * off, o.z0 + z)); B[kind(dcl.color)].fan(pts, N, dcl.color); } }
    }
    const top = o.top || mix(o.color, '#ffffff', 0.18); B[kind(top)].fan(o.pts.map(p => W(p[0], p[1], o.z1)), UPN, top);
    if (o.z0 > 0.02) b.fan(o.pts.map(p => W(p[0], p[1], o.z0)), DOWN, o.color);
  };
  const addSprite = o => { // flat shapes standing up, facing south; layers a hair apart
    let layer = 0; for (const sh of o.shapes) { const off = 0.006 * layer++, pts2 = sh.ell ? Array.from({ length: 18 }, (_, i) => [sh.ell[0] + Math.cos(i / 18 * 6.2832) * sh.ell[2], sh.ell[1] + Math.sin(i / 18 * 6.2832) * sh.ell[3]]) : sh.pts;
      const f = pts2.map(([u, v]) => W(o.x + u, o.y + 0.02 + off, o.z + v)), bk = pts2.map(([u, v]) => W(o.x + u, o.y - 0.02 - off, o.z + v));
      B[kind(sh.color)].fan(f, new V3(0, 0, 1), sh.color); B[kind(sh.color)].fan(bk, new V3(0, 0, -1), sh.color); } };
  const addBall = o => {
    if (o.color === PAL.leaf) { const g = new THREE.SphereGeometry(o.r, 18, 12), pos = g.attributes.position, v = new V3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = 1 + 0.1 * Math.sin(v.x * 9.1 / o.r * 0.5 + o.x * 3) * Math.cos(v.y * 8.3 / o.r * 0.5 + o.y) + 0.07 * Math.sin(v.z * 11.7 / o.r * 0.5 + v.x * 5 / o.r * 0.5) + 0.035 * Math.sin(v.x * 31 + v.y * 27 + v.z * 23); pos.setXYZ(i, v.x * k, v.y * k * 0.94, v.z * k); }
      g.computeVertexNormals(); B.leaf.add(g, new THREE.Matrix4().makeTranslation(o.x, o.z, o.y), '#5f8256', 0.28); g.dispose();
      if (o.dots) for (let i = 0; i < 9; i++) { const t = i * 2.4 + o.x, ph = 0.5 + (i % 3) * 0.45, r = o.r * 0.97; B.matte.add(SPHS, new THREE.Matrix4().compose(new V3(o.x + Math.cos(t) * Math.sin(ph) * r, o.z + Math.cos(ph) * r * 0.9, o.y + Math.sin(t) * Math.sin(ph) * r), IDQ, new V3(o.r * 0.1, o.r * 0.1, o.r * 0.1)), o.dots); }
    } else B[o.color === '#d2453a' ? 'glow' : kind(o.color)].add(SPH, new THREE.Matrix4().compose(new V3(o.x, o.z, o.y), IDQ, new V3(o.r, o.r, o.r)), o.color);
  };
  const addCone = o => { const tree = o.color === PAL.cypress, g = new THREE.ConeGeometry(o.r, o.h, tree ? 14 : 16, tree ? 7 : 1);
    if (tree) { const pos = g.attributes.position, v = new V3(); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = 1 + 0.12 * Math.sin(v.y * 9 + v.x * 13 + o.x) + 0.06 * Math.sin(v.y * 23 + v.z * 19); pos.setXYZ(i, v.x * k, v.y, v.z * k); } g.computeVertexNormals();
      B.leaf.add(g, new THREE.Matrix4().makeTranslation(o.x, o.z0 + o.h / 2 + 0.25, o.y), '#39604f', 0.25); const tr = new THREE.CylinderGeometry(0.07, 0.09, 0.4, 6); B.matte.add(tr, new THREE.Matrix4().makeTranslation(o.x, 0.2, o.y), PAL.walnutD); tr.dispose(); }
    else B.cloth.add(g, new THREE.Matrix4().makeTranslation(o.x, o.z0 + o.h / 2, o.y), o.color); g.dispose(); };
  const person = (o, mode, x, y, face) => { const sc = figScale(o), M = new THREE.Matrix4().compose(new V3(x, 0, y), new THREE.Quaternion().setFromAxisAngle(UP, yawOf(face)), new V3(sc, sc, sc));
    figure(o, (geo, m, hex, part) => B[part === 'glow' ? 'glow' : 'cloth'].add(geo, new THREE.Matrix4().multiplyMatrices(M, m), hex), mode);
    if (o.pose === 'smoke') { const tip = new V3(-0.2, 1.31 - 0.33 + 0.12, 0.29).applyMatrix4(M); smoke.push([tip.x, tip.z, tip.y, 0]); } };
  for (const list of [S.back, S.solids]) for (const o of list) {
    if (o.k === 'prism') addPrism(o); else if (o.k === 'flat') B[kind(o.color)].fan(o.pts.map(p => W(p[0], p[1], o.z + 0.002)), UPN, o.color);
    else if (o.k === 'ball') addBall(o); else if (o.k === 'cone') addCone(o); else if (o.k === 'sprite') addSprite(o); else if (o.k === 'pawn') person(o, o.seat ? 'seat' : 'stand', o.x, o.y, o.face);
  }
  const mats = { matte, metal, leaf: leafM, water, glow: glowM, cloth };
  for (const k in B) if (!B[k].empty) { const m = B[k].mesh(mats[k]); m.castShadow = k !== 'glow' && k !== 'water'; m.receiveShadow = k !== 'glow'; m.matrixAutoUpdate = false; scene.add(m); }
  // two small warm lights: the lamp at home and the lamp on the secretary's desk
  const lampA = new THREE.PointLight('#ffd9a0', 0, 7, 1.6); lampA.position.set(37.5, 1.5, 9.3); const lampB = new THREE.PointLight('#ffd9a0', 1.6, 3.5, 1.8); lampB.position.set(16.83, 1.25, 6.16); scene.add(lampA, lampB);

  // ---- people who move: the learner (walking with the guitar on the back, or seated and playing) and the strollers
  const mover = (o, mode) => { const parts = {}, grp = new THREE.Group(), sc = figScale(o);
    figure(o, (geo, m, hex, part = 'core') => { if (part === 'glow') part = 'core'; (parts[part] || (parts[part] = new Bucket())).add(geo, m, hex); }, mode);
    const out = { grp, limbs: {} };
    for (const k in parts) { const pivotY = k.startsWith('leg') ? 0.8 : k.startsWith('arm') ? 1.28 : 0, mesh = parts[k].mesh(cloth); mesh.castShadow = true; mesh.receiveShadow = true;
      if (pivotY) { mesh.geometry.translate(0, -pivotY, 0); const pv = new THREE.Group(); pv.position.y = pivotY; pv.add(mesh); grp.add(pv); out.limbs[k] = pv; } else grp.add(mesh); }
    grp.scale.setScalar(sc); scene.add(grp); return out; };
  const stuO = { h: 0.86, color: PAL.terra, head: '#f0d2ad', collar: PAL.ivory, seed: 3 };
  const stuWalk = mover({ ...stuO, carry: true }, 'stand'), stuSit = mover({ ...stuO, seat: true, play: 'guitar' }, 'seat');
  const strollers = walkersAt(S, 0).map(w => ({ m: mover(w, 'stand'), last: null, yaw: 0 }));
  let stuLast = null, stuYaw = 0;
  const swing = (m, step) => { const a = step == null ? 0 : Math.sin(step) * 0.5; if (m.limbs.legL) m.limbs.legL.rotation.x = a; if (m.limbs.legR) m.limbs.legR.rotation.x = -a; if (m.limbs.armL) m.limbs.armL.rotation.x = -a * 0.7; if (m.limbs.armR) m.limbs.armR.rotation.x = a * 0.7; };
  const turn = (cur, want) => { let dlt = want - cur; while (dlt > Math.PI) dlt -= 2 * Math.PI; while (dlt < -Math.PI) dlt += 2 * Math.PI; return cur + dlt * 0.2; };

  let quality = 2, lastW = 0, lastH = 0, lastDpr = 0, shadowR = 0, lost = false;
  const v = new V3();
  function render(cam, view, st, time, dpr) {
    const Wd = view.W, Hd = view.H;
    if (Wd !== lastW || Hd !== lastH || dpr !== lastDpr) { renderer.setPixelRatio(dpr); renderer.setSize(Wd, Hd, false); lastW = Wd; lastH = Hd; lastDpr = dpr; camera.aspect = Wd / Hd; }
    // the story camera: same target, direction and framing as the flat view, with perspective
    const a = cam.a * Math.PI / 180, e = Math.min(89.9, cam.e) * Math.PI / 180, sa = Math.sin(a), ca = Math.cos(a), se = Math.sin(e), ce = Math.cos(e);
    const s = Math.min(view.fitW / cam.w, view.fitH / cam.h), th = Math.tan(camera.fov * Math.PI / 360), dist = Hd / (2 * s * th);
    camera.position.set(cam.tx + dist * ce * sa, dist * se, cam.ty + dist * ce * ca); camera.up.set(-sa * se, ce, -ca * se); camera.lookAt(cam.tx, 0, cam.ty);
    camera.near = Math.max(0.5, dist - 70); camera.far = dist + 140; camera.setViewOffset(Wd, Hd, Wd / 2 - view.cx, Hd / 2 - view.cy, Wd, Hd); camera.updateProjectionMatrix();
    scene.fog.near = dist + 30; scene.fog.far = dist + 170;
    // the sun follows the view, so shadows stay sharp in close-ups
    const R = Math.max(9, Math.max(cam.w, cam.h * 1.25) * 0.7);
    sun.target.position.set(cam.tx, 0, cam.ty); sun.position.set(cam.tx - 0.42 * 70, 70, cam.ty + 0.36 * 70);
    if (Math.abs(R - shadowR) > 0.5) { shadowR = R; const sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 10; sc.far = 190; sc.updateProjectionMatrix(); }
    lampA.intensity = 9 * Math.max(st.home, 0.3);
    // the learner
    const sp = st.student, seated = !!st.seated; stuWalk.grp.visible = !seated; stuSit.grp.visible = seated;
    if (seated) { const to = sp[0] > 30 ? [S.homeSeat[0] + 1.4, S.homeSeat[1] + 0.6] : S.teacher; stuYaw = yawOf(Math.atan2(to[1] - sp[1], to[0] - sp[0])); stuSit.grp.position.set(sp[0], 0, sp[1]); stuSit.grp.rotation.y = stuYaw; }
    else { if (stuLast && Math.hypot(sp[0] - stuLast[0], sp[1] - stuLast[1]) > 0.002) stuYaw = turn(stuYaw, yawOf(Math.atan2(sp[1] - stuLast[1], sp[0] - stuLast[0]))); stuWalk.grp.position.set(sp[0], 0, sp[1]); stuWalk.grp.rotation.y = stuYaw; swing(stuWalk, st.moving ? st.stride : null); }
    stuLast = [sp[0], sp[1]];
    const ws = walkersAt(S, time);
    strollers.forEach((w, i) => { const q = ws[i]; if (w.last && Math.hypot(q.x - w.last[0], q.y - w.last[1]) > 0.0004) w.yaw = turn(w.yaw, yawOf(Math.atan2(q.y - w.last[1], q.x - w.last[0]))); w.last = [q.x, q.y]; w.m.grp.position.set(q.x, 0, q.y); w.m.grp.rotation.y = w.yaw; swing(w.m, time ? q.step : null); });
    renderer.render(scene, camera);
    const P = (x, y, z = 0) => { v.set(x, z, y).project(camera); return [(v.x + 1) / 2 * Wd, (1 - v.y) / 2 * Hd]; };
    return { P, s, smoke };
  }
  /** 2: everything · 1: no cast shadows · 0: also no environment reflections */
  function setQuality(q) { quality = q; renderer.shadowMap.enabled = q >= 2; sun.castShadow = q >= 2; scene.environmentIntensity = q >= 1 ? 0.42 : 0.2; for (const k in mats) mats[k].needsUpdate = true; ground.material.needsUpdate = true; }
  function dispose() { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const k in mats) mats[k].dispose(); gtex.dispose(); scene.environment?.dispose(); renderer.dispose(); }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  return { render, setQuality, dispose, get quality() { return quality; }, get lost() { return lost; }, info: () => renderer.info.render };
}
