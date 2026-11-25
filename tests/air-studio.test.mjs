// HezarAva Air Studio — deterministic tests with simulated landmarks and synthetic data.
// These tests do not validate physical hand tracking; they validate the logic fed by MediaPipe landmarks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/air/tuning.mjs';
import { HandMachine, HandRouter, handFeatures, makeTransform, zoneWithHysteresis } from '../dist/air/gesture.mjs';
import { encodeWav, encodeMidi, parseMidi, concatChunks } from '../dist/air/export.mjs';
import { PointerVoices } from '../dist/air/touch.mjs';
import { Lifecycle } from '../dist/air/lifecycle.mjs';
import { Exercise } from '../dist/air/learn.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// ---------------------------------------------------------------- tuning
test('scale-to-frequency: equal temperament and reference pitch', () => {
  const c = T.makeTuning({ system: 'western', key: 'major', rootPc: 0, octave: 4 });
  near(T.degreeFrequency(c, 0), 261.6255653, 1e-4);
  near(T.degreeFrequency(c, 4), 391.9954360, 1e-4);          // G4
  near(T.degreeFrequency(c, 7), 2 * T.degreeFrequency(c, 0), 1e-9); // wraps to the octave
  near(T.degreeFrequency(c, 0, -1), 130.8127827, 1e-4);
  const c432 = T.makeTuning({ system: 'western', key: 'major', rootPc: 9, octave: 4, refA4: 432 });
  near(T.degreeFrequency(c432, 0), 432, 1e-9);
});

test('Persian presets keep microtones in cents (no semitone rounding) and accept edits', () => {
  const shur = T.makeTuning({ system: 'persian', key: 'shur', rootPc: 7, octave: 4 });
  const g = T.degreeFrequency(shur, 0);
  near(1200 * Math.log2(T.degreeFrequency(shur, 1) / g), 145, 1e-9);
  assert.notEqual(Math.round(T.freqToMidi(T.degreeFrequency(shur, 1))), T.freqToMidi(T.degreeFrequency(shur, 1)));
  const edited = T.makeTuning({ system: 'persian', key: 'shur', rootPc: 7, octave: 4, offsets: [0, -10] });
  near(1200 * Math.log2(T.degreeFrequency(edited, 1) / g), 135, 1e-9);
  assert.equal(T.degreeLabel(shur, 1).fa, 'لا کرن');
  for (const [k, p] of Object.entries(T.PERSIAN)) {
    assert.equal(p.cents.length, 7, k);
    assert.ok(p.cents.every((c, i) => i === 0 || c > p.cents[i - 1]), k + ' ascending');
  }
  assert.ok(Object.values(T.PERSIAN).some(p => p.cents.some(c => c % 100 !== 0 && c % 100 !== 50)), 'not every inflection is a fixed 50 c step');
});

test('diatonic harmony is derived from the scale; other scales use explicit rules', () => {
  const C = T.makeTuning({ system: 'western', key: 'major', rootPc: 0 });
  const q = s => T.harmonyFor(C, s).quality;
  assert.deepEqual([q(0), q(1), q(2), q(3), q(4)], ['major', 'major', 'major', 'minor', 'minor']); // I IV V vi ii
  const hm = T.makeTuning({ system: 'western', key: 'harmonicMinor', rootPc: 9 });
  assert.equal(T.harmonyFor(hm, 2).quality, 'major');   // V in harmonic minor
  assert.equal(T.harmonyFor(T.makeTuning({ system: 'western', key: 'minor', rootPc: 9 }), 2).quality, 'minor'); // v in natural minor
  const pent = T.harmonyFor(T.makeTuning({ system: 'western', key: 'pentatonicMajor', rootPc: 0 }), 0);
  assert.equal(pent.kind, 'dyad'); assert.equal(pent.cents[1] - pent.cents[0], 700);
  assert.equal(T.harmonyFor(T.makeTuning({ system: 'western', key: 'chromatic', rootPc: 0 }), 0).kind, 'dyad');
  const persian = T.harmonyFor(T.makeTuning({ system: 'persian', key: 'homayun', rootPc: 7 }), 1);
  assert.equal(persian.kind, 'drone'); assert.deepEqual(persian.cents, [0, 702]);
});

// ---------------------------------------------------------------- simulated landmarks
/** 21 landmarks for a hand centred at (cx, cy) with palm length s; `pinch` is thumb–index distance / palm. */
function hand({ cx = 0.5, cy = 0.5, s = 0.2, pinch = 1.0, fingers = 4, fist = false } = {}) {
  const P = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  P[0] = { x: cx, y: cy + s, z: 0 };
  const mcp = { 5: [-0.25, 0], 9: [0, 0], 13: [0.2, 0], 17: [0.38, 0.05] };
  for (const [k, [dx, dy]] of Object.entries(mcp)) P[k] = { x: cx + dx * s, y: cy + dy * s, z: 0 };
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach(([m, pip, dip, tip], i) => {
    const ext = !fist && i < fingers;
    const b = P[m];
    if (ext) { P[pip] = { x: b.x, y: b.y - 0.35 * s }; P[dip] = { x: b.x, y: b.y - 0.6 * s }; P[tip] = { x: b.x, y: b.y - 0.85 * s }; }
    else { P[pip] = { x: b.x, y: b.y - 0.15 * s }; P[dip] = { x: b.x, y: b.y + 0.05 * s }; P[tip] = { x: b.x, y: b.y + 0.2 * s }; }
  });
  const it = P[8];
  P[1] = { x: cx - 0.35 * s, y: cy + 0.7 * s }; P[2] = { x: cx - 0.5 * s, y: cy + 0.45 * s }; P[3] = { x: cx - 0.55 * s, y: cy + 0.2 * s };
  P[4] = fist ? { x: cx - 0.1 * s, y: cy + 0.3 * s } : { x: it.x - pinch * s, y: it.y };
  return P;
}
const frame = opts => ({ features: handFeatures(hand(opts)), confidence: 0.95 });
function run(m, fps, ms, opts, t0 = 0) { const out = []; const dt = 1000 / fps; let t = t0; for (; t <= t0 + ms; t += dt) out.push(...m.update(t, typeof opts === 'function' ? opts(t) : opts == null ? null : frame(opts)).map(e => ({ ...e, t }))); return { out, t }; }

test('features: pinch is normalised by palm length; fist and finger counts are detected', () => {
  near(handFeatures(hand({ s: 0.1, pinch: 0.5 })).pinch, 0.5, 1e-9);
  near(handFeatures(hand({ s: 0.3, pinch: 0.5 })).pinch, 0.5, 1e-9);
  assert.equal(handFeatures(hand({ fingers: 2 })).extended, 2);
  assert.equal(handFeatures(hand({ fist: true })).fist, true);
});

test('pinch onset latches the stable degree; finger geometry during the pinch cannot change the note', () => {
  const m = new HandMachine({ columns: 7, octaves: 3, selection: 'fingers' });
  const a = run(m, 30, 400, { cx: 0.3, fingers: 3, pinch: 1.2 });
  assert.equal(a.out.filter(e => e.type === 'select').at(-1).degree, 2); // three fingers, left half → degree 2
  // pinching curls the index toward the thumb: only one finger is counted now, but the latched degree stays 2
  const b = run(m, 30, 400, { cx: 0.3, fingers: 1, pinch: 0.1 }, a.t);
  const on = b.out.filter(e => e.type === 'on');
  assert.equal(on.length, 1); assert.equal(on[0].degree, 2);
  assert.equal(b.out.filter(e => e.type === 'select' || e.type === 'move').length, 0);
});

test('pinch hysteresis: values between the on and off thresholds keep the note', () => {
  const m = new HandMachine({ columns: 7 });
  let r = run(m, 60, 300, { cx: 0.5, pinch: 1.0 });
  r = run(m, 60, 200, { cx: 0.5, pinch: 0.1 }, r.t);
  assert.equal(r.out.filter(e => e.type === 'on').length, 1);
  r = run(m, 60, 600, { cx: 0.5, pinch: 0.38 }, r.t); // between 0.30 and 0.45
  assert.equal(r.out.filter(e => e.type === 'off').length, 0);
  r = run(m, 60, 300, { cx: 0.5, pinch: 0.9 }, r.t);
  assert.equal(r.out.filter(e => e.type === 'off').length, 1);
  assert.equal(r.out.find(e => e.type === 'off').reason, 'release');
});

test('a single noisy open frame does not cut a sustained note (release debounce)', () => {
  const m = new HandMachine({ columns: 7, smoothingMs: 1 });
  let r = run(m, 60, 300, { pinch: 1.0 }); r = run(m, 60, 100, { pinch: 0.1 }, r.t);
  r = run(m, 60, 17, { pinch: 1.0 }, r.t);           // one frame open
  r = run(m, 60, 300, { pinch: 0.1 }, r.t);
  assert.equal(r.out.filter(e => e.type === 'off').length, 0);
});

test('debounce is frame-rate independent (timestamps, not frame counts)', () => {
  const when = fps => { const m = new HandMachine({ columns: 7 }); const r = run(m, fps, 600, t => frame({ cx: t < 100 ? 0.1 : 0.8 })); return r.out.filter(e => e.type === 'select').at(-1).t; };
  const a = when(15), b = when(60), c = when(120);
  assert.ok(Math.abs(a - b) <= 1000 / 15 + 1 && Math.abs(b - c) <= 1000 / 60 + 1, `${a} ${b} ${c}`);
});

test('octave and column boundaries are stable under jitter (hysteresis)', () => {
  assert.equal(zoneWithHysteresis(0.335, 3, 0, 0.035), 0);
  assert.equal(zoneWithHysteresis(0.38, 3, 0, 0.035), 1);
  const m = new HandMachine({ columns: 7, octaves: 3 });
  // centre of palm jitters ±0.012 around the 2/3 boundary
  const r = run(m, 60, 2000, t => frame({ cx: 0.5, cy: 1 - 2 / 3 - 0.2 * 0.3 + Math.sin(t / 37) * 0.012 }));
  assert.ok(r.out.filter(e => e.type === 'select').length <= 1);
});

test('temporary tracking loss keeps the note; full loss releases it; a returning pinch does not retrigger', () => {
  const m = new HandMachine({ columns: 7 });
  let r = run(m, 30, 300, { pinch: 1.0 }); r = run(m, 30, 200, { pinch: 0.1 }, r.t);
  assert.equal(r.out.filter(e => e.type === 'on').length, 1);
  r = run(m, 30, 200, null, r.t);                       // 200 ms gap (< 350 ms)
  r = run(m, 30, 300, { pinch: 0.1 }, r.t);
  assert.equal(r.out.filter(e => e.type !== 'lost').length, 0, 'no events during a short gap and recovery');
  assert.equal(r.out.filter(e => e.type === 'lost').length, 0);
  r = run(m, 30, 600, null, r.t);                       // full loss
  assert.deepEqual(r.out.map(e => e.type + ':' + (e.reason || '')), ['off:lost', 'lost:']);
  r = run(m, 30, 500, { pinch: 0.1 }, r.t);             // comes back already pinched
  assert.equal(r.out.filter(e => e.type === 'on').length, 0);
  r = run(m, 30, 300, { pinch: 1.0 }, r.t); r = run(m, 30, 200, { pinch: 0.1 }, r.t);
  assert.equal(r.out.filter(e => e.type === 'on').length, 1, 'a deliberate new pinch plays');
});

test('closed fist silences; cooldown limits retriggers', () => {
  const m = new HandMachine({ columns: 7 });
  let r = run(m, 30, 300, { pinch: 1.0 }); r = run(m, 30, 150, { pinch: 0.1 }, r.t);
  r = run(m, 30, 400, { fist: true }, r.t);
  assert.deepEqual(r.out.filter(e => e.type === 'off').map(e => e.reason), ['fist']);
  assert.equal(r.out.filter(e => e.type === 'fist').length, 1, 'fist is reported even for latched (non-sounding) hands');
  const c = new HandMachine({ columns: 7, cooldownMs: 300, smoothingMs: 1, releaseHoldMs: 0 });
  let q = run(c, 60, 300, { pinch: 1.0 });
  for (let i = 0; i < 4; i++) { q = run(c, 60, 34, { pinch: 0.1 }, q.t); q = run(c, 60, 34, { pinch: 1.0 }, q.t); }
  assert.ok(true);
  const ons = []; const c2 = new HandMachine({ columns: 7, cooldownMs: 300, smoothingMs: 1, releaseHoldMs: 0 }); let t = 0;
  for (let i = 0; i < 400; i++, t += 1000 / 60) ons.push(...c2.update(t, frame({ pinch: t < 300 ? 1 : Math.floor(t / 50) % 2 ? 0.1 : 1.0 })).filter(e => e.type === 'on'));
  assert.ok(ons.length <= Math.ceil((400 * 1000 / 60 - 300) / 300) + 1);
});

test('hold / glide policies during sustain', () => {
  const g = new HandMachine({ columns: 7, sustainPolicy: 'glide' });
  let r = run(g, 30, 300, { cx: 0.1, pinch: 1 }); r = run(g, 30, 200, { cx: 0.1, pinch: 0.1 }, r.t);
  r = run(g, 30, 500, { cx: 0.9, pinch: 0.1 }, r.t);
  assert.equal(r.out.filter(e => e.type === 'move').at(-1).degree, 6);
  const h = new HandMachine({ columns: 7, sustainPolicy: 'hold' });
  r = run(h, 30, 300, { cx: 0.1, pinch: 1 }); r = run(h, 30, 200, { cx: 0.1, pinch: 0.1 }, r.t);
  r = run(h, 30, 500, { cx: 0.9, pinch: 0.1 }, r.t);
  assert.equal(r.out.length, 0);
});

test('mirrored coordinates and handedness mapping are explicit', () => {
  const t = makeTransform({ mirrored: true, labelForRight: 'Left' });
  assert.equal(t.point({ x: 0.2, y: 0.3 }).x, 0.8);
  assert.equal(t.hand('Left'), 'right'); assert.equal(t.hand('Right'), 'left');
  assert.equal(makeTransform({ mirrored: true, labelForRight: 'Left', swap: true }).hand('Left'), 'left');
  assert.equal(makeTransform({ mirrored: false }).point({ x: 0.2, y: 0 }).x, 0.2);
});

test('a one-frame handedness flip never moves a sustained voice to the other hand', () => {
  const r = new HandRouter({ transform: makeTransform({ labelForRight: 'Left' }) });
  const R = hand({ cx: 0.7 }), L = hand({ cx: 0.3 });
  let t = 0, out;
  for (; t < 500; t += 33) out = r.route(t, [{ landmarks: R, label: 'Left', score: 0.95 }, { landmarks: L, label: 'Right', score: 0.95 }]);
  const melodySlot = out.find(o => o.role === 'melody').slot;
  const locked = id => id === melodySlot;
  out = r.route(t, [{ landmarks: R, label: 'Right', score: 0.9 }, { landmarks: L, label: 'Left', score: 0.9 }], locked); // labels flip
  assert.equal(out.find(o => o.slot === melodySlot).role, 'melody');
  assert.equal(out.find(o => o.slot !== melodySlot).role, 'accomp');
  // left-handed preference and single-hand mode
  const lefty = new HandRouter({ transform: makeTransform({ labelForRight: 'Left' }), leftHanded: true });
  for (t = 0; t < 400; t += 33) out = lefty.route(t, [{ landmarks: L, label: 'Right', score: 0.95 }]);
  assert.equal(out[0].role, 'melody');
  const single = new HandRouter({ transform: makeTransform({}), mode: 'single' });
  out = single.route(0, [{ landmarks: R, label: 'Left', score: 0.9 }, { landmarks: L, label: 'Right', score: 0.9 }]);
  assert.equal(out.length, 1); assert.equal(out[0].role, 'melody');
});

// ---------------------------------------------------------------- exports
test('WAV: valid RIFF header and the actual samples', () => {
  const sr = 48000, n = 4800, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = Math.sin(2 * Math.PI * 440 * i / sr) * 0.5; r[i] = -l[i]; }
  const bytes = encodeWav([l, r], sr), v = new DataView(bytes.buffer);
  const str = o => String.fromCharCode(...bytes.slice(o, o + 4));
  assert.equal(str(0), 'RIFF'); assert.equal(str(8), 'WAVE'); assert.equal(str(12), 'fmt '); assert.equal(str(36), 'data');
  assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(22, true), 2); assert.equal(v.getUint32(24, true), sr);
  assert.equal(v.getUint32(28, true), sr * 4); assert.equal(v.getUint16(32, true), 4); assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), n * 4); assert.equal(bytes.length, 44 + n * 4); assert.equal(v.getUint32(4, true), bytes.length - 8);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(v.getInt16(44 + i * 4, true)));
  assert.ok(peak > 16000 && peak <= 16384, 'samples carry the signal');
  assert.ok(Math.abs(v.getInt16(44 + 100 * 4 + 2, true) + v.getInt16(44 + 100 * 4, true)) <= 1, 'right channel is the inverted left channel');
  assert.equal(concatChunks([new Float32Array([1, 2]), new Float32Array([3])]).length, 3);
});

test('MIDI: timing, note-offs, RPN bend range, per-channel microtonal bends and resets', () => {
  const shur = T.makeTuning({ system: 'persian', key: 'shur', rootPc: 7, octave: 4 });
  const f0 = T.degreeFrequency(shur, 0), f1 = T.degreeFrequency(shur, 1);
  const ev = [{ type: 'on', id: 1, time: 10, freq: f0 }, { type: 'on', id: 2, time: 10.5, freq: f1 }, { type: 'off', id: 1, time: 11 }, { type: 'off', id: 2, time: 11.5 }];
  const { bytes, notes, rounded } = encodeMidi(ev, { bpm: 120, ppq: 480 });
  assert.equal(notes, 2); assert.equal(rounded, 0);
  const { ppq, events } = parseMidi(bytes);
  assert.equal(ppq, 480);
  const ons = events.filter(e => (e.status & 0xf0) === 0x90), offs = events.filter(e => (e.status & 0xf0) === 0x80);
  assert.equal(ons.length, 2); assert.equal(offs.length, 2);
  assert.deepEqual(ons.map(e => e.tick), [0, 480]);           // 0.5 s at 120 bpm = 480 ticks
  assert.deepEqual(offs.map(e => e.tick), [960, 1440]);
  assert.notEqual(ons[0].status & 0x0f, ons[1].status & 0x0f, 'simultaneous pitches on separate channels');
  const rpn = events.filter(e => (e.status & 0xf0) === 0xb0 && e.data[0] === 6 && e.data[1] === 2);
  assert.ok(rpn.length >= 15, 'pitch-bend range = ±2 semitones set on every channel');
  const ch1 = ons[1].status & 0x0f;
  const bendBefore = events.filter(e => e.status === (0xe0 | ch1) && e.tick === 480)[0];
  const value = bendBefore.data[0] | (bendBefore.data[1] << 7);
  const cents = (value - 8192) / 8192 * 200, exact = T.freqToMidi(f1);
  near(cents, (exact - ons[1].data[0]) * 100, 0.05);
  assert.ok(events.some(e => e.status === (0xe0 | ch1) && e.tick === 1440 && e.data[0] === 0 && e.data[1] === 64), 'bend centred after note-off');
  // more simultaneous notes than channels: the extra ones are counted as rounded
  const many = Array.from({ length: 17 }, (_, i) => ({ type: 'on', id: i + 1, time: 0, freq: 440 * Math.pow(2, (i + 0.3) / 12) }));
  assert.equal(encodeMidi(many).rounded, 2);
  // rounded export: no bends at all, one channel
  const r = parseMidi(encodeMidi(ev, { mode: 'rounded' }).bytes).events;
  assert.equal(r.filter(e => (e.status & 0xf0) === 0xe0).length, 0);
  assert.ok(r.filter(e => (e.status & 0xf0) === 0x90).every(e => (e.status & 0x0f) === 0));
  // a note still held at the end gets a note-off
  const open = parseMidi(encodeMidi([{ type: 'on', id: 9, time: 0, freq: 440 }]).bytes).events;
  assert.equal(open.filter(e => (e.status & 0xf0) === 0x80).length, 1);
});

// ---------------------------------------------------------------- input, lifecycle, learning
test('multitouch: every pointer releases on up, cancel or releaseAll; sliding retargets', () => {
  const live = new Set(); let n = 0;
  const pv = new PointerVoices(pad => { const id = ++n; live.add(id); return id; }, id => live.delete(id));
  pv.down(1, '0:1'); pv.down(2, '3:1'); pv.down(3, '4:2');
  assert.equal(live.size, 3);
  pv.move(1, '1:1'); assert.equal(live.size, 3); assert.equal(pv.map.get(1).pad, '1:1');
  pv.cancel(2); assert.equal(live.size, 2);
  pv.down(3, '5:2'); assert.equal(live.size, 2, 'a repeated down replaces, never stacks');
  pv.releaseAll(); assert.equal(live.size, 0); assert.equal(pv.size, 0);
  pv.up(99); // unknown pointer is harmless
});

test('lifecycle: concurrent init runs once; stop disposes once in reverse; restart works', async () => {
  const life = new Lifecycle(), order = []; let inits = 0;
  const init = async () => { inits++; await new Promise(r => setTimeout(r, 5)); return 'ok'; };
  const [a, b] = await Promise.all([life.once('model', init), life.once('model', init)]);
  assert.equal(inits, 1); assert.equal(a, b);
  life.add('camera', () => order.push('camera')); life.add('tracker', () => order.push('tracker'));
  await life.stop(); await life.stop();
  assert.deepEqual(order, ['tracker', 'camera']);
  await life.once('model', init); assert.equal(inits, 2, 'after stop a new generation initialises again');
  const failing = new Lifecycle(); let tries = 0;
  await assert.rejects(failing.once('x', async () => { tries++; throw new Error('denied'); }));
  await failing.once('x', async () => { tries++; }); assert.equal(tries, 2, 'a failed init can be retried');
});

test('learning exercises judge only real note events', () => {
  const tr = new Exercise('trigger');
  assert.equal(tr.handle({ type: 'off' }), null);
  tr.handle({ type: 'on', degree: 0, time: 0 }); assert.equal(tr.handle({ type: 'off', time: 1 }).done, true);
  const dg = new Exercise('degree', { degrees: 7, rand: () => 0.5 });
  assert.equal(dg.handle({ type: 'on', degree: (dg.target[0] + 1) % 7, time: 0 }).ok, false);
  assert.equal(dg.handle({ type: 'on', degree: dg.target[0], time: 1 }).done, true);
  const sq = new Exercise('sequence', { degrees: 7, rand: () => 0, gapSec: 3 });
  assert.deepEqual(sq.target, [0, 1, 2]);
  sq.handle({ type: 'on', degree: 0, time: 0 }); sq.handle({ type: 'on', degree: 1, time: 1 });
  sq.handle({ type: 'on', degree: 2, time: 9 });            // too slow: restarts
  assert.equal(sq.done, false);
  sq.handle({ type: 'on', degree: 0, time: 10 }); sq.handle({ type: 'on', degree: 1, time: 11 });
  assert.equal(sq.handle({ type: 'on', degree: 2, time: 12 }).done, true);
});

// ======================================================================= دستانِ نوا: pad accompaniment
import { tutorialSteps, PlayCheck } from '../dist/air/tutorial.mjs';

test('pad slots follow explicit rules per scale family', () => {
  const names = (system, key, rootPc) => T.padSlots(T.makeTuning({ system, key, rootPc })).map(s => s.label);
  assert.deepEqual(names('western', 'major', 0), ['C', 'F', 'G', 'Am']);
  assert.deepEqual(names('western', 'harmonicMinor', 9), ['Am', 'Dm', 'E', 'F'], 'harmonic minor derives a major V from its own raised 7th');
  assert.deepEqual(names('western', 'phrygian', 4), ['Em', 'Am', 'B°', 'C']);
  // pentatonic: every chord tone belongs to the scale
  const pt = T.makeTuning({ system: 'western', key: 'pentatonicMajor', rootPc: 0 });
  for (const s of T.padSlots(pt)) for (const c of s.cents) assert.ok(pt.cents.includes(((c % 1200) + 1200) % 1200), s.label + ' uses a tone outside the pentatonic scale');
  assert.deepEqual(names('western', 'bluesMinor', 0), ['Cm7', 'Fm7', 'Gm7', 'B♭']);
  assert.deepEqual(names('western', 'chromatic', 0).slice(0, 3), ['C5', 'F5', 'G5'], 'chromatic offers open fifths, no implied key');
});

test('Persian textures use the edited microtonal tuning and no Western chord names', () => {
  const t = T.makeTuning({ system: 'persian', key: 'segah', rootPc: 9, offsets: [0, 0, 0, 0, 10] });
  const slots = T.padSlots(t);
  assert.equal(slots.length, 4);
  assert.ok(slots.every(s => s.kind === 'texture' && !/^[A-G]/.test(s.label)));
  assert.deepEqual(slots[1].cents, [0, 655, 1200], 'degree 5 of segah (645 c) plus the user offset (+10 c)');
  assert.deepEqual(slots[3].cents, [0, 345, 655], 'neutral third kept');
});

test('voice leading keeps common tones and moves the rest by the smallest step', () => {
  const C = [0, 400, 700], F = [500, 900, 1200], G = [700, 1100, 1400];
  const v1 = T.voiceLead(C), v2 = T.voiceLead(F, v1), v3 = T.voiceLead(G, v2);
  assert.deepEqual(v1, [0, 400, 700]);
  assert.deepEqual(v2, [0, 500, 900], 'C stays, E→F, G→A');
  assert.ok(v3.includes(700) || v3.includes(-100), 'G chord placed close to the previous voicing');
  const move = (a, b) => a.reduce((n, c) => n + Math.min(...b.map(x => Math.abs(x - c))), 0);
  assert.ok(move(v2, v3) <= 500);
  assert.deepEqual(T.voiceLead([0, 1200], [0, 700]), [0, 1200], 'octave textures keep both octaves');
});

test('accompaniment hand: finger-count selection is latched before the pinch changes the fingers', () => {
  const m = new HandMachine({ columns: 4, octaves: 1, selection: 'fingers', fingerHalves: false, freezeMargin: 0.15, sustainPolicy: 'hold' });
  let r = run(m, 30, 500, { cx: 0.25, fingers: 3, pinch: 1.2 });
  assert.equal(r.out.filter(e => e.type === 'select').pop().degree, 2);
  // the thumb approaches the index; on the way the index stops counting as extended (2 fingers) before the pinch closes
  const path = t => ({ cx: 0.25, fingers: t < 150 ? 3 : 2, pinch: t < 150 ? 0.9 - t / 300 : t < 450 ? 0.4 : 0.05 });
  const t0 = r.t + 33; r = run(m, 30, 750, t => frame(path(t - t0)), t0);
  const on = r.out.find(e => e.type === 'on');
  assert.ok(on, 'pinch triggered');
  assert.equal(on.degree, 2, 'the three-finger choice made before the pinch is the one that sounds');
  assert.ok(!r.out.some(e => e.type === 'select' && e.degree === 1), 'no selection change while approaching the pinch');
});

test('accompaniment hand: release, fist and loss events', () => {
  const m = new HandMachine({ columns: 4, octaves: 1, selection: 'fingers', fingerHalves: false, freezeMargin: 0.15, sustainPolicy: 'hold' });
  let r = run(m, 30, 400, { cx: 0.25, fingers: 1 });
  r = run(m, 30, 300, { cx: 0.25, fingers: 1, pinch: 0.05 }, r.t + 33);
  assert.equal(r.out.filter(e => e.type === 'on').length, 1);
  r = run(m, 30, 300, { cx: 0.25, fingers: 1, pinch: 1.2 }, r.t + 33);
  assert.deepEqual(r.out.filter(e => e.type === 'off').map(e => e.reason), ['release']);
  r = run(m, 30, 300, { cx: 0.25, fingers: 1, pinch: 0.05 }, r.t + 33);
  r = run(m, 30, 400, { cx: 0.25, fist: true }, r.t + 33);
  assert.ok(r.out.some(e => e.type === 'off' && e.reason === 'fist') && r.out.some(e => e.type === 'fist'));
});

test('practice check advances only on real melody and pad events, in order', () => {
  const c = new PlayCheck({ needPad: true });
  assert.equal(c.feed({ type: 'pad', on: true, source: 'camera' }, { melodySounding: false, padSounding: true }), false, 'pad before melody does not count');
  assert.equal(c.feed({ type: 'on', bus: 'melody', demo: true }, {}), false, 'demo notes never count');
  assert.equal(c.feed({ type: 'on', bus: 'accomp' }, { padSounding: true }), false, 'pad voices are not melody');
  c.feed({ type: 'on', bus: 'melody' }, { melodySounding: true, padSounding: false }); assert.equal(c.stage, 'pad');
  c.feed({ type: 'pad', on: false }, {}); assert.equal(c.stage, 'pad', 'releasing is not triggering');
  c.feed({ type: 'pad', on: true, source: 'touch' }, { melodySounding: false, padSounding: true }); assert.equal(c.stage, 'both');
  c.feed({ type: 'on', bus: 'melody' }, { melodySounding: true, padSounding: false }); assert.equal(c.stage, 'both', 'melody alone is not "together"');
  c.feed({ type: 'on', bus: 'melody' }, { melodySounding: true, padSounding: true }); assert.equal(c.stage, 'done');
  const single = new PlayCheck({ needPad: false }); single.feed({ type: 'on', bus: 'melody' }, {}); assert.equal(single.stage, 'done');
});

test('tutorial steps follow the settings (mirrored sides, left-handed, single hand, touch)', () => {
  const base = { melodyHand: 'right', single: false, hold: false, input: 'camera', slots: [{ label: 'C' }, { label: 'F' }, { label: 'G' }, { label: 'Am' }] };
  const s = tutorialSteps(base);
  assert.deepEqual(s.map(x => x.id), ['place', 'melody', 'accomp', 'sustain', 'fist', 'both']);
  assert.match(s[1].title, /راست/); assert.match(s[2].title, /چپ/);
  assert.match(s[2].result, /۳ انگشت: G/);
  assert.ok(s.every(x => x.frames.every(f => f.svg.startsWith('<svg'))));
  const lefty = tutorialSteps({ ...base, melodyHand: 'left' });
  assert.match(lefty[1].title, /چپ/); assert.match(lefty[2].title, /راست/);
  assert.deepEqual(tutorialSteps({ ...base, single: true }).map(x => x.id), ['place', 'melody', 'sustain', 'fist']);
  assert.equal(tutorialSteps({ ...base, input: 'touch' }).length, 3);
  assert.match(tutorialSteps({ ...base, hold: true })[3].text, /نگه‌داشتن آکورد/);
});

test('MIDI keeps accompaniment notes on their own program/channel', () => {
  const ev = [
    { type: 'on', id: 1, time: 0, freq: 261.63, velocity: 0.8, bus: 'melody' },
    { type: 'on', id: 2, time: 0, freq: 130.81, velocity: 0.3, bus: 'accomp' },
    { type: 'on', id: 3, time: 0, freq: 164.81, velocity: 0.3, bus: 'accomp' },
    { type: 'off', id: 1, time: 0.5 }, { type: 'off', id: 2, time: 1 }, { type: 'off', id: 3, time: 1 },
  ];
  const r = parseMidi(encodeMidi(ev, { mode: 'rounded' }).bytes).events;
  const ons = r.filter(e => (e.status & 0xf0) === 0x90 && e.data[1] > 0);
  assert.deepEqual(ons.map(e => e.status & 15).sort(), [0, 1, 1]);
  assert.ok(r.some(e => e.status === 0xc1 && e.data[0] === 89), 'pad channel uses GM 89 (Warm Pad)');
  const m = parseMidi(encodeMidi(ev, { mode: 'microtonal' }).bytes).events;
  const progs = m.filter(e => (e.status & 0xf0) === 0xc0);
  const padNoteChs = m.filter(e => (e.status & 0xf0) === 0x90 && e.data[1] > 0 && e.data[0] < 58).map(e => e.status & 15);
  for (const ch of padNoteChs) { const last = progs.filter(p => (p.status & 15) === ch).pop(); assert.equal(last.data[0], 89, 'channel ' + ch + ' switched to the pad program'); }
});
