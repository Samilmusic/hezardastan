// HezarAva Air Studio — gesture layer. Pure, timestamp-driven, no DOM. Tested with simulated landmarks.
// Landmark indices follow MediaPipe Hands: 0 wrist, 4 thumb tip, 5/9/13/17 MCPs, 6/10/14/18 PIPs, 8/12/16/20 tips.

export const DEFAULTS = {
  pinchOn: 0.30,        // thumb–index distance / palm length that starts a pinch
  pinchOff: 0.45,       // must open beyond this to release (hysteresis)
  releaseHoldMs: 45,    // pinch must stay open this long before the note is released
  stableMs: 120,        // a pose must persist this long before it changes the selection
  fistMs: 180,          // a closed fist must persist this long to silence the hand
  cooldownMs: 110,      // minimum time between two note-ons of the same hand
  lossMs: 350,          // tracking may drop out this long without releasing a sustained note
  smoothingMs: 45,      // time constant of the exponential smoothing (frame-rate independent)
  minConfidence: 0.5,   // handedness/presence score below which a frame is ignored
  zoneHysteresis: 0.035,// fraction of the frame width/height a hand must cross beyond a boundary
  sustainPolicy: 'hold', // 'hold' keeps the latched degree; 'glide' retunes the sounding voice; 'retrigger' restarts it
  selection: 'zones',   // 'zones': horizontal column selects the degree; 'fingers': extended-finger count (+ half)
  fingerHalves: true,   // 'fingers' selection: the right half of the frame adds 4 (8 degrees); false = 4 slots only
  freezeMargin: 0,      // > 0: stop updating the selection once the pinch ratio falls below pinchOff + margin,
                        // so the thumb closing on the index cannot change a finger-count selection (latched first)
};

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Coordinate transform. MediaPipe returns landmarks in the coordinates of the frame it was given.
 * We feed the raw (unmirrored) camera frame and mirror only the preview, so display x = 1 − x when the
 * preview is mirrored. Handedness labels are NOT trusted blindly: `labelToRole` comes from calibration
 * («دست راستت را بالا بیاور») and can be swapped manually.
 */
export function makeTransform({ mirrored = true, swap = false, labelForRight = 'Left' } = {}) {
  return {
    mirrored, swap, labelForRight,
    point: p => ({ x: mirrored ? 1 - p.x : p.x, y: p.y, z: p.z || 0 }),
    hand(label) { // physical hand of the player for a model label
      const right = label === labelForRight;
      return (swap ? !right : right) ? 'right' : 'left';
    },
  };
}

/** Geometry features of one hand from 21 display-space landmarks. */
export function handFeatures(lm) {
  const palm = Math.max(1e-4, d2(lm[0], lm[9]));
  const pinch = d2(lm[4], lm[8]) / palm;
  const ext = [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]].map(([tip, pip, mcp]) => {
    const r = d2(lm[tip], lm[0]) / Math.max(1e-4, d2(lm[mcp], lm[0]));
    return r > 1.45 ? 1 : r < 1.12 ? -1 : 0; // 1 extended, −1 curled, 0 ambiguous
  });
  const thumbOut = d2(lm[4], lm[17]) / palm > 1.05;
  // thumb: tip distance from the little-finger knuckle and from the index knuckle, in palm lengths (mirror-invariant)
  const thumbSpan = d2(lm[4], lm[17]) / palm, thumbReach = d2(lm[4], lm[5]) / palm;
  const extended = ext.filter(v => v === 1).length;
  const curled = ext.filter(v => v === -1).length;
  const center = { x: (lm[0].x + lm[5].x + lm[17].x) / 3, y: (lm[0].y + lm[5].y + lm[17].y) / 3 };
  const pinchPoint = { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
  return { palm, pinch, ext, extended, curled, thumbOut, thumbSpan, thumbReach, fist: curled === 4, center, pinchPoint, wrist: lm[0] };
}

/** Zone index with hysteresis: stays in `current` until the value moves `h` past its boundary. */
export function zoneWithHysteresis(value, count, current, h) {
  const raw = Math.max(0, Math.min(count - 1, Math.floor(value * count)));
  if (current == null || current < 0 || current >= count) return raw;
  const lo = current / count - h, hi = (current + 1) / count + h;
  return value >= lo && value < hi ? current : raw;
}

/**
 * Per-hand state machine. Feed it `update(t, frame)` where frame is null (hand not seen) or
 * { features, confidence }. It returns a list of events:
 *   {type:'select', degree, octave}   — stable selection changed (no sound)
 *   {type:'on', degree, octave}       — pinch onset latched this selection
 *   {type:'move', degree, octave}     — selection changed during sustain ('glide' policy only)
 *   {type:'off', reason}              — release (pinch opened, fist, or hand lost)
 *   {type:'retrigger', degree, octave} — selection changed during sustain ('retrigger' policy)
 *   {type:'fist'} / {type:'lost'}      — explicit silence pose / hand left the frame (used to release latches)
 */
export class HandMachine {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.columns = opts.columns || 7;
    this.octaves = opts.octaves || 3;
    this.reset();
  }
  configure(opts) { Object.assign(this.o, opts); if (opts.columns) this.columns = opts.columns; if (opts.octaves) this.octaves = opts.octaves; }
  reset() {
    this.state = 'absent'; // absent | open | pinched | fist
    this.sounding = null;  // {degree, octave} while a note is held
    this.sel = null;       // stable selection {degree, octave}
    this.cand = null; this.candSince = 0;
    this.fistSince = null; this.openSince = null;
    this.lastSeen = -Infinity; this.lastT = null; this.lastOn = -Infinity;
    this.sp = null; this.sx = null; this.sy = null; // smoothed pinch ratio, x, y
    this.col = null; this.row = null;
    this.stability = 'none'; this.needOpen = false;
  }
  _smooth(prev, value, dt) {
    if (prev == null || dt == null) return value;
    const a = 1 - Math.exp(-Math.max(0, dt) / this.o.smoothingMs);
    return prev + (value - prev) * a;
  }
  _selection(f) {
    const p = f.center;
    this.col = zoneWithHysteresis(p.x, this.columns, this.col, this.o.zoneHysteresis);
    // top of the frame = highest octave band
    const band = zoneWithHysteresis(1 - p.y, this.octaves, this.row, this.o.zoneHysteresis);
    this.row = band;
    let degree = this.col;
    if (this.o.selection === 'fingers') {
      const count = Math.max(1, Math.min(4, f.extended));
      degree = (count - 1) + (this.o.fingerHalves && p.x >= 0.5 ? 4 : 0);
    }
    return { degree, octave: band };
  }
  /** Force-release (panic, mode change). */
  silence(reason = 'panic') {
    const ev = this.sounding ? [{ type: 'off', reason }] : [];
    this.sounding = null;
    if (this.state === 'pinched') this.state = 'open';
    return ev;
  }
  update(t, frame) {
    const o = this.o, out = [];
    if (!frame || (frame.confidence ?? 1) < o.minConfidence) {
      // tracking gap: keep everything until the loss timeout, then release without retrigger later
      if (this.sounding && t - this.lastSeen > o.lossMs) { out.push({ type: 'off', reason: 'lost' }); this.sounding = null; }
      if (t - this.lastSeen > o.lossMs && this.state !== 'absent') out.push({ type: 'lost' });
      if (t - this.lastSeen > o.lossMs) { this.state = 'absent'; this.cand = null; this.stability = 'none'; this.fistSince = null; this.needOpen = true; }
      return out;
    }
    const f = frame.features;
    const dt = this.lastT == null ? null : t - this.lastT;
    const gap = t - this.lastSeen;
    this.lastT = t; this.lastSeen = t;
    // after a real loss, smoothing restarts so stale values cannot fake an onset
    if (gap > o.lossMs) { this.sp = null; this.sx = null; this.sy = null; }
    this.sp = this._smooth(this.sp, f.pinch, dt);
    if (this.needOpen && this.sp > o.pinchOff) this.needOpen = false; // a returning hand must open before it can trigger
    const sf = { ...f, center: { x: (this.sx = this._smooth(this.sx, f.center.x, dt)), y: (this.sy = this._smooth(this.sy, f.center.y, dt)) } };

    // closed fist → explicit silence (needs to be stable)
    if (f.fist) {
      this.fistSince ??= t;
      if (t - this.fistSince >= o.fistMs && this.state !== 'fist') {
        if (this.sounding) out.push({ type: 'off', reason: 'fist' });
        out.push({ type: 'fist' });
        this.sounding = null; this.state = 'fist'; this.stability = 'fist'; this.needOpen = true;
      }
      return out;
    }
    this.fistSince = null;
    if (this.state === 'fist' || this.state === 'absent') this.state = 'open';

    if (this.state === 'pinched') {
      // release with hysteresis and a short hold so a single noisy frame cannot cut the note
      if (this.sp > o.pinchOff) {
        this.openSince ??= t;
        if (t - this.openSince >= o.releaseHoldMs) {
          out.push({ type: 'off', reason: 'release' });
          this.sounding = null; this.state = 'open'; this.openSince = null;
        }
      } else this.openSince = null;
      if (this.state === 'pinched' && o.sustainPolicy !== 'hold') {
        const s = this._selection(sf);
        if (this.sounding && (s.degree !== this.sounding.degree || s.octave !== this.sounding.octave)) {
          if (!this.cand || this.cand.degree !== s.degree || this.cand.octave !== s.octave) { this.cand = s; this.candSince = t; }
          if (t - this.candSince >= o.stableMs) {
            this.sounding = { ...s };
            out.push(o.sustainPolicy === 'glide' ? { type: 'move', ...s } : { type: 'retrigger', ...s });
          }
        }
      }
      return out;
    }

    // open hand: update the stable selection (geometry while pinching is never used for this)
    const approaching = o.freezeMargin > 0 && this.sel && this.sp < o.pinchOff + o.freezeMargin;
    if (approaching) { this.cand = { ...this.sel }; this.candSince = t; this.stability = 'stable'; }
    else {
      const s = this._selection(sf);
      if (!this.cand || this.cand.degree !== s.degree || this.cand.octave !== s.octave) { this.cand = s; this.candSince = t; }
      const stable = t - this.candSince >= o.stableMs;
      this.stability = stable ? 'stable' : 'settling';
      if (stable && (!this.sel || this.sel.degree !== s.degree || this.sel.octave !== s.octave)) {
        this.sel = { ...s };
        out.push({ type: 'select', ...this.sel });
      }
    }
    // pinch onset latches the last stable selection
    if (!this.needOpen && this.sp < o.pinchOn && this.sel && t - this.lastOn >= o.cooldownMs && !(f.curled >= 3 && !f.thumbOut && f.extended === 0)) {
      this.state = 'pinched'; this.lastOn = t; this.openSince = null;
      this.sounding = { ...this.sel };
      out.push({ type: 'on', ...this.sounding });
    }
    return out;
  }
}

// ======================================================================= chord hand: show 1–5 fingers, the chord stays
export const CHORD_DEFAULTS = {
  dwellMs: 320,       // a finger count must be shown this long before it becomes the chord
  fistMs: 220,        // a closed fist must be held this long to release the pad
  graceMs: 450,       // tracking may drop out this long with nothing changing (and nothing shown)
  lossMs: 1600,       // after this long without the hand the pad is released (the caller fades it)
  restartMs: 180,     // a candidate that was not seen for this long starts its dwell again
  minConfidence: 0.5, // detections below this score count as "not seen"
  thumbOut: 1.15, thumbIn: 0.95,   // thumbSpan above/below: thumb extended / tucked; between: uncertain
  thumbReach: 0.5,                 // an extended thumb is also at least this far from the index knuckle
  slots: 5,
};
/**
 * How many digits a hand shows. The thumb counts: four fingers with the thumb tucked is 4, an open hand is 5.
 * Returns { count: 0…5 or null, fist }. null means the frame is uncertain (a finger or the thumb is half-way) and
 * must not change anything. Only distances are used, so the result is the same for either hand and for a mirrored image.
 */
export function digitCount(f, o = CHORD_DEFAULTS) {
  const thumb = f.thumbSpan > o.thumbOut && f.thumbReach > o.thumbReach ? 1 : (f.thumbSpan < o.thumbIn || f.thumbReach < o.thumbReach * 0.8) ? -1 : 0;
  if (f.curled === 4 && thumb !== 1) return { count: 0, fist: true, thumb };
  if (f.ext.includes(0) || thumb === 0) return { count: null, fist: false, thumb };
  return { count: f.extended + (thumb === 1 ? 1 : 0), fist: false, thumb };
}
/**
 * Accompaniment hand. Feed `update(t, frame)` with frame = null (hand not seen) or { features, confidence }.
 * Events:
 *   {type:'pending', slot}        — a different finger count is being shown (slot null: it was withdrawn)
 *   {type:'chord', slot}          — the count was held for dwellMs: this slot is now selected and stays selected
 *   {type:'release', reason}      — 'fist' (closed fist held), 'lost' (hand gone for lossMs) or 'panic'
 *   {type:'tracking', lost}       — the hand went missing beyond the grace period / came back
 * The selected slot survives uncertain frames, low-confidence frames and short gaps; showing the same count again
 * never produces a second 'chord' event.
 */
export class ChordHand {
  constructor(opts = {}) { this.o = { ...CHORD_DEFAULTS, ...opts }; this.reset(); }
  configure(opts) { Object.assign(this.o, opts); }
  reset() { this.slot = null; this.cand = null; this.candSince = 0; this.candLast = 0; this.fistSince = null; this.lastSeen = -Infinity; this.lost = false; this.count = null; this.ignore = null; this.stability = 'none'; }
  get state() { return this.stability; }
  _drop(out) { if (this.cand != null) { this.cand = null; out.push({ type: 'pending', slot: null }); } }
  /** Force-release (panic, pause, retune). The finger count that is still being shown is ignored until it changes, so a stop is never undone by the hand that is still up. */
  silence(reason = 'panic') { const out = []; this._drop(out); this.fistSince = null; this.ignore = this.slot ?? this.ignore; if (this.slot != null) { this.slot = null; out.push({ type: 'release', reason }); } return out; }
  update(t, frame) {
    const o = this.o, out = [];
    if (!frame || (frame.confidence ?? 1) < o.minConfidence) {
      const gap = t - this.lastSeen; this.fistSince = null; this.count = null;
      if (gap > o.restartMs) this._drop(out);
      if (gap > o.lossMs) this.ignore = null;
      if (gap > o.graceMs && !this.lost && this.lastSeen > -Infinity) { this.lost = true; out.push({ type: 'tracking', lost: true }); }
      if (gap > o.lossMs && this.slot != null) { this.slot = null; out.push({ type: 'release', reason: 'lost' }); }
      this.stability = this.lost ? 'lost' : 'gap';
      return out;
    }
    this.lastSeen = t;
    if (this.lost) { this.lost = false; out.push({ type: 'tracking', lost: false }); }
    const d = digitCount(frame.features, o); this.count = d.count;
    if (d.fist) {
      this.fistSince ??= t; this._drop(out); this.stability = 'fist'; this.ignore = null;
      if (t - this.fistSince >= o.fistMs && this.slot != null) { this.slot = null; out.push({ type: 'release', reason: 'fist' }); }
      return out;
    }
    this.fistSince = null;
    if (d.count == null || d.count < 1) { this.stability = this.slot != null ? 'held' : 'uncertain'; return out; }   // half-way shapes change nothing
    const slot = Math.min(o.slots, d.count) - 1;
    if (slot === this.slot) { this._drop(out); this.stability = 'held'; return out; }                              // same chord: never retriggered
    if (slot === this.ignore) { this._drop(out); this.stability = 'stopped'; return out; }                         // stopped by hand: wait for a different count
    this.ignore = null;
    if (slot !== this.cand || t - this.candLast > o.restartMs) { this.cand = slot; this.candSince = t; out.push({ type: 'pending', slot, dwellMs: o.dwellMs }); }
    this.candLast = t; this.stability = 'settling';
    if (t - this.candSince >= o.dwellMs) { this.slot = slot; this.cand = null; this.stability = 'held'; out.push({ type: 'chord', slot }); }
    return out;
  }
}

/**
 * Which chord slot sounds, for every input (camera gestures, touch on the chord ring, keys). It owns no audio: the
 * caller applies the returned action. `state` may be an existing object; `slot` and `queued` are kept on it.
 *   select(slot, {waitBeat}) → 'start' (sound this slot now) | 'queue' (wait for the next beat) |
 *                              'unqueue' (back to the sounding chord) | 'none' (already sounding: never restarted)
 *   tap(slot, {waitBeat})    → like select, but a deliberate tap on the sounding chord returns 'release'
 *   beat()                   → 'start' when a queued slot becomes the sounding one, else 'none'
 *   release()                → 'release' if anything was sounding or queued, else 'none'
 */
export class ChordDeck {
  constructor(state = {}) { this.state = state; state.slot ??= null; state.queued ??= null; }
  select(slot, { waitBeat = false } = {}) {
    const s = this.state;
    if (slot === s.slot) { if (s.queued != null) { s.queued = null; return 'unqueue'; } return 'none'; }
    if (waitBeat) { s.queued = slot; return 'queue'; }
    s.queued = null; s.slot = slot; return 'start';
  }
  tap(slot, o) { const s = this.state; if (slot === s.slot && s.queued == null) return this.release(); return this.select(slot, o); }
  beat() { const s = this.state; if (s.queued == null) return 'none'; s.slot = s.queued; s.queued = null; return 'start'; }
  release() { const s = this.state, had = s.slot != null || s.queued != null; s.slot = null; s.queued = null; return had ? 'release' : 'none'; }
}

/**
 * Assigns detections to two persistent slots by wrist proximity, and gives each slot a role ('melody'/'accomp')
 * from a smoothed vote of the transformed handedness. A slot that is sounding keeps its role, so a one-frame
 * label flip can never move a sustained voice to the other hand.
 */
export class HandRouter {
  constructor({ transform, mode = 'two', leftHanded = false, voteMs = 250 } = {}) {
    this.transform = transform; this.mode = mode; this.leftHanded = leftHanded; this.voteMs = voteMs;
    this.slots = [this._slot(0), this._slot(1)];
  }
  _slot(i) { return { id: i, wrist: null, seen: -Infinity, vote: 0, role: null }; }
  setTransform(t) { this.transform = t; this.slots.forEach(s => { s.vote = 0; if (!s.locked) s.role = null; }); }
  roleForHand(hand) {
    if (this.mode === 'single') return 'melody';
    const melodyHand = this.leftHanded ? 'left' : 'right';
    return hand === melodyHand ? 'melody' : 'accomp';
  }
  /** detections: [{landmarks (display space), label, score}] → [{slot, role, det}] */
  route(t, detections, isLocked = () => false) {
    const free = new Set([0, 1]), result = [];
    const pairs = [];
    detections.forEach((d, di) => this.slots.forEach(s => {
      const dist = s.wrist && t - s.seen < 800 ? Math.hypot(s.wrist.x - d.landmarks[0].x, s.wrist.y - d.landmarks[0].y) : 9;
      pairs.push({ di, si: s.id, dist });
    }));
    pairs.sort((a, b) => a.dist - b.dist);
    const usedDet = new Set();
    for (const p of pairs) {
      if (usedDet.has(p.di) || !free.has(p.si)) continue;
      usedDet.add(p.di); free.delete(p.si);
      const s = this.slots[p.si], d = detections[p.di];
      const dt = Math.max(1, t - (s.seen === -Infinity ? t - 33 : s.seen));
      s.wrist = d.landmarks[0]; s.seen = t;
      const vote = this.transform.hand(d.label) === 'right' ? 1 : -1;
      const a = 1 - Math.exp(-dt / this.voteMs);
      s.vote += (vote * (d.score ?? 1) - s.vote) * a;
      const hand = s.vote >= 0 ? 'right' : 'left';
      const wanted = this.roleForHand(hand);
      if (!isLocked(s.id) || s.role == null) s.role = wanted;
      result.push({ slot: s.id, role: s.role, hand, det: d });
    }
    // in two-hand mode never give both slots the same role in one frame: the stronger vote keeps it
    if (this.mode !== 'single' && result.length === 2 && result[0].role === result[1].role) {
      const [a, b] = result, sa = this.slots[a.slot], sb = this.slots[b.slot];
      const loser = isLocked(a.slot) ? b : isLocked(b.slot) ? a : Math.abs(sa.vote) >= Math.abs(sb.vote) ? b : a;
      if (!isLocked(loser.slot)) { loser.role = loser.role === 'melody' ? 'accomp' : 'melody'; this.slots[loser.slot].role = loser.role; }
    }
    if (this.mode === 'single' && result.length === 2) {
      // single-hand melody: only the slot that is already playing (or the first) is used
      const keep = result.find(r => isLocked(r.slot)) || result[0];
      return [keep];
    }
    return result;
  }
}
