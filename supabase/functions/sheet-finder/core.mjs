// نت‌یاب هزاردستان — shared search core (server function and browser fallback).
// Pure functions only: no network access here except through an injected fetch.
// Keep this file identical to dist/sheet-core.mjs (tests/sheet-finder.test.mjs checks it).

export const LIMITS = { query: 120, composer: 80, results: 24 };

const AR_FA = [[/ي/g, 'ی'], [/ى/g, 'ی'], [/ك/g, 'ک'], [/ة/g, 'ه'], [/[أإآ]/g, 'ا'], [/ؤ/g, 'و'], [/ۀ/g, 'ه']];
const DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/** Lower-case, strip Latin diacritics, unify Arabic/Persian letter variants and digits, drop ZWNJ/tatweel/harakat. */
export function normalize(input) {
  let s = String(input ?? '').slice(0, 400).normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (const [re, to] of AR_FA) s = s.replace(re, to);
  s = s.replace(/[۰-۹٠-٩]/g, d => DIGITS[d]).replace(/[ً-ٰٟـ]/g, '').replace(/[‌‍‎‏]/g, ' ');
  return s.toLowerCase().replace(/['’`´"«»()[\]{}.,،؛;:!?؟\-_/\\|+*]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Persian → English vocabulary for the open catalogues, which are catalogued in Latin script.
const FA_TERMS = {
  'باخ': 'bach', 'موتسارت': 'mozart', 'موزارت': 'mozart', 'بتهوون': 'beethoven', 'بتهون': 'beethoven', 'شوپن': 'chopin', 'ویوالدی': 'vivaldi',
  'هایدن': 'haydn', 'شوبرت': 'schubert', 'شومان': 'schumann', 'برامس': 'brahms', 'چایکوفسکی': 'tchaikovsky', 'دبوسی': 'debussy', 'ساتی': 'satie',
  'هندل': 'handel', 'لیست': 'liszt', 'مندلسون': 'mendelssohn', 'گریگ': 'grieg', 'پاگانینی': 'paganini', 'سور': 'sor', 'تارگا': 'tarrega',
  'کارولی': 'carulli', 'جولیانی': 'giuliani', 'اسکارلاتی': 'scarlatti', 'تلمان': 'telemann', 'کوپرن': 'couperin', 'رامو': 'rameau', 'کورلی': 'corelli',
  'پاخلبل': 'pachelbel', 'آلبنیز': 'albeniz', 'کلمنتی': 'clementi', 'چرنی': 'czerny', 'بورگمولر': 'burgmuller', 'دولند': 'dowland', 'جاپلین': 'joplin',
  'سوئیت': 'suite', 'سونات': 'sonata', 'سوناتین': 'sonatina', 'مینوئت': 'minuet', 'منوئت': 'menuet', 'والس': 'waltz', 'پرلود': 'prelude', 'فوگ': 'fugue',
  'اتود': 'etude', 'نوکتورن': 'nocturne', 'کنسرتو': 'concerto', 'مارش': 'march', 'سرناد': 'serenade', 'آریا': 'aria', 'گاووت': 'gavotte', 'ساراباند': 'sarabande',
  'اینونسیون': 'invention', 'کانن': 'canon', 'رقص': 'dance', 'ترانه': 'song', 'سرود': 'hymn', 'مزورکا': 'mazurka', 'پولونز': 'polonaise', 'رندو': 'rondo',
  'فانتزی': 'fantasia', 'بالاد': 'ballade', 'اسکرتسو': 'scherzo', 'آلماند': 'allemande', 'کورانت': 'courante', 'ژیگ': 'gigue', 'تمرین': 'exercise',
  'برای': 'fur', 'الیزه': 'elise', 'مهتاب': 'moonlight', 'تابستان': 'summer', 'زمستان': 'winter', 'بهار': 'spring', 'پاییز': 'autumn',
};

/** Instruments offered in the finder: label, catalogue tokens counted as an exact match, and related tokens counted as uncertain. */
export const INSTRUMENTS = {
  piano: { fa: 'پیانو', exact: ['piano', 'pianoforte', 'fortepiano'], related: ['harpsichord', 'clavier', 'clavichord', 'organ', 'keyboard', 'piano duet', 'cembalo'] },
  keyboard: { fa: 'کیبورد', exact: ['keyboard'], related: ['piano', 'harpsichord', 'organ', 'clavier'] },
  guitar: { fa: 'گیتار', exact: ['guitar', 'classical guitar'], related: ['lute', 'vihuela', 'baroque guitar', 'mandolin', '2 guitars', 'guitar duet'] },
  violin: { fa: 'ویولن', exact: ['violin', 'violine', 'violino'], related: ['violins', '2 violins', 'string quartet', 'string ensemble', 'viola'] },
  viola: { fa: 'ویولا', exact: ['viola'], related: ['violin', 'string quartet'] },
  cello: { fa: 'ویولنسل', exact: ['cello', 'violoncello', "'cello"], related: ['bass', 'string quartet', 'viola da gamba'] },
  flute: { fa: 'فلوت', exact: ['flute', 'transverse flute'], related: ['recorder', 'flutes', 'piccolo'] },
  recorder: { fa: 'ریکوردر', exact: ['recorder', 'alto recorder', 'soprano recorder', 'treble recorder'], related: ['flute'] },
  clarinet: { fa: 'کلارینت', exact: ['clarinet'], related: ['basset horn', 'clarinets'] },
  trumpet: { fa: 'ترومپت', exact: ['trumpet'], related: ['cornet', 'horn', 'brass'] },
  voice: { fa: 'آواز', exact: ['voice', 'soprano', 'alto', 'tenor', 'baritone', 'bass voice', 'voice (soprano)', 'voice (bass)'], related: ['choir', 'voice (satb)', 'choir (satb)', 'satb'] },
  drums: { fa: 'درام و کوبه‌ای', exact: ['drums', 'percussion', 'timpani', 'drum kit'], related: [] },
  // Persian instruments: rarely catalogued in these open sources; kept so the visitor gets an honest answer.
  tar: { fa: 'تار', exact: ['tar'], related: ['setar', 'oud', 'lute'] },
  setar: { fa: 'سه‌تار', exact: ['setar'], related: ['tar', 'lute'] },
  santoor: { fa: 'سنتور', exact: ['santur', 'santoor', 'santour'], related: ['dulcimer', 'hammered dulcimer'] },
  ney: { fa: 'نی', exact: ['ney', 'nay'], related: ['flute'] },
  oud: { fa: 'عود', exact: ['oud', 'ud'], related: ['lute'] },
  any: { fa: 'هر سازی', exact: [], related: [] },
};
export const PERSIAN_INSTRUMENTS = ['tar', 'setar', 'santoor', 'ney', 'oud'];

let TERMS = null;
export function expandTerms(text) {
  TERMS ??= Object.fromEntries(Object.entries(FA_TERMS).map(([k, v]) => [normalize(k), v]));
  const n = normalize(text);
  if (!n) return [];
  const out = new Set();
  for (const w of n.split(' ')) {
    if (!w) continue;
    if (TERMS[w]) out.add(TERMS[w]);
    else if (w.length > 1 || /\d/.test(w)) out.add(w);
  }
  return [...out];
}

export function validateInput(body) {
  const query = String(body?.query ?? '').trim();
  const composer = String(body?.composer ?? '').trim();
  const instrument = String(body?.instrument ?? 'any');
  if (!query && !composer) return { error: 'نام قطعه یا آهنگساز را بنویس.' };
  if (query.length > LIMITS.query || composer.length > LIMITS.composer) return { error: 'متن جست‌وجو بیش از اندازه بلند است.' };
  if (!Object.hasOwn(INSTRUMENTS, instrument)) return { error: 'ساز انتخاب‌شده معتبر نیست.' };
  return { query, composer, instrument };
}

const splitInstruments = s => normalize(s).split(/ ?, ?| and | & | with /).map(x => x.trim()).filter(Boolean);

/** Classify how a catalogued instrumentation relates to the visitor's instrument. */
export function instrumentMatch(instrumentKey, catalogued, arranger = '') {
  const spec = INSTRUMENTS[instrumentKey];
  if (!spec || instrumentKey === 'any') return { level: 'any', label: '' };
  const parts = splitInstruments(catalogued);
  if (!parts.length) return { level: 'unknown', label: 'ساز در منبع مشخص نشده' };
  const has = list => parts.some(p => list.some(t => p === t || p.replace(/^(solo |2 |two )/, '') === t));
  const mentions = list => parts.some(p => list.some(t => p.includes(t)));
  if (has(spec.exact)) {
    if (parts.length === 1) return { level: arranger ? 'arrangement' : 'exact', label: arranger ? 'تنظیم برای ساز تو' : 'برای ساز تو' };
    return { level: 'ensemble', label: 'ساز تو همراه سازهای دیگر' };
  }
  if (mentions(spec.exact)) return { level: 'ensemble', label: 'ساز تو در ترکیب سازها' };
  if (spec.related.length && (has(spec.related) || mentions(spec.related))) return { level: 'uncertain', label: 'برای ساز هم‌خانواده؛ تطابق قطعی نیست' };
  return { level: 'none', label: '' };
}

const LEVEL_RANK = { exact: 0, arrangement: 1, ensemble: 2, any: 2, uncertain: 3, unknown: 4, none: 9 };

export function licenseInfo(l) {
  const s = String(l || '');
  if (/^Public Domain/i.test(s)) return { fa: 'مالکیت عمومی', code: 'PD' };
  const m = s.match(/Creative Commons Attribution(-ShareAlike)? ([\d.]+)/i);
  if (m) return { fa: `کریتیو کامنز ${m[1] ? 'BY-SA' : 'BY'} ${m[2]}`, code: `CC BY${m[1] ? '-SA' : ''} ${m[2]}` };
  return { fa: 'مجوز را در صفحهٔ منبع ببین', code: '' };
}

/** Score open-catalogue records (Mutopia Project) against the request. */
export function searchCatalog(catalog, { query, composer, instrument }) {
  const qTerms = expandTerms(query);
  const cTerms = expandTerms(composer);
  if (!qTerms.length && !cTerms.length) return [];
  const results = [];
  for (const r of catalog) {
    const title = normalize(r.t), comp = normalize(r.c + ' ' + r.cc), opus = normalize(r.o);
    const hay = title + ' ' + opus;
    let score = 0, hits = 0;
    for (const t of qTerms) {
      if (hay.includes(t)) { score += title.split(' ').includes(t) ? 4 : 2; hits++; }
      else if (comp.includes(t)) { score += 3; hits++; }
    }
    if (qTerms.length && hits < Math.max(1, Math.ceil(qTerms.length * 0.6))) continue;
    if (cTerms.length) {
      const ch = cTerms.filter(t => comp.includes(t)).length;
      if (!ch) continue;
      score += ch * 3;
    }
    const match = instrumentMatch(instrument, r.i, r.a);
    if (instrument !== 'any' && match.level === 'none') continue;
    score -= (LEVEL_RANK[match.level] ?? 5) * 2;
    if (qTerms.length && title === qTerms.join(' ')) score += 6;
    results.push({ r, score, match });
  }
  results.sort((a, b) => (LEVEL_RANK[a.match.level] - LEVEL_RANK[b.match.level]) || (b.score - a.score) || (a.r.id - b.r.id));
  return results.slice(0, LIMITS.results).map(({ r, match }) => mutopiaResult(r, match));
}

const MUTOPIA = 'https://www.mutopiaproject.org';
export function mutopiaResult(r, match) {
  const lic = licenseInfo(r.l);
  const piece = r.p.split('/').pop();
  return {
    provider: 'mutopia', source: 'Mutopia Project', id: 'mutopia-' + r.id,
    title: r.t, composer: r.c, arranger: r.a || '', opus: r.o || '', instrumentation: r.i || '', style: r.s || '',
    match: match.level, matchLabel: match.label,
    license: lic.fa, licenseCode: lic.code, access: 'free', accessLabel: 'رایگان؛ مجوز آزاد',
    format: null, pageUrl: `${MUTOPIA}/cgibin/piece-info.cgi?id=${r.id}`,
    // Candidate files are only offered for download after server-side verification.
    candidates: [`${MUTOPIA}/ftp/${r.p}/${piece}-a4.pdf`, `${MUTOPIA}/ftp/${r.p}/${piece}-a4-pdfs.zip`],
    download: null, verifiedAt: null,
  };
}

// ---------------------------------------------------------------- server-side link verification
export const ALLOWED_HOSTS = new Set(['www.mutopiaproject.org', 'mutopiaproject.org', 'imslp.org']);
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?f[cd]|\[?fe80)/i;

export function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  if (PRIVATE.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || !ALLOWED_HOSTS.has(u.hostname)) return null;
  return u;
}

/**
 * Verify that a catalogue file is really downloadable right now: GET (not HEAD), manual redirects to allowed hosts only,
 * timeout, byte cap, and a magic-number check so an HTML error page is never reported as a PDF.
 */
export async function verifyFile(rawUrl, fetchImpl, { timeoutMs = 6000, maxBytes = 65536, maxRedirects = 3 } = {}) {
  let url = safeUrl(rawUrl);
  if (!url) return { ok: false, reason: 'blocked' };
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { Range: 'bytes=0-1023', 'User-Agent': 'HezardastanSheetFinder/1.0 (+https://avayehezardastan.com)' } });
    } catch { clearTimeout(timer); return { ok: false, reason: 'unreachable' }; }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const next = safeUrl(new URL(res.headers.get('location') || '', url).href);
      try { await res.body?.cancel(); } catch {}
      if (!next) return { ok: false, reason: 'redirect-blocked' };
      url = next; continue;
    }
    if (res.status !== 200 && res.status !== 206) { clearTimeout(timer); try { await res.body?.cancel(); } catch {} return { ok: false, reason: 'status-' + res.status }; }
    const len = Number(res.headers.get('content-length') || 0);
    if (res.status === 200 && len > 50 * 1024 * 1024) { clearTimeout(timer); try { await res.body?.cancel(); } catch {} return { ok: false, reason: 'too-large' }; }
    let head = new Uint8Array(0);
    try {
      const reader = res.body.getReader();
      while (head.length < 8) {
        const { value, done } = await reader.read();
        if (done) break;
        const merged = new Uint8Array(head.length + value.length); merged.set(head); merged.set(value, head.length); head = merged;
        if (head.length > maxBytes) break;
      }
      try { await reader.cancel(); } catch {}
    } catch { clearTimeout(timer); return { ok: false, reason: 'read-failed' }; }
    clearTimeout(timer);
    const sig = String.fromCharCode(...head.slice(0, 5));
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (sig.startsWith('%PDF')) return { ok: true, url: url.href, format: 'PDF' };
    if (sig.startsWith('PK')) return { ok: true, url: url.href, format: 'ZIP (PDF)' };
    return { ok: false, reason: type.includes('html') ? 'html-not-file' : 'not-a-score-file' };
  }
  return { ok: false, reason: 'too-many-redirects' };
}

// ---------------------------------------------------------------- IMSLP (MediaWiki API, public-domain library)
export function imslpSearchUrl(terms) {
  const p = new URLSearchParams({ action: 'query', list: 'search', srsearch: terms.join(' '), srnamespace: '0', srlimit: '12', format: 'json', origin: '*' });
  return 'https://imslp.org/api.php?' + p;
}
export function imslpCategoriesUrl(titles) {
  const p = new URLSearchParams({ action: 'query', prop: 'categories', titles: titles.join('|'), cllimit: '500', format: 'json', origin: '*' });
  return 'https://imslp.org/api.php?' + p;
}
/** IMSLP categories such as "For piano" or "Scores featuring the violin" are the instrument metadata used for matching. */
export function imslpInstrumentation(categories) {
  const names = (categories || []).map(c => String(c.title || c).replace(/^Category:/, ''));
  const forCats = names.filter(n => /^For /i.test(n)).map(n => n.replace(/^For /i, ''));
  const featuring = names.filter(n => /^Scores featuring the /i.test(n)).map(n => n.replace(/^Scores featuring the /i, ''));
  const arranged = names.some(n => /arrangements/i.test(n));
  return { instrumentation: (forCats[0] || featuring.join(', ')), forCats, featuring, arranged };
}
export function imslpResults(searchJson, categoriesJson, instrument) {
  const hits = searchJson?.query?.search || [];
  const pages = Object.values(categoriesJson?.query?.pages || {});
  const out = [];
  for (const h of hits) {
    const page = pages.find(p => p.title === h.title);
    const info = imslpInstrumentation(page?.categories);
    let match = instrumentMatch(instrument, info.forCats[0] || info.featuring.join(', '), info.arranged ? 'arr' : '');
    if (instrument !== 'any' && match.level === 'none' && info.featuring.length) match = instrumentMatch(instrument, info.featuring.join(', '));
    if (instrument !== 'any' && match.level === 'none') continue;
    const m = h.title.match(/^(.*) \(([^()]+)\)$/);
    out.push({
      provider: 'imslp', source: 'IMSLP', id: 'imslp-' + h.pageid,
      title: m ? m[1] : h.title, composer: m ? m[2] : '', arranger: '', opus: '', instrumentation: info.instrumentation, style: '',
      match: match.level, matchLabel: match.label,
      license: 'بیشتر آثار مالکیت عمومی؛ وضعیت هر فایل در منبع', licenseCode: '', access: 'free', accessLabel: 'رایگان؛ دانلود از صفحهٔ منبع با پذیرش شرایط آن',
      format: null, pageUrl: 'https://imslp.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_')), candidates: [], download: null, verifiedAt: null,
    });
  }
  return out.sort((a, b) => (LEVEL_RANK[a.match] ?? 5) - (LEVEL_RANK[b.match] ?? 5));
}

export function suggestions({ query, composer, instrument }, count) {
  const tips = [];
  if (PERSIAN_INSTRUMENTS.includes(instrument)) tips.push('برای سازهای ایرانی، منابع باز بین‌المللی نت زیادی ندارند؛ نت ردیف و قطعه‌های ایرانی را از استادت بخواه.');
  if (/[؀-ۿ]/.test(query + composer)) tips.push('نام قطعه یا آهنگساز را به انگلیسی هم امتحان کن؛ این منابع با الفبای لاتین فهرست شده‌اند.');
  if (instrument !== 'any') tips.push('«هر سازی» را انتخاب کن تا تنظیم‌های دیگر هم دیده شوند.');
  if (composer) tips.push('فیلد آهنگساز را خالی بگذار یا فقط نام خانوادگی را بنویس.');
  if (!count) tips.push('ترانه‌ها و آهنگ‌های امروزی معمولاً حق نشر دارند و در این منابع آزاد پیدا نمی‌شوند.');
  return tips.slice(0, 4);
}
