// جهانِ هزارآوا — live canvas runtime. Scroll position chooses the story position; nothing here hijacks scrolling.
// No network, no storage of personal data, no camera, microphone or audio.
import { buildScene, drawScene, cameraAt, storyState, PERCHES, perchFor, BIRD_START } from './scene.mjs';

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

const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Start the live scene.
 * opts: { stage, canvas, bird, labels: {key: element}, cards: [element…], wide: MediaQueryList, reduced: boolean,
 *         onChapter(i), onSlow() }
 * Returns { destroy(), chapterIndex(), goTo(i) }. Throws if a 2D canvas is unavailable.
 */
export function start(opts) {
  const { stage, canvas, bird, cards } = opts;
  const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('canvas');
  const g = new CanvasG(ctx), S = buildScene(), reduced = !!opts.reduced;
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), centers = [], refY = 0;
  let p = 0, ps = 0, raf = 0, running = false, visible = true, destroyed = false, lastT = 0, chapter = -1, api = null;
  let drawMs = 8, frames = 0, lastAnim = 0;
  const birdState = { pos: BIRD_START.slice(), from: null, to: null, t0: 0, dur: 0, perch: -1, flip: false, settledAt: 0, started: false };

  function measure() {
    const r = stage.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // the line a card is "at" when it is the active one: the middle of the area the cards scroll through
    const top = stage.parentElement, T = stickyTop(), below = opts.wide.matches ? 0 : top.offsetHeight, area = innerHeight - T - below; // phones: cards scroll below the sticky stage
    refY = T + below + area / 2;
    // a card taller than that area is anchored by its top, so its heading is never hidden
    centers = cards.map(c => { const b = c.getBoundingClientRect(); return b.top + scrollY + Math.min(b.height, area - 16) / 2; });
  }
  function stickyTop() { return parseFloat(getComputedStyle(stage.parentElement).top) || 0; }
  function readP() {
    const v = scrollY + refY, n = centers.length; if (!n) return 0;
    if (v <= centers[0]) return 0; if (v >= centers[n - 1]) return n - 1;
    let k = 0; while (k < n - 2 && v > centers[k + 1]) k++;
    return k + (v - centers[k]) / (centers[k + 1] - centers[k]);
  }
  function view() {
    if (!opts.wide.matches) return { W, H, cx: W / 2, cy: H * 0.55, fitW: W * 0.97, fitH: H * 0.9 };
    const card = Math.min(480, W * 0.42), free = W - card; // cards sit on the inline-start side (right in RTL)
    return { W, H, cx: free / 2, cy: H * 0.53, fitW: free * 0.94, fitH: H * 0.88 };
  }

  function flyTo(k, now, instant) {
    const b = birdState, to = PERCHES[k].at; b.perch = k;
    if (instant) { b.pos = to.slice(); b.to = null; b.flip = !!PERCHES[k].flip; b.settledAt = 0; bird.classList.remove('is-flying', 'is-settling'); return; }
    b.from = b.pos.slice(); b.to = to; b.t0 = now; const d = Math.hypot(to[0] - b.from[0], to[1] - b.from[1], to[2] - b.from[2]);
    b.dur = Math.max(900, Math.min(2400, 800 + d * 62)); b.lift = Math.min(4.6, 1 + d * 0.13);
    bird.classList.remove('is-settling'); bird.classList.add('is-flying');
  }
  function stepBird(now) {
    const b = birdState; if (!b.to) return false;
    const t = Math.min(1, (now - b.t0) / b.dur), k = ease(t), prev = b.pos.slice();
    b.pos = [lerp(b.from[0], b.to[0], k), lerp(b.from[1], b.to[1], k), lerp(b.from[2], b.to[2], k) + Math.sin(Math.PI * k) * b.lift];
    if (api && t < 0.92) { const a0 = api.P(prev[0], prev[1], prev[2]), a1 = api.P(b.pos[0], b.pos[1], b.pos[2]); if (Math.abs(a1[0] - a0[0]) > 0.4) b.flip = a1[0] < a0[0]; }
    if (t >= 1) { b.pos = b.to.slice(); b.to = null; b.flip = !!PERCHES[b.perch].flip; bird.classList.remove('is-flying'); bird.classList.add('is-settling'); b.settledAt = now; }
    return true;
  }
  function placeBird() {
    const b = birdState, q = api.P(b.pos[0], b.pos[1], b.pos[2]), w = Math.max(opts.wide.matches ? 58 : 46, Math.min(170, 1.3 * api.s)), k = w / 160;
    bird.style.transform = `translate3d(${(q[0] + (b.flip ? 86 : -86) * k).toFixed(1)}px,${(q[1] - 111 * k).toFixed(1)}px,0) scale(${b.flip ? -k : k},${k})`;
    bird.style.opacity = b.started ? '1' : '0';
  }

  function frame(now) {
    raf = 0; if (destroyed) return;
    const dt = Math.min(64, now - (lastT || now)); lastT = now;
    p = readP();
    ps = reduced ? p : ps + (p - ps) * (1 - Math.exp(-dt / 130)); if (Math.abs(p - ps) < 0.0004) ps = p;
    const idx = Math.round(p); if (idx !== chapter) { chapter = idx; opts.onChapter?.(idx); }
    const want = perchFor(p);
    if (!birdState.started) { if (now - startedAt > (reduced ? 0 : 450)) { birdState.started = true; flyTo(want, now, reduced); } }
    else if (want !== birdState.perch) flyTo(want, now, reduced);
    const flying = stepBird(now);
    if (birdState.settledAt && now - birdState.settledAt > 800) { birdState.settledAt = 0; bird.classList.remove('is-settling'); }

    const st = storyState(ps), b = birdState, high = Math.max(0, b.pos[2] - (b.to ? Math.min(b.from[2], b.to[2]) : b.pos[2]));
    st.bird = b.started ? { gx: b.pos[0] + 0.42 * high * 0.4, gy: b.pos[1] - 0.36 * high * 0.4, gz: b.to ? 0.02 : b.pos[2], shadow: Math.max(0.35, 1 - high / 6) } : null;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    api = drawScene(g, S, cameraAt(ps, !opts.wide.matches), view(), st, reduced ? 0 : now);
    drawMs += (performance.now() - t0 - drawMs) * 0.12; frames++;
    placeBird();
    if (opts.labels) for (const key in opts.labels) { const el = opts.labels[key], w = S.rooms[key], q = api.P(w[0], w[1], 0); el.style.transform = `translate(${q[0].toFixed(1)}px,${q[1].toFixed(1)}px) translate(-50%,-50%)`; el.style.opacity = (key === 'home' ? Math.min(st.labels, st.back > 0.5 || ps > 4.7 ? 1 : 0) : st.labels).toFixed(2); }
    // stay light on slower devices: lower the canvas resolution first, then hand over to the simple view
    if (frames > 24 && drawMs > 26) { if (dpr > 1) { dpr = Math.max(1, dpr - 0.5); frames = 0; drawMs = 12; measure(); } else if (drawMs > 45) { opts.onSlow?.(); return; } }
    const animated = !reduced && (st.lesson > 0.01 || (st.back > 0.01 && ps < 4.75) || (st.way > 0.01 && st.way < 0.999));
    if (animated) lastAnim = now;
    if (flying || p !== ps || animated || birdState.settledAt || !birdState.started) schedule();
  }
  function schedule() { if (!raf && running && visible && !document.hidden && !destroyed) raf = requestAnimationFrame(frame); }
  const onScroll = () => schedule();
  let lastW = innerWidth, keep = null;
  const onResize = () => {
    if (destroyed) return;
    if (innerWidth !== lastW && !keep) { keep = { i: Math.round(p) }; lastW = innerWidth;        // rotation / width change: stay on the same chapter
      requestAnimationFrame(() => requestAnimationFrame(() => { const k = keep; keep = null; measure(); if (k) goTo(k.i, true); schedule(); })); return; }
    measure(); schedule();
  };
  function goTo(i, instant) {
    const c = centers[Math.max(0, Math.min(centers.length - 1, i))]; if (c == null) return;
    scrollTo({ top: Math.max(0, c - refY), behavior: instant || reduced ? 'auto' : 'smooth' });
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null; ro?.observe(stage);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) { lastT = 0; schedule(); } }) : null; io?.observe(stage);
  const onVis = () => { if (!document.hidden) { lastT = 0; schedule(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onResize); addEventListener('orientationchange', onResize);
  document.addEventListener('visibilitychange', onVis); opts.wide.addEventListener?.('change', onResize);

  measure(); p = ps = readP(); running = true;
  const startedAt = performance.now();
  frame(startedAt); // first frame synchronously, so a failure is caught by the caller before the layout switches

  return {
    chapterIndex: () => Math.round(p), goTo, remeasure: () => { measure(); schedule(); },
    stats: () => ({ drawMs, dpr, frames, p, ps, running: !!raf, bird: birdState.pos.slice(), perch: birdState.perch }),
    destroy() { destroyed = true; running = false; if (raf) cancelAnimationFrame(raf); raf = 0; ro?.disconnect(); io?.disconnect();
      removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVis); opts.wide.removeEventListener?.('change', onResize); canvas.width = canvas.height = 1; },
  };
}
