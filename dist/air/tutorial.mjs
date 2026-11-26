// دستانِ نوا — illustrated gesture tutorial and the event-driven practice check.
// Diagrams are drawn from the same mapping the gesture layer implements:
//   melody hand: horizontal column = scale degree, height = octave, thumb–index pinch plays, open releases, fist silences;
//   accompaniment hand: 1–5 digits shown (thumb counts; an open hand is five) select one of five chord slots after a
//   short dwell; the chord stays without any pinch; another count changes it; a closed fist releases it; height sets expression.
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
 * One hand. pose: 'open' | 'count' (n digits shown: 1–4 fingers with the thumb tucked, 5 = open hand) | 'pinch' | 'fist'.
 * side: 'right' | 'left' (left is the mirror image). highlight: finger names (and 'thumb').
 */
export function hand({ side = 'right', pose = 'open', count = 4, highlight = [], keepCount = null } = {}) {
  const hi = n => highlight.includes(n);
  let fingers = '', folded = '', thumb = '', spark = '';
  const ext = pose === 'open' ? 4 : pose === 'count' ? Math.min(4, count) : pose === 'pinch' ? (keepCount ?? 4) : 0;
  ORDER.forEach((n, i) => {
    const f = FINGERS[n];
    if (pose === 'pinch' && n === 'index') fingers += capsule([[f.x, 70], [40, 50], [31, 41]], f.w, hi(n));
    else if (i < ext) fingers += capsule([[f.x, 70], [f.x, f.tip]], f.w, hi(n));
    else folded += capsule([[f.x, 58], [f.x, 76]], f.w, hi(n)) + `<path d="M${f.x - f.w / 2 + 1} 66h${f.w - 2}" stroke="${INK}" stroke-width="1" opacity=".35"/>`;
  });
  if (pose === 'pinch') { thumb = capsule([[40, 104], [25, 78], [28, 45]], 12, hi('thumb')); spark = `<g class="tut-spark"><circle cx="29.5" cy="42" r="9" fill="none" stroke="${GOLD_INK}" stroke-width="1.4"/><circle cx="29.5" cy="42" r="3" fill="${GOLD_INK}"/></g>`; }
  else if (pose === 'fist' || (pose === 'count' && count < 5)) thumb = capsule([[38, 100], [50, 86], [66, 84]], 12, hi('thumb'));
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
  for (let c = 0; c < 5; c++) { const on = which !== 'melody' && c === 1; g += `<rect x="${12 + c * 60}" y="112" width="54" height="34" rx="17" fill="${on ? GOLD : '#f6ecdb'}" stroke="${GOLD_INK}" stroke-opacity=".6"/><text x="${39 + c * 60}" y="134" text-anchor="middle" font-size="13" font-weight="700" fill="#5a4128">${c + 1}</text>`; }
  if (which !== 'chord') g += `<circle cx="198" cy="34" r="11" fill="#fff" fill-opacity=".85" stroke="${TEAL}" stroke-width="2"/>`;
  if (which !== 'melody') g += `<circle cx="99" cy="129" r="11" fill="#fff" fill-opacity=".85" stroke="${TEAL}" stroke-width="2"/>`;
  return svg(`<rect x="2" y="4" width="316" height="150" rx="12" fill="#1d4a46"/>${g}`, '0 0 320 158', 'tut-svg--pads');
}

/** The chord ring as it appears in the performance view: five positions, the sounding chord in the centre. */
function ringDiagram(ctx) {
  const names = (ctx.slots || []).map(s => s.short || s.label), on = 1; let g = '<circle cx="100" cy="100" r="62" fill="#143a36" stroke="#e2cfa5" stroke-opacity=".3" stroke-width="1.5"/>';
  [-90, -18, 54, 126, 198].forEach((deg, i) => { const a = deg * Math.PI / 180, x = 100 + Math.cos(a) * 62, y = 100 + Math.sin(a) * 62, act = i === on, small = (names[i] || '').length > 4;
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="25" fill="${act ? GOLD : '#1d4a46'}" stroke="${act ? '#fdf3dc' : '#e2cfa5'}" stroke-opacity="${act ? 1 : .5}" stroke-width="${act ? 2.5 : 1}"/>`
      + `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${act ? '#735624' : '#e9d6a6'}">${i + 1}</text>`
      + `<text x="${x.toFixed(1)}" y="${(y + 10).toFixed(1)}" text-anchor="middle" font-size="${small ? 9 : 13}" font-weight="700" fill="${act ? '#33240f' : '#fdf7ea'}">${names[i] || ''}</text>`; });
  g += `<circle cx="100" cy="100" r="29" fill="#0f2b28" stroke="${GOLD}"/><text x="100" y="105" text-anchor="middle" font-size="${(names[on] || '').length > 4 ? 10 : 15}" font-weight="700" fill="#fdf7ea">${names[on] || ''}</text>`;
  return svg(g, '0 0 200 200', 'tut-svg--ring');
}
const handFa = h => h === 'right' ? 'دست راستِ تو' : 'دست چپِ تو';
const screenFa = h => h === 'right' ? 'سمت راستِ تصویر' : 'سمت چپِ تصویر';

/**
 * Tutorial steps for the current settings.
 * ctx: { melodyHand:'right'|'left', single:boolean, hold:boolean, input:'camera'|'touch', slots:[{label}], scaleName }
 */
export function tutorialSteps(ctx) {
  const m = ctx.melodyHand, a = m === 'right' ? 'left' : 'right';
  const slotList = (ctx.slots || []).map((s, i) => fa(i + 1) + ': \u2068' + (s.short || s.label) + '\u2069').join(' · ');   // isolates keep Latin chord names in order inside Persian text
  const kind = ctx.custom ? 'آکوردهای دلخواه تو' : ctx.persian ? 'بافت‌های مُدالِ مقام (آکورد غربی نیستند)' : 'آکوردهای خودِ گام';
  const edit = { id: 'edit', title: 'پنج آکورد را خودت بچین', text: 'در «تنظیمات ← آکوردها» یک چیدمان آماده بردار (مثل Am – F – C – G – Em) یا نت پایه و نوع هر آکورد را عوض کن. گام ملودی جدا می‌ماند.',
    result: 'الان: ' + kind + (slotList ? ' — ' + slotList : '') + '. حلقهٔ آکورد، آکوردِ در حال پخش را وسط نشان می‌دهد.', frames: [{ svg: ringDiagram(ctx), cap: 'حلقهٔ آکورد: شماره، نام و آکوردِ در حال پخش' }] };
  if (ctx.input === 'touch') return [
    { id: 'touch-melody', title: 'نت‌ها با لمس', text: 'روی هر خانه بزن و نگه دار؛ ردیف بالا اکتاو بالاتر است.', result: 'تا وقتی انگشتت روی خانه است، نت می‌ماند.', frames: [{ svg: padsDiagram('melody'), cap: 'لمس و نگه‌داشتن یک نت' }] },
    { id: 'touch-chord', title: 'آکورد با لمس', text: 'یکی از پنج خانهٔ پایین را یک بار بزن؛ آکورد می‌ماند. خانهٔ دیگر، آکورد را نرم عوض می‌کند و زدنِ دوبارهٔ همان خانه خاموشش می‌کند.', result: 'پنج خانه: ' + (slotList || 'آکورد یا بافت انتخاب‌شده'), frames: [{ svg: padsDiagram('chord'), cap: 'یک لمس: آکورد می‌ماند' }] },
    edit,
    { id: 'touch-both', title: 'هر دو با هم', text: 'آکورد را روشن کن و با انگشت دیگر روی آن نت بزن.', result: 'ملودی روی پد شنیده می‌شود. روی رایانه: ردیف‌های Z، A و Q نت‌ها، کلیدهای ۱ تا ۵ آکوردها و ۰ خاموش‌کردن پد است.', frames: [{ svg: padsDiagram('both'), cap: 'آکورد مانده، نت با انگشت دیگر' }] },
  ];
  const steps = [
    { id: 'place', title: 'جای دست‌ها', text: ctx.single ? `فقط ${handFa(m)} را باز و داخل کادر نگه دار.` : 'هر دو دست را باز، کمی جلوتر از شانه‌ها و داخل کادر نگه دار.', result: `تصویر مثل آینه است: ${handFa('right')} در ${screenFa('right')} دیده می‌شود. نقطه‌های طلایی یعنی دست دیده می‌شود.`, frames: [{ svg: frameDiagram(ctx), cap: ctx.single ? 'یک دست داخل کادر' : 'دو دست داخل کادر، مثل آینه' }] },
    { id: 'melody', title: `ملودی با ${handFa(m)}`, text: 'دست باز را روی ستون نت ببر، بعد شست و اشاره را به هم برسان. تا وقتی به هم چسبیده‌اند نت می‌ماند.', result: 'نت همان ستون پخش می‌شود؛ دست بالاتر، اکتاو بالاتر. باز کردن انگشت‌ها نت را رها می‌کند.', frames: [
      { svg: svg(hand({ side: m, pose: 'open' }) + arrowH + arrowV(m === 'right' ? 110 : 10)), cap: 'باز: انتخاب ستون و اکتاو' },
      { svg: svg(hand({ side: m, pose: 'pinch', highlight: ['thumb', 'index'] })), cap: 'شست و اشاره به هم: نواختن' }] },
  ];
  if (!ctx.single) steps.push(
    { id: 'accomp', title: `آکورد با ${handFa(a)}: ۱ تا ۵ انگشت`, text: 'یک تا پنج انگشت نشان بده و لحظه‌ای نگه دار. آکورد همان‌جا می‌ماند؛ نیشگون یا نگه‌داشتن دست لازم نیست. شست هم یک انگشت است: دستِ کاملاً باز یعنی پنج.', result: slotList ? kind + ' — ' + slotList : 'آکورد انتخاب‌شده با صدای پد نرم شروع می‌شود و می‌ماند.', frames: [
      { svg: svg(hand({ side: a, pose: 'count', count: 1, highlight: ['index'] })), cap: 'یک انگشت: آکورد ۱' },
      { svg: svg(hand({ side: a, pose: 'count', count: 3, highlight: ['index', 'middle', 'ring'] })), cap: 'سه انگشت: آکورد ۳' },
      { svg: svg(hand({ side: a, pose: 'count', count: 5, highlight: ['thumb', 'index', 'middle', 'ring', 'pinky'] }) + arrowV(a === 'right' ? 110 : 10)), cap: 'دست باز: آکورد ۵ · بالا و پایین: بلندی' }] },
    { id: 'switch', title: 'عوض کردن و خاموش کردن آکورد', text: `عدد دیگری نشان بده تا آکورد نرم عوض شود؛ نت‌های مشترک می‌مانند. مشتِ بستهٔ ${handFa(a)} پد را آرام خاموش می‌کند.`, result: 'همان عدد دوباره، آکورد را از نو نمی‌زند. اگر دست برای لحظه‌ای دیده نشود آکورد می‌ماند؛ اگر طولانی شود آرام محو می‌شود.', frames: [
      { svg: svg(hand({ side: a, pose: 'count', count: 2, highlight: ['index', 'middle'] })), cap: 'دو انگشت: آکورد ۲' },
      { svg: svg(hand({ side: a, pose: 'count', count: 4, highlight: ['index', 'middle', 'ring', 'pinky'] })), cap: 'چهار انگشت: آکورد ۴' },
      { svg: svg(hand({ side: a, pose: 'fist', highlight: ['thumb', 'index', 'middle', 'ring', 'pinky'] })), cap: 'مشت: پد خاموش' }] },
    edit,
  );
  steps.push(
    { id: 'fist', title: 'مشت یعنی سکوت', text: `مشتِ ${handFa(m)} نت ملودی را قطع می‌کند` + (ctx.single ? '.' : ` و مشتِ ${handFa(a)} پد را.`), result: 'دکمهٔ «قطع صداها» هم همیشه بالای صفحه است و همه‌چیز را بی‌درنگ خاموش می‌کند.', frames: [{ svg: svg(hand({ side: m, pose: 'fist', highlight: ['thumb', 'index', 'middle', 'ring', 'pinky'] })), cap: 'مشتِ بسته و ثابت' }] },
  );
  if (!ctx.single) steps.push(
    { id: 'both', spatial: true, title: 'ملودی روی آکورد', text: `${handFa(a)} آکورد را انتخاب می‌کند و می‌تواند پایین بیاید؛ ${handFa(m)} روی آن ملودی می‌نوازد.`, result: 'دو صدای جدا، هم‌زمان: عوض شدن آکورد نت ملودی را قطع نمی‌کند. با «تمرین با دوربین» عوض کردن دو آکورد را امتحان کن.', frames: [
      { svg: svg(`<g transform="translate(0 6) scale(.9)">${a === 'left' ? hand({ side: 'left', pose: 'count', count: 2, highlight: ['index', 'middle'] }) : hand({ side: 'left', pose: 'pinch', highlight: ['thumb', 'index'] })}</g>`), cap: a === 'left' ? 'چپ: آکورد' : 'چپ: ملودی' },
      { svg: svg(`<g transform="translate(12 6) scale(.9)">${m === 'right' ? hand({ side: 'right', pose: 'pinch', highlight: ['thumb', 'index'] }) : hand({ side: 'right', pose: 'count', count: 2, highlight: ['index', 'middle'] })}</g>`), cap: m === 'right' ? 'راست: ملودی' : 'راست: آکورد' }] },
  );
  return steps;
}

/**
 * Practice check driven only by real engine events.
 * Stages: 'melody' → 'pad' (a chord sounds) → 'switch' (a different chord slot sounds while the pad is on) → 'both'
 * (melody and pad together) → 'done'. Without accompaniment: 'melody' → 'done'.
 * feed(event, live) where event is an engine event ({type:'on', bus, ...} or {type:'pad', on, slot, source}) and
 * live = { melodySounding:boolean, padSounding:boolean } measured right after the event.
 */
export class PlayCheck {
  constructor({ needPad = true } = {}) { this.needPad = needPad; this.stage = 'melody'; this.log = []; this.firstSlot = null; }
  get stages() { return this.needPad ? ['melody', 'pad', 'switch', 'both'] : ['melody']; }
  feed(e, live) {
    if (this.stage === 'done' || !e || e.demo) return false;
    const before = this.stage;
    const melodyOn = e.type === 'on' && e.bus === 'melody' && !e.demo;
    const padOn = e.type === 'pad' && e.on && e.source !== 'demo';
    if (this.stage === 'melody' && melodyOn) this.stage = this.needPad ? 'pad' : 'done';
    else if (this.stage === 'pad' && padOn) { this.firstSlot = e.slot ?? null; this.stage = 'switch'; }
    else if (this.stage === 'switch' && padOn && e.slot != null && e.slot !== this.firstSlot) this.stage = live.melodySounding ? 'done' : 'both';
    else if (this.stage === 'both' && ((melodyOn && live.padSounding) || (padOn && live.melodySounding))) this.stage = 'done';
    if (this.stage !== before) { this.log.push({ from: before, to: this.stage, by: e.type + (e.bus ? ':' + e.bus : '') }); return true; }
    return false;
  }
}
