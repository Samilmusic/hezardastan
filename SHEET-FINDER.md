# نت‌یاب هزاردستان (public sheet-music finder)

## What runs where
- `dist/sheet-finder.js` (browser) posts `{query, composer, instrument}` to the Supabase Edge Function `sheet-finder`.
- `supabase/functions/sheet-finder/index.ts` (server) searches two legitimate open sources:
  - **Mutopia Project** — public-domain and Creative Commons scores. Catalogue bundled as `catalog.json`, built from the headers of github.com/MutopiaProject/MutopiaProject with `scripts/build-mutopia-catalog.py`. For the top results the server checks the real PDF (or zipped PDFs) with a ranged GET, manual redirects restricted to Mutopia hosts, a 6 s timeout, a byte cap and a `%PDF` / `PK` signature check. Only then is «دانلود نت» shown, with the time of the check.
  - **IMSLP** — public MediaWiki API (`imslp.org/api.php`, search + categories). Instrument matching uses IMSLP categories (`For cello`, `Scores featuring the violin`). IMSLP files sit behind IMSLP's own disclaimer, so these results are always «مشاهده در منبع»; the disclaimer is never bypassed.
- If the function is not deployed or unreachable, the browser searches the same bundled Mutopia catalogue locally (`dist/data/mutopia-catalog.json`) and says so; it never shows a download button in that mode.

## Security
No database access, no secrets, no user-supplied URLs are fetched. Destinations are fixed allowlisted hosts (https only, no credentials, no non-443 ports, private/loopback/IP-literal hosts refused, redirects re-validated). Input lengths bounded (120/80 chars), per-IP limit 20 searches/minute per isolate, 10-minute result cache, 6-hour file-check cache. Provider content is rendered with `textContent`.

## Deploy (required for verified downloads and IMSLP)
```
supabase functions deploy sheet-finder --no-verify-jwt
```
Optional secrets (Supabase → Edge Functions → Secrets):
- `SHEET_FINDER_ALLOWED_ORIGINS` — extra comma-separated origins (the main domain and www are built in).
- `SHEET_FINDER_IMSLP=false` — turn the IMSLP provider off.
No API key is needed for either provider. The site CSP already allows `connect-src` to the project's Supabase URL.

## Tests
`node --test tests/sheet-finder.test.mjs` — normalisation, Persian queries, exact vs uncertain matches on the real catalogue, PDF signature/HTML/404/timeout/redirect/SSRF cases with mocked responses, IMSLP category matching.
