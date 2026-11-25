// هزارآوا | دستانِ نوا — controller. One audio engine; camera gestures, touch and keyboard all drive the same
// melody and pad logic. The interface is performance first: surface, indicators, instrument, transport; every
// detailed setting lives in the settings panel.
import { makeTuning, degreeFrequency, degreeLabel, rootFrequency, padSlots, voiceLead, WESTERN, PERSIAN, PERSIAN_NOTE, NOTE_NAMES_FA } from './tuning.mjs';
import { HandMachine, HandRouter, handFeatures, makeTransform, DEFAULTS } from './gesture.mjs';
import { AudioEngine, INSTRUMENTS } from './engine.mjs';
import { encodeWav, concatChunks, encodeMidi } from './export.mjs';
import { Lifecycle } from './lifecycle.mjs';
import { PointerVoices } from './touch.mjs';
import { EXERCISES, Exercise } from './learn.mjs';
import { tutorialSteps, PlayCheck } from './tutorial.mjs';

const $ = s => document.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const desktop = matchMedia('(min-width: 900px) and (min-height: 501px)');
const store = { get(k, d) { try { const v = localStorage.getItem('air:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('air:' + k, JSON.stringify(v)); } catch {} } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ---------------------------------------------------------------- settings
const S = Object.assign({
  input: 'camera', system: 'persian', key: 'shur', rootPc: 7, octave: 4, refA4: 440, offsets: {}, instrument: 'soft', volume: 0.8,
  accomp: true, hold: false, padVol: 0.45, bright: 'warm', rhythm: false, bpm: 84,
  policy: 'hold', selection: 'zones', swap: false, lefty: false, single: false,
  koron: 60, diag: false, labelForRight: 'Left', pinchOn: DEFAULTS.pinchOn, pinchOff: DEFAULTS.pinchOff, calibrated: false, practiced: false,
}, store.get('settings', {}));
const save = () => store.set('settings', S);
let tuning, slots;
function rebuildTuning() {
  tuning = makeTuning({ system: S.system, key: S.key, rootPc: S.rootPc, octave: S.octave, refA4: S.refA4, offsets: S.offsets[S.system + ':' + S.key] || [] });
  slots = padSlots(tuning);
}
rebuildTuning();

// ---------------------------------------------------------------- core objects
const life = new Lifecycle();
let engine = null, camera = null, tracker = null, router = null;
const melody = new HandMachine({ columns: 7, octaves: 3 });
const accomp = new HandMachine({ columns: 4, octaves: 1, selection: 'fingers' });
const held = { melody: null };
const pad = { slot: null, source: null, voicing: null, candidate: null };
let sounding = new Set(), selected = null, padExpr = 0.6;
let started = false, playing = false, paused = false, perform = false, events = [], takes = [], noteCount = 0;

const els = {
  intro: $('#air-intro'), play: $('#air-play'), start: $('#air-start'), exit: $('#air-exit'), panic: $('#air-panic'), full: $('#air-full'), help: $('#air-help'),
  video: $('#air-video'), canvas: $('#air-canvas'), pads: $('#air-pads'), chords: $('#air-chords'), status: $('#air-status'), surface: $('#air-surface'),
  coach: $('#air-coach'), coachTitle: $('#air-coach-title'), coachBody: $('#air-coach-body'), coachChecks: $('#air-coach-checks'), coachActions: $('#air-coach-actions'),
  overlay: $('#air-overlay'), overlayTitle: $('#air-overlay-title'), overlayBody: $('#air-overlay-body'), overlayActions: $('#air-overlay-actions'),
  mMelody: $('#air-m-melody'), mNote: $('#air-m-note'), mNoteState: $('#air-m-note-state'), mMelodyHand: $('#air-m-melody-hand'),
  mPad: $('#air-m-pad'), mChord: $('#air-m-chord'), mChordState: $('#air-m-chord-state'), mPadHand: $('#air-m-pad-hand'), mExpr: $('#air-m-expr'),
  scale: $('#air-scale'), summary: $('#air-summary'), inst: $('#air-inst'), instPanel: $('#air-inst-panel'), instNote: $('#air-inst-note'),
  toggle: $('#air-toggle'), rec: $('#air-rec'), recTime: $('#air-rec-time'), learnBtn: $('#air-learn-btn'), settingsBtn: $('#air-settings-btn'),
  take: $('#air-take'), takeRec: $('#air-take-rec'), takeTime: $('#air-take-time'), takeStop: $('#air-take-stop'), takeDone: $('#air-take-done'), takePlay: $('#air-take-play'),
  takeTitle: $('#air-take-title'), takeMeta: $('#air-take-meta'), takeWav: $('#air-take-wav'), takeMicro: $('#air-take-mid-micro'), takeRound: $('#air-take-mid-round'),
  takeMidiHelp: $('#air-take-midi-help'), takeClose: $('#air-take-close'), takeError: $('#air-take-error'), takeAudio: $('#air-take-audio'), takeMidi: $('#air-take-midi'),
  panel: $('#air-panel'), scrim: $('#air-scrim'), panelClose: $('#air-panel-close'),
  volume: $('#air-volume'), volumeOut: $('#air-volume-out'), scaleKey: $('#air-scale-key'), scaleKeyLabel: $('#air-scale-key-label'), root: $('#air-root'),
  persianNote: $('#air-persian-note'), musicHelpTitle: $('#air-music-help-title'),
  accomp: $('#air-accomp'), accompHint: $('#air-accomp-hint'), hold: $('#air-hold'), slotList: $('#air-slots'), padVol: $('#air-padvol'), padVolOut: $('#air-padvol-out'),
  rhythm: $('#air-rhythm'), bpm: $('#air-bpm'), ref: $('#air-ref'), koron: $('#air-koron'), tuningBox: $('#air-tuning'), reset: $('#air-reset-tuning'),
  swap: $('#air-swap'), lefty: $('#air-lefty'), single: $('#air-single'), recal: $('#air-recalibrate'), diag: $('#air-diag'), diagOut: $('#air-diag-out'),
  tut: $('#air-tut'), tutBody: $('#air-tut-body'), tutTitle: $('#air-tut-title'), tutCount: $('#air-tut-count'), tutPrev: $('#air-tut-prev'), tutNext: $('#air-tut-next'), tutDots: $('#air-tut-dots'),
  credits: $('#air-credits'), next: $('#air-next'), nextInst: $('#air-next-inst'),
};
const radios = name => $$(`input[name="${name}"]`);
const setRadio = (name, value) => radios(name).forEach(r => { r.checked = String(r.value) === String(value); });

// ---------------------------------------------------------------- status chips, coach, overlay
const status = { camera: '', model: '', hands: '', light: '' };
function renderStatus() { els.status.replaceChildren(...Object.entries(status).filter(([, v]) => v).map(([k, v]) => el('span', 'air-chip air-chip--' + k, v))); }
function coach(title, body, actions = [], checks = null) {
  if (!title) { els.coach.hidden = true; return; }
  els.coachTitle.textContent = title; els.coachBody.textContent = body || '';
  els.coachActions.replaceChildren(...actions.map(([label, fn, primary]) => { const b = el('button', 'air-btn air-btn--small ' + (primary ? 'air-btn--primary' : 'air-btn--ghost'), label); b.type = 'button'; b.onclick = fn; return b; }));
  if (checks) { els.coachChecks.replaceChildren(...checks.map(([label, st]) => el('li', st === 'ok' ? 'is-ok' : st === 'now' ? 'is-now' : '', label))); els.coachChecks.hidden = false; }
  else els.coachChecks.hidden = true;
  els.coach.hidden = false;
}
$('#air-coach-close').onclick = () => { coach(null); if (practice) stopPractice(); if (onboarding.step === 'right' || onboarding.step === 'pinch') onboarding.go('free'); if (learnMode) setLearn(false); };
function overlay(title, body, actions = []) {
  if (!title) { els.overlay.hidden = true; return; }
  els.overlayTitle.textContent = title; els.overlayBody.textContent = body || '';
  els.overlayActions.replaceChildren(...actions.map(([label, fn, primary]) => { const b = el('button', 'air-btn ' + (primary ? 'air-btn--light' : 'air-btn--ghost'), label); b.type = 'button'; b.onclick = fn; return b; }));
  els.overlay.hidden = false; els.overlayActions.querySelector('button')?.focus();
}

// ---------------------------------------------------------------- melody
const scaleLen = () => tuning.cents.length;
const label = d => degreeLabel(tuning, d).fa;
const freqFor = (degree, band) => degreeFrequency(tuning, degree, band - 1);
const BAND_FA = ['بم', 'میانه', 'زیر'];
function playNote(degree, band, source, velocity = 0.8) {
  if (!engine) return null;
  const id = engine.noteOn(freqFor(degree, band), { velocity, bus: 'melody', meta: { degree, octave: band, source } });
  if (id != null) { sounding.add(degree + ':' + band); noteCount++; burst(degree, band); renderMeters(); }
  return id;
}
function stopNote(id) { if (id != null) engine?.noteOff(id); }
const melodySounding = () => held.melody != null || pointers.size > 0;

// ---------------------------------------------------------------- pad (shared by camera, touch and keyboard)
function padBase() { return rootFrequency(tuning.rootPc, tuning.octave - 1, tuning.refA4); }
function padStart(slot, src) {
  const s = slots[slot]; if (!s || !engine) return;
  pad.voicing = voiceLead(s.cents, pad.slot != null || pad.voicing ? pad.voicing : null);
  const base = padBase();
  engine.setPad(pad.voicing.map(c => base * Math.pow(2, c / 1200)), { slot, label: s.label, source: src.split(':')[0] });
  pad.slot = slot; pad.source = src; renderMeters(); renderChordPads();
}
function padStop() { if (!engine) return; engine.releasePad(); pad.slot = null; pad.source = null; renderMeters(); renderChordPads(); }
/** A press from any input. In hold mode a press toggles (another slot switches chords smoothly). */
function padPress(slot, src) {
  if (!engine || !S.accomp) return;
  if (S.hold && pad.slot === slot) { padStop(); return; }
  padStart(slot, src);
}
/** Release from the same input that started the pad (ignored in hold mode). */
function padRelease(src) { if (S.hold) return; if (pad.slot != null && pad.source === src) padStop(); }

function panic() {
  engine?.panic();
  held.melody = null; pointers.releaseAll(); chordPointers.clear(); heldKeys.clear();
  melody.silence('panic'); accomp.silence('panic'); pad.slot = null; pad.source = null; sounding.clear();
  if (S.rhythm) { S.rhythm = false; els.rhythm.checked = false; save(); }
  markPads(); renderChordPads(); renderMeters(); renderScaleStrip();
}
els.panic.onclick = panic;
function panicSoft() { if (held.melody != null) { stopNote(held.melody); held.melody = null; melody.silence('retune'); } pointers.releaseAll(); markPads(); if (pad.slot != null) padStop(); accomp.silence('retune'); }

// ---------------------------------------------------------------- camera: gestures
function applyGestureSettings() {
  const common = { pinchOn: S.pinchOn, pinchOff: S.pinchOff };
  melody.configure({ ...common, sustainPolicy: S.policy, selection: S.selection, columns: scaleLen(), octaves: 3 });
  accomp.configure({ ...common, sustainPolicy: 'hold', selection: 'fingers', fingerHalves: false, freezeMargin: 0.15, columns: 4, octaves: 1 });
}
let routeRole = {}, lastHands = [], lastHandsAt = 0;
function handleHands(t, hands) {
  const transform = makeTransform({ mirrored: true, swap: S.swap, labelForRight: S.labelForRight });
  router.transform = transform; router.leftHanded = S.lefty; router.mode = S.single ? 'single' : 'two';
  const dets = hands.map(h => ({ landmarks: h.landmarks.map(transform.point), label: h.label, score: h.score }));
  lastHands = dets; lastHandsAt = t;
  if (onboarding.handle(t, dets)) return;
  const locked = id => (routeRole[id] === 'melody' && held.melody != null) || (routeRole[id] === 'accomp' && pad.slot != null && pad.source === 'camera');
  const routed = router.route(t, dets, locked);
  routeRole = {}; routed.forEach(r => { routeRole[r.slot] = r.role; });
  const byRole = { melody: null, accomp: null };
  for (const r of routed) if (!byRole[r.role]) byRole[r.role] = r;
  const m = byRole.melody ? { features: handFeatures(byRole.melody.det.landmarks), confidence: byRole.melody.det.score } : null;
  for (const e of melody.update(t, m)) applyMelody(e);
  const a = byRole.accomp && !S.single ? { features: handFeatures(byRole.accomp.det.landmarks), confidence: byRole.accomp.det.score } : null;
  for (const e of accomp.update(t, a)) applyAccomp(e);
  if (a) { const expr = Math.max(0, Math.min(1, (0.85 - a.features.center.y) / 0.6)); padExpr += (expr - padExpr) * 0.25; engine.setExpression(padExpr); els.mExpr.style.width = Math.round(padExpr * 100) + '%'; }
  status.hands = hands.length ? (hands.length === 2 ? 'دو دست' : 'یک دست') : 'دستی دیده نمی‌شود';
}
function applyMelody(e) {
  if (e.type === 'select') { selected = { degree: e.degree, octave: e.octave }; renderScaleStrip(); renderMeters(); }
  else if (e.type === 'on') { if (held.melody != null) stopNote(held.melody); held.melody = playNote(e.degree, e.octave, 'camera'); }
  else if (e.type === 'off') { stopNote(held.melody); held.melody = null; sounding.clear(); renderScaleStrip(); renderMeters(); }
  else if (e.type === 'move') { engine.setFrequency(held.melody, freqFor(e.degree, e.octave)); selected = { degree: e.degree, octave: e.octave }; sounding = new Set([e.degree + ':' + e.octave]); renderScaleStrip(); renderMeters(); }
  else if (e.type === 'retrigger') { stopNote(held.melody); sounding.clear(); held.melody = playNote(e.degree, e.octave, 'camera'); }
}
function applyAccomp(e) {
  if (e.type === 'select') { pad.candidate = e.degree % 4; renderMeters(); }
  else if (e.type === 'on') padPress(e.degree % 4, 'camera');
  else if (e.type === 'off' && e.reason === 'release') padRelease('camera');
  else if (e.type === 'fist') { if (pad.slot != null) padStop(); }
  else if ((e.type === 'lost' || (e.type === 'off' && e.reason === 'lost')) && !S.hold && pad.source === 'camera') padStop();
}

// ---------------------------------------------------------------- onboarding: calibration, then the two-hand practice
const onboarding = {
  step: 'idle', since: 0, cand: null, pinch: { min: 9, max: 0, n: 0 },
  begin() { if (!S.calibrated) this.go('right'); else this.go(S.practiced ? 'free' : 'practice'); },
  go(step) {
    this.step = step; this.since = performance.now(); this.cand = null;
    const skip = ['رد کردن', () => this.go(step === 'right' ? 'pinch' : 'practice')];
    const mh = S.lefty ? 'چپ' : 'راست';
    if (step === 'right') coach(`دست ${mh}ت را بالا بیاور`, `فقط دست ${mh}ت را باز جلوی دوربین نگه دار تا چپ و راست را بشناسیم.`, [skip]);
    else if (step === 'pinch') { this.pinch = { min: 9, max: 0, n: 0 }; coach('چند بار نیشگون بگیر', 'نوک شست و اشاره را چند بار به هم برسان و باز کن تا اندازهٔ دستت را بشناسیم.', [skip]); }
    else if (step === 'practice') { if (!practice) startPractice(); }
    else if (step === 'free') { if (!practice && !learnMode) coach(null); }
  },
  handle(t, dets) {
    if (this.step === 'right') {
      if (dets.length === 1) {
        if (!this.cand || this.cand.label !== dets[0].label) this.cand = { label: dets[0].label, at: t };
        else if (t - this.cand.at > 900) {
          // the calibrated hand is the melody hand; map labels so that it reads as the player's real side
          const mapsTo = S.lefty ? 'left' : 'right';
          S.labelForRight = mapsTo === 'right' ? dets[0].label : (dets[0].label === 'Left' ? 'Right' : 'Left');
          S.swap = false; els.swap.checked = false; save(); this.go('pinch');
        }
      } else this.cand = null;
      return true;
    }
    if (this.step === 'pinch') {
      if (dets.length) { const p = handFeatures(dets[0].landmarks).pinch; this.pinch.min = Math.min(this.pinch.min, p); this.pinch.max = Math.max(this.pinch.max, p); this.pinch.n++; }
      if (t - this.since > 4000 && this.pinch.n > 40 && this.pinch.max - this.pinch.min > 0.35) {
        const { min, max } = this.pinch, span = max - min;
        S.pinchOn = Math.max(0.15, Math.min(0.42, min + span * 0.3)); S.pinchOff = Math.max(S.pinchOn + 0.08, Math.min(0.62, min + span * 0.5));
        S.calibrated = true; save(); applyGestureSettings(); this.go(S.practiced ? 'free' : 'practice');
      }
      return true;
    }
    return false;
  },
};

let practice = null;
function practiceText() {
  const camera = S.input === 'camera', mh = S.lefty ? 'چپ' : 'راست', ah = S.lefty ? 'راست' : 'چپ';
  return {
    melody: camera ? `نت با دست ${mh}` : 'نت ملودی',
    pad: camera ? `پد با دست ${ah}` : 'پد همراهی',
    both: 'هر دو با هم',
    help: { melody: camera ? 'دست باز روی یک ستون، بعد شست و اشاره به هم.' : 'لمس کن و نگه دار.', pad: camera ? 'یک تا چهار انگشت باز، بعد شست و اشاره به هم.' : (S.hold ? 'یک بار بزن تا روشن بماند.' : 'نگهش دار.'), both: camera ? 'پد را با یک دست نگه دار و با دست دیگر نت بزن.' : 'با دو انگشت هم‌زمان.' },
  };
}
const camera_ = () => S.input === 'camera';
function startPractice() {
  const needPad = S.accomp && !(S.input === 'camera' && S.single);
  practice = new PlayCheck({ needPad }); renderPractice();
}
function stopPractice() { practice = null; if (!learnMode) coach(null); }
function renderPractice() {
  if (!practice) return;
  const T = practiceText(), order = practice.stages, i = order.indexOf(practice.stage);
  const checks = order.map((s, k) => [T[s], practice.stage === 'done' || k < i ? 'ok' : k === i ? 'now' : '']);
  if (practice.stage === 'done') {
    S.practiced = true; save();
    coach('عالی بود!', order.length > 1 ? 'ملودی و پد هم‌زمان شنیده شدند. حالا آزادانه بنواز.' : 'اولین نت را نواختی.', [['تکرار تمرین', () => startPractice()], ['ادامهٔ نوازندگی', () => { stopPractice(); if (learnMode) setLearn(false); }, true]], checks);
  } else coach('تمرین: ' + ({ melody: camera_(T) ? 'یک نت بنواز' : 'یک نت را لمس کن', pad: 'پد را روشن کن', both: 'ملودی روی پد' })[practice.stage], T.help[practice.stage], [['رد کردن', () => { S.practiced = true; save(); stopPractice(); if (learnMode) setLearn(false); }], ['راهنمای تصویری', () => openTutorial()]], checks);
}

// ---------------------------------------------------------------- touch & keyboard
const pointers = new PointerVoices(p => { const [d, o] = p.split(':').map(Number); return playNote(d, o, 'touch', 0.75); }, id => { stopNote(id); sounding.clear(); renderScaleStrip(); renderMeters(); });
function buildPads() {
  els.pads.replaceChildren();
  for (let band = 2; band >= 0; band--) {
    const row = el('div', 'air-pad-row');
    for (let d = 0; d < scaleLen(); d++) {
      const b = el('button', 'air-pad'); b.type = 'button'; b.dataset.pad = d + ':' + band;
      b.append(el('b', '', label(d)));
      b.setAttribute('aria-label', label(d) + '، اکتاو ' + BAND_FA[band]);
      row.append(b);
    }
    els.pads.append(row);
  }
}
const padAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.air-pad')?.dataset.pad ?? null;
els.pads.addEventListener('pointerdown', e => { const p = e.target.closest('.air-pad')?.dataset.pad; if (!p) return; e.preventDefault(); try { els.pads.setPointerCapture(e.pointerId); } catch {} pointers.down(e.pointerId, p); markPads(); });
els.pads.addEventListener('pointermove', e => { if (!pointers.map.has(e.pointerId)) return; pointers.move(e.pointerId, padAt(e.clientX, e.clientY)); markPads(); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) els.pads.addEventListener(type, e => { pointers.up(e.pointerId); markPads(); });
els.pads.addEventListener('contextmenu', e => e.preventDefault());
els.pads.addEventListener('keydown', e => { const p = e.target.closest?.('.air-pad')?.dataset.pad; if (!p || e.repeat || !(e.key === 'Enter' || e.key === ' ')) return; e.preventDefault(); pointers.down('k' + p, p); markPads(); });
els.pads.addEventListener('keyup', e => { const p = e.target.closest?.('.air-pad')?.dataset.pad; if (!p) return; pointers.up('k' + p); markPads(); });
function markPads() { const on = new Set([...pointers.map.values()].map(v => v.pad)); els.pads.querySelectorAll('.air-pad').forEach(p => p.classList.toggle('is-on', on.has(p.dataset.pad))); }

// chord pads: every pointer is tracked; only the pointer that started the pad can release it
const chordPointers = new Map();
function buildChordPads() {
  els.chords.replaceChildren(...slots.map((s, i) => {
    const b = el('button', 'air-chord'); b.type = 'button'; b.dataset.slot = i;
    b.append(el('b', '', s.short || s.label), el('small', '', s.roman ? s.roman : fa(i + 1)));
    b.setAttribute('aria-label', 'همراهی ' + fa(i + 1) + ': ' + (s.kind === 'texture' ? s.label : s.fa));
    return b;
  }));
  renderChordPads();
}
function renderChordPads() { els.chords.querySelectorAll('.air-chord').forEach(b => { b.setAttribute('aria-pressed', String(pad.slot === Number(b.dataset.slot))); b.disabled = !S.accomp; }); }
els.chords.addEventListener('pointerdown', e => { const b = e.target.closest('.air-chord'); if (!b || b.disabled) return; e.preventDefault(); try { els.chords.setPointerCapture(e.pointerId); } catch {} chordPointers.set(e.pointerId, true); padPress(Number(b.dataset.slot), 'touch:' + e.pointerId); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) els.chords.addEventListener(type, e => { if (!chordPointers.delete(e.pointerId)) return; padRelease('touch:' + e.pointerId); });
els.chords.addEventListener('contextmenu', e => e.preventDefault());
els.chords.addEventListener('keydown', e => { const b = e.target.closest?.('.air-chord'); if (!b || e.repeat || !(e.key === 'Enter' || e.key === ' ')) return; e.preventDefault(); padPress(Number(b.dataset.slot), 'kbd:' + b.dataset.slot); });
els.chords.addEventListener('keyup', e => { const b = e.target.closest?.('.air-chord'); if (!b || !(e.key === 'Enter' || e.key === ' ')) return; padRelease('kbd:' + b.dataset.slot); });

const KEYROWS = [['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '', ''], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", ''], ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']']];
function keyToPad(e) {
  const code = e.code || ''; const k = code.startsWith('Key') ? code.slice(3).toLowerCase() : ({ Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']' })[code];
  for (let band = 0; band < 3; band++) { const i = KEYROWS[band].indexOf(k); if (i >= 0 && i < scaleLen()) return i + ':' + band; }
  return null;
}
const heldKeys = new Set();
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !els.panel.hidden) { closePanel(true); return; }
  if (!playing || paused || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input,select,textarea,dialog,.air-panel')) return;
  if (e.key === 'Escape') { panic(); return; }
  if (/^Digit[1-4]$/.test(e.code) || /^Numpad[1-4]$/.test(e.code)) { if (!e.repeat) { heldKeys.add(e.code); padPress(Number(e.code.slice(-1)) - 1, 'key:' + e.code); } e.preventDefault(); return; }
  if (e.code === 'Digit0' || e.code === 'Backquote') { padStop(); return; }
  const p = keyToPad(e); if (!p || e.repeat) return;
  if (e.target.closest?.('.air-pad,.air-chord')) return;
  e.preventDefault(); pointers.down('key:' + e.code, p); markPads();
});
document.addEventListener('keyup', e => { if (heldKeys.delete(e.code)) padRelease('key:' + e.code); pointers.up('key:' + e.code); markPads(); });
window.addEventListener('blur', () => { pointers.releaseAll(); markPads(); for (const c of heldKeys) padRelease('key:' + c); heldKeys.clear(); });

// ---------------------------------------------------------------- indicators
const octFa = b => BAND_FA[b] || '';
function renderMeters() {
  const mh = S.lefty ? 'چپ' : 'راست', ah = S.lefty ? 'راست' : 'چپ', cam = S.input === 'camera';
  els.mMelodyHand.textContent = cam ? 'ملودی · دست ' + mh : 'ملودی';
  els.mPadHand.textContent = cam && !S.single ? 'پد · دست ' + ah : 'پد همراهی';
  const live = [...sounding][0];
  if (live) { const [d, o] = live.split(':').map(Number); els.mNote.textContent = label(d) + ' · ' + octFa(o); els.mNoteState.textContent = 'در حال پخش'; }
  else if (selected && cam) { els.mNote.textContent = label(selected.degree) + ' · ' + octFa(selected.octave); els.mNoteState.textContent = 'انتخاب‌شده'; }
  else { els.mNote.textContent = '—'; els.mNoteState.textContent = 'آماده'; }
  els.mMelody.classList.toggle('is-sounding', !!live); els.mMelody.classList.toggle('is-selected', !live && !!selected && cam);
  let chord = 'خاموش', st = '';
  if (!S.accomp) { chord = 'غیرفعال'; }
  else if (pad.slot != null) { const s = slots[pad.slot]; chord = s.label + (s.roman ? ' · ' + s.roman : ''); st = S.hold ? 'نگه‌داشته' : 'در حال پخش'; }
  else if (pad.candidate != null && cam && slots[pad.candidate]) { chord = slots[pad.candidate].label; st = fa(pad.candidate + 1) + ' انگشت'; }
  els.mChord.textContent = chord; els.mChordState.textContent = st;
  els.mPad.classList.toggle('is-sounding', pad.slot != null); els.mPad.classList.toggle('is-off', pad.slot == null && pad.candidate == null);
  els.mPad.setAttribute('aria-label', 'پد همراهی: ' + chord + (st ? '، ' + st : '') + '. برای تنظیمات همراهی بزن.');
}
function renderScaleStrip() {
  els.scale.replaceChildren(...tuning.cents.map((c, d) => {
    const b = el('span', 'air-degree'); const lab = degreeLabel(tuning, d);
    b.append(el('b', '', lab.fa), el('small', '', fa(Math.round(c + (tuning.offsets[d] || 0)))));
    if (selected?.degree === d) b.classList.add('is-selected');
    if ([...sounding].some(s => s.startsWith(d + ':'))) b.classList.add('is-sounding');
    return b;
  }));
}
function scaleName() {
  const sc = (S.system === 'persian' ? PERSIAN : WESTERN)[S.key].fa, root = NOTE_NAMES_FA[S.rootPc];
  return S.system === 'persian' ? sc + 'ِ ' + root : root + ' ' + sc.replace(/ \(.*\)$/, '');
}
function renderSummary() {
  els.summary.textContent = [INSTRUMENTS[S.instrument].fa, scaleName(), S.accomp ? 'همراهی روشن' + (S.hold ? ' (نگه‌داشتن)' : '') : 'همراهی خاموش'].join(' · ');
}

// ---------------------------------------------------------------- instrument picker
const INST_META = {
  piano: { icon: 'piano', tag: 'نمونهٔ ضبط‌شده' }, guitar: { icon: 'guitar', tag: 'نمونهٔ ضبط‌شده' }, epiano: { icon: 'epiano', tag: 'نمونهٔ ضبط‌شده' },
  violin: { icon: 'violin', tag: 'نمونهٔ ضبط‌شده' }, soft: { icon: 'soft', tag: 'سنتز', synth: true }, pluck: { icon: 'pluck', tag: 'سنتز · تار نیست', synth: true },
};
const INST_DESC = { piano: 'پیانوی آکوستیک', guitar: 'گیتار کلاسیک با سیم نایلون', epiano: 'پیانوی الکتریک', violin: 'ویولن با صدای کشیده', soft: 'صدای ملایم ساخته‌شده در مرورگر', pluck: 'زخمه‌ای ساخته‌شده؛ صدای تار یا سه‌تار نیست' };
let loadingInst = null;
function renderInstruments() {
  for (const box of [els.inst, els.instPanel]) {
    const list = box === els.instPanel;
    box.replaceChildren(...Object.keys(INSTRUMENTS).map(k => {
      const m = INST_META[k], b = el('button', 'air-instbtn'); b.type = 'button'; b.dataset.inst = k; b.setAttribute('role', 'radio');
      b.innerHTML = `<svg aria-hidden="true"><use href="#ag-${m.icon}"/></svg>`;
      b.append(el('b', '', INSTRUMENTS[k].fa), el('small', m.synth ? 'is-synth' : '', list ? m.tag + ' · ' + INST_DESC[k] : m.tag));
      return b;
    }));
  }
  markInstruments();
}
function markInstruments() {
  for (const b of $$('.air-instbtn')) {
    const k = b.dataset.inst, on = k === S.instrument;
    b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    b.toggleAttribute('aria-busy', loadingInst === k);
    if (on && b.parentElement === els.inst && els.inst.scrollWidth > els.inst.clientWidth) { const r = b.getBoundingClientRect(), c = els.inst.getBoundingClientRect(); if (r.left < c.left || r.right > c.right) els.inst.scrollLeft += (r.left < c.left ? r.left - c.left - 8 : r.right - c.right + 8); }
  }
}
for (const box of [els.inst, els.instPanel]) {
  box.addEventListener('click', e => { const b = e.target.closest('.air-instbtn'); if (b) chooseInstrument(b.dataset.inst); });
  box.addEventListener('keydown', e => {
    const keys = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 1, ArrowUp: -1 }; if (!(e.key in keys)) return;
    e.preventDefault(); const all = $$('.air-instbtn', box), i = all.indexOf(document.activeElement), j = (i + keys[e.key] + all.length) % all.length;
    all[j].focus(); chooseInstrument(all[j].dataset.inst);
  });
}
let instrumentJob = null;
async function chooseInstrument(key) {
  if (key === S.instrument && !loadingInst) return;
  instrumentJob?.abort(); const job = instrumentJob = new AbortController();
  $$('.air-instbtn').forEach(b => b.classList.remove('is-error'));
  if (!engine) { S.instrument = key; save(); markInstruments(); renderSummary(); return; }
  panicSoft();
  const name = INSTRUMENTS[key].fa;
  if (INSTRUMENTS[key].kind === 'sampled' && !engine.cache.has(key)) { loadingInst = key; markInstruments(); setInstNote('در حال بارگیری ' + name + '…'); }
  try {
    await engine.setInstrument(key, { signal: job.signal, onProgress: p => { if (job !== instrumentJob) return; $$(`.air-instbtn[data-inst="${key}"]`).forEach(b => b.style.setProperty('--p', p.toFixed(2))); setInstNote('در حال بارگیری ' + name + '… ' + fa(Math.round(p * 100)) + '٪'); } });
    if (job !== instrumentJob) return;
    S.instrument = key; save(); loadingInst = null; setInstNote(INST_META[key].synth ? (key === 'pluck' ? 'زخمه‌ای سنتزی: صدای ساخته‌شده؛ تار یا سه‌تار نیست.' : '') : '');
  } catch (e) {
    if (e?.name === 'AbortError') return;
    loadingInst = null; $$(`.air-instbtn[data-inst="${key}"]`).forEach(b => b.classList.add('is-error'));
    setInstNote('صدای ' + name + ' دریافت نشد؛ اتصال را بررسی کن. ' + INSTRUMENTS[S.instrument].fa + ' فعال ماند.', true);
  }
  markInstruments(); renderSummary(); updateNextLink();
}
function setInstNote(text, error = false) { els.instNote.textContent = text; els.instNote.classList.toggle('is-error', error); }

// ---------------------------------------------------------------- settings panel
let panelReturn = null;
function openPanel(tab) {
  if (tab) selectTab(tab);
  panelReturn = document.activeElement;
  els.panel.hidden = false; els.scrim.hidden = desktop.matches; els.settingsBtn.setAttribute('aria-expanded', 'true');
  $('.air-tabs [aria-selected="true"]').focus();
}
function closePanel(restore) { if (els.panel.hidden) return; els.panel.hidden = true; els.scrim.hidden = true; els.settingsBtn.setAttribute('aria-expanded', 'false'); if (restore) (panelReturn?.isConnected ? panelReturn : els.settingsBtn).focus(); }
els.settingsBtn.onclick = () => els.panel.hidden ? openPanel() : closePanel(true);
els.panelClose.onclick = () => closePanel(true);
els.scrim.onclick = () => closePanel(true);
els.summary.onclick = () => openPanel('music');
els.mPad.onclick = () => openPanel('accomp');
const TABS = ['sound', 'music', 'accomp', 'adv'];
function selectTab(name) {
  for (const t of TABS) { const b = $('#air-t-' + t), on = t === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('#air-p-' + t).hidden = !on; }
  $('.air-panel-body').scrollTop = 0;
}
$$('.air-tabs [role="tab"]').forEach((b, i, all) => {
  b.onclick = () => selectTab(b.id.slice(6));
  b.onkeydown = e => { const k = { ArrowLeft: 1, ArrowRight: -1, Home: 'h', End: 'e' }[e.key]; if (k == null) return; e.preventDefault(); const j = k === 'h' ? 0 : k === 'e' ? all.length - 1 : (i + k + all.length) % all.length; all[j].focus(); selectTab(all[j].id.slice(6)); };
});
desktop.addEventListener?.('change', () => { if (!els.panel.hidden) els.scrim.hidden = desktop.matches; });

function fillSelect(sel, items, value) { sel.replaceChildren(...items.map(([v, t]) => { const o = el('option', '', t); o.value = v; return o; })); sel.value = value; }
function renderSettings() {
  setRadio('air-system', S.system);
  els.scaleKeyLabel.textContent = S.system === 'persian' ? 'مقام' : 'گام';
  fillSelect(els.scaleKey, Object.entries(S.system === 'persian' ? PERSIAN : WESTERN).map(([k, d]) => [k, d.fa]), S.key);
  fillSelect(els.root, NOTE_NAMES_FA.map((n, i) => [i, n]), S.rootPc);
  setRadio('air-octave', S.octave); setRadio('air-policy', S.policy); setRadio('air-selection', S.selection); setRadio('air-bright', S.bright);
  els.accomp.checked = S.accomp; els.hold.checked = S.hold; els.rhythm.checked = S.rhythm; els.bpm.value = S.bpm; els.ref.value = S.refA4; els.koron.value = S.koron;
  els.swap.checked = S.swap; els.lefty.checked = S.lefty; els.single.checked = S.single; els.diag.checked = S.diag; els.diagOut.hidden = !S.diag;
  els.volume.value = Math.round(S.volume * 100); els.volumeOut.textContent = fa(els.volume.value) + '٪';
  els.padVol.value = Math.round(S.padVol * 100); els.padVolOut.textContent = fa(els.padVol.value) + '٪';
  els.musicHelpTitle.textContent = S.system === 'persian' ? 'دربارهٔ کوک مقام‌ها' : 'دربارهٔ کوک گام‌های غربی';
  els.persianNote.textContent = S.system === 'persian' ? PERSIAN_NOTE : 'گام‌های غربی با کوک برابر (۱۲ نیم‌پردهٔ مساوی) محاسبه می‌شوند.';
  const mh = S.lefty ? 'راست' : 'چپ';
  els.accompHint.textContent = S.single ? 'در حالت یک‌دستی با خانه‌های گرد یا کلیدهای ۱ تا ۴' : `با دست ${mh}، لمس خانه‌های گرد یا کلیدهای ۱ تا ۴`;
  els.slotList.replaceChildren(...slots.map((s, i) => { const li = el('li'); li.append(el('span', 'n', fa(i + 1) + ' انگشت'), el('span', 'c', s.label), el('span', 'r', s.roman || (s.kind === 'texture' ? 'بافت مُدال' : ''))); li.title = s.fa; return li; }));
  renderTuningEditor(); renderScaleStrip(); buildPads(); buildChordPads(); renderSummary(); renderMeters(); markInstruments();
}
function renderTuningEditor() {
  const key = S.system + ':' + S.key, offs = S.offsets[key] || [];
  els.tuningBox.replaceChildren(...tuning.cents.map((c, i) => {
    const row = el('div', 'air-tune-row');
    const name = el('span', 'air-tune-name', fa(i + 1) + ' · ' + label(i));
    const input = el('input'); input.type = 'number'; input.step = '5'; input.min = '-100'; input.max = '100'; input.value = offs[i] || 0; input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'جابه‌جایی درجهٔ ' + fa(i + 1) + ' به سنت');
    input.onchange = () => setOffset(i, Math.max(-100, Math.min(100, Number(input.value) || 0)));
    const k = el('button', 'air-mini', 'کرن'); k.type = 'button'; k.onclick = () => setOffset(i, (offs[i] || 0) - S.koron); k.setAttribute('aria-label', 'کرن کردن درجهٔ ' + fa(i + 1));
    const s = el('button', 'air-mini', 'سری'); s.type = 'button'; s.onclick = () => setOffset(i, (offs[i] || 0) + S.koron); s.setAttribute('aria-label', 'سری کردن درجهٔ ' + fa(i + 1));
    if (i === 0) { k.disabled = s.disabled = input.disabled = true; }
    row.append(name, input, k, s);
    return row;
  }));
}
function setOffset(i, v) { const key = S.system + ':' + S.key; const offs = [...(S.offsets[key] || [])]; offs[i] = Math.max(-100, Math.min(100, v)); S.offsets[key] = offs; save(); retune(); }
function retune() { panicSoft(); rebuildTuning(); pad.voicing = null; pad.candidate = null; applyGestureSettings(); renderSettings(); }
const onRadio = (name, fn) => radios(name).forEach(r => r.addEventListener('change', () => { if (r.checked) fn(r.value); }));
onRadio('air-system', v => { S.system = v; S.key = Object.keys(v === 'persian' ? PERSIAN : WESTERN)[0]; save(); retune(); });
onRadio('air-octave', v => { S.octave = Number(v); save(); retune(); });
onRadio('air-policy', v => { S.policy = v; save(); applyGestureSettings(); });
onRadio('air-selection', v => { S.selection = v; save(); applyGestureSettings(); });
onRadio('air-bright', v => { S.bright = v; save(); engine?.setPadBrightness(v); });
els.scaleKey.onchange = () => { S.key = els.scaleKey.value; save(); retune(); };
els.root.onchange = () => { S.rootPc = Number(els.root.value); save(); retune(); };
els.ref.onchange = () => { S.refA4 = Math.max(415, Math.min(466, Number(els.ref.value) || 440)); els.ref.value = S.refA4; save(); retune(); };
els.koron.onchange = () => { S.koron = Math.max(20, Math.min(90, Number(els.koron.value) || 60)); els.koron.value = S.koron; save(); };
els.reset.onclick = () => { delete S.offsets[S.system + ':' + S.key]; save(); retune(); };
els.swap.onchange = () => { S.swap = els.swap.checked; save(); panicSoft(); };
els.lefty.onchange = () => { S.lefty = els.lefty.checked; save(); panicSoft(); renderSettings(); };
els.single.onchange = () => { S.single = els.single.checked; save(); panicSoft(); renderSettings(); };
els.accomp.onchange = () => { S.accomp = els.accomp.checked; save(); if (!S.accomp && pad.slot != null) padStop(); renderChordPads(); renderSummary(); renderMeters(); };
els.hold.onchange = () => { S.hold = els.hold.checked; save(); if (!S.hold && pad.slot != null && pad.source && !pad.source.startsWith('camera')) padStop(); renderSummary(); renderMeters(); };
els.volume.oninput = () => { S.volume = Number(els.volume.value) / 100; els.volumeOut.textContent = fa(els.volume.value) + '٪'; engine?.setMasterVolume(S.volume); };
els.volume.onchange = save;
els.padVol.oninput = () => { S.padVol = Number(els.padVol.value) / 100; els.padVolOut.textContent = fa(els.padVol.value) + '٪'; engine?.setPadVolume(S.padVol); };
els.padVol.onchange = save;
els.bpm.onchange = () => { S.bpm = Math.max(50, Math.min(160, Number(els.bpm.value) || 84)); els.bpm.value = S.bpm; save(); if (engine?.rhythm) { engine.stopRhythm(); engine.startRhythm({ bpm: S.bpm }); } };
els.rhythm.onchange = () => { S.rhythm = els.rhythm.checked; save(); if (!engine) return; if (S.rhythm) engine.startRhythm({ bpm: S.bpm }); else engine.stopRhythm(); };
els.diag.onchange = () => { S.diag = els.diag.checked; save(); els.diagOut.hidden = !S.diag; };
els.recal.onclick = () => { if (S.input !== 'camera' || !tracker) { setInstNote('کالیبره فقط در حالت دوربین ممکن است.'); return; } S.calibrated = false; save(); closePanel(false); onboarding.go('right'); };

// ---------------------------------------------------------------- visual tutorial
let tutStep = 0, tutMode = 'camera', tutReturn = null;
function tutorialContext() { return { melodyHand: S.lefty ? 'left' : 'right', single: S.single, hold: S.hold, input: tutMode, slots }; }
function openTutorial(mode) {
  tutMode = mode || (S.input === 'touch' || !navigator.mediaDevices?.getUserMedia ? 'touch' : 'camera');
  setRadio('air-tut-mode', tutMode); tutStep = 0; tutReturn = document.activeElement;
  renderTutorial(); if (!els.tut.open) els.tut.showModal(); els.tutNext.focus();
}
function renderTutorial() {
  const steps = tutorialSteps(tutorialContext()), s = steps[tutStep];
  els.tutCount.textContent = 'قدم ' + fa(tutStep + 1) + ' از ' + fa(steps.length);
  const box = el('div', 'air-tut-step'); box.append(el('h3', '', s.title), el('p', '', s.text));
  const frames = el('div', 'air-tut-frames' + (s.spatial ? ' air-tut-frames--spatial' : ''));
  for (const f of s.frames) { const fig = el('figure', 'air-tut-frame'); fig.innerHTML = f.svg; fig.append(el('figcaption', '', f.cap)); frames.append(fig); }
  box.append(frames, el('p', 'air-tut-result', s.result));
  els.tutBody.replaceChildren(box); els.tutBody.scrollTop = 0;
  els.tutDots.replaceChildren(...steps.map((_, i) => el('i', i === tutStep ? 'on' : '')));
  els.tutPrev.disabled = tutStep === 0;
  const last = tutStep === steps.length - 1;
  els.tutNext.textContent = !last ? 'بعدی' : playing ? (tutMode === 'camera' && S.input === 'camera' ? 'تمرین با دوربین' : 'تمرین لمسی') : 'شروع نوازندگی';
}
els.tutPrev.onclick = () => { if (tutStep > 0) { tutStep--; renderTutorial(); } };
els.tutNext.onclick = () => {
  const steps = tutorialSteps(tutorialContext());
  if (tutStep < steps.length - 1) { tutStep++; renderTutorial(); return; }
  els.tut.close();
  if (playing) { setLearn(true, 'practice'); }
  else { const pick = $(`input[name="air-input"][value="${tutMode}"]`); if (pick && !pick.disabled) pick.checked = true; pendingPractice = true; startPlaying(); }
};
$('#air-tut-close').onclick = () => els.tut.close();
els.tut.addEventListener('close', () => { if (tutReturn?.isConnected) tutReturn.focus(); });
onRadio('air-tut-mode', v => { tutMode = v; tutStep = 0; renderTutorial(); });
els.help.onclick = () => openTutorial();
$('#air-intro-guide').onclick = () => openTutorial($('input[name="air-input"]:checked')?.value);
$$('[data-open-credits]').forEach(b => b.onclick = () => els.credits.showModal());
els.credits.querySelector('[data-close]').onclick = () => els.credits.close();
for (const d of [els.tut, els.credits]) d.addEventListener('click', e => { if (e.target === d) d.close(); });
let pendingPractice = false;

// ---------------------------------------------------------------- learning (practice + exercises)
let learnMode = false, exercise = null, exIndex = 0;
function setLearn(on, which = 'practice') {
  learnMode = on; els.learnBtn.setAttribute('aria-pressed', String(on));
  exercise = null;
  if (!on) { stopPractice(); coach(null); return; }
  if (which === 'practice') { startPractice(); addExerciseNav(-1); }
  else startExercise(which);
}
function addExerciseNav(active) {
  const nav = el('div', 'air-ex-nav'); nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'تمرین‌ها');
  const mk = (txt, i, title) => { const b = el('button', '', txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.setAttribute('aria-pressed', String(i === active)); b.onclick = () => setLearn(true, i < 0 ? 'practice' : i); nav.append(b); };
  mk('دو دست', -1, 'تمرین ملودی و پد'); EXERCISES.forEach((x, i) => mk(fa(i + 1), i, x.fa));
  els.coachActions.prepend(nav);
}
els.learnBtn.onclick = () => setLearn(!learnMode);
function startExercise(i) {
  practice = null; exIndex = i % EXERCISES.length; const def = EXERCISES[exIndex];
  exercise = new Exercise(def.id, { degrees: scaleLen() });
  const actions = [['تمرین تازه', () => startExercise(exIndex)]];
  if (def.id === 'interval') actions.unshift(['پخش فاصله', () => playInterval(exercise.target)]);
  coach(def.fa, exercise.prompt(d => label(d) + ' (درجهٔ ' + fa(d + 1) + ')'), actions);
  addExerciseNav(exIndex);
}
function playInterval(target) { if (!engine) return; target.forEach((d, k) => setTimeout(() => { const id = engine.noteOn(freqFor(d, 1), { velocity: 0.7, meta: { demo: true } }); setTimeout(() => engine.noteOff(id), 650); }, k * 800)); }
function feedExercise(e) {
  if (!exercise || e.bus !== 'melody' || e.demo) return;
  const r = exercise.handle(e); if (!r) return;
  els.coachBody.textContent = r.message; els.coachBody.classList.toggle('air-ex-feedback', true); els.coachBody.classList.toggle('is-ok', !!r.ok);
  if (r.done) setTimeout(() => { if (learnMode && exercise) startExercise(exIndex + 1); }, 1800);
}

// ---------------------------------------------------------------- recording
let recTimer = null, recordStart = null;
const fmtTime = s => fa(Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'));
function showTakeError(msg) { els.takeError.textContent = msg; els.takeError.hidden = !msg; if (msg) els.take.hidden = false; }
async function toggleRecording() {
  if (!engine) return;
  if (engine.recording) return stopRecording();
  showTakeError('');
  try { const ok = await engine.startRecording(); if (!ok) throw new Error('busy'); }
  catch { showTakeError('ضبط در این مرورگر شروع نشد. نوازندگی ادامه دارد؛ مرورگر دیگری را امتحان کن.'); return; }
  recordStart = engine.now; events = events.filter(e => e.time >= recordStart - 0.01);
  els.rec.setAttribute('aria-pressed', 'true'); els.rec.querySelector('.air-tr-label').textContent = 'پایان'; els.recTime.hidden = false;
  els.take.hidden = false; els.takeRec.hidden = false; els.takeDone.hidden = true;
  recTimer = setInterval(() => { const s = engine.recordedSeconds(); els.recTime.textContent = els.takeTime.textContent = fmtTime(s); }, 250);
}
async function stopRecording(limitReached = false) {
  clearInterval(recTimer);
  const r = await engine?.stopRecording();
  els.rec.setAttribute('aria-pressed', 'false'); els.rec.querySelector('.air-tr-label').textContent = 'ضبط'; els.recTime.hidden = true; els.takeRec.hidden = true;
  if (!r) return;
  const l = concatChunks(r.chunks[0]), rr = concatChunks(r.chunks[1]);
  if (!l.length) { showTakeError('صدایی ضبط نشد؛ دوباره امتحان کن.'); return; }
  const wav = encodeWav([l, rr], r.sampleRate);
  const take = events.filter(e => e.time >= r.startedAt - 0.01 && e.time <= r.endedAt + 0.01);
  const open = new Map(); take.forEach(e => e.type === 'on' ? open.set(e.id, e) : open.delete(e.id));
  open.forEach((e, id) => take.push({ type: 'off', id, time: r.endedAt, bus: e.bus }));
  addTake(wav, take, l.length / r.sampleRate, limitReached);
}
function addTake(wav, take, seconds, limitReached) {
  takes.forEach(t => t.urls.forEach(u => URL.revokeObjectURL(u)));
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  const micro = encodeMidi(take, { mode: 'microtonal', refA4: tuning.refA4 }), round = encodeMidi(take, { mode: 'rounded', refA4: tuning.refA4 });
  const mu = URL.createObjectURL(new Blob([micro.bytes], { type: 'audio/midi' })), ru = URL.createObjectURL(new Blob([round.bytes], { type: 'audio/midi' }));
  takes = [{ urls: [url, mu, ru] }];
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const padNotes = take.filter(e => e.type === 'on' && e.bus === 'accomp').length, melNotes = take.filter(e => e.type === 'on' && e.bus !== 'accomp').length;
  els.takeTitle.textContent = 'ضبط ' + fmtTime(seconds);
  els.takeMeta.textContent = fa(melNotes) + ' نت ملودی · ' + fa(padNotes) + ' صدای پد' + (limitReached ? ' · به سقف ۵ دقیقه رسید' : '');
  els.takeAudio.src = url; els.takePlay.querySelector('use').setAttribute('href', '#i-play'); els.takePlay.setAttribute('aria-label', 'پخش ضبط');
  els.takeWav.href = url; els.takeWav.download = 'dastan-e-nava-' + stamp + '.wav';
  els.takeMicro.href = mu; els.takeMicro.download = 'dastan-e-nava-' + stamp + '-microtonal.mid';
  els.takeRound.href = ru; els.takeRound.download = 'dastan-e-nava-' + stamp + '-rounded.mid';
  els.takeMidiHelp.textContent = 'در فایل «با ریزپرده‌ها» هر نت هم‌زمان کانال جداگانه و Pitch Bend با بازهٔ ±۲ نیم‌پرده دارد؛ ملودی و پد ساز جدا (پد: Warm Pad) دارند. فقط نرم‌افزارهایی که Pitch Bend هر کانال را می‌پذیرند کوک را دقیق پخش می‌کنند.'
    + (micro.rounded ? ' در این ضبط ' + fa(micro.rounded) + ' نت به‌خاطر کمبود کانال گرد شد.' : '') + ' در فایل «گردشده» ملودی روی کانال ۱ و پد روی کانال ۲ است و ریزپرده‌ها به نزدیک‌ترین نیم‌پرده می‌روند.';
  els.take.hidden = false; els.takeDone.hidden = false; showTakeError('');
  els.next.hidden = false;
}
els.rec.onclick = toggleRecording;
els.takeStop.onclick = () => stopRecording();
els.takePlay.onclick = () => { const a = els.takeAudio; if (a.paused) a.play().catch(() => showTakeError('پخش ضبط ممکن نشد؛ فایل WAV را دانلود کن.')); else a.pause(); };
els.takeAudio.onplay = () => { els.takePlay.querySelector('use').setAttribute('href', '#i-pause'); els.takePlay.setAttribute('aria-label', 'توقف پخش'); };
els.takeAudio.onpause = els.takeAudio.onended = () => { els.takePlay.querySelector('use').setAttribute('href', '#i-play'); els.takePlay.setAttribute('aria-label', 'پخش ضبط'); };
els.takeClose.onclick = () => { els.takeAudio.pause(); els.take.hidden = true; els.takeMidi.open = false; };
document.addEventListener('click', e => { if (els.takeMidi.open && !e.target.closest('#air-take-midi')) els.takeMidi.open = false; });

// ---------------------------------------------------------------- canvas (decoupled from inference and audio)
const g = els.canvas.getContext('2d');
let particles = [], frameAvg = 16, lastFrame = performance.now(), raf = 0;
const goldLines = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
function burst(degree, band) {
  if (reduceMotion.matches || frameAvg > 26 || S.input !== 'camera') return;
  const W = els.canvas.width, H = els.canvas.height, x = (degree + 0.5) / scaleLen() * W, y = (1 - (band + 0.5) / 3) * H;
  for (let i = 0; i < 12 && particles.length < 48; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2 - 0.5, life: 1 });
}
function resizeCanvas() { const r = els.surface.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); els.canvas.width = Math.round(r.width * dpr); els.canvas.height = Math.round(r.height * dpr); }
new ResizeObserver(resizeCanvas).observe(els.surface);
function draw(now) {
  raf = requestAnimationFrame(draw);
  const dt = now - lastFrame; lastFrame = now; frameAvg += (dt - frameAvg) * 0.05;
  const W = els.canvas.width, H = els.canvas.height; g.clearRect(0, 0, W, H);
  if (S.input !== 'camera') return;
  const cols = scaleLen(), dpr = W / (els.canvas.clientWidth || 1);
  const vw = els.video.videoWidth || 4, vh = els.video.videoHeight || 3, sc = Math.max(W / vw, H / vh), ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2;
  const X = x => ox + x * vw * sc, Y = y => oy + y * vh * sc;
  g.lineWidth = dpr;
  for (let b = 0; b < 3; b++) { if (b % 2) { g.fillStyle = 'rgba(20,48,45,.12)'; g.fillRect(0, Y((2 - b) / 3), W, Y((3 - b) / 3) - Y((2 - b) / 3)); } }
  for (let c = 0; c < cols; c++) {
    const x0 = X(c / cols), w = X((c + 1) / cols) - x0;
    const isSel = selected?.degree === c, isOn = [...sounding].some(s => s.startsWith(c + ':'));
    if (isSel || isOn) { g.fillStyle = isOn ? 'rgba(233,214,166,.30)' : 'rgba(233,214,166,.12)'; g.fillRect(x0, 0, w, H); }
    g.strokeStyle = 'rgba(244,231,198,.2)'; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, H); g.stroke();
    g.fillStyle = 'rgba(253,247,234,.92)'; g.font = `600 ${12.5 * dpr}px Vazir, Tahoma`; g.textAlign = 'center'; g.fillText(label(c), x0 + w / 2, H - 14 * dpr);
  }
  for (let b = 1; b < 3; b++) { g.strokeStyle = 'rgba(244,231,198,.16)'; g.setLineDash([4 * dpr, 6 * dpr]); g.beginPath(); g.moveTo(0, Y(b / 3)); g.lineTo(W, Y(b / 3)); g.stroke(); g.setLineDash([]); }
  if (now - lastHandsAt < 300) for (const [i, h] of lastHands.entries()) {
    const P = h.landmarks.map(p => [X(p.x), Y(p.y)]), role = Object.values(routeRole)[i];
    g.strokeStyle = role === 'accomp' ? 'rgba(143,212,198,.95)' : 'rgba(214,183,120,.95)'; g.lineWidth = 2.2 * dpr; g.lineCap = 'round';
    for (const line of goldLines) { g.beginPath(); line.forEach((k, j) => j ? g.lineTo(...P[k]) : g.moveTo(...P[k])); g.stroke(); }
    for (const k of [4, 8, 12, 16, 20]) { g.fillStyle = k === 4 || k === 8 ? '#fdf3dc' : 'rgba(253,243,220,.7)'; g.beginPath(); g.arc(...P[k], (k === 4 || k === 8 ? 5 : 3.5) * dpr, 0, 7); g.fill(); }
  }
  if (pad.slot != null) {
    g.strokeStyle = 'rgba(143,212,198,.75)'; g.lineWidth = 2 * dpr; g.beginPath();
    const amp = (5 + padExpr * 18) * dpr, ph = reduceMotion.matches ? 0 : now / 650;
    for (let x = 0; x <= W; x += 8 * dpr) { const y = H - 44 * dpr + Math.sin(x / (60 * dpr) + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  if (particles.length) {
    particles = particles.filter(p => (p.life -= dt / 900) > 0);
    for (const p of particles) { p.x += p.vx * dpr; p.y += p.vy * dpr; g.fillStyle = `rgba(233,214,166,${p.life * 0.8})`; g.beginPath(); g.arc(p.x, p.y, 2.2 * dpr, 0, 7); g.fill(); }
  }
}

// ---------------------------------------------------------------- lifecycle
async function startPlaying() {
  if (started) return; started = true;
  els.start.disabled = true;
  S.input = $('input[name="air-input"]:checked')?.value || 'touch'; save();
  engine = new AudioEngine();
  try { await engine.start(); }
  catch { started = false; els.start.disabled = false; engine = null; alertIntro('مرورگر اجازهٔ پخش صدا نداد. دوباره «شروع نوازندگی» را بزن.'); return; }
  life.add('engine', () => engine.dispose());
  engine.setMasterVolume(S.volume); engine.setPadVolume(S.padVol); engine.setPadBrightness(S.bright);
  engine.on(onEngineEvent);
  playing = true; paused = false; els.intro.hidden = true; els.play.hidden = false; els.exit.hidden = false; els.full.hidden = false; window.scrollTo(0, 0);
  rebuildTuning(); applyGestureSettings(); renderInstruments(); renderSettings(); resizeCanvas(); setToggle();
  if (INSTRUMENTS[S.instrument].kind === 'sampled') { const k = S.instrument; S.instrument = 'soft'; chooseInstrument(k); }
  raf = requestAnimationFrame(draw); life.add('render', () => cancelAnimationFrame(raf));
  const diagTimer = setInterval(updateDiagnostics, 500); life.add('diag', () => clearInterval(diagTimer));
  if (S.rhythm) engine.startRhythm({ bpm: S.bpm });
  if (S.input === 'camera') await startCamera(); else startTouch();
}
function onEngineEvent(e) {
  if (e.type === 'on' || e.type === 'off') { events.push(e); if (events.length > 20000) events.splice(0, 5000); if (learnMode && exercise) feedExercise(e); }
  if (practice && (e.type === 'on' || e.type === 'pad')) {
    queueMicrotask(() => { if (practice && practice.feed(e, { melodySounding: melodySounding() || (e.type === 'on' && e.bus === 'melody'), padSounding: !!engine?.pad.ids.length })) renderPractice(); });
  }
  if (e.type === 'state' && e.state !== 'running' && playing && !paused && !document.hidden) overlay('صدا متوقف شد', 'مرورگر پخش صدا را متوقف کرد (مثلاً با تماس تلفنی).', [['ادامه', resumeAll, true]]);
  if (e.type === 'record-limit') stopRecording(true);
}
function alertIntro(msg) { let p = els.intro.querySelector('.air-error'); if (!p) { p = el('p', 'air-error'); $('.air-intro-actions').after(p); } p.textContent = msg; p.setAttribute('role', 'alert'); }
function startTouch(reason) {
  S.input = 'touch'; els.pads.hidden = false; els.chords.hidden = false; els.video.hidden = true; els.surface.classList.add('is-touch');
  status.camera = reason || ''; status.model = ''; status.hands = ''; renderStatus(); renderMeters();
  if (pendingPractice || !S.practiced) { pendingPractice = false; setLearn(true, 'practice'); }
}
async function startCamera() {
  els.pads.hidden = true; els.chords.hidden = true; els.video.hidden = false; els.surface.classList.remove('is-touch');
  const { Camera, HandTracker, frameBrightness } = await import('./tracker.mjs');
  if (!camera) camera = new Camera(els.video);
  status.camera = 'درخواست دسترسی به دوربین…'; renderStatus();
  try { await camera.start({ quality: (navigator.hardwareConcurrency || 4) <= 4 ? 'low' : 'normal' }); }
  catch (err) {
    const msg = { denied: 'اجازهٔ دوربین داده نشد.', missing: 'دوربینی پیدا نشد.', busy: 'دوربین در اختیار برنامهٔ دیگری است.', unsupported: 'این مرورگر دسترسی به دوربین را پشتیبانی نمی‌کند.' }[err.code] || 'دوربین شروع نشد.';
    overlay(msg, 'می‌توانی با لمس صفحه یا صفحه‌کلید بنوازی، یا پس از بررسی تنظیمات مرورگر دوباره امتحان کنی.', [['نوازندگی لمسی', () => { overlay(null); startTouch('دوربین در دسترس نیست'); }, true], ['تلاش دوباره', () => { overlay(null); startCamera(); }]]);
    status.camera = msg; renderStatus(); return;
  }
  if (!life.has('camera')) life.add('camera', () => camera?.stop());
  camera.onended = () => { if (playing && !paused) overlay('دوربین قطع شد', 'اتصال دوربین قطع شد.', [['اتصال دوباره', () => { overlay(null); startCamera(); }, true], ['نوازندگی لمسی', () => { overlay(null); startTouch(); }]]); };
  status.camera = ''; status.model = 'بارگیری تشخیص دست… ۰٪'; renderStatus();
  if (!tracker) {
    tracker = new HandTracker();
    const ctl = new AbortController(); life.add('model-download', () => ctl.abort());
    try { await life.once('model', () => tracker.load({ signal: ctl.signal, onProgress: p => { status.model = 'بارگیری تشخیص دست… ' + fa(Math.round(p * 100)) + '٪'; renderStatus(); } })); }
    catch {
      tracker = null; status.model = 'تشخیص دست بارگیری نشد'; renderStatus();
      overlay('تشخیص دست بارگیری نشد', 'فایل‌های تشخیص دست دریافت یا اجرا نشدند. اتصال را بررسی کن و دوباره امتحان کن، یا با حالت لمسی ادامه بده.', [['تلاش دوباره', () => { overlay(null); camera.stop(); startCamera(); }, true], ['نوازندگی لمسی', () => { overlay(null); camera.stop(); startTouch(); }]]);
      return;
    }
    life.add('tracker', () => { tracker?.dispose(); tracker = null; });
  }
  status.model = ''; renderStatus();
  router = new HandRouter({ transform: makeTransform({ mirrored: true, swap: S.swap, labelForRight: S.labelForRight }), mode: S.single ? 'single' : 'two', leftHanded: S.lefty });
  tracker.onError = () => { status.model = 'خطای موقت در تشخیص'; renderStatus(); };
  tracker.onDelegate = () => {};
  const slowTimer = setInterval(() => { if (tracker?.stats.slow) { status.model = 'تشخیص روی این دستگاه کند است؛ حالت لمسی روان‌تر است'; renderStatus(); } }, 3000);
  life.add('slow', () => clearInterval(slowTimer));
  tracker.start(els.video, (t, hands) => { handleHands(t, hands); });
  const probe = document.createElement('canvas');
  const lightTimer = setInterval(() => { const b = frameBrightness(els.video, probe); status.light = b != null && b < 45 ? 'نور کم است' : ''; renderStatus(); }, 2000);
  life.add('light', () => clearInterval(lightTimer));
  if (pendingPractice) { pendingPractice = false; S.practiced = false; }
  onboarding.begin();
}
async function stopPlaying() {
  if (!started) return;
  panic(); playing = false;
  if (engine?.recording) await stopRecording();
  onboarding.step = 'idle'; coach(null); overlay(null); setPerform(false); closePanel(false); learnMode = false; practice = null; exercise = null;
  await life.stop();
  engine = null; camera = null; tracker = null; router = null; started = false; paused = false;
  els.play.hidden = true; els.intro.hidden = false; els.start.disabled = false; els.exit.hidden = true; els.full.hidden = true;
  if (noteCount > 0) els.next.hidden = false;
  updateNextLink();
}
els.exit.onclick = stopPlaying;
els.start.onclick = startPlaying;

// start / stop in the transport: stopping pauses audio and camera without leaving the instrument
function setToggle() { const p = paused; els.toggle.querySelector('use').setAttribute('href', p ? '#i-play' : '#i-pause'); els.toggle.querySelector('span').textContent = p ? 'شروع' : 'توقف'; els.toggle.setAttribute('aria-label', p ? 'ادامهٔ نوازندگی' : 'توقف نوازندگی'); }
async function pauseAll(reasonTitle) {
  if (!playing || paused) return;
  paused = true; panic(); tracker?.stop(); if (camera?.active) camera.stop();
  if (engine?.recording) await stopRecording();
  await engine?.suspend(); setToggle();
  overlay(reasonTitle || 'نوازندگی متوقف شد', 'صدا و دوربین خاموش‌اند. هر وقت آماده بودی ادامه بده.', [['ادامه', resumeAll, true]]);
}
async function resumeAll() {
  overlay(null);
  try { await engine.start(); } catch { overlay('صدا ادامه پیدا نکرد', 'دوباره امتحان کن.', [['ادامه', resumeAll, true]]); return; }
  if (S.input === 'camera' && camera && !camera.active) {
    try { await camera.start(); tracker?.start(els.video, (t, hands) => handleHands(t, hands)); }
    catch { startTouch('دوربین دوباره روشن نشد'); }
  }
  if (S.rhythm) engine.startRhythm({ bpm: S.bpm });
  paused = false; setToggle();
}
els.toggle.onclick = () => paused ? resumeAll() : pauseAll();
document.addEventListener('visibilitychange', () => { if (playing && document.hidden) pauseAll('ادامهٔ نوازندگی'); });
window.addEventListener('pagehide', () => { if (started) { panic(); life.stop(); } });

// immersive presentation (layout only; audio and tracking keep running)
function setPerform(on) {
  perform = on; document.body.classList.toggle('is-perform', on); els.full.setAttribute('aria-pressed', String(on));
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (on && !iOS && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
els.full.onclick = () => setPerform(!perform);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && perform) setPerform(false); });

function updateDiagnostics() {
  if (!S.diag) return;
  const st = tracker?.stats;
  els.diagOut.textContent = [
    'AudioContext: ' + (engine?.state || '-'),
    'صداهای فعال: ' + (engine?.activeVoices ?? 0) + ' · صداهای پد: ' + (engine?.pad.ids.length ?? 0),
    st ? `تشخیص: ${st.hz} بار در ثانیه · ${st.ms.toFixed(1)} میلی‌ثانیه · ${st.dropped} فریم رد شده · ${st.delegate}` : 'تشخیص: -',
    'دست ملودی: ' + melody.state + ' / ' + melody.stability + ' · دست همراهی: ' + accomp.state,
    'برچسب مدل: ' + (lastHands.map(h => h.label + ' ' + (h.score ?? 0).toFixed(2)).join(' / ') || '-'),
    'زمان فریم رسم: ' + frameAvg.toFixed(1) + ' میلی‌ثانیه',
    'این اعداد تأخیر واقعی صدا از دست تا گوش نیستند.',
  ].join('\n');
}
function updateNextLink() {
  const inst = { piano: 'piano', guitar: 'guitar', violin: 'violin', epiano: 'keyboard' }[S.instrument];
  els.nextInst.href = inst ? 'instruments/' + inst + '.html' : 'courses.html#instruments';
  els.nextInst.textContent = inst ? 'صفحهٔ ' + ({ piano: 'پیانو', guitar: 'گیتار', violin: 'ویولن', keyboard: 'کیبورد' })[inst] + ' و استادش' : 'سازها و استادها';
}

// ---------------------------------------------------------------- boot
renderInstruments(); renderSettings(); updateNextLink();
const canCam = !!navigator.mediaDevices?.getUserMedia;
const pick = $(`input[name="air-input"][value="${canCam ? S.input : 'touch'}"]`); if (pick) pick.checked = true;
if (!canCam) $('input[name="air-input"][value="camera"]').disabled = true;
// test hook for automated browser checks (no effect on normal use)
window.__air = {
  feed: (t, hands) => router && handleHands(t, hands), pauseTracking: () => tracker?.stop(), get step() { return onboarding.step; },
  get engine() { return engine; }, get life() { return life; }, get pad() { return { ...pad }; }, get practice() { return practice && practice.stage; },
  get tracker() { return tracker; }, get camera() { return camera; }, panic, stopPlaying, startPlaying, get events() { return events; },
};
