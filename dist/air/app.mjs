// HezarAva Air Studio — controller. Wires input (camera gestures, touch, keyboard) to one audio engine.
import { makeTuning, degreeFrequency, degreeLabel, harmonyFor, rootFrequency, WESTERN, PERSIAN, PERSIAN_NOTE, PERSIAN_TEXTURES, WESTERN_SLOTS, NOTE_NAMES_FA } from './tuning.mjs';
import { HandMachine, HandRouter, handFeatures, makeTransform, DEFAULTS } from './gesture.mjs';
import { AudioEngine, INSTRUMENTS } from './engine.mjs';
import { encodeWav, concatChunks, encodeMidi } from './export.mjs';
import { Lifecycle } from './lifecycle.mjs';
import { PointerVoices } from './touch.mjs';
import { EXERCISES, Exercise } from './learn.mjs';

const $ = s => document.querySelector(s);
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const store = { get(k, d) { try { const v = localStorage.getItem('air:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('air:' + k, JSON.stringify(v)); } catch {} } };

// ---------------------------------------------------------------- settings
const S = Object.assign({
  input: 'camera', system: 'persian', key: 'shur', rootPc: 7, octave: 4, refA4: 440, offsets: {}, instrument: 'soft',
  accomp: true, rhythm: false, bpm: 84, policy: 'hold', selection: 'zones', swap: false, lefty: false, single: false,
  koron: 60, diag: false, labelForRight: 'Left', pinchOn: DEFAULTS.pinchOn, pinchOff: DEFAULTS.pinchOff, calibrated: false,
}, store.get('settings', {}));
const save = () => store.set('settings', S);
let tuning;
function rebuildTuning() {
  const off = S.offsets[S.system + ':' + S.key] || [];
  tuning = makeTuning({ system: S.system, key: S.key, rootPc: S.rootPc, octave: S.octave, refA4: S.refA4, offsets: off });
}
rebuildTuning();

// ---------------------------------------------------------------- core objects
const life = new Lifecycle();
let engine = null, camera = null, tracker = null;
const melody = new HandMachine({ columns: 7, octaves: 3 });
const accomp = new HandMachine({ columns: 4, octaves: 1, selection: 'fingers' });
let router = null;
const held = { melody: null, touch: new Map(), keys: new Map() }; // voice ids by input
let accompSlot = null, sounding = new Set(), selected = null, lastAccompExpr = 0.5;
let started = false, playing = false, mode = 'free', events = [], recordStart = null, takes = [], noteCount = 0;

// ---------------------------------------------------------------- DOM refs
const els = {
  intro: $('#air-intro'), play: $('#air-play'), start: $('#air-start'), exit: $('#air-exit'), panic: $('#air-panic'),
  video: $('#air-video'), canvas: $('#air-canvas'), pads: $('#air-pads'), status: $('#air-status'), surface: $('#air-surface'),
  guide: $('#air-guide'), guideTitle: $('#air-guide-title'), guideBody: $('#air-guide-body'), guideActions: $('#air-guide-actions'),
  overlay: $('#air-overlay'), overlayTitle: $('#air-overlay-title'), overlayBody: $('#air-overlay-body'), overlayActions: $('#air-overlay-actions'),
  scale: $('#air-scale'), instrument: $('#air-instrument'), soundNote: $('#air-sound-note'), system: $('#air-system'), scaleKey: $('#air-scale-key'),
  root: $('#air-root'), accomp: $('#air-accomp'), rhythm: $('#air-rhythm'), accompPads: $('#air-accomp-pads'), rec: $('#air-rec'), recTime: $('#air-rec-time'),
  takes: $('#air-takes'), octave: $('#air-octave'), ref: $('#air-ref'), tuningBox: $('#air-tuning'), persianNote: $('#air-persian-note'), koron: $('#air-koron'),
  reset: $('#air-reset-tuning'), policy: $('#air-policy'), selection: $('#air-selection'), swap: $('#air-swap'), lefty: $('#air-lefty'), single: $('#air-single'),
  bpm: $('#air-bpm'), recal: $('#air-recalibrate'), diag: $('#air-diag'), diagOut: $('#air-diag-out'), next: $('#air-next'), nextInst: $('#air-next-inst'),
  learn: $('#air-learn'), panel: $('#air-panel'),
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ---------------------------------------------------------------- status & guide
const status = { camera: '', model: '', hands: '', stability: '', light: '' };
function renderStatus() {
  els.status.replaceChildren(...Object.entries(status).filter(([, v]) => v).map(([k, v]) => el('span', 'air-chip air-chip--' + k, v)));
}
let guideDismissed = store.get('guideDismissed', false);
function guide(title, body, actions = []) {
  if (!title) { els.guide.hidden = true; return; }
  els.guideTitle.textContent = title; els.guideBody.textContent = body || '';
  els.guideActions.replaceChildren(...actions.map(([label, fn, primary]) => { const b = el('button', 'air-btn ' + (primary ? 'air-btn--light' : 'air-btn--ghost'), label); b.type = 'button'; b.onclick = fn; return b; }));
  els.guide.hidden = false;
}
els.guide.querySelector('#air-guide-close').onclick = () => { els.guide.hidden = true; if (onboarding.step === 'free') { guideDismissed = true; store.set('guideDismissed', true); } };
function overlay(title, body, actions = []) {
  if (!title) { els.overlay.hidden = true; return; }
  els.overlayTitle.textContent = title; els.overlayBody.textContent = body || '';
  els.overlayActions.replaceChildren(...actions.map(([label, fn, primary]) => { const b = el('button', 'air-btn ' + (primary ? 'air-btn--primary' : 'air-btn--ghost'), label); b.type = 'button'; b.onclick = fn; return b; }));
  els.overlay.hidden = false;
  els.overlayActions.querySelector('button')?.focus();
}

// ---------------------------------------------------------------- notes
const scaleLen = () => tuning.cents.length;
const label = d => degreeLabel(tuning, d).fa;
const freqFor = (degree, band) => degreeFrequency(tuning, degree, band - 1); // bands 0,1,2 → −1, 0, +1 octave
function playNote(degree, band, source, velocity = 0.8) {
  if (!engine) return null;
  const id = engine.noteOn(freqFor(degree, band), { velocity, bus: 'melody', meta: { degree, octave: band, source } });
  if (id != null) { sounding.add(degree + ':' + band); noteCount++; burst(degree, band); }
  return id;
}
function stopNote(id) { if (id != null) engine?.noteOff(id); }

function accompFreqs(slot) {
  const h = harmonyFor(tuning, slot), base = rootFrequency(tuning.rootPc, tuning.octave - 1, tuning.refA4);
  return { label: h.label, freqs: h.cents.map(c => base * Math.pow(2, c / 1200)) };
}
function setAccomp(slot) {
  if (!engine) return;
  if (slot == null || !S.accomp) { engine.releaseAccompaniment(); accompSlot = null; }
  else { const a = accompFreqs(slot); engine.setAccompaniment(a.freqs, { slot, label: a.label }); accompSlot = slot; }
  renderAccompPads();
}
function panic() {
  engine?.panic();
  held.melody = null; held.touch.clear(); held.keys.clear(); pointers.releaseAll();
  melody.silence('panic'); accomp.silence('panic'); accompSlot = null; sounding.clear();
  els.rhythm.checked = false; S.rhythm = false; save();
  renderAccompPads(); renderScaleStrip();
}
els.panic.onclick = panic;

// ---------------------------------------------------------------- camera input → gestures
function handleHands(t, hands) {
  const transform = makeTransform({ mirrored: true, swap: S.swap, labelForRight: S.labelForRight });
  router.transform = transform; router.leftHanded = S.lefty; router.mode = S.single ? 'single' : 'two';
  const dets = hands.map(h => ({ landmarks: h.landmarks.map(transform.point), label: h.label, score: h.score }));
  lastHands = dets; lastHandsAt = t;
  if (onboarding.handle(t, dets)) return;
  const locked = id => (routeRole[id] === 'melody' && held.melody != null) || (routeRole[id] === 'accomp' && accompSlot != null);
  const routed = router.route(t, dets, locked);
  routeRole = {}; routed.forEach(r => { routeRole[r.slot] = r.role; });
  const byRole = { melody: null, accomp: null };
  for (const r of routed) if (!byRole[r.role]) byRole[r.role] = r;
  // melody hand
  const m = byRole.melody ? { features: handFeatures(byRole.melody.det.landmarks), confidence: byRole.melody.det.score } : null;
  for (const e of melody.update(t, m)) applyMelody(e);
  // accompaniment hand
  const a = byRole.accomp && !S.single ? { features: handFeatures(byRole.accomp.det.landmarks), confidence: byRole.accomp.det.score } : null;
  for (const e of accomp.update(t, a)) applyAccomp(e);
  if (a && accompSlot != null) { const expr = Math.max(0, Math.min(1, 1 - a.features.center.y)); lastAccompExpr += (expr - lastAccompExpr) * 0.3; engine.setExpression(lastAccompExpr); }
  status.hands = hands.length ? (hands.length === 2 ? 'دو دست دیده می‌شود' : 'یک دست دیده می‌شود') : 'دستی دیده نمی‌شود';
  status.stability = m ? ({ stable: 'ژست پایدار', settling: 'در حال تثبیت ژست', fist: 'مشت: بی‌صدا', none: '' }[melody.stability] || '') : '';
}
let routeRole = {}, lastHands = [], lastHandsAt = 0;
function applyMelody(e) {
  if (e.type === 'select') { selected = { degree: e.degree, octave: e.octave }; renderScaleStrip(); }
  else if (e.type === 'on') { if (held.melody != null) stopNote(held.melody); held.melody = playNote(e.degree, e.octave, 'camera'); onboarding.noted(); }
  else if (e.type === 'off') { stopNote(held.melody); held.melody = null; sounding.clear(); renderScaleStrip(); }
  else if (e.type === 'move') { engine.setFrequency(held.melody, freqFor(e.degree, e.octave)); selected = { degree: e.degree, octave: e.octave }; renderScaleStrip(); }
  else if (e.type === 'retrigger') { stopNote(held.melody); held.melody = playNote(e.degree, e.octave, 'camera'); }
}
function applyAccomp(e) {
  const slots = S.system === 'persian' ? PERSIAN_TEXTURES.length : (tuning.chords === 'diatonic' ? WESTERN_SLOTS.length : 4);
  if (e.type === 'on') setAccomp(e.degree % slots);
  else if (e.type === 'fist' || e.type === 'lost' || (e.type === 'off' && e.reason === 'panic')) setAccomp(null); // pinch release keeps the latch
}

// ---------------------------------------------------------------- onboarding (camera)
const onboarding = {
  step: 'idle', since: 0, cand: null, pinch: { min: 9, max: 0, n: 0 },
  begin() { this.go(S.calibrated ? 'first-note' : 'right'); },
  go(step) {
    this.step = step; this.since = performance.now(); this.cand = null;
    const skip = ['رد کردن', () => this.go(step === 'right' ? 'pinch' : step === 'pinch' ? 'first-note' : 'free')];
    if (step === 'right') guide('دست راستت را بالا بیاور', 'فقط دست راستت را جلوی دوربین نگه دار تا بدانیم کدام دست کدام است.', [skip]);
    else if (step === 'pinch') { this.pinch = { min: 9, max: 0, n: 0 }; guide('چند بار نیشگون بگیر', 'نوک شست و اشاره را چند بار به هم برسان و باز کن تا اندازهٔ دستت را بشناسیم.', [skip]); }
    else if (step === 'first-note') guide('اولین نت', 'دستت را باز نگه دار؛ ستونی که روشن می‌شود نت توست. حالا شست و اشاره را به هم برسان.', [skip]);
    else if (step === 'accomp') guide('همراهی با دست چپ (اختیاری)', 'با دست چپ تعداد انگشت‌های باز را انتخاب کن و نیشگون بگیر تا همراهی روشن شود؛ بالا و پایین بردن دست، بلندی آن را تغییر می‌دهد. مشت کردن خاموشش می‌کند.', [['شروع نوازندگی آزاد', () => this.go('free'), true]]);
    else if (step === 'free') { guide(guideDismissed ? null : 'نوازندگی آزاد', 'مشت بستن هر دست، صدای همان دست را قطع می‌کند. دکمهٔ «قطع همهٔ صداها» همیشه بالای صفحه است.', [['متوجه شدم', () => { guideDismissed = true; store.set('guideDismissed', true); guide(null); }, true]]); }
  },
  handle(t, dets) {
    if (this.step === 'right') {
      if (dets.length === 1) {
        if (!this.cand || this.cand.label !== dets[0].label) this.cand = { label: dets[0].label, at: t };
        else if (t - this.cand.at > 900) { S.labelForRight = dets[0].label; S.swap = false; els.swap.checked = false; save(); this.go('pinch'); }
      } else this.cand = null;
      return true;
    }
    if (this.step === 'pinch') {
      if (dets.length) {
        const p = handFeatures(dets[0].landmarks).pinch;
        this.pinch.min = Math.min(this.pinch.min, p); this.pinch.max = Math.max(this.pinch.max, p); this.pinch.n++;
      }
      if (t - this.since > 4000 && this.pinch.n > 40 && this.pinch.max - this.pinch.min > 0.35) {
        const { min, max } = this.pinch, span = max - min;
        S.pinchOn = Math.max(0.15, Math.min(0.42, min + span * 0.3)); S.pinchOff = Math.max(S.pinchOn + 0.08, Math.min(0.62, min + span * 0.5));
        S.calibrated = true; save(); applyGestureSettings(); this.go('first-note');
      }
      return true;
    }
    return false;
  },
  noted() { if (this.step === 'first-note') { guide('عالی بود!', 'اولین نت را نواختی.'); setTimeout(() => this.go(S.single ? 'free' : 'accomp'), 1400); } },
};

function applyGestureSettings() {
  const common = { pinchOn: S.pinchOn, pinchOff: S.pinchOff };
  melody.configure({ ...common, sustainPolicy: S.policy, selection: S.selection, columns: scaleLen(), octaves: 3 });
  accomp.configure({ ...common, sustainPolicy: 'hold', selection: 'fingers', columns: 4, octaves: 1 });
}

// ---------------------------------------------------------------- touch pads & keyboard (same engine)
const pointers = new PointerVoices(pad => { const [d, o] = pad.split(':').map(Number); return playNote(d, o, 'touch', 0.75); }, id => { stopNote(id); sounding.clear(); renderScaleStrip(); });
function buildPads() {
  els.pads.replaceChildren();
  for (let band = 2; band >= 0; band--) {
    const row = el('div', 'air-pad-row');
    for (let d = 0; d < scaleLen(); d++) {
      const b = el('button', 'air-pad'); b.type = 'button'; b.dataset.pad = d + ':' + band;
      b.append(el('b', '', label(d)), el('small', '', 'درجهٔ ' + fa(d + 1)));
      b.setAttribute('aria-label', label(d) + '، اکتاو ' + fa(band + 1));
      row.append(b);
    }
    els.pads.append(row);
  }
}
const padAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.air-pad')?.dataset.pad ?? null;
els.pads.addEventListener('pointerdown', e => { const pad = e.target.closest('.air-pad')?.dataset.pad; if (!pad) return; e.preventDefault(); try { els.pads.setPointerCapture(e.pointerId); } catch {} pointers.down(e.pointerId, pad); markPad(); });
els.pads.addEventListener('pointermove', e => { if (!pointers.map.has(e.pointerId)) return; pointers.move(e.pointerId, padAt(e.clientX, e.clientY)); markPad(); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) els.pads.addEventListener(type, e => { pointers.up(e.pointerId); markPad(); });
els.pads.addEventListener('contextmenu', e => e.preventDefault());
// keyboard accessibility: Enter/Space on a focused pad plays while held
els.pads.addEventListener('keydown', e => { const pad = e.target.closest?.('.air-pad')?.dataset.pad; if (!pad || e.repeat || !(e.key === 'Enter' || e.key === ' ')) return; e.preventDefault(); pointers.down('k' + pad, pad); markPad(); });
els.pads.addEventListener('keyup', e => { const pad = e.target.closest?.('.air-pad')?.dataset.pad; if (!pad) return; pointers.up('k' + pad); markPad(); });
function markPad() { const on = new Set([...pointers.map.values()].map(v => v.pad)); els.pads.querySelectorAll('.air-pad').forEach(p => p.classList.toggle('is-on', on.has(p.dataset.pad))); }

const KEYROWS = [['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'shift', ''], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", ''], ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']']];
function keyToPad(e) {
  const code = e.code || ''; const k = code.startsWith('Key') ? code.slice(3).toLowerCase() : ({ Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']' })[code];
  for (let band = 0; band < 3; band++) { const i = KEYROWS[band].indexOf(k); if (i >= 0 && i < scaleLen()) return i + ':' + band; }
  return null;
}
document.addEventListener('keydown', e => {
  if (!playing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input,select,textarea')) return;
  if (e.key === 'Escape') { panic(); return; }
  if (/^Digit[1-5]$/.test(e.code)) { setAccomp(Number(e.code.slice(5)) - 1); return; }
  if (e.code === 'Digit0' || e.code === 'Backquote') { setAccomp(null); return; }
  const pad = keyToPad(e); if (!pad || e.repeat) return;
  if (e.target.closest?.('.air-pad')) return; // handled by the focused pad
  e.preventDefault(); pointers.down('key:' + e.code, pad); markPad();
});
document.addEventListener('keyup', e => { pointers.up('key:' + e.code); markPad(); });
window.addEventListener('blur', () => { pointers.releaseAll(); markPad(); });

// ---------------------------------------------------------------- scale strip, accompaniment pads
function renderScaleStrip() {
  els.scale.replaceChildren(...tuning.cents.map((c, d) => {
    const b = el('span', 'air-degree'); const lab = degreeLabel(tuning, d);
    b.append(el('b', '', lab.fa), el('small', '', fa(Math.round(c + (tuning.offsets[d] || 0))) + ' سنت'));
    if (selected?.degree === d) b.classList.add('is-selected');
    if ([...sounding].some(s => s.startsWith(d + ':'))) b.classList.add('is-sounding');
    return b;
  }));
}
function renderAccompPads() {
  const persian = S.system === 'persian';
  const n = persian ? PERSIAN_TEXTURES.length : (tuning.chords === 'diatonic' ? WESTERN_SLOTS.length : 4);
  els.accompPads.replaceChildren(...Array.from({ length: n }, (_, i) => {
    const h = harmonyFor(tuning, i); const b = el('button', 'air-accomp-pad', h.label); b.type = 'button';
    b.setAttribute('aria-pressed', String(accompSlot === i)); b.disabled = !S.accomp;
    b.onclick = () => setAccomp(accompSlot === i ? null : i);
    return b;
  }), Object.assign(el('button', 'air-accomp-pad air-accomp-off', 'قطع همراهی'), { type: 'button', onclick: () => setAccomp(null), disabled: accompSlot == null }));
}

// ---------------------------------------------------------------- settings UI
function fillSelect(sel, items, value) { sel.replaceChildren(...items.map(([v, t]) => { const o = el('option', '', t); o.value = v; return o; })); sel.value = value; }
function renderSettings() {
  fillSelect(els.instrument, Object.entries(INSTRUMENTS).map(([k, d]) => [k, d.fa + (d.kind === 'sampled' ? ' — نمونهٔ ضبط‌شده' : ' — سنتز')]), S.instrument);
  els.system.value = S.system;
  fillSelect(els.scaleKey, Object.entries(S.system === 'persian' ? PERSIAN : WESTERN).map(([k, d]) => [k, d.fa]), S.key);
  fillSelect(els.root, NOTE_NAMES_FA.map((n, i) => [i, n]), S.rootPc);
  els.accomp.checked = S.accomp; els.rhythm.checked = S.rhythm; els.octave.value = S.octave; els.ref.value = S.refA4; els.koron.value = S.koron;
  els.policy.value = S.policy; els.selection.value = S.selection; els.swap.checked = S.swap; els.lefty.checked = S.lefty; els.single.checked = S.single; els.bpm.value = S.bpm; els.diag.checked = S.diag;
  els.persianNote.textContent = S.system === 'persian' ? PERSIAN_NOTE : 'گام‌های غربی با کوک برابر (۱۲ نیم‌پردهٔ مساوی) محاسبه می‌شوند.';
  const d = INSTRUMENTS[S.instrument];
  els.soundNote.textContent = (d.kind === 'sampled' ? 'نمونهٔ ضبط‌شده: ' : 'صدای ساخته‌شده در مرورگر: ') + d.source + '. نی، تار، سه‌تار و سنتور هنوز نمونهٔ ضبط‌شدهٔ مجاز ندارند و در فهرست نیستند.';
  renderTuningEditor(); renderScaleStrip(); renderAccompPads(); buildPads();
  const inst = { piano: 'piano', guitar: 'guitar', violin: 'violin', epiano: 'keyboard' }[S.instrument];
  els.nextInst.href = inst ? 'instruments/' + inst + '.html' : 'index.html#instruments';
  els.nextInst.textContent = inst ? 'صفحهٔ ' + ({ piano: 'پیانو', guitar: 'گیتار', violin: 'ویولن', keyboard: 'کیبورد' })[inst] + ' و استادش' : 'سازها و استادها';
}
function renderTuningEditor() {
  const key = S.system + ':' + S.key, offs = S.offsets[key] || [];
  els.tuningBox.replaceChildren(...tuning.cents.map((c, i) => {
    const row = el('div', 'air-tune-row');
    const name = el('span', 'air-tune-name', 'درجهٔ ' + fa(i + 1) + ' · ' + label(i));
    const input = el('input'); input.type = 'number'; input.step = '5'; input.min = '-100'; input.max = '100'; input.value = offs[i] || 0; input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'جابه‌جایی درجهٔ ' + fa(i + 1) + ' به سنت');
    input.onchange = () => setOffset(i, Math.max(-100, Math.min(100, Number(input.value) || 0)));
    const k = el('button', 'air-mini', 'کرن'); k.type = 'button'; k.onclick = () => setOffset(i, (offs[i] || 0) - S.koron);
    const s = el('button', 'air-mini', 'سری'); s.type = 'button'; s.onclick = () => setOffset(i, (offs[i] || 0) + S.koron);
    if (i === 0) { k.disabled = s.disabled = input.disabled = true; }
    row.append(name, input, el('small', '', 'سنت'), k, s);
    return row;
  }));
}
function setOffset(i, v) { const key = S.system + ':' + S.key; const offs = [...(S.offsets[key] || [])]; offs[i] = Math.max(-100, Math.min(100, v)); S.offsets[key] = offs; save(); retune(); }
function retune() { panicSoft(); rebuildTuning(); applyGestureSettings(); renderSettings(); }
function panicSoft() { if (held.melody != null) { stopNote(held.melody); held.melody = null; melody.silence('retune'); } pointers.releaseAll(); if (accompSlot != null) setAccomp(null); }

els.system.onchange = () => { S.system = els.system.value; S.key = Object.keys(S.system === 'persian' ? PERSIAN : WESTERN)[0]; save(); retune(); };
els.scaleKey.onchange = () => { S.key = els.scaleKey.value; save(); retune(); };
els.root.onchange = () => { S.rootPc = Number(els.root.value); save(); retune(); };
els.octave.onchange = () => { S.octave = Number(els.octave.value); save(); retune(); };
els.ref.onchange = () => { S.refA4 = Math.max(415, Math.min(466, Number(els.ref.value) || 440)); save(); retune(); };
els.koron.onchange = () => { S.koron = Math.max(20, Math.min(90, Number(els.koron.value) || 60)); save(); };
els.reset.onclick = () => { delete S.offsets[S.system + ':' + S.key]; save(); retune(); };
els.policy.onchange = () => { S.policy = els.policy.value; save(); applyGestureSettings(); };
els.selection.onchange = () => { S.selection = els.selection.value; save(); applyGestureSettings(); };
els.swap.onchange = () => { S.swap = els.swap.checked; save(); panicSoft(); };
els.lefty.onchange = () => { S.lefty = els.lefty.checked; save(); panicSoft(); };
els.single.onchange = () => { S.single = els.single.checked; save(); panicSoft(); };
els.accomp.onchange = () => { S.accomp = els.accomp.checked; save(); if (!S.accomp) setAccomp(null); renderAccompPads(); };
els.bpm.onchange = () => { S.bpm = Math.max(50, Math.min(160, Number(els.bpm.value) || 84)); save(); if (engine?.rhythm) { engine.stopRhythm(); engine.startRhythm({ bpm: S.bpm }); } };
els.rhythm.onchange = () => { S.rhythm = els.rhythm.checked; save(); if (!engine) return; if (S.rhythm) engine.startRhythm({ bpm: S.bpm }); else engine.stopRhythm(); };
els.diag.onchange = () => { S.diag = els.diag.checked; save(); els.diagOut.hidden = !S.diag; };
els.recal.onclick = () => { if (S.input !== 'camera' || !tracker) return; S.calibrated = false; save(); onboarding.go('right'); };
let instrumentJob = null;
els.instrument.onchange = async () => {
  const key = els.instrument.value; instrumentJob?.abort(); const job = instrumentJob = new AbortController();
  panicSoft();
  els.soundNote.textContent = 'در حال بارگیری صدای ' + INSTRUMENTS[key].fa + '…';
  try { await engine.setInstrument(key, { signal: job.signal, onProgress: p => { if (job === instrumentJob) els.soundNote.textContent = 'در حال بارگیری صدای ' + INSTRUMENTS[key].fa + '… ' + fa(Math.round(p * 100)) + '٪'; } }); if (job !== instrumentJob) return; S.instrument = key; save(); renderSettings(); }
  catch (e) { if (e?.name === 'AbortError') return; els.instrument.value = S.instrument; els.soundNote.textContent = 'صدای این ساز دریافت نشد؛ اتصال را بررسی کن. ساز قبلی فعال ماند.'; }
};

// ---------------------------------------------------------------- modes
let exercise = null, exIndex = 0;
document.querySelectorAll('.air-modes [data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
function setMode(m) {
  mode = m;
  document.querySelectorAll('.air-modes [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  els.learn.hidden = m !== 'learn';
  if (m === 'learn') startExercise(exIndex); else exercise = null;
  if (m === 'perform') enterPerform(); else exitPerform();
}
function startExercise(i) {
  exIndex = i % EXERCISES.length; const def = EXERCISES[exIndex];
  exercise = new Exercise(def.id, { degrees: scaleLen() });
  const box = el('div', 'air-ex');
  const nav = el('div', 'air-ex-nav'); EXERCISES.forEach((x, k) => { const b = el('button', 'air-mini' + (k === exIndex ? ' is-on' : ''), fa(k + 1)); b.type = 'button'; b.title = x.fa; b.setAttribute('aria-label', x.fa); b.onclick = () => startExercise(k); nav.append(b); });
  box.append(nav, el('b', '', def.fa), el('p', 'air-ex-prompt', exercise.prompt(d => label(d) + ' (درجهٔ ' + fa(d + 1) + ')')), el('p', 'air-ex-feedback', ''));
  if (def.id === 'interval') { const b = el('button', 'air-btn air-btn--ghost', 'پخش فاصله'); b.type = 'button'; b.onclick = () => playInterval(exercise.target); box.append(b); }
  const again = el('button', 'air-btn air-btn--ghost', 'تمرین تازه'); again.type = 'button'; again.onclick = () => startExercise(exIndex); box.append(again);
  els.learn.replaceChildren(box);
}
function playInterval(target) { if (!engine) return; target.forEach((d, k) => setTimeout(() => { const id = engine.noteOn(freqFor(d, 1), { velocity: 0.7, meta: { demo: true } }); setTimeout(() => engine.noteOff(id), 650); }, k * 800)); }
function feedExercise(e) {
  if (!exercise || e.bus !== 'melody' || e.demo) return;
  const r = exercise.handle(e); if (!r) return;
  const fb = els.learn.querySelector('.air-ex-feedback'); if (fb) { fb.textContent = r.message; fb.classList.toggle('is-ok', !!r.ok); }
  if (r.done) setTimeout(() => { if (mode === 'learn') startExercise(exIndex + 1); }, 1800);
}
function enterPerform() {
  document.body.classList.add('is-perform'); els.exit.hidden = false;
  const tgt = document.documentElement;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!iOS && tgt.requestFullscreen && !document.fullscreenElement) tgt.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  if (S.rhythm && engine && !engine.rhythm) engine.startRhythm({ bpm: S.bpm });
}
function exitPerform() {
  document.body.classList.remove('is-perform'); els.exit.hidden = !playing;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && mode === 'perform') { /* keep in-page immersive layout */ } });

// ---------------------------------------------------------------- recording & export
let recTimer = null;
els.rec.onclick = async () => {
  if (!engine) return;
  if (!engine.recording) {
    try { await engine.startRecording(); } catch { els.recTime.textContent = 'ضبط در این مرورگر ممکن نشد'; return; }
    recordStart = engine.now; events = [];
    els.rec.setAttribute('aria-pressed', 'true'); els.rec.querySelector('span').textContent = 'پایان ضبط';
    recTimer = setInterval(() => { const s = Math.floor(engine.recordedSeconds()); els.recTime.textContent = fa(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')); if (s >= engine.recordLimitSec) stopRecording(); }, 250);
  } else stopRecording();
};
async function stopRecording() {
  clearInterval(recTimer);
  const r = await engine.stopRecording();
  els.rec.setAttribute('aria-pressed', 'false'); els.rec.querySelector('span').textContent = 'ضبط';
  if (!r) return;
  const l = concatChunks(r.chunks[0]), rr = concatChunks(r.chunks[1]);
  if (!l.length) { els.recTime.textContent = 'صدایی ضبط نشد'; return; }
  const wav = encodeWav([l, rr], r.sampleRate);
  // close any note still sounding at the end of the take so the MIDI file has matching note-offs
  const take = events.filter(e => e.time >= r.startedAt - 0.01 && e.time <= r.endedAt + 0.01);
  const openIds = new Set(); take.forEach(e => e.type === 'on' ? openIds.add(e.id) : openIds.delete(e.id));
  openIds.forEach(id => take.push({ type: 'off', id, time: r.endedAt }));
  addTake(wav, take, l.length / r.sampleRate);
  els.next.hidden = false;
}
function addTake(wav, take, seconds) {
  takes.forEach(t => t.urls.forEach(u => URL.revokeObjectURL(u))); // keep only the newest take in memory
  const blob = new Blob([wav], { type: 'audio/wav' }), url = URL.createObjectURL(blob);
  const micro = encodeMidi(take, { mode: 'microtonal', refA4: tuning.refA4 }), round = encodeMidi(take, { mode: 'rounded', refA4: tuning.refA4 });
  const mu = URL.createObjectURL(new Blob([micro.bytes], { type: 'audio/midi' })), ru = URL.createObjectURL(new Blob([round.bytes], { type: 'audio/midi' }));
  takes = [{ urls: [url, mu, ru] }];
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const box = el('div', 'air-take');
  const audio = el('audio'); audio.controls = true; audio.src = url; audio.preload = 'metadata';
  const a1 = el('a', 'air-btn air-btn--light', 'دانلود WAV'); a1.href = url; a1.download = 'hezarava-' + stamp + '.wav';
  const a2 = el('a', 'air-btn air-btn--ghost', 'MIDI با ریزپرده‌ها'); a2.href = mu; a2.download = 'hezarava-' + stamp + '-microtonal.mid';
  const a3 = el('a', 'air-btn air-btn--ghost', 'MIDI گردشده'); a3.href = ru; a3.download = 'hezarava-' + stamp + '-rounded.mid';
  box.append(el('b', '', 'ضبط ' + fa(Math.round(seconds)) + ' ثانیه‌ای · ' + fa(micro.notes) + ' نت'), audio, el('div', 'air-take-links'), el('p', 'air-fine', 'MIDI با ریزپرده‌ها برای هر نت هم‌زمان یک کانال جدا و Pitch Bend با بازهٔ ±۲ نیم‌پرده می‌سازد؛ فقط نرم‌افزارهایی که Pitch Bend هر کانال را می‌پذیرند کوک را دقیق پخش می‌کنند.' + (micro.rounded ? ' ' + fa(micro.rounded) + ' نت به‌خاطر کمبود کانال گرد شد.' : '') + ' نسخهٔ گردشده همه‌جا پخش می‌شود ولی ریزپرده‌ها را به نزدیک‌ترین نیم‌پرده می‌برد.'));
  box.querySelector('.air-take-links').append(a1, a2, a3);
  els.takes.replaceChildren(box); els.takes.hidden = false;
}

// ---------------------------------------------------------------- rendering (decoupled from inference and audio)
const g = els.canvas.getContext('2d');
let particles = [], frameAvg = 16, lastFrame = performance.now(), raf = 0;
const goldLines = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
function burst(degree, band) {
  if (reduceMotion.matches || frameAvg > 26) return;
  const W = els.canvas.width, H = els.canvas.height, x = (degree + 0.5) / scaleLen() * W, y = (1 - (band + 0.5) / 3) * H; // approximate; decorative only
  for (let i = 0; i < 14 && particles.length < 60; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2 - 0.5, life: 1 });
}
function resizeCanvas() {
  const r = els.surface.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  els.canvas.width = Math.round(r.width * dpr); els.canvas.height = Math.round(r.height * dpr);
}
new ResizeObserver(resizeCanvas).observe(els.surface);
function draw(now) {
  raf = requestAnimationFrame(draw);
  const dt = now - lastFrame; lastFrame = now; frameAvg += (dt - frameAvg) * 0.05;
  const W = els.canvas.width, H = els.canvas.height; g.clearRect(0, 0, W, H);
  if (S.input !== 'camera') return;
  const cols = scaleLen(), dpr = W / els.canvas.clientWidth || 1;
  // map normalised frame coordinates through the same "cover" crop the video element uses
  const vw = els.video.videoWidth || 4, vh = els.video.videoHeight || 3, sc = Math.max(W / vw, H / vh), ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2;
  const X = x => ox + x * vw * sc, Y = y => oy + y * vh * sc;
  // octave bands and note columns
  g.lineWidth = 1 * dpr;
  for (let b = 0; b < 3; b++) { g.fillStyle = b % 2 ? 'rgba(20,48,45,.10)' : 'rgba(20,48,45,0)'; g.fillRect(0, Y((2 - b) / 3), W, Y((3 - b) / 3) - Y((2 - b) / 3)); }
  for (let c = 0; c < cols; c++) {
    const x0 = X(c / cols), w = X((c + 1) / cols) - x0;
    const isSel = selected?.degree === c, isOn = [...sounding].some(s => s.startsWith(c + ':'));
    if (isSel || isOn) { g.fillStyle = isOn ? 'rgba(233,214,166,.30)' : 'rgba(233,214,166,.12)'; g.fillRect(x0, 0, w, H); }
    g.strokeStyle = 'rgba(244,231,198,.22)'; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, H); g.stroke();
    g.fillStyle = 'rgba(253,247,234,.9)'; g.font = `${13 * dpr}px Vazir, Tahoma`; g.textAlign = 'center'; g.fillText(label(c), x0 + w / 2, Math.max(0, Y(0)) + 46 * dpr);
  }
  for (let b = 1; b < 3; b++) { g.strokeStyle = 'rgba(244,231,198,.18)'; g.setLineDash([4 * dpr, 6 * dpr]); g.beginPath(); g.moveTo(0, Y(b / 3)); g.lineTo(W, Y(b / 3)); g.stroke(); g.setLineDash([]); }
  // hands (stale after 300 ms → hidden)
  if (now - lastHandsAt < 300) for (const h of lastHands) {
    const P = h.landmarks.map(p => [X(p.x), Y(p.y)]);
    g.strokeStyle = 'rgba(214,183,120,.95)'; g.lineWidth = 2.2 * dpr; g.lineCap = 'round';
    for (const line of goldLines) { g.beginPath(); line.forEach((k, i) => i ? g.lineTo(...P[k]) : g.moveTo(...P[k])); g.stroke(); }
    for (const k of [4, 8, 12, 16, 20]) { g.fillStyle = k === 4 || k === 8 ? '#fdf3dc' : 'rgba(253,243,220,.7)'; g.beginPath(); g.arc(...P[k], (k === 4 || k === 8 ? 5 : 3.5) * dpr, 0, 7); g.fill(); }
  }
  // accompaniment indicator: soft wave whose height follows expression
  if (accompSlot != null) {
    g.strokeStyle = 'rgba(127,192,179,.7)'; g.lineWidth = 2 * dpr; g.beginPath();
    const amp = (6 + lastAccompExpr * 22) * dpr, ph = reduceMotion.matches ? 0 : now / 600;
    for (let x = 0; x <= W; x += 8 * dpr) { const y = H - 34 * dpr + Math.sin(x / (60 * dpr) + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  // particles (capped, disabled under reduced motion or when frames are slow)
  if (particles.length) {
    particles = particles.filter(p => (p.life -= dt / 900) > 0);
    for (const p of particles) { p.x += p.vx * dpr; p.y += p.vy * dpr; g.fillStyle = `rgba(233,214,166,${p.life * 0.8})`; g.beginPath(); g.arc(p.x, p.y, 2.2 * dpr, 0, 7); g.fill(); }
  }
}

// ---------------------------------------------------------------- lifecycle: start / stop / background
async function startPlaying() {
  if (started) return; started = true;
  els.start.disabled = true;
  S.input = document.querySelector('input[name="air-input"]:checked')?.value || 'touch'; save();
  engine = new AudioEngine();
  try { await engine.start(); }                       // the click gesture unlocks audio here
  catch { started = false; els.start.disabled = false; alertIntro('مرورگر اجازهٔ پخش صدا نداد. دوباره «شروع نوازندگی» را بزن.'); return; }
  life.add('engine', () => engine.dispose());
  engine.on(e => {
    if (e.type === 'on' || e.type === 'off') { events.push(e); if (events.length > 20000) events.splice(0, 5000); if (mode === 'learn') feedExercise(e); }
    if (e.type === 'state' && e.state !== 'running' && playing) overlay('صدا متوقف شد', 'مرورگر پخش صدا را متوقف کرد (مثلاً با تماس تلفنی یا رفتن به برنامهٔ دیگر).', [['ادامه', resumeAll, true]]);
    if (e.type === 'record-limit') stopRecording();
  });
  if (INSTRUMENTS[S.instrument].kind === 'sampled') engine.setInstrument(S.instrument).catch(() => { S.instrument = 'soft'; renderSettings(); });
  playing = true; els.intro.hidden = true; els.play.hidden = false; els.exit.hidden = false; window.scrollTo(0, 0);
  rebuildTuning(); applyGestureSettings(); renderSettings(); resizeCanvas();
  raf = requestAnimationFrame(draw); life.add('render', () => cancelAnimationFrame(raf));
  const diagTimer = setInterval(updateDiagnostics, 500); life.add('diag', () => clearInterval(diagTimer));
  if (S.rhythm) engine.startRhythm({ bpm: S.bpm });
  if (S.input === 'camera') await startCamera(); else startTouch();
}
function alertIntro(msg) { let p = els.intro.querySelector('.air-error'); if (!p) { p = el('p', 'air-error'); els.start.after(p); } p.textContent = msg; p.setAttribute('role', 'alert'); }
function startTouch(reason) {
  S.input = 'touch'; els.pads.hidden = false; els.video.hidden = true; els.surface.classList.add('is-touch');
  status.camera = reason || 'حالت لمسی'; status.model = ''; status.hands = ''; status.stability = ''; renderStatus();
  guide(guideDismissed && !reason ? null : 'نوازندگی لمسی', 'روی هر درجه بزن و نگه دار؛ چند انگشت هم‌زمان کار می‌کند. روی رایانه، ردیف‌های Z، A و Q صفحه‌کلید سه اکتاو را می‌نوازند و ۱ تا ۵ همراهی را روشن می‌کند.');
}
async function startCamera() {
  els.pads.hidden = true; els.video.hidden = false; els.surface.classList.remove('is-touch');
  const { Camera, HandTracker, frameBrightness } = await import('./tracker.mjs');
  camera = new Camera(els.video);
  status.camera = 'درخواست دسترسی به دوربین…'; renderStatus();
  try { await camera.start({ quality: (navigator.hardwareConcurrency || 4) <= 4 ? 'low' : 'normal' }); }
  catch (e) {
    const msg = { denied: 'اجازهٔ دوربین داده نشد.', missing: 'دوربینی پیدا نشد.', busy: 'دوربین در اختیار برنامهٔ دیگری است.', unsupported: 'این مرورگر دسترسی به دوربین را پشتیبانی نمی‌کند.' }[e.code] || 'دوربین شروع نشد.';
    overlay(msg, 'می‌توانی با لمس صفحه یا صفحه‌کلید بنوازی، یا پس از بررسی تنظیمات مرورگر دوباره امتحان کنی.', [['نوازندگی لمسی', () => { overlay(null); startTouch('دوربین در دسترس نیست؛ حالت لمسی'); }, true], ['تلاش دوباره', () => { overlay(null); startCamera(); }]]);
    status.camera = msg; renderStatus(); return;
  }
  life.add('camera', () => camera.stop());
  camera.onended = () => { if (playing) overlay('دوربین قطع شد', 'اتصال دوربین قطع شد.', [['اتصال دوباره', () => { overlay(null); startCamera(); }, true], ['نوازندگی لمسی', () => { overlay(null); startTouch('حالت لمسی'); }]]); };
  status.camera = 'دوربین فعال'; status.model = 'در حال بارگیری تشخیص دست… ۰٪'; renderStatus();
  if (!tracker) {
    tracker = new HandTracker();
    const ctl = new AbortController(); life.add('model-download', () => ctl.abort());
    try { await life.once('model', () => tracker.load({ signal: ctl.signal, onProgress: p => { status.model = 'در حال بارگیری تشخیص دست… ' + fa(Math.round(p * 100)) + '٪'; renderStatus(); } })); }
    catch (e) {
      tracker = null; status.model = 'تشخیص دست بارگیری نشد'; renderStatus();
      overlay('تشخیص دست بارگیری نشد', 'فایل‌های تشخیص دست دریافت یا اجرا نشدند. اتصال را بررسی کن و دوباره امتحان کن، یا با حالت لمسی ادامه بده.', [['تلاش دوباره', () => { overlay(null); camera.stop(); startCamera(); }, true], ['نوازندگی لمسی', () => { overlay(null); camera.stop(); startTouch('حالت لمسی'); }]]);
      return;
    }
    life.add('tracker', () => { tracker?.dispose(); tracker = null; });
  }
  status.model = 'تشخیص دست آماده (' + tracker.stats.delegate + ')'; renderStatus();
  router = new HandRouter({ transform: makeTransform({ mirrored: true, swap: S.swap, labelForRight: S.labelForRight }), mode: S.single ? 'single' : 'two', leftHanded: S.lefty });
  tracker.onError = () => { status.model = 'خطای موقت در تشخیص'; renderStatus(); };
  tracker.onDelegate = d => { status.model = 'تشخیص دست آماده (' + d + ')'; renderStatus(); };
  const slowTimer = setInterval(() => { if (tracker?.stats.slow) { status.model = 'تشخیص دست روی این دستگاه کند است؛ حالت لمسی روان‌تر است'; renderStatus(); } }, 3000);
  life.add('slow', () => clearInterval(slowTimer));
  tracker.start(els.video, (t, hands) => { handleHands(t, hands); });
  // low-light hint, checked every 2 s on a tiny copy of the frame (no pixels leave the page)
  const probe = document.createElement('canvas');
  const lightTimer = setInterval(() => { const b = frameBrightness(els.video, probe); status.light = b != null && b < 45 ? 'نور کم است؛ صورتت را به سمت نور بچرخان' : ''; renderStatus(); }, 2000);
  life.add('light', () => clearInterval(lightTimer));
  onboarding.begin();
}
async function stopPlaying() {
  if (!started) return;
  panic(); playing = false;
  if (engine?.recording) await stopRecording();
  onboarding.step = 'idle'; guide(null); overlay(null); exitPerform();
  await life.stop();
  engine = null; camera = null; tracker = null; started = false;
  els.play.hidden = true; els.intro.hidden = false; els.start.disabled = false; els.exit.hidden = true;
  if (noteCount > 0) els.next.hidden = false;
}
els.exit.onclick = () => { if (mode === 'perform') setMode('free'); else stopPlaying(); };
els.start.onclick = startPlaying;

async function resumeAll() {
  overlay(null);
  try { await engine.start(); } catch { overlay('صدا ادامه پیدا نکرد', 'دوباره امتحان کن.', [['ادامه', resumeAll, true]]); return; }
  if (S.input === 'camera' && camera && !camera.active) {
    try { await camera.start(); tracker?.start(els.video, (t, hands) => handleHands(t, hands)); }
    catch { startTouch('دوربین دوباره روشن نشد؛ حالت لمسی'); }
  }
  if (S.rhythm) engine.startRhythm({ bpm: S.bpm });
}
document.addEventListener('visibilitychange', async () => {
  if (!playing) return;
  if (document.hidden) {
    panic(); tracker?.stop();
    if (camera?.active) camera.stop();
    await engine?.suspend();
  } else overlay('ادامهٔ نوازندگی', 'برای جلوگیری از صدای ناگهانی، پخش و دوربین متوقف شدند.', [['ادامه', resumeAll, true], ['پایان', () => { overlay(null); stopPlaying(); }]]);
});
window.addEventListener('pagehide', () => { if (started) { panic(); life.stop(); } });
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 300));

function updateDiagnostics() {
  if (!S.diag) return;
  const st = tracker?.stats;
  els.diagOut.textContent = [
    'وضعیت AudioContext: ' + (engine?.state || '-'),
    'صداهای فعال: ' + (engine?.activeVoices ?? 0),
    st ? `استنتاج: ${st.hz} بار در ثانیه · ${st.ms.toFixed(1)} میلی‌ثانیه پردازش · ${st.dropped} فریم رد شده · ${st.delegate}` : 'استنتاج: -',
    'پایداری ژست ملودی: ' + melody.stability + ' · وضعیت: ' + melody.state,
    'امتیاز مدل (handedness): ' + (lastHands.map(h => h.label + ' ' + (h.score ?? 0).toFixed(2)).join(' / ') || '-'),
    'زمان فریم رسم: ' + frameAvg.toFixed(1) + ' میلی‌ثانیه',
    'این اعداد تأخیر واقعی صدا از دست تا گوش نیستند.',
  ].join('\n');
}

renderSettings();
const pick = document.querySelector(`input[name="air-input"][value="${navigator.mediaDevices?.getUserMedia ? S.input : 'touch'}"]`); if (pick) pick.checked = true;
if (!navigator.mediaDevices?.getUserMedia) document.querySelector('input[name="air-input"][value="camera"]').disabled = true;
// test hook for automated browser checks (no effect on normal use)
window.__air = { feed: (t, hands) => router && handleHands(t, hands), pauseTracking: () => tracker?.stop(), get step() { return onboarding.step; }, get engine() { return engine; }, get life() { return life; }, panic, stopPlaying, startPlaying, get events() { return events; } };
