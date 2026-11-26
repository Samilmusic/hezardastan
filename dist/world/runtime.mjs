// جهانِ هزارآوا — live canvas runtime. Scroll position chooses the story position; nothing here hijacks scrolling.
// No network, no storage of personal data, no camera, microphone or audio.
// Where WebGL is available the world is drawn in 3D (view3d.mjs, loaded on demand) and this canvas code only adds the
// story's light and life on top; otherwise, or if the device proves too slow, the flat drawing is used.
import { buildScene, drawScene, cameraAt, storyState, birdAt, birdFaces } from './scene.mjs';

class CanvasG {
  constructor(c) { this.c = c; }
  poly(p, fill, a) { const c = this.c; if (a != null) c.globalAlpha = a; c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.fillStyle = fill; c.fill();
    if (typeof fill === 'string' && a == null) { c.strokeStyle = fill; c.lineWidth = 0.7; c.stroke(); } if (a != null) c.globalAlpha = 1; }
  polys(list, fill) { const c = this.c; c.beginPath(); for (const p of list) { c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); } c.fillStyle = fill; c.fill(); }
  ellipse(x, y, rx, ry, fill) { const c = this.c; c.beginPath(); c.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, 6.2832); c.fillStyle = fill; c.fill(); }
  glow(x, y, rx, ry, color, alpha) { const c = this.c; c.save(); c.translate(x, y); c.scale(1, ry / rx); const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, color); g.addColorStop(1, color + '00'); c.globalAlpha = alpha; c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 6.2832); c.fill(); c.restore(); }
  line(p, color, w, o = {}) { const c = this.c; c.save(); if (o.alpha != null) c.globalAlpha = o.alpha; if (o.dash) c.setLineDash(o.dash); c.lineCap = o.cap || 'butt'; c.lineJoin = 'round'; c.strokeStyle = color; c.lineWidth = w;
    c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.stroke(); c.restore(); }
  lin(x0, y0, x1, y1, st) { const g = this.c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of st) g.addColorStop(o, col); return g; }
  rad(x, y, r, st) { const g = this.c.createRadialGradient(x, y, 0, x, y, Math.max(r, 0.01)); for (const [o, col] of st) g.addColorStop(o, col); return g; }
  rect(x, y, w, h, fill) { this.c.fillStyle = fill; this.c.fillRect(x, y, w, h); }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const START_ONLY = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'porch', 'reception', 'street', 'hall']);

/**
 * Start the live scene.
 * opts: { stage, canvas, bird, labels: {key: element}, cards: [element…], wide: MediaQueryList, reduced: boolean,
 *         onChapter(i), onSlow() }
 * Returns { destroy(), chapterIndex(), goTo(i) }. Throws if a 2D canvas is unavailable.
 *
 * Layouts. Wide: cards scroll past in a column beside the scene. Phone: the scene fills the screen and each card
 * rests at the bottom of it (CSS sticky) while its chapter scrolls by; this code only fades cards in and out.
 */
export function start(opts) {
  const { stage, canvas, bird, cards } = opts;
  const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('canvas');
  const g = new CanvasG(ctx), S = buildScene(), reduced = !!opts.reduced;
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), anchors = [], phone = null, vw = { W: 1, H: 1, cx: 0, cy: 0, fitW: 1, fitH: 1 };
  let p = 0, ps = 0, raf = 0, running = false, visible = true, destroyed = false, lastT = 0, chapter = -1, api = null;
  let drawMs = 8, frames = 0, dir = 1, faceLeft = false, flying = null, shown = false, birdW = 80, vel = 0, tilt = 0, skip = false, flap = '';
  // ---- 3D view (optional): a WebGL canvas for the world, a transparent canvas above it for the story's light and life
  let v3 = null, v3dpr = 1, v3frames = 0, v3dt = 16, v3off = false; const glMode = /[?&]gl=(off|keep)/.exec(location.search)?.[1];
  function stop3d(note) { if (!v3) return; const o = v3; v3 = null; v3off = true; try { o.view.dispose(); } catch {} o.gl.remove(); o.fx.remove(); canvas.style.visibility = ''; stage.classList.remove('is-3d'); if (note) opts.on3d?.(false); schedule(); }
  async function start3d() {
    if (reduced || glMode === 'off' || v3off || destroyed || navigator.connection?.saveData) return;
    try {
      const mod = await import('./view3d.mjs'); if (destroyed || !mod.supported()) return;
      await new Promise(r => ('requestIdleCallback' in window ? requestIdleCallback(r, { timeout: 1200 }) : setTimeout(r, 60)));
      const gl = document.createElement('canvas'), fx = document.createElement('canvas'); gl.className = 'wd-gl'; fx.className = 'wd-fx';
      const view = mod.create({ canvas: gl, S, phone: !opts.wide.matches });
      canvas.after(gl, fx); v3dpr = Math.min(dpr, opts.wide.matches ? 2 : 1.6);
      v3 = { view, gl, fx, ctx: fx.getContext('2d'), g: null }; v3.g = new CanvasG(v3.ctx); v3frames = 0; v3dt = 16;
      canvas.style.visibility = 'hidden'; stage.classList.add('is-3d'); measure(); opts.on3d?.(true); schedule();
    } catch (e) { stop3d(); }
  }
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none'; stage.appendChild(probe);

  function measure() {
    const r = stage.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w !== W || h !== H || canvas.width !== Math.round(w * dpr)) { W = w; H = h; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    if (v3 && (v3.fx.width !== Math.round(W * v3dpr) || v3.fx.height !== Math.round(H * v3dpr))) { v3.fx.width = Math.round(W * v3dpr); v3.fx.height = Math.round(H * v3dpr); }
    const T = stickyTop(), small = (probe.offsetHeight || innerHeight) - T, wide = opts.wide.matches;   // small: the part of the stage that is always visible
    const tops = cards.map(c => c.parentElement.getBoundingClientRect().top + scrollY), hs = cards.map(c => c.parentElement.offsetHeight), ch = cards.map(c => c.offsetHeight);
    if (wide) {
      phone = null;
      // a card is "at" its chapter when its middle reaches the middle of the stage; a very tall card is taken by its top
      const refY = T + H / 2; anchors = cards.map(c => { const b = c.getBoundingClientRect(); return Math.max(0, b.top + scrollY + Math.min(b.height, H - 16) / 2 - refY); });
      for (const c of cards) { c.style.opacity = ''; c.style.pointerEvents = ''; }
      const card = Math.min(480, W * 0.42), free = W - card;   // cards sit on the inline-start side (right in RTL)
      vw = { W, H, cx: free / 2, cy: H * 0.53, fitW: free * 0.94, fitH: H * 0.88 };
    } else {
      // where a resting card's bottom edge is, measured from the top of the stage in the smallest viewport
      const gap = parseFloat(getComputedStyle(cards[0]).bottom) || 46, rest = T + small - gap;
      // chapter k is "at" when its card is half-way through its rest
      anchors = cards.map((c, k) => Math.max(0, tops[k] + hs[k] / 2 - (rest - ch[k] / 2)));
      const barH = stage.parentElement.querySelector('.wd-bar')?.offsetHeight || 48;
      phone = { rest, tops, ends: tops.map((t, k) => t + hs[k] - rest), ch, top: barH + 14, room: small - gap - 10 - (barH + 14) };
      vw = { W, H, cx: W / 2, cy: 0, fitW: W * 0.97, fitH: 1 }; frameArea(ps);
    }
    anchors[0] = 0; for (let k = 1; k < anchors.length; k++) if (anchors[k] <= anchors[k - 1]) anchors[k] = anchors[k - 1] + 1;
  }
  function frameArea(q) { // phone: the scene is framed in the space between the bar and the caption that is showing
    const n = phone.ch.length, k = clamp(Math.floor(q), 0, n - 2), f = clamp(q - k, 0, 1), e = f * f * (3 - 2 * f), free = Math.max(150, phone.room - (phone.ch[k] + (phone.ch[k + 1] - phone.ch[k]) * e));
    vw.cy = phone.top + free / 2; vw.fitH = free;
  }
  function stickyTop() { return parseFloat(getComputedStyle(stage.parentElement).top) || 0; }
  function readP() {
    const v = scrollY, n = anchors.length; if (!n) return 0;
    if (v <= anchors[0]) return 0; if (v >= anchors[n - 1]) return n - 1;
    let k = 0; while (k < n - 2 && v > anchors[k + 1]) k++;
    return k + (v - anchors[k]) / (anchors[k + 1] - anchors[k]);
  }
  function fadeCards() { // phone: a card appears as it comes to rest and fades as it starts to leave, so the scene stays clear
    if (!phone) return; const y = scrollY;
    cards.forEach((c, k) => {
      const inn = clamp((y + phone.rest - phone.tops[k] - phone.ch[k] * 0.6) / (phone.ch[k] * 0.4), 0, 1), out = k === cards.length - 1 ? 1 : clamp(1 - (y - phone.ends[k]) / 56, 0, 1);
      const o = k === 0 ? out : Math.min(inn, out); c.style.opacity = o.toFixed(3); c.style.pointerEvents = o < 0.5 ? 'none' : '';
    });
  }

  function placeBird(st, now) {
    const b = st.bird, bs = birdAt(ps), q = api.P(b.x, b.y, b.z);
    const face = birdFaces(ps, api.P, dir); if (bs.fly > 0.05 || !shown) faceLeft = face; else faceLeft = bs.flip;
    const base = phone ? clamp(1.7 * api.s, 78, 150) : clamp(1.5 * api.s, 84, 190), w = base + (Math.max(base, phone ? 112 : 170) - base) * st.connect, k = w / 160; birdW = w;
    const bob = reduced || bs.fly < 0.05 ? 0 : Math.sin(now * 0.0052) * 3.2 * bs.fly * k * 1.6;
    tilt += ((bs.fly > 0.05 ? clamp(-Math.abs(vel) * 26, -16, 0) : 0) - tilt) * 0.15;       // lean into the flight
    bird.style.transform = `translate3d(${(q[0] + (faceLeft ? 86 : -86) * k).toFixed(1)}px,${(q[1] - (bs.fly > 0.05 ? 84 : 111) * k + bob).toFixed(1)}px,0) scale(${faceLeft ? -k : k},${k}) translate(86px,84px) rotate(${tilt.toFixed(1)}deg) translate(-86px,-84px)`;
    const fs = Math.abs(vel) > 0.7 ? '.19s' : Math.abs(vel) > 0.25 ? '.24s' : '.3s'; if (fs !== flap) { flap = fs; bird.style.setProperty('--flap', fs); }
    const fl = bs.fly > 0.05; if (fl !== flying) { flying = fl; bird.classList.toggle('is-flying', fl); bird.classList.toggle('is-settling', !fl && shown && !reduced); }
    if (!shown) { shown = true; bird.style.opacity = '1'; }
    return q;
  }

  function frame(now) {
    raf = 0; if (destroyed) return;
    if (!reduced && p === ps && (skip = !skip)) { schedule(); return; }   // nothing is moving but the ambient life: half the frame rate is enough
    const dt = Math.min(64, now - (lastT || now)); lastT = now;
    p = readP(); const before = ps;
    ps = reduced ? p : ps + (p - ps) * (1 - Math.exp(-dt / 150)); if (Math.abs(p - ps) < 0.0004) ps = p;
    if (Math.abs(ps - before) > 0.0006) dir = ps > before ? 1 : -1;
    const idx = Math.round(p); if (idx !== chapter) { chapter = idx; opts.onChapter?.(idx); }
    fadeCards();

    if (phone) frameArea(ps);
    const st = storyState(ps), t0 = performance.now(), bsNow = birdAt(ps);
    vel += ((ps - before) / Math.max(dt, 1) * 1000 - vel) * 0.18;                         // story units per second, smoothed
    if (!reduced && bsNow.fly > 0.05) { st.trail = []; for (let k = 1; k <= 9; k++) { const q = ps - dir * k * 0.011; if (q < 0 || q > 5) break; const b = birdAt(q); if (b.fly < 0.05) break; st.trail.push([b.pos[0], b.pos[1], b.pos[2] + 0.35, (1 - k / 10) * Math.min(1, Math.abs(vel) * 4 + 0.25) * bsNow.fly]); } }
    const camNow = cameraAt(ps, !!phone);
    if (v3 && v3.view.lost) stop3d(true);
    if (v3) {
      const a3 = v3.view.render(camNow, vw, st, now, v3dpr); v3.ctx.setTransform(v3dpr, 0, 0, v3dpr, 0, 0); v3.ctx.clearRect(0, 0, W, H);
      api = drawScene(v3.g, S, camNow, vw, st, now, a3);
      // keep it smooth: while the story is moving, a slow device first loses resolution, then shadows, then goes back to the flat drawing
      if (Math.abs(ps - before) > 0.0005) { v3dt += (dt - v3dt) * 0.12; v3frames++; }
      if (glMode !== 'keep' && v3frames > 36 && v3dt > 36) { v3frames = 0; v3dt = 20;
        if (v3dpr > 1.05) { v3dpr = Math.max(1, v3dpr - 0.5); measure(); } else if (v3.view.quality > 1) v3.view.setQuality(1); else stop3d(true); }
    } else {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    api = drawScene(g, S, camNow, vw, st, reduced ? 0 : now);
    }
    drawMs += (performance.now() - t0 - drawMs) * 0.12; frames++;
    const bq = placeBird(st, now);
    if (opts.labels) for (const key in opts.labels) { const el = opts.labels[key];
      if (key === 'bird') { el.style.transform = `translate(${bq[0].toFixed(1)}px,${(bq[1] + birdW * 0.2).toFixed(1)}px) translate(-50%,0)`; el.style.opacity = st.connect.toFixed(2); continue; }
      const w = S.rooms[key], q = api.P(w[0], w[1], 0); el.style.transform = `translate(${q[0].toFixed(1)}px,${q[1].toFixed(1)}px) translate(-50%,-50%)`;
      const early = ps < 2 ? st.labels : 0, late = ps > 4 ? st.labels : 0;                           // room-by-room names only on the opening plan
      el.style.opacity = (key === 'court' ? st.labels * (1 - st.connect) : key === 'home' || key === 'classes' ? late : START_ONLY.has(key) ? early : st.labels).toFixed(2); }
    // stay light on slower devices: lower the canvas resolution first, then hand over to the simple view
    if (!v3 && frames > 24 && drawMs > 26) { if (dpr > 1) { dpr = Math.max(1, dpr - 0.5); frames = 0; drawMs = 12; measure(); } else if (drawMs > 45) { opts.onSlow?.(); return; } }
    if (p !== ps || !reduced) schedule();   // the scene is alive (people, water, notes), so it keeps drawing while it is on screen
  }
  function schedule() { if (!raf && running && visible && !document.hidden && !destroyed) raf = requestAnimationFrame(frame); }
  const onScroll = () => { skip = true; schedule(); };
  let lastW = innerWidth, keep = null;
  const onResize = () => {
    if (destroyed) return;
    if (innerWidth !== lastW && !keep) { keep = { i: Math.round(p) }; lastW = innerWidth;        // rotation / width change: stay on the same chapter
      requestAnimationFrame(() => requestAnimationFrame(() => { const k = keep; keep = null; measure(); if (k) goTo(k.i, true); schedule(); })); return; }
    measure(); schedule();
  };
  function goTo(i, instant) {
    const c = anchors[Math.max(0, Math.min(anchors.length - 1, i))]; if (c == null) return;
    scrollTo({ top: c, behavior: instant || reduced ? 'auto' : 'smooth' });
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null; ro?.observe(stage);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) { lastT = 0; schedule(); } }) : null; io?.observe(stage);
  const onVis = () => { if (!document.hidden) { lastT = 0; schedule(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onResize); addEventListener('orientationchange', onResize);
  document.addEventListener('visibilitychange', onVis); opts.wide.addEventListener?.('change', onResize);

  measure(); p = ps = readP(); running = true;
  frame(performance.now()); // first frame synchronously, so a failure is caught by the caller before the layout switches
  start3d();

  return {
    chapterIndex: () => Math.round(p), goTo, remeasure: () => { measure(); schedule(); },
    stats: () => ({ three: v3 ? { dpr: v3dpr, dt: v3dt, quality: v3.view.quality, info: v3.view.info() } : null, drawMs, dpr, frames, p, ps, running: !!raf, bird: birdAt(ps).pos, phone: !!phone, view: vw, anchors: anchors.slice() }),
    destroy() { stop3d(); destroyed = true; running = false; if (raf) cancelAnimationFrame(raf); raf = 0; ro?.disconnect(); io?.disconnect();
      removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVis); opts.wide.removeEventListener?.('change', onResize); canvas.width = canvas.height = 1; probe.remove();
      for (const c of cards) { c.style.opacity = ''; c.style.pointerEvents = ''; } },
  };
}
