// نت‌یاب هزاردستان — public sheet-music search. No database access, no secrets required, no user-supplied URLs fetched.
// Providers: Mutopia Project (bundled open catalogue, files verified on request) and IMSLP (public MediaWiki API).
import catalog from './catalog.json' with { type: 'json' };
import { validateInput, searchCatalog, verifyFile, expandTerms, imslpSearchUrl, imslpCategoriesUrl, imslpResults, suggestions } from './core.mjs';

const origins = ['https://avayehezardastan.com', 'https://www.avayehezardastan.com', ...(Deno.env.get('SHEET_FINDER_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)];
const imslpEnabled = (Deno.env.get('SHEET_FINDER_IMSLP') ?? 'true') !== 'false';
const UA = 'HezardastanSheetFinder/1.0 (+https://avayehezardastan.com)';

// Small in-memory caches and per-IP limiter (per isolate; good enough to absorb bursts).
const resultCache = new Map<string, { at: number; data: unknown }>();
const fileCache = new Map<string, { at: number; v: Awaited<ReturnType<typeof verifyFile>> }>();
const hits = new Map<string, number[]>();
const RESULT_TTL = 10 * 60_000, FILE_TTL = 6 * 3600_000;

function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 20;
}

async function timedJson(url: string, ms = 7000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'error' });
    if (!r.ok) throw new Error('status ' + r.status);
    const text = await r.text();
    if (text.length > 600_000) throw new Error('too large');
    return JSON.parse(text);
  } finally { clearTimeout(t); }
}

async function verifyCached(url: string) {
  const c = fileCache.get(url);
  if (c && Date.now() - c.at < FILE_TTL) return c.v;
  const v = await verifyFile(url, fetch);
  fileCache.set(url, { at: Date.now(), v });
  if (fileCache.size > 3000) fileCache.clear();
  return v;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'apikey,content-type,authorization,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' };
  const send = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.includes(origin)) return send({ message: 'مبدأ مجاز نیست' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return send({ message: 'POST required' }, 405);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return send({ message: 'جست‌وجوهای زیادی پشت‌سرهم انجام شد؛ یک دقیقه بعد دوباره امتحان کن.' }, 429);
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 2000) return send({ message: 'درخواست بیش از اندازه بزرگ است.' }, 413);
    body = JSON.parse(raw);
  } catch { return send({ message: 'درخواست نامعتبر است.' }, 400); }
  const input = validateInput(body);
  if ('error' in input) return send({ message: input.error }, 400);

  const key = JSON.stringify(input);
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < RESULT_TTL) return send(cached.data);

  const providers: Record<string, string> = {};
  // 1) Mutopia: catalogue search, then verify candidate files for the top results.
  const mutopia = searchCatalog(catalog as never, input);
  providers.mutopia = 'ok';
  await Promise.all(mutopia.slice(0, 8).map(async (r: any) => {
    for (const candidate of r.candidates) {
      const v = await verifyCached(candidate);
      if (v.ok) { r.download = v.url; r.format = v.format; r.verifiedAt = new Date().toISOString(); break; }
    }
    delete r.candidates;
  }));
  mutopia.forEach((r: any) => delete r.candidates);

  // 2) IMSLP: public MediaWiki API; downloads stay on IMSLP's own pages (its disclaimer is never bypassed).
  let imslp: unknown[] = [];
  if (imslpEnabled) {
    try {
      const terms = [...expandTerms(input.query), ...expandTerms(input.composer)].slice(0, 12);
      const search = await timedJson(imslpSearchUrl(terms));
      const titles = (search?.query?.search || []).map((h: any) => h.title).slice(0, 12);
      const cats = titles.length ? await timedJson(imslpCategoriesUrl(titles)) : {};
      imslp = imslpResults(search, cats, input.instrument);
      providers.imslp = 'ok';
    } catch { providers.imslp = 'error'; }
  } else providers.imslp = 'disabled';

  const results = [...mutopia, ...imslp];
  const data = { results, providers, checkedAt: new Date().toISOString(), suggestions: suggestions(input, results.length) };
  resultCache.set(key, { at: Date.now(), data });
  if (resultCache.size > 1000) resultCache.clear();
  return send(data);
});
