// Learning exercises evaluated only from real triggered note events: {type:'on'|'off', degree, octave, time(s)}.
export const EXERCISES = [
  { id: 'trigger', fa: 'یک نت بنواز و رها کن', hint: 'نت را بنواز و بعد رهایش کن.' },
  { id: 'degree', fa: 'درجهٔ خواسته‌شده را پیدا کن', hint: 'ستون یا دکمهٔ درجهٔ گفته‌شده را پیدا کن و بنواز.' },
  { id: 'sequence', fa: 'یک توالی کوتاه را تکرار کن', hint: 'نت‌ها را به همین ترتیب بنواز.' },
  { id: 'interval', fa: 'فاصله را بشنو و بساز', hint: 'دو نت پخش می‌شود؛ همان دو درجه را به ترتیب بنواز.' },
];

export class Exercise {
  /** opts: {degrees (scale length), gapSec (max pause between notes), rand} */
  constructor(id, { degrees = 7, gapSec = 6, rand = Math.random } = {}) {
    this.id = id; this.gapSec = gapSec; this.done = false; this.progress = []; this.feedback = '';
    const pick = () => Math.floor(rand() * degrees);
    if (id === 'degree') this.target = [1 + Math.floor(rand() * (degrees - 1))];
    else if (id === 'sequence') { const a = pick(); this.target = [a, (a + 1) % degrees, (a + 2) % degrees]; }
    else if (id === 'interval') { const b = Math.min(degrees - 1, [2, 3, 4][Math.floor(rand() * 3)]); this.target = [0, b]; }
    else this.target = null;
    this.pendingOn = null;
  }
  prompt(label) {
    if (this.id === 'trigger') return 'یک نت بنواز و بعد رهایش کن.';
    if (this.id === 'degree') return `درجهٔ ${label(this.target[0])} را بنواز.`;
    if (this.id === 'sequence') return 'این توالی را بنواز: ' + this.target.map(label).join(' ← ');
    return 'گوش کن، بعد همان دو درجه را به ترتیب بنواز: ' + this.target.map(label).join(' ← ');
  }
  /** Feed every melody note event. Returns {done, ok, message} when something changes. */
  handle(e) {
    if (this.done) return null;
    if (this.id === 'trigger') {
      if (e.type === 'on') { this.pendingOn = e; return { ok: true, message: 'نت شنیده شد؛ حالا رهایش کن.' }; }
      if (e.type === 'off' && this.pendingOn) { this.done = true; return { done: true, ok: true, message: 'آفرین؛ نواختن و رها کردن را انجام دادی.' }; }
      return null;
    }
    if (e.type !== 'on') return null;
    if (this.id === 'degree') {
      if (e.degree === this.target[0]) { this.done = true; return { done: true, ok: true, message: 'درست است.' }; }
      return { ok: false, message: 'این درجهٔ دیگری بود؛ دوباره امتحان کن.' };
    }
    const last = this.progress[this.progress.length - 1];
    if (last && e.time - last.time > this.gapSec) this.progress = [];
    const want = this.target[this.progress.length];
    if (e.degree === want) {
      this.progress.push(e);
      if (this.progress.length === this.target.length) { this.done = true; return { done: true, ok: true, message: 'کامل و درست بود.' }; }
      return { ok: true, message: `${this.progress.length} از ${this.target.length}` };
    }
    this.progress = e.degree === this.target[0] ? [e] : [];
    return { ok: false, message: 'ترتیب به هم خورد؛ از اول شروع کن.' };
  }
}
