import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../supabase/functions/sheet-finder/core.mjs';

const catalog = JSON.parse(readFileSync(new URL('../supabase/functions/sheet-finder/catalog.json', import.meta.url)));

test('browser and server copies of the core are identical, catalogues too', () => {
  assert.equal(readFileSync(new URL('../dist/sheet-core.mjs', import.meta.url), 'utf8'), readFileSync(new URL('../supabase/functions/sheet-finder/core.mjs', import.meta.url), 'utf8'));
  assert.equal(readFileSync(new URL('../dist/data/mutopia-catalog.json', import.meta.url), 'utf8'), readFileSync(new URL('../supabase/functions/sheet-finder/catalog.json', import.meta.url), 'utf8'));
});

test('normalizes Persian/Arabic variants, digits, ZWNJ and Latin diacritics', () => {
  assert.equal(core.normalize('كمانچه‌ي ۱۲'), 'کمانچه ی 12');
  assert.equal(core.normalize('Für Élise'), 'fur elise');
  assert.deepEqual(core.expandTerms('سوئیت باخ'), ['suite', 'bach']);
});

test('validates and bounds input', () => {
  assert.ok(core.validateInput({ query: '', composer: '' }).error);
  assert.ok(core.validateInput({ query: 'x'.repeat(200) }).error);
  assert.ok(core.validateInput({ query: 'suite', instrument: 'banjo' }).error);
  assert.deepEqual(core.validateInput({ query: ' suite ', instrument: 'cello' }), { query: 'suite', composer: '', instrument: 'cello' });
});

test('real catalogue queries across instruments, exact before uncertain', () => {
  const cello = core.searchCatalog(catalog, { query: 'suite', composer: 'bach', instrument: 'cello' });
  assert.ok(cello.length > 0);
  assert.equal(cello[0].match, 'exact');
  assert.match(cello[0].pageUrl, /^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/);
  assert.ok(cello.some(r => r.id === 'mutopia-517'), 'Cello Suite 1 (Mutopia id 517) is found');

  const persian = core.searchCatalog(catalog, { query: 'سوئیت', composer: 'باخ', instrument: 'cello' });
  assert.deepEqual(persian.map(r => r.id), cello.map(r => r.id), 'Persian query maps to the same results');

  const guitar = core.searchCatalog(catalog, { query: 'study', composer: 'sor', instrument: 'guitar' });
  assert.ok(guitar.length > 0 && guitar.every(r => ['exact', 'arrangement', 'ensemble', 'uncertain'].includes(r.match)));

  const piano = core.searchCatalog(catalog, { query: 'elise', composer: '', instrument: 'piano' });
  assert.ok(piano.some(r => /elise/i.test(r.title)));

  const harpsi = core.searchCatalog(catalog, { query: 'sonata', composer: 'scarlatti', instrument: 'piano' });
  assert.ok(harpsi.some(r => r.match === 'uncertain' || r.match === 'exact'));
  const order = { exact: 0, arrangement: 1, ensemble: 2, uncertain: 3, unknown: 4 };
  for (let i = 1; i < harpsi.length; i++) assert.ok(order[harpsi[i - 1].match] <= order[harpsi[i].match]);
});

test('instrument classification', () => {
  assert.equal(core.instrumentMatch('cello', 'Cello').level, 'exact');
  assert.equal(core.instrumentMatch('cello', "'Cello").level, 'exact');
  assert.equal(core.instrumentMatch('violin', 'Violin, Piano').level, 'ensemble');
  assert.equal(core.instrumentMatch('piano', 'Harpsichord').level, 'uncertain');
  assert.equal(core.instrumentMatch('guitar', 'Guitar', 'Someone').level, 'arrangement');
  assert.equal(core.instrumentMatch('flute', 'Organ').level, 'none');
  assert.equal(core.instrumentMatch('piano', '').level, 'unknown');
});

test('no results for a Persian instrument produce honest suggestions', () => {
  const r = core.searchCatalog(catalog, { query: 'چهارمضراب', composer: '', instrument: 'santoor' });
  assert.equal(r.length, 0);
  assert.ok(core.suggestions({ query: 'چهارمضراب', composer: '', instrument: 'santoor' }, 0).length >= 2);
});

// ---- link verification ----
const body = bytes => ({ getReader() { let done = false; return { async read() { if (done) return { done: true }; done = true; return { value: new TextEncoder().encode(bytes), done: false }; }, async cancel() {} }; }, async cancel() {} });
const resp = (status, headers = {}, bytes = '') => ({ status, headers: new Headers(headers), body: body(bytes) });

test('verifies a real PDF by its signature using GET with a range', async () => {
  let seen;
  const r = await core.verifyFile('https://www.mutopiaproject.org/ftp/A/b/b-a4.pdf', async (url, init) => { seen = init; return resp(206, { 'content-type': 'application/pdf' }, '%PDF-1.4 ...'); });
  assert.deepEqual(r, { ok: true, url: 'https://www.mutopiaproject.org/ftp/A/b/b-a4.pdf', format: 'PDF' });
  assert.equal(seen.method, 'GET'); assert.equal(seen.redirect, 'manual');
});

test('HTML pretending to be a PDF, 404 and network failure are not downloads', async () => {
  assert.equal((await core.verifyFile('https://www.mutopiaproject.org/x.pdf', async () => resp(200, { 'content-type': 'text/html' }, '<!doctype html>'))).reason, 'html-not-file');
  assert.equal((await core.verifyFile('https://www.mutopiaproject.org/x.pdf', async () => resp(404))).ok, false);
  assert.equal((await core.verifyFile('https://www.mutopiaproject.org/x.pdf', async () => { throw new Error('down'); })).reason, 'unreachable');
});

test('redirects are followed only to allowed hosts; arbitrary and private URLs are refused', async () => {
  const hops = [resp(302, { location: '/ftp/real.pdf' }), resp(200, {}, '%PDF-1.7')];
  assert.equal((await core.verifyFile('https://www.mutopiaproject.org/x.pdf', async () => hops.shift())).url, 'https://www.mutopiaproject.org/ftp/real.pdf');
  assert.equal((await core.verifyFile('https://www.mutopiaproject.org/x.pdf', async () => resp(302, { location: 'http://169.254.169.254/latest' }))).reason, 'redirect-blocked');
  assert.equal((await core.verifyFile('https://www.mutopiaproject.org/x.pdf', async () => resp(301, { location: 'https://evil.example/x.pdf' }))).reason, 'redirect-blocked');
  for (const bad of ['http://www.mutopiaproject.org/x.pdf', 'https://127.0.0.1/x.pdf', 'https://localhost/x', 'https://example.com/x.pdf', 'file:///etc/passwd', 'https://user:pw@imslp.org/x', 'https://imslp.org:8443/x'])
    assert.equal((await core.verifyFile(bad, async () => { throw new Error('must not fetch'); })).reason, 'blocked', bad);
});

test('timeouts abort the request', async () => {
  const r = await core.verifyFile('https://www.mutopiaproject.org/slow.pdf', (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))), { timeoutMs: 30 });
  assert.equal(r.reason, 'unreachable');
});

test('IMSLP categories drive instrument matching; unrelated pages are dropped', () => {
  const search = { query: { search: [{ title: 'Cello Suite No.1 in G major, BWV 1007 (Bach, Johann Sebastian)', pageid: 1 }, { title: 'Mass in B minor, BWV 232 (Bach, Johann Sebastian)', pageid: 2 }] } };
  const cats = { query: { pages: { 1: { title: search.query.search[0].title, categories: [{ title: 'Category:For cello' }, { title: 'Category:Scores featuring the cello' }] }, 2: { title: search.query.search[1].title, categories: [{ title: 'Category:For voices, chorus, orchestra' }] } } } };
  const res = core.imslpResults(search, cats, 'cello');
  assert.equal(res.length, 1);
  assert.equal(res[0].match, 'exact');
  assert.equal(res[0].composer, 'Bach, Johann Sebastian');
  assert.equal(res[0].download, null, 'IMSLP results never claim a direct download');
  assert.match(res[0].pageUrl, /^https:\/\/imslp\.org\/wiki\//);
});
