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
