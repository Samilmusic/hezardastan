// HezarAva Air Studio — scales, tuning and accompaniment rules. Pure data and functions (no audio, no DOM).
// Every degree is stored in cents above the tonic, so Persian presets are never rounded to semitones.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const NOTE_NAMES_FA = ['دو', 'دو دیز', 'ر', 'می بمل', 'می', 'فا', 'فا دیز', 'سل', 'لا بمل', 'لا', 'سی بمل', 'سی'];

const et = semis => semis.map(s => s * 100);

/** Western scales: equal-tempered. `chords` says how accompaniment is derived (see harmonyFor). */
export const WESTERN = {
  major: { fa: 'ماژور', cents: et([0, 2, 4, 5, 7, 9, 11]), chords: 'diatonic' },
  minor: { fa: 'مینور طبیعی', cents: et([0, 2, 3, 5, 7, 8, 10]), chords: 'diatonic' },
  harmonicMinor: { fa: 'مینور هارمونیک', cents: et([0, 2, 3, 5, 7, 8, 11]), chords: 'diatonic' },
  dorian: { fa: 'دورین', cents: et([0, 2, 3, 5, 7, 9, 10]), chords: 'diatonic' },
  phrygian: { fa: 'فریژین', cents: et([0, 1, 3, 5, 7, 8, 10]), chords: 'diatonic' },
  pentatonicMajor: { fa: 'پنتاتونیک ماژور (پنج‌نتی)', cents: et([0, 2, 4, 7, 9]), chords: 'dyad' },
  bluesMinor: { fa: 'بلوز مینور شش‌نتی (با نت ♭۵)', cents: et([0, 3, 5, 6, 7, 10]), chords: 'dyad' },
  chromatic: { fa: 'کروماتیک (۱۲ نیم‌پرده)', cents: et([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), chords: 'dyad' },
};

/**
 * Persian modal presets: exploratory, editable degree sets in cents relative to the tonic.
 * Basis: approximate interval sizes reported in measurement-based literature on Persian intonation (e.g. neutral
 * seconds of roughly 135–160 c and neutral thirds of roughly 340–360 c), rounded to 5 c and simplified to one
 * octave around the tonic. Performers vary these intervals; nothing here is a fixed standard.
 * `koron`/`sori` mark the degrees that are usually inflected, for display and for the quick adjust buttons.
 */
export const PERSIAN = {
  shur: { fa: 'شور', cents: [0, 145, 300, 500, 700, 800, 1000], koron: [1] },
  mahur: { fa: 'ماهور', cents: [0, 200, 400, 500, 700, 900, 1100], koron: [] },
  homayun: { fa: 'همایون', cents: [0, 145, 400, 500, 700, 800, 1000], koron: [1] },
  esfahan: { fa: 'اصفهان', cents: [0, 200, 300, 500, 700, 845, 1100], koron: [5] },
  chahargah: { fa: 'چهارگاه', cents: [0, 140, 390, 500, 700, 840, 1100], koron: [1, 5] },
  segah: { fa: 'سه‌گاه', cents: [0, 145, 345, 500, 645, 845, 1045], koron: [1, 4] },
  nava: { fa: 'نوا', cents: [0, 200, 300, 500, 700, 845, 1000], koron: [5] },
  rastPanjgah: { fa: 'راست‌پنجگاه', cents: [0, 200, 400, 500, 700, 900, 1000], koron: [] },
};

export const PERSIAN_NOTE = 'این پیش‌تنظیم‌ها فقط مجموعه‌ای از درجه‌ها برای کاوش‌اند. یک دستگاه، ردیف، گوشه‌ها، دستور ملودیک و شیوهٔ اجرای هر نوازنده را بازسازی نمی‌کنند. فاصلهٔ کرن و سری هم ثابت نیست؛ با گوش خودت و راهنمایی استادت تنظیمش کن.';

export const DEFAULT_KORON = 60; // how far the «کرن» button lowers a degree; editable, not a universal constant

export function scaleDef(system, key) {
  const src = system === 'persian' ? PERSIAN[key] : WESTERN[key];
  if (!src) throw new Error('unknown scale ' + system + ':' + key);
  return { system, key, fa: src.fa, cents: [...src.cents], koron: src.koron ? [...src.koron] : [], chords: src.chords || 'drone' };
}

/** Tonic frequency for a root pitch-class (0 = C) in a given octave, relative to the A4 reference. */
export function rootFrequency(rootPc, octave = 4, refA4 = 440) {
  const midi = (octave + 1) * 12 + rootPc;
  return refA4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Frequency of a scale degree. `degree` can exceed the scale length (wraps into higher octaves);
 * `octaveShift` adds whole octaves. Offsets (cents) are per-degree user edits.
 */
export function degreeFrequency(tuning, degree, octaveShift = 0) {
  const { cents, offsets = [], rootPc, octave = 4, refA4 = 440 } = tuning;
  const n = cents.length;
  const wrap = Math.floor(degree / n), idx = ((degree % n) + n) % n;
  const c = cents[idx] + (offsets[idx] || 0) + 1200 * (wrap + octaveShift);
  return rootFrequency(rootPc, octave, refA4) * Math.pow(2, c / 1200);
}

/** Absolute pitch of a frequency in fractional MIDI note numbers (for display, sampling and MIDI export). */
export const freqToMidi = (f, refA4 = 440) => 69 + 12 * Math.log2(f / refA4);
export const midiToFreq = (m, refA4 = 440) => refA4 * Math.pow(2, (m - 69) / 12);

export function degreeLabel(tuning, degree) {
  const n = tuning.cents.length, idx = ((degree % n) + n) % n;
  const c = tuning.cents[idx] + (tuning.offsets?.[idx] || 0);
  const lower = Math.floor(c / 100), rest = c - lower * 100;
  // between two semitones: named after the upper note with «کرن» (e.g. 145 c above G → لا کرن)
  if (rest >= 25 && rest <= 75) { const pc = ((tuning.rootPc + lower + 1) % 12 + 12) % 12; return { degree: idx + 1, name: NOTE_NAMES[pc] + 'p', fa: NOTE_NAMES_FA[pc] + ' کرن', cents: c }; }
  const near = Math.round(c / 100), dev = Math.round(c - near * 100), pc = ((tuning.rootPc + near) % 12 + 12) % 12;
  return { degree: idx + 1, name: NOTE_NAMES[pc] + (dev ? (dev > 0 ? '+' : '') + dev : ''), fa: NOTE_NAMES_FA[pc] + (dev ? ' (' + (dev > 0 ? '+' : '') + dev + ')' : ''), cents: c };
}

/**
 * Accompaniment voicing for a chosen accompaniment "slot".
 * Western, seven-degree scales: diatonic triads stacked in thirds from the scale itself (I, IV, V, vi, ii).
 * Five/six/twelve-note scales have no straightforward tertian mapping, so they use root + perfect fifth (dyads).
 * Persian presets: drone textures only by default — tonic, tonic+fifth, tonic+fourth, tonic+octave. No functional
 * progressions are imposed. Returns cents relative to the tonic (lower octave added by the caller).
 */
export const WESTERN_SLOTS = [0, 3, 4, 5, 1]; // I, IV, V, vi, ii (degree indices)
export const PERSIAN_TEXTURES = [
  { fa: 'واخوان تونیک', cents: [0] },
  { fa: 'تونیک و پنجم', cents: [0, 702] },
  { fa: 'تونیک و چهارم', cents: [0, 498] },
  { fa: 'تونیک و اکتاو', cents: [0, 1200] },
  { fa: 'تونیک، پنجم و اکتاو', cents: [0, 702, 1200] },
];

export function harmonyFor(tuning, slot) {
  const cents = tuning.cents.map((c, i) => c + (tuning.offsets?.[i] || 0));
  if (tuning.system === 'persian') {
    const t = PERSIAN_TEXTURES[((slot % PERSIAN_TEXTURES.length) + PERSIAN_TEXTURES.length) % PERSIAN_TEXTURES.length];
    return { label: t.fa, cents: [...t.cents], kind: 'drone' };
  }
  if (tuning.chords === 'diatonic' && cents.length === 7) {
    const d = WESTERN_SLOTS[((slot % WESTERN_SLOTS.length) + WESTERN_SLOTS.length) % WESTERN_SLOTS.length];
    const at = k => cents[(d + k) % 7] + (d + k >= 7 ? 1200 : 0);
    const triad = [at(0), at(2), at(4)];
    const third = triad[1] - triad[0], fifth = triad[2] - triad[0];
    const quality = third === 400 && fifth === 700 ? 'major' : third === 300 && fifth === 700 ? 'minor' : third === 300 && fifth === 600 ? 'diminished' : third === 400 && fifth === 800 ? 'augmented' : 'other';
    return { label: ['I', 'IV', 'V', 'vi', 'ii'][WESTERN_SLOTS.indexOf(d)] || String(d + 1), cents: triad, kind: 'triad', quality, degree: d };
  }
  // dyad rule for pentatonic / blues / chromatic: chosen scale degree plus a perfect fifth above it
  const d = ((slot % cents.length) + cents.length) % cents.length;
  const roots = cents.length >= 5 ? [0, 3, 4, 1, 2].map(i => Math.min(i, cents.length - 1)) : [0];
  const base = cents[roots[slot % roots.length]] ?? cents[d];
  return { label: 'درجه + پنجم', cents: [base, base + 700], kind: 'dyad' };
}

export function makeTuning({ system = 'persian', key = 'shur', rootPc = 7, octave = 4, refA4 = 440, offsets = [] } = {}) {
  const s = scaleDef(system, key);
  return { ...s, rootPc, octave, refA4, offsets: s.cents.map((_, i) => offsets[i] || 0) };
}

// ======================================================================= pad slots (five per scale, one per finger count)
/**
 * Explicit accompaniment rules, five slots per scale (1–5 fingers shown by the accompaniment hand):
 *  • Heptatonic Western scales (major, minors, dorian, phrygian): triads stacked in thirds from the scale itself on
 *    scale degrees 1, 4, 5 and 6. Quality and name are computed from the resulting intervals, so harmonic minor
 *    gives a major V and phrygian a minor v without special cases.
 *  • Major pentatonic: only chords whose tones all belong to the scale — I, the sus4 chords on degrees 5 and 2, and vi.
 *  • Minor blues (six-note): the minor-blues convention i m7, iv m7, v m7 plus ♭VII; labelled as blues voicings.
 *  • Chromatic: no key-derived harmony exists, so open power-fifth voicings on I, IV and V and a tonic octave.
 *  • Persian presets: modal textures built from the preset's own (microtonal, user-edited) degrees — tonic drone,
 *    tonic + 5th degree, tonic + 4th degree, and degrees 1–3–5. No Western function or chord names are implied.
 * Cents are relative to the tonic; the caller chooses the register and voicing.
 */
const CHORD_TYPES = [
  [[0, 4, 7, 11], 'maj7'], [[0, 4, 7, 10], '7'], [[0, 3, 7, 10], 'm7'], [[0, 4, 7], ''], [[0, 3, 7], 'm'], [[0, 3, 6], '°'], [[0, 4, 8], '+'],
  [[0, 5, 7], 'sus4'], [[0, 2, 7], 'sus2'], [[0, 7], '5'], [[0, 7, 12], '5'], [[0, 12], ''],
];
/** Name of a 12-TET chord given its root pitch class and the intervals (semitones) above that root. */
export function chordName(rootPc, semis) {
  const set = [...new Set(semis.map(s => ((Math.round(s) % 12) + 12) % 12))].sort((a, b) => a - b);
  for (const [iv, suffix] of CHORD_TYPES) {
    const want = [...new Set(iv.map(x => x % 12))].sort((a, b) => a - b);
    if (want.length === set.length && want.every((x, i) => x === set[i])) return { name: NOTE_NAMES[rootPc] + suffix, fa: NOTE_NAMES_FA[rootPc] + ({ '': ' ماژور', m: ' مینور', '°': ' کاسته', '+': ' افزوده', '7': ' هفت', m7: ' مینور هفت', maj7: ' ماژور هفت', sus4: ' ساس‌۴', sus2: ' ساس‌۲', 5: ' پنجم' }[suffix] ?? ''), suffix };
  }
  return { name: NOTE_NAMES[rootPc], fa: NOTE_NAMES_FA[rootPc], suffix: '?' };
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_CENTS = [0, 200, 400, 500, 700, 900, 1100];
function roman(deg, suffix, rootCents) {
  const flat = ((rootCents % 1200) + 1200) % 1200 < MAJOR_CENTS[deg] - 50 ? '♭' : '';
  const r = flat + ROMAN[deg];
  if (suffix === 'm' || suffix === 'm7' || suffix === '°') return r.toLowerCase() + (suffix === '°' ? '°' : suffix === 'm7' ? '7' : '');
  return r + ({ '7': '7', '+': '+', sus4: 'sus4', sus2: 'sus2', 5: '5' }[suffix] || '');
}

export function padSlots(tuning) {
  const cents = tuning.cents.map((c, i) => c + (tuning.offsets?.[i] || 0));
  const pcOf = c => ((tuning.rootPc + Math.round(c / 100)) % 12 + 12) % 12;
  const tertian = (d, size = 3) => Array.from({ length: size }, (_, k) => cents[(d + 2 * k) % cents.length] + 1200 * Math.floor((d + 2 * k) / cents.length));
  const make = (deg, chord, extra = {}) => {
    const root = chord[0], semis = chord.map(c => (c - root) / 100), n = chordName(pcOf(root), semis);
    return { kind: 'chord', label: n.name, fa: n.fa, roman: deg == null ? '' : roman(deg, n.suffix, root), cents: chord, ...extra };
  };
  if (tuning.system === 'persian') {
    const c = k => cents[k % cents.length];
    return [
      { kind: 'texture', short: 'واخوان', label: 'واخوان تونیک', fa: 'تونیک و اکتاو آن', roman: '', cents: [0, 1200] },
      { kind: 'texture', short: 'با درجهٔ ۵', label: 'تونیک و درجهٔ ۵', fa: 'فاصلهٔ باز تونیک با درجهٔ پنجم همین مقام', roman: '', cents: [0, c(4), 1200] },
      { kind: 'texture', short: 'با درجهٔ ۴', label: 'تونیک و درجهٔ ۴', fa: 'فاصلهٔ باز تونیک با درجهٔ چهارم همین مقام', roman: '', cents: [0, c(3), 1200] },
      { kind: 'texture', short: '۱–۳–۵', label: 'بافت ۱–۳–۵', fa: 'درجه‌های ۱، ۳ و ۵ همین مقام با کوک خودش', roman: '', cents: [0, c(2), c(4)] },
      { kind: 'texture', short: 'واخوان ۴', label: 'واخوان درجهٔ ۴', fa: 'واخوان روی درجهٔ چهارم همین مقام و اکتاو آن', roman: '', cents: [c(3), c(3) + 1200] },
    ];
  }
  if (tuning.chords === 'diatonic' && cents.length === 7) return [0, 3, 4, 5, 1].map(d => make(d, tertian(d)));
  if (tuning.key === 'pentatonicMajor') return [
    make(0, [cents[0], cents[2], cents[3]]),          // I: 1–3–5
    make(4, [cents[3], cents[0] + 1200, cents[1] + 1200]), // sus4 on the 5th
    make(5, [cents[4], cents[0] + 1200, cents[2] + 1200]), // vi: 6–1–3
    make(1, [cents[1], cents[3], cents[4]]),          // sus4 on the 2nd
    make(5, [cents[4], cents[1] + 1200, cents[2] + 1200]), // sus4 on the 6th: 6–2–3
  ];
  if (tuning.key === 'bluesMinor') return [
    make(0, [0, 300, 700, 1000], { blues: true }), make(3, [500, 800, 1200, 1500], { blues: true }),
    make(4, [700, 1000, 1400, 1700], { blues: true }), make(6, [1000, 1400, 1700], { blues: true }), make(2, [300, 700, 1000], { blues: true }),
  ];
  // chromatic: open fifths, no implied key
  return [make(0, [0, 700, 1200]), make(3, [500, 1200, 1700]), make(4, [700, 1400, 1900]), { kind: 'chord', label: NOTE_NAMES[tuning.rootPc] + ' (اکتاو)', short: NOTE_NAMES[tuning.rootPc] + '8', fa: 'تونیک و اکتاو', roman: '', cents: [0, 1200] }, make(6, [1000, 1700, 2200])];
}

/**
 * Voice leading. Places each chord tone (cents relative to `baseCents`) in the octave closest to the previous voicing,
 * inside a comfortable pad range, and returns ascending cents. With no previous voicing, a close position above
 * the base is used. Common tones therefore stay where they are and other voices move by the smallest step.
 */
export function voiceLead(tones, prev = null, { low = -300, high = 1900 } = {}) {
  const pcs = [...new Set(tones.map(c => ((c % 1200) + 1200) % 1200))];
  const fit = c => { while (c < low) c += 1200; while (c > high) c -= 1200; return c; };   // octave shifts only: a tone is never bent into range
  if (!prev || !prev.length) return tones.map(fit).sort((a, b) => a - b);
  const used = new Set(), out = [];
  for (const pc of pcs) {
    let best = null;
    for (let k = -2; k <= 2; k++) {
      const c = pc + 1200 * k; if (c < low || c > high) continue;
      const d = Math.min(...prev.map(p => Math.abs(p - c))) + (used.has(c) ? 1e6 : 0);
      if (!best || d < best.d) best = { c, d };
    }
    if (best) { used.add(best.c); out.push(best.c); }
  }
  // keep an octave-doubled tonic texture (e.g. [0, 1200]) instead of collapsing it to one pitch
  if (out.length < tones.length && pcs.length < tones.length) for (const c of tones) if (!out.includes(c) && c >= low && c <= high) out.push(c);
  return out.sort((a, b) => a - b);
}

// ======================================================================= five-chord setup (manual chords and presets)
/** Chord qualities the pad can render exactly in twelve-tone equal temperament (intervals in semitones above the root). */
export const QUALITIES = {
  '': { iv: [0, 4, 7], fa: 'ماژور' }, m: { iv: [0, 3, 7], fa: 'مینور' },
  sus2: { iv: [0, 2, 7], fa: 'ساس‌۲ (معلق)' }, sus4: { iv: [0, 5, 7], fa: 'ساس‌۴ (معلق)' },
  7: { iv: [0, 4, 7, 10], fa: 'هفت' }, m7: { iv: [0, 3, 7, 10], fa: 'مینور هفت' }, maj7: { iv: [0, 4, 7, 11], fa: 'ماژور هفت' },
  dim: { iv: [0, 3, 6], fa: 'کاسته' }, 5: { iv: [0, 7, 12], fa: 'پنجم باز' },
};
const QSUFFIX = { dim: '°' };
/** Five-chord presets: [root pitch class, quality] per gesture 1–5. */
export const CHORD_PRESETS = [
  { id: 'am-f-c-g-em', label: 'Am – F – C – G – Em', fa: 'لا مینور و خویشاوندانش', chords: [[9, 'm'], [5, ''], [0, ''], [7, ''], [4, 'm']] },
  { id: 'c-g-am-f-dm', label: 'C – G – Am – F – Dm', fa: 'دو ماژور و خویشاوندانش', chords: [[0, ''], [7, ''], [9, 'm'], [5, ''], [2, 'm']] },
  { id: 'dm-bb-f-c-gm', label: 'Dm – B♭ – F – C – Gm', fa: 'ر مینور و خویشاوندانش', chords: [[2, 'm'], [10, ''], [5, ''], [0, ''], [7, 'm']] },
  { id: 'em-c-g-d-am', label: 'Em – C – G – D – Am', fa: 'می مینور و خویشاوندانش', chords: [[4, 'm'], [0, ''], [7, ''], [2, ''], [9, 'm']] },
];
export const DEFAULT_CHORDS = CHORD_PRESETS[0].chords;
export function chordSymbol(rootPc, quality) {
  const q = QUALITIES[quality] ? quality : '', pc = ((Math.round(rootPc) % 12) + 12) % 12;
  return { name: NOTE_NAMES[pc] + (QSUFFIX[q] ?? q), fa: NOTE_NAMES_FA[pc] + ' ' + QUALITIES[q].fa, quality: q, rootPc: pc };
}
/** A manually chosen chord as a pad slot. Its tones are twelve-tone equal tempered, placed around the tonic of `tuning`. */
export function customSlot(chord, tuning) {
  const [root, quality] = chord, sym = chordSymbol(root, quality);
  let base = (((sym.rootPc - tuning.rootPc) % 12) + 12) % 12 * 100; if (base >= 700) base -= 1200;   // roots stay within a fifth of the tonic
  return { kind: 'chord', manual: true, label: sym.name, short: sym.name, fa: sym.fa, roman: '', rootPc: sym.rootPc, quality: sym.quality, cents: QUALITIES[sym.quality].iv.map(i => base + i * 100) };
}
/** Chords that fit a Western scale, as editable [root, quality] pairs (null where the scale's own chord has no listed quality). */
export function suggestedChords(tuning) {
  if (tuning.system === 'persian') return null;
  const map = { '': '', m: 'm', '°': 'dim', 7: '7', m7: 'm7', maj7: 'maj7', sus4: 'sus4', sus2: 'sus2', 5: '5' };
  return padSlots(tuning).map(s => { const root = s.cents[0], pc = ((tuning.rootPc + Math.round(root / 100)) % 12 + 12) % 12, n = chordName(pc, s.cents.map(c => (c - root) / 100)); return [pc, map[n.suffix] ?? '']; });
}
/**
 * The five slots that the accompaniment hand selects. source 'auto': what the melody scale itself suggests — chords built
 * from a Western scale, or modal textures for a Persian preset (never Western triads). source 'custom': five chords the
 * player chose; these are always twelve-tone equal tempered, whatever the melody tuning is.
 */
export function accompSlots(tuning, { source = 'auto', chords = DEFAULT_CHORDS } = {}) {
  if (source === 'custom') return Array.from({ length: 5 }, (_, i) => customSlot(chords[i] || DEFAULT_CHORDS[i], tuning));
  return padSlots(tuning);
}
