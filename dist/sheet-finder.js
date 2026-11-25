// نت‌یاب هزاردستان — public client. Uses the server function when it is deployed; otherwise searches the bundled open
// Mutopia catalogue locally and says so. Never fabricates results, never labels an unverified link as a download.
import { INSTRUMENTS, validateInput, searchCatalog, suggestions } from './sheet-core.mjs';

const ENDPOINT = 'https://azastzjxnzjaloxmnbfd.supabase.co/functions/v1/sheet-finder';
const KEY = 'sb_publishable_BPYP79Lh70nWiwxExhRBvw_dRgVsed7';
const ORDER = ['any', 'piano', 'guitar', 'violin', 'cello', 'flute', 'clarinet', 'trumpet', 'voice', 'keyboard', 'viola', 'recorder', 'santoor', 'tar', 'setar', 'ney', 'oud'];

const form = document.getElementById('ny-form'), out = document.getElementById('ny-out'), grid = document.getElementById('ny-inst');
if (form && out && grid) {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

  ORDER.forEach((key, i) => {
    const id = 'ny-i-' + key, lab = el('label', 'ny-chip');
    const input = el('input'); input.type = 'radio'; input.name = 'instrument'; input.value = key; input.id = id; if (i === 0) input.checked = true;
    lab.htmlFor = id; lab.append(input, el('span', '', INSTRUMENTS[key].fa));
    grid.append(lab);
  });

  let catalog = null, serverState = 'unknown', inflight = null, last = null;
  async function loadCatalog() {
    if (catalog) return catalog;
    const r = await fetch('data/mutopia-catalog.json', { cache: 'force-cache' });
    if (!r.ok) throw new Error('catalog');
    catalog = await r.json();
    return catalog;
  }

  async function viaServer(input, signal) {
    const limit = new AbortController(), timer = setTimeout(() => limit.abort(), 20000);
    const sig = AbortSignal.any ? AbortSignal.any([signal, limit.signal]) : signal;
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', signal: sig, headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (r.status === 404) { serverState = 'missing'; return null; }
      const data = await r.json().catch(() => null);
      if (r.status === 429 || r.status === 400) return { message: data?.message || 'درخواست پذیرفته نشد.' };
      if (!r.ok || !data || !Array.isArray(data.results)) { serverState = 'error'; return null; }
      serverState = 'ok';
      return { ...data, mode: 'server' };
    } catch (e) {
      if (signal.aborted) throw e;
      serverState = 'unreachable'; return null;
    } finally { clearTimeout(timer); }
  }

  async function viaCatalog(input) {
    const cat = await loadCatalog();
    const results = searchCatalog(cat, input).map(r => ({ ...r, candidates: undefined }));
    return { results, providers: { mutopia: 'ok', imslp: 'not-connected' }, checkedAt: null, suggestions: suggestions(input, results.length), mode: 'catalog' };
  }

  function state(kind, title, body, retry) {
    out.replaceChildren();
    const box = el('div', 'ny-state ny-state--' + kind);
    box.append(el('b', '', title));
    if (body) box.append(el('p', '', body));
    if (retry) { const b = el('button', 'st-btn st-btn--secondary', 'تلاش دوباره'); b.type = 'button'; b.onclick = () => run(last); box.append(b); }
    out.append(box);
  }

  const MATCH = { exact: 'برای ساز تو', arrangement: 'تنظیم برای ساز تو', ensemble: 'ساز تو همراه سازهای دیگر', uncertain: 'هم‌خانواده؛ تطابق قطعی نیست', unknown: 'ساز در منبع مشخص نیست', any: '' };

  function card(r) {
    const li = el('li', 'ny-result ny-result--' + r.match);
    const head = el('div', 'ny-r-head');
    const t = el('h3', '', r.title); t.lang = 'en'; t.dir = 'auto';
    head.append(t);
    if (r.match && r.match !== 'any') head.append(el('span', 'ny-badge ny-badge--' + r.match, r.matchLabel || MATCH[r.match]));
    li.append(head);
    const meta = el('dl', 'ny-meta');
    const row = (k, v, ltr) => { if (!v) return; const d = el('div'); d.append(el('dt', '', k)); const dd = el('dd', '', v); if (ltr) dd.dir = 'auto'; d.append(dd); meta.append(d); };
    row('آهنگساز', r.composer, true); row('تنظیم', r.arranger, true); row('ساز / ترکیب', r.instrumentation, true);
    row('منبع', r.source, true); row('مجوز', r.license); row('دسترسی', r.accessLabel);
    row('قالب', r.format ? r.format + ' · بررسی‌شده' : 'بررسی‌نشده');
    li.append(meta);
    const act = el('div', 'ny-actions');
    if (r.download) {
      const a = el('a', 'st-btn st-btn--primary', 'دانلود نت'); a.href = r.download; a.rel = 'noopener noreferrer'; a.target = '_blank';
      act.append(a);
      if (r.verifiedAt) act.append(el('small', 'ny-when', 'فایل در ' + new Date(r.verifiedAt).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }) + ' در دسترس بود؛ ممکن است بعداً تغییر کند.'));
    }
    const src = el('a', r.download ? 'st-btn st-btn--link' : 'st-btn st-btn--secondary', 'مشاهده در منبع'); src.href = r.pageUrl; src.rel = 'noopener noreferrer'; src.target = '_blank';
    act.append(src);
    li.append(act);
    return li;
  }

  function render(data, input) {
    out.replaceChildren();
    const { results } = data;
    const head = el('div', 'ny-summary');
    const exact = results.filter(r => ['exact', 'arrangement'].includes(r.match)).length;
    head.append(el('b', '', results.length ? fa(results.length) + ' نتیجه' + (input.instrument !== 'any' && exact ? ' · ' + fa(exact) + ' مورد مستقیم برای ' + INSTRUMENTS[input.instrument].fa : '') : 'نتیجه‌ای پیدا نشد'));
    out.append(head);
    if (data.mode === 'catalog') out.append(el('p', 'ny-notice', 'جست‌وجو در فهرست باز Mutopia Project انجام شد. بررسی خودکار فایل‌ها و جست‌وجوی IMSLP هنوز روی سرور آموزشگاه فعال نشده است؛ برای دانلود، از صفحهٔ منبع اقدام کن.'));
    else if (data.providers?.imslp === 'error') out.append(el('p', 'ny-notice', 'IMSLP در این لحظه پاسخ نداد؛ فقط نتایج Mutopia نمایش داده شده است. چند دقیقه بعد دوباره امتحان کن.'));
    if (results.length) {
      const ul = el('ul', 'ny-results'); results.forEach(r => ul.append(card(r))); out.append(ul);
      out.append(el('p', 'ny-foot', 'نت‌ها متعلق به منابع خودشان هستند. پیش از استفاده، مجوز هر اثر را در صفحهٔ منبع ببین.'));
    }
    const tips = data.suggestions || [];
    if (tips.length && (!results.length || results.length < 3)) {
      const box = el('div', 'ny-tips'); box.append(el('b', '', results.length ? 'برای نتیجهٔ بیشتر:' : 'پیشنهاد برای جست‌وجوی بهتر:'));
      const ul = el('ul'); tips.forEach(t => ul.append(el('li', '', t))); box.append(ul); out.append(box);
    }
  }

  async function run(input) {
    if (!input) return;
    last = input;
    inflight?.abort();
    const ctl = inflight = new AbortController();
    out.setAttribute('aria-busy', 'true');
    state('loading', 'در حال جست‌وجو در منابع…', 'ممکن است چند ثانیه طول بکشد؛ فایل‌ها پیش از نمایش دکمهٔ دانلود بررسی می‌شوند.');
    try {
      let data = serverState === 'missing' ? null : await viaServer(input, ctl.signal);
      if (ctl !== inflight) return;
      if (data?.message) { state('error', data.message, null, false); return; }
      if (!data) data = await viaCatalog(input);
      if (ctl !== inflight) return;
      render(data, input);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      state('error', 'جست‌وجو انجام نشد.', 'اتصال اینترنت را بررسی کن و دوباره امتحان کن.', true);
    } finally { if (ctl === inflight) out.setAttribute('aria-busy', 'false'); }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = validateInput({ query: form.query.value, composer: form.composer.value, instrument: form.instrument.value });
    if (input.error) { state('error', input.error); form.query.focus(); return; }
    run(input);
  });
}
