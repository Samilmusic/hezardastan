// جهانِ هزارآوا — the scroll story: scene model, timeline, static art and page contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { buildScene, studentAt, cameraAt, birdAt, birdFaces, storyState, drawScene } from '../dist/world/scene.mjs';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const html = read('world.html');

// a backend that only records what the scene asks for
function recorder() {
  const calls = { poly: 0, bad: 0 };
  const ok = pts => pts.length >= 4 && pts.every(Number.isFinite); // flat [x0, y0, x1, y1, …]
  return { calls,
    poly(pts) { calls.poly++; if (!ok(pts)) calls.bad++; }, polys(list) { for (const pts of list) { calls.poly++; if (!ok(pts)) calls.bad++; } },
    ellipse() {}, glow() {}, line(pts) { if (!ok(pts)) calls.bad++; }, lin() { return '#000'; }, rad() { return '#000'; }, rect() {} };
}

test('the timeline is continuous: camera and student never jump between neighbouring scroll positions', () => {
  for (const phone of [false, true]) {
    let c0 = cameraAt(0, phone), s0 = studentAt(0);
    for (let p = 0.01; p <= 5.0001; p += 0.01) {
      const c = cameraAt(p, phone), s = studentAt(p);
      for (const k of ['tx', 'ty', 'w', 'h', 'e', 'a']) assert.ok(Number.isFinite(c[k]), `camera ${k} at p=${p.toFixed(2)}`);
      assert.ok(Math.hypot(c.tx - c0.tx, c.ty - c0.ty) < 1.2, `camera target jumps at p=${p.toFixed(2)}`);
      assert.ok(Math.abs(c.e - c0.e) < 4 && Math.abs(c.a - c0.a) < 4, `camera angle jumps at p=${p.toFixed(2)}`);
      assert.ok(Math.hypot(s[0] - s0[0], s[1] - s0[1]) < 1.6, `student jumps at p=${p.toFixed(2)}`);
      c0 = c; s0 = s;
    }
  }
});

test('the story opens from above and ends on the whole world', () => {
  const a = cameraAt(0, false), z = cameraAt(5, false);
  assert.equal(a.e, 90); assert.ok(z.e > cameraAt(4.15, false).e, 'the view rises at the end');
  assert.ok(z.w > cameraAt(2.2, false).w * 2, 'the last view is much wider than the classroom view');
  assert.ok(studentAt(0)[1] > studentAt(2.2)[1], 'the learner walks in from the gate to the classroom');
  assert.ok(studentAt(3.3)[0] > 26, 'by chapter four the learner is at home');
});

test('the viewer is the bird: its flight is continuous, it rests at every stop and the camera travels with it', () => {
  let b0 = birdAt(0).pos;
  for (let p = 0.005; p <= 5.0001; p += 0.005) { const b = birdAt(p).pos; assert.ok(b.every(Number.isFinite)); assert.ok(Math.hypot(b[0] - b0[0], b[1] - b0[1], b[2] - b0[2]) < 0.9, 'bird jumps at p=' + p.toFixed(3)); b0 = b; }
  for (const p of [0.5, 1, 1.45, 2.2, 3.3]) assert.equal(birdAt(p).fly, 0, 'perched at p=' + p);
  for (const p of [0.2, 2.75, 4.15, 5]) assert.ok(birdAt(p).fly > 0.5, 'in the air at p=' + p);
  for (const phone of [false, true]) for (let p = 0; p <= 5; p += 0.05) { const c = cameraAt(p, phone), b = birdAt(p).pos;
    assert.ok(Math.abs(c.tx - b[0]) < c.w * 0.62 && Math.abs(c.ty - b[1]) < c.h * 0.62, 'the bird stays in the frame at p=' + p.toFixed(2)); }
  assert.ok(Math.hypot(birdAt(2.75).pos[0] - studentAt(2.75)[0], birdAt(2.75).pos[1] - studentAt(2.75)[1]) < 1.5, 'it flies home beside the learner');
  assert.equal(typeof birdFaces(2.75, (x, y) => [x, y], 1), 'boolean');
});

test('the story ends with everything tied to the bird', () => {
  assert.equal(storyState(4.2).connect, 0); assert.equal(storyState(5).connect, 1);
  const S = buildScene(); assert.ok(S.nodes.length >= 6, 'reception, management, classes, courtyard and home');
  const lines = []; const g = { poly() {}, polys() {}, ellipse() {}, glow() {}, rect() {}, lin: () => '#000', rad: () => '#000', line(pts, color) { lines.push(color); } };
  const view = { W: 1200, H: 800, cx: 600, cy: 400, fitW: 1100, fitH: 740 };
  drawScene(g, S, cameraAt(4.2, false), view, storyState(4.2), 0); const before = lines.length; lines.length = 0;
  drawScene(g, S, cameraAt(5, false), view, storyState(5), 0);
  assert.ok(lines.length >= before + S.nodes.length * 2, 'threads are drawn to every place');
});

test('every chapter draws with finite geometry at desktop and phone sizes', () => {
  const S = buildScene();
  for (const [W, H, phone] of [[1440, 820, false], [390, 330, true], [320, 210, true]]) for (let k = 0; k <= 5; k++) {
    const g = recorder(); drawScene(g, S, cameraAt(k, phone), { W, H, cx: W / 2, cy: H / 2, fitW: W * 0.94, fitH: H * 0.94 }, storyState(k), 1000);
    assert.ok(g.calls.poly > 200, `chapter ${k + 1} draws the scene (${g.calls.poly})`); assert.equal(g.calls.bad, 0, `chapter ${k + 1} has only finite points`);
  }
});

test('static chapter art and the teaser exist, are light, and carry no scripts, raster images or remote references', () => {
  for (const f of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'teaser']) {
    const path = new URL(`../dist/world/${f}.svg`, import.meta.url); assert.ok(existsSync(path), f);
    const s = readFileSync(path, 'utf8'); assert.ok(statSync(path).size < 190_000, f + ' stays under 190 KB before compression');
    assert.ok(!/<script|<image|<foreignObject|https?:\/\/(?!www\.w3\.org)/.test(s), f + ' is self-contained vector art');
  }
});

test('the page is a complete story without the runtime', () => {
  assert.equal((html.match(/<section class="wd-ch"/g) || []).length, 6);
  for (const line of ['اینجا، هر مسیر به یادگیری می‌رسد.', 'کلاس را انتخاب کن؛ درخواستت برای بررسی می‌رود.', 'استاد مسیر را روشن می‌کند.', 'کلاس که تمام شد، تمرین تنها نمی‌ماند.', 'هر تمرین، یک قدم روشن‌تر.', 'همه‌چیز، برای ادامهٔ یادگیری.', 'از آموزشگاه تا خانه، مسیر یادگیری ادامه دارد.'])
    assert.ok(html.includes(line), line);
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.equal((html.match(/class="wd-fig"/g) || []).length, 6);
  for (const m of html.matchAll(/<figure class="wd-fig">\s*<img[^>]*>/g)) assert.match(m[0], /alt="[^"]{20,}"/);
  assert.match(html, /id="wd-skip"[^>]*href="#wd-actions"|href="#wd-actions"[^>]*id="wd-skip"/);
  assert.ok(html.includes('رد کردن روایت'));
});

test('the story is honest about enrolment and samples', () => {
  assert.ok(html.includes('در انتظار تأیید مدیر'), 'a request waits for the manager');
  assert.ok((html.match(/>نمونه</g) || []).length >= 2, 'request and feedback cards are marked as samples');
  assert.ok(!/تأیید فوری|ثبت‌نام قطعی شد|پرداخت خودکار|تضمین/.test(html), 'no instant approval, automatic payment or guarantee');
  assert.ok(!/\d+\s*٪|[۰-۹]+\s*٪|نمره|امتیاز/.test(html.slice(html.indexOf('<main'), html.indexOf('</main>'))), 'no invented scores or statistics');
});

test('final actions lead to real destinations', () => {
  const a = html.slice(html.indexOf('id="wd-actions"'));
  assert.match(a, /href="portal\.html#register"[^>]*>\s*انتخاب کلاس و ثبت‌نام|انتخاب کلاس و ثبت‌نام/);
  assert.ok(a.includes('href="portal.html#register"')); assert.ok(a.includes('discover-trigger')); assert.ok(a.includes('کشف ساز مناسب من')); assert.ok(a.includes('ورود به پرتال'));
});

test('the story asks for nothing private: no data client, camera, microphone, audio, storage of personal data or third-party code', () => {
  const code = ['world.js', 'world/runtime.mjs', 'world/scene.mjs'].map(read).join('\n');
  assert.ok(!/supabase|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|getUserMedia|mediaDevices|AudioContext|new Audio|geolocation|document\.cookie|https?:\/\//.test(code));
  assert.ok(!/supabase|session\.js|portal\.js|<audio|<video|autoplay/.test(html));
  const keys = [...code.matchAll(/(?:localStorage|sessionStorage)[^;]*?['"]([\w:.-]+)['"]/g)].map(m => m[1]);
  assert.deepEqual([...new Set(keys)].filter(k => k !== 'world:view'), [], 'only the view preference is remembered');
});

test('the homepage carries only a light teaser and every public page links to the story', () => {
  const home = read('index.html');
  for (const t of ['جهانِ هزارآوا', 'ببین کلاس چگونه تا خانه ادامه پیدا می‌کند.', 'وارد این جهان شو', 'world/teaser.svg']) assert.ok(home.includes(t), t);
  assert.ok(!/world\.js|runtime\.mjs|scene\.mjs|world\.css/.test(home), 'the homepage does not load the story runtime');
  for (const f of ['index', 'courses', 'teachers', 'schedule', 'learning', 'sheet-music', 'contact', 'tuner', 'metronome', 'world'])
    assert.ok((read(f + '.html').match(/href="world\.html"/g) || []).length >= 3, f + '.html links to the story in the header, the menu and the footer');
  assert.ok(read('sitemap.xml').includes('https://avayehezardastan.com/world.html'));
});
