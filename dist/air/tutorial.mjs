// دستانِ نوا — illustrated gesture tutorial and the event-driven practice check.
// Diagrams are drawn from the same mapping the gesture layer implements:
//   melody hand: horizontal column = scale degree, height = octave, thumb–index pinch plays, open releases, fist silences;
//   accompaniment hand: 1–4 extended fingers (index→pinky) choose the slot, pinch plays the pad, open releases with a
//   tail (or toggles in «نگه‌داشتن آکورد»), fist stops, height sets expression.
// Hands are drawn as the player sees them in the mirrored preview: back of the hand, thumb toward the body centre.

const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const INK = '#5a4128', SKIN = '#f6ecdb', GOLD = '#e3c487', GOLD_INK = '#8a6a36', TEAL = '#2c6a63';

const FINGERS = { // right hand, back view, thumb on screen-left
  index: { x: 42.5, w: 11.5, tip: 18 }, middle: { x: 55.5, w: 12, tip: 10 }, ring: { x: 68.5, w: 11, tip: 16 }, pinky: { x: 80.5, w: 9.5, tip: 30 },
};
const ORDER = ['index', 'middle', 'ring', 'pinky'];
function capsule(points, w, hi) {
  const p = points.map(q => q.join(',')).join(' ');
  return `<polyline points="${p}" fill="none" stroke="${hi ? GOLD_INK : INK}" stroke-width="${w + 3}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<polyline points="${p}" fill="none" stroke="${hi ? GOLD : SKIN}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
/**
 * One hand. pose: 'open' | 'count' (n fingers extended, others curled) | 'pinch' | 'fist'.
 * side: 'right' | 'left' (left is the mirror image). highlight: finger names (and 'thumb').
 */
export function hand({ side = 'right', pose = 'open', count = 4, highlight = [], keepCount = null } = {}) {
  const hi = n => highlight.includes(n);
  let fingers = '', folded = '', thumb = '', spark = '';
  const ext = pose === 'open' ? 4 : pose === 'count' ? count : pose === 'pinch' ? (keepCount ?? 4) : 0;
  ORDER.forEach((n, i) => {
    const f = FINGERS[n];
    if (pose === 'pinch' && n === 'index') fingers += capsule([[f.x, 70], [40, 50], [31, 41]], f.w, hi(n));
    else if (i < ext) fingers += capsule([[f.x, 70], [f.x, f.tip]], f.w, hi(n));
    else folded += capsule([[f.x, 58], [f.x, 76]], f.w, hi(n)) + `<path d="M${f.x - f.w / 2 + 1} 66h${f.w - 2}" stroke="${INK}" stroke-width="1" opacity=".35"/>`;
  });
  if (pose === 'pinch') { thumb = capsule([[40, 104], [25, 78], [28, 45]], 12, hi('thumb')); spark = `<g class="tut-spark"><circle cx="29.5" cy="42" r="9" fill="none" stroke="${GOLD_INK}" stroke-width="1.4"/><circle cx="29.5" cy="42" r="3" fill="${GOLD_INK}"/></g>`; }
  else if (pose === 'fist') thumb = capsule([[38, 100], [50, 86], [66, 84]], 12, hi('thumb'));
  else thumb = capsule([[40, 104], [22, 80], [14, 64]], 12, hi('thumb'));
  const palm = `<rect x="35" y="62" width="54" height="54" rx="15" fill="${SKIN}" stroke="${INK}" stroke-width="1.5"/>`
    + `<rect x="46" y="108" width="32" height="38" rx="9" fill="${SKIN}" stroke="${INK}" stroke-width="1.5"/>`
    + `<rect x="35.8" y="104" width="52.4" height="10" fill="${SKIN}"/>`;
  const body = `${fingers}${palm}${folded}${thumb}${spark}`;
  return side === 'left' ? `<g transform="translate(120 0) scale(-1 1)">${body}</g>` : body;
}
const svg = (inner, vb = '0 0 120 150', cls = '') => `<svg class="tut-svg ${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;
const arrowH = `<g class="tut-arrow"><path d="M14 142h92M22 136l-8 6 8 6M98 136l8 6-8 6" fill="none" stroke="${TEAL}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const arrowV = (x = 108) => `<g class="tut-arrow"><path d="M${x} 20v100M${x - 6} 28l6-8 6 8M${x - 6} 112l6 8 6-8" fill="none" stroke="${TEAL}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;

/** Camera frame as the player sees it (mirrored): physical right hand on the right of the screen. */
function frameDiagram(ctx) {
  const left = `<g transform="translate(34 34) scale(.62)">${hand({ side: 'left', pose: 'open' })}</g>`;
  const right = `<g transform="translate(212 34) scale(.62)">${hand({ side: 'right', pose: 'open' })}</g>`;
  const dim = ctx.single ? (ctx.melodyHand === 'right' ? '<rect x="18" y="22" width="132" height="150" rx="6" fill="#f7f2e8" opacity=".72"/>' : '<rect x="170" y="22" width="132" height="150" rx="6" fill="#f7f2e8" opacity=".72"/>') : '';
  return svg(`<rect x="8" y="12" width="304" height="170" rx="14" fill="#123532"/><rect x="14" y="18" width="292" height="158" rx="10" fill="#1d4a46"/>
    <circle cx="160" cy="12" r="4" fill="#e3c487"/><path d="M160 26v144" stroke="#e2cfa5" stroke-opacity=".35" stroke-dasharray="4 6"/>${left}${right}${dim}`, '0 0 320 190', 'tut-svg--frame');
}
function padsDiagram(which) {
  let g = '';
  for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) { const on = which !== 'chord' && r === 0 && c === 4; g += `<rect x="${12 + c * 42}" y="${14 + r * 46}" width="36" height="40" rx="6" fill="${on ? GOLD : '#2c615b'}" stroke="#e2cfa5" stroke-opacity=".35"/>`; }
  for (let c = 0; c < 4; c++) { const on = which !== 'melody' && c === 1; g += `<rect x="${12 + c * 74}" y="112" width="66" height="34" rx="17" fill="${on ? GOLD : '#f6ecdb'}" stroke="${GOLD_INK}" stroke-opacity=".6"/>`; }
  if (which !== 'chord') g += `<circle cx="198" cy="34" r="11" fill="#fff" fill-opacity=".85" stroke="${TEAL}" stroke-width="2"/>`;
  if (which !== 'melody') g += `<circle cx="123" cy="129" r="11" fill="#fff" fill-opacity=".85" stroke="${TEAL}" stroke-width="2"/>`;
  return svg(`<rect x="2" y="4" width="316" height="150" rx="12" fill="#1d4a46"/>${g}`, '0 0 320 158', 'tut-svg--pads');
}

const handFa = h => h === 'right' ? 'دست راستِ تو' : 'دست چپِ تو';
const screenFa = h => h === 'right' ? 'سمت راستِ تصویر' : 'سمت چپِ تصویر';

/**
 * Tutorial steps for the current settings.
 * ctx: { melodyHand:'right'|'left', single:boolean, hold:boolean, input:'camera'|'touch', slots:[{label}], scaleName }
 */
export function tutorialSteps(ctx) {
  const m = ctx.melodyHand, a = m === 'right' ? 'left' : 'right';
  const slotList = (ctx.slots || []).map((s, i) => fa(i + 1) + ' انگشت: ' + s.label).join(' · ');
  if (ctx.input === 'touch') return [
    { id: 'touch-melody', title: 'نت‌ها با لمس', text: 'روی هر خانه بزن و نگه دار؛ ردیف بالا اکتاو بالاتر است.', result: 'تا وقتی انگشتت روی خانه است، نت می‌ماند.', frames: [{ svg: padsDiagram('melody'), cap: 'لمس و نگه‌داشتن یک نت' }] },
    { id: 'touch-chord', title: 'همراهی با لمس', text: ctx.hold ? 'یکی از خانه‌های گرد پایین را یک بار بزن؛ دوباره زدن خاموشش می‌کند.' : 'یکی از خانه‌های گرد پایین را نگه دار؛ رها کردن، آکورد را با دنبالهٔ نرم تمام می‌کند.', result: 'صدای پد نرم: ' + (slotList || 'آکورد یا بافت انتخاب‌شده'), frames: [{ svg: padsDiagram('chord'), cap: 'خانه‌های همراهی' }] },
    { id: 'touch-both', title: 'هر دو با هم', text: 'با یک انگشت نت را نگه دار و با انگشت دیگر خانهٔ همراهی را.', result: 'ملودی روی پد شنیده می‌شود. روی رایانه: ردیف‌های Z، A و Q نت‌ها، و کلیدهای ۱ تا ۴ همراهی‌اند.', frames: [{ svg: padsDiagram('both'), cap: 'دو انگشت هم‌زمان' }] },
  ];
  const steps = [
    { id: 'place', title: 'جای دست‌ها', text: ctx.single ? `فقط ${handFa(m)} را باز و داخل کادر نگه دار.` : 'هر دو دست را باز، کمی جلوتر از شانه‌ها و داخل کادر نگه دار.', result: `تصویر مثل آینه است: ${handFa('right')} در ${screenFa('right')} دیده می‌شود. نقطه‌های طلایی یعنی دست دیده می‌شود.`, frames: [{ svg: frameDiagram(ctx), cap: ctx.single ? 'حالت یک‌دستی' : `چپ تصویر: ${handFa('left')} · راست تصویر: ${handFa('right')}` }] },
    { id: 'melody', title: `ملودی با ${handFa(m)}`, text: 'دست باز را روی ستون نت ببر، بعد شست و اشاره را به هم برسان.', result: 'نت همان ستون پخش می‌شود؛ دست بالاتر، اکتاو بالاتر.', frames: [
      { svg: svg(hand({ side: m, pose: 'open' }) + arrowH + arrowV(m === 'right' ? 110 : 10)), cap: 'باز: انتخاب ستون و اکتاو' },
      { svg: svg(hand({ side: m, pose: 'pinch', highlight: ['thumb', 'index'] })), cap: 'شست و اشاره به هم: نواختن' }] },
  ];
  if (!ctx.single) steps.push(
    { id: 'accomp', title: `همراهی با ${handFa(a)}`, text: 'یک تا چهار انگشت باز کن تا آکورد انتخاب شود؛ بعد، بی‌آن‌که بقیه را ببندی، شست و اشاره را به هم برسان.', result: slotList ? 'پد نرم: ' + slotList : 'آکورد یا بافت انتخاب‌شده با صدای پد نرم شروع می‌شود.', frames: [
      { svg: svg(hand({ side: a, pose: 'count', count: 2, highlight: ['index', 'middle'] })), cap: 'دو انگشت: آکورد دوم' },
      { svg: svg(hand({ side: a, pose: 'count', count: 3, highlight: ['index', 'middle', 'ring'] })), cap: 'سه انگشت: آکورد سوم' },
      { svg: svg(hand({ side: a, pose: 'pinch', keepCount: 3, highlight: ['thumb', 'index'] }) + arrowV(a === 'right' ? 110 : 10)), cap: 'نیشگون: پخش · بالا و پایین: بلندی' }] },
  );
  steps.push(
    { id: 'sustain', title: 'نگه‌داشتن و رها کردن', text: ctx.hold && !ctx.single ? 'ملودی تا وقتی شست و اشاره به هم چسبیده‌اند می‌ماند. با «نگه‌داشتن آکورد»، هر نیشگونِ دست همراهی پد را روشن یا خاموش می‌کند.' : 'تا وقتی شست و اشاره به هم چسبیده‌اند صدا می‌ماند؛ باز کردن آن‌ها صدا را با دنبالهٔ نرم تمام می‌کند.', result: 'صدا با باز کردن انگشت‌ها آرام تمام می‌شود، نه ناگهانی.', frames: [
      { svg: svg(hand({ side: m, pose: 'pinch', highlight: ['thumb', 'index'] })), cap: 'به هم چسبیده: صدا می‌ماند' },
      { svg: svg(hand({ side: m, pose: 'open', highlight: ['thumb', 'index'] })), cap: 'باز: رها می‌شود' }] },
    { id: 'fist', title: 'مشت یعنی سکوت', text: 'مشت کردن هر دست، صدای همان دست را قطع می‌کند.', result: 'دکمهٔ «قطع صداها» هم همیشه بالای صفحه است و همه‌چیز را خاموش می‌کند.', frames: [{ svg: svg(hand({ side: m, pose: 'fist', highlight: ['thumb', 'index', 'middle', 'ring', 'pinky'] })), cap: 'مشتِ بسته و ثابت' }] },
  );
  if (!ctx.single) steps.push(
    { id: 'both', spatial: true, title: 'ملودی و پد با هم', text: `${handFa(a)} پد را نگه می‌دارد و ${handFa(m)} روی آن ملودی می‌نوازد.`, result: 'دو صدای جدا، هم‌زمان. با «تمرین با دوربین» امتحانش کن.', frames: [
      { svg: svg(`<g transform="translate(0 6) scale(.9)">${hand({ side: 'left', pose: 'pinch', keepCount: 2, highlight: ['thumb', 'index'] })}</g>`), cap: a === 'left' ? 'چپ: پد' : 'چپ: ملودی' },
      { svg: svg(`<g transform="translate(12 6) scale(.9)">${hand({ side: 'right', pose: 'pinch', highlight: ['thumb', 'index'] })}</g>`), cap: m === 'right' ? 'راست: ملودی' : 'راست: پد' }] },
  );
  return steps;
}

/**
 * Practice check driven only by real engine events.
 * Stages: 'melody' → 'pad' → 'both' → 'done' ('melody' → 'done' when no accompaniment hand is used).
 * feed(event, live) where event is an engine event ({type:'on', bus, ...} or {type:'pad', on, source}) and
 * live = { melodySounding:boolean, padSounding:boolean } measured right after the event.
 */
export class PlayCheck {
  constructor({ needPad = true } = {}) { this.needPad = needPad; this.stage = 'melody'; this.log = []; }
  get stages() { return this.needPad ? ['melody', 'pad', 'both'] : ['melody']; }
  feed(e, live) {
    if (this.stage === 'done' || !e || e.demo) return false;
    const before = this.stage;
    const melodyOn = e.type === 'on' && e.bus === 'melody' && !e.demo;
    const padOn = e.type === 'pad' && e.on && e.source !== 'demo';
    if (this.stage === 'melody' && melodyOn) this.stage = this.needPad ? 'pad' : 'done';
    else if (this.stage === 'pad' && padOn) this.stage = 'both';
    else if (this.stage === 'both' && ((melodyOn && live.padSounding) || (padOn && live.melodySounding))) this.stage = 'done';
    if (this.stage !== before) { this.log.push({ from: before, to: this.stage, by: e.type + (e.bus ? ':' + e.bus : '') }); return true; }
    return false;
  }
}
