// جهانِ هزارآوا — page controller. The page is complete as static content; this only switches the live scene on
// when it can run, and keeps the chapter indicator, skip and view switch working in both views.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const main = $('#main'), header = $('.sx-header'), stage = $('#wd-stage'), canvas = $('#wd-canvas'), bird = $('#wd-bird');
const toggle = $('#wd-toggle'), skip = $('#wd-skip'), msg = $('#wd-msg'), count = $('#wd-count');
const chapters = $$('.wd-ch'), cards = $$('.wd-card'), dots = $$('.wd-dots a');
const reduce = matchMedia('(prefers-reduced-motion: reduce)'), wide = matchMedia('(min-width:900px),(min-width:560px) and (max-height:520px)');
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const pref = { get() { try { return localStorage.getItem('world:view'); } catch { return null; } }, set(v) { try { localStorage.setItem('world:view', v); } catch {} } };
let rt = null, active = 0;

const setHeader = () => main.style.setProperty('--wd-hh', Math.round(header?.getBoundingClientRect().height || 74) + 'px');
function mark(i) {
  active = Math.max(0, Math.min(chapters.length - 1, i));
  dots.forEach((d, k) => { if (k === active) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
  count.textContent = 'فصل ' + fa(active + 1) + ' از ' + fa(chapters.length);
}
function nearest() { // simple view: the chapter under a reading line just below the sticky header and bar
  const T = document.querySelector('.wd-bar').getBoundingClientRect().bottom, ref = T + (innerHeight - T) * 0.35; let best = 0, d = Infinity;
  chapters.forEach((c, i) => { const r = c.getBoundingClientRect(), k = ref < r.top ? r.top - ref : ref > r.bottom ? ref - r.bottom : 0; if (k < d) { d = k; best = i; } });
  return best;
}
function say(text) { msg.textContent = text || ''; }
function label() { toggle.hidden = false; toggle.textContent = rt ? 'نمایش ساده' : 'نمایش سینمایی'; toggle.setAttribute('aria-pressed', String(!!rt)); }

async function cinema() {
  if (rt) return; const at = nearest(); toggle.disabled = true;
  try {
    const m = await import('./world/runtime.mjs');
    setHeader(); main.classList.add('wd--cinema');
    rt = m.start({ stage, canvas, bird, cards, wide, reduced: reduce.matches, labels: Object.fromEntries($$('.wd-label').map(e => [e.dataset.room, e])), onChapter: mark,
      onSlow: () => { simple(); say('برای روانی بیشتر، نمایش ساده فعال شد.'); } });
    say(''); if (at > 0) rt.goTo(at, true);
    const again = () => rt?.remeasure(); addEventListener('load', again, { once: true }); document.fonts?.ready.then(again);
  } catch { main.classList.remove('wd--cinema'); rt = null; say('نمایش سینمایی در این مرورگر اجرا نشد؛ روایت به‌صورت ساده نمایش داده می‌شود.'); }
  document.documentElement.classList.remove('wd-pending'); toggle.disabled = false; label();
}
function simple() {
  if (!rt) return; const at = rt.chapterIndex(); rt.destroy(); rt = null; main.classList.remove('wd--cinema'); bird.style.opacity = '0'; label(); mark(at);
  if (at > 0) chapters[at].scrollIntoView({ block: 'start' }); else scrollTo(0, 0);
}
toggle.addEventListener('click', () => { if (rt) { simple(); pref.set('simple'); } else { pref.set('cinema'); cinema(); } });

// indicator and skip: in the live view go to the chapter's reading position; otherwise the plain anchor works
function go(i, focusEl) { if (!rt) return false; rt.goTo(i); focusEl?.focus({ preventScroll: true }); return true; }
dots.forEach((d, i) => d.addEventListener('click', e => { if (go(i, cards[i].querySelector('h2'))) e.preventDefault(); }));
skip.addEventListener('click', e => { if (go(chapters.length - 1, $('#wd-actions a'))) e.preventDefault(); });
// simple view: follow scrolling for the indicator
let tick = false; addEventListener('scroll', () => { if (rt || tick) return; tick = true; requestAnimationFrame(() => { tick = false; mark(nearest()); }); }, { passive: true });
addEventListener('resize', setHeader); addEventListener('pagehide', e => { if (!e.persisted) { rt?.destroy(); rt = null; } });

setHeader(); mark(0); label();
const choice = pref.get();
if (!(choice === 'cinema' || (choice !== 'simple' && !reduce.matches))) document.documentElement.classList.remove('wd-pending');
else cinema().then(() => {
  const h = /^#ch-(\d)$/.exec(location.hash); if (h && rt) rt.goTo(Number(h[1]) - 1, true);
});
window.__world = { get rt() { return rt; }, get active() { return active; } }; // for automated checks only
