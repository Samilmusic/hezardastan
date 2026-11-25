/* Public scroll story. Presentation only: never reads a session, student record or financial API.
   The page is complete without this file; it only adds choreography, filters and the opt-in demos. */
(()=>{'use strict';
const doc=document.documentElement,body=document.body,$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)'),faDigits=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const normalize=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s‌‏/،,-]/g,'').toLowerCase();
const cleanups=[];const on=(t,e,f,o)=>{t.addEventListener(e,f,o);cleanups.push(()=>t.removeEventListener(e,f,o));};

/* ---------------------------------------------------------- header menu */
const menu=$('.st-menu'),nav=$('#st-nav');
function closeMenu(){nav?.classList.remove('is-open');menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label','باز کردن فهرست');}
menu&&on(menu,'click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'بستن فهرست':'باز کردن فهرست');nav.classList.toggle('is-open',open);if(open)nav.querySelector('a')?.focus();});
nav&&on(nav,'click',e=>{if(e.target.closest('a'))closeMenu();});
on(document,'keydown',e=>{if(e.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
on(document,'click',e=>{if(!e.target.closest('.st-header'))closeMenu();});

/* ---------------------------------------------------------- sound: only after an explicit action */
let sample=null,sampleGen=0,loopOn=false,rate=1;const stage=$('#practice-stage'),playBtn=$('#demo-play'),status=$('#demo-status'),timeEl=$('#demo-time');
const LOOP=[2.6,7.0];
const fmt=t=>{t=Math.max(0,Math.floor(t));return faDigits(Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));};
function sampleIdle(msg){stage?.classList.remove('is-playing');playBtn?.setAttribute('aria-pressed','false');const sr=playBtn?.querySelector('.st-sr');if(sr)sr.textContent='پخش نمونهٔ صوتی';if(msg&&status)status.textContent=msg;}
function stopSample(msg){sampleGen++;if(sample){sample.pause();try{sample.currentTime=0;}catch{}}stage?.style.setProperty('--pos','0');if(timeEl)timeEl.textContent=fmt(0);sampleIdle(msg||'نمونه فقط با زدن دکمهٔ پخش شنیده می‌شود.');}
function ensureSample(){if(sample)return sample;sample=new Audio('audio/guide-clips/sound-bow.mp3');sample.preload='none';try{sample.preservesPitch=true;sample.webkitPreservesPitch=true;}catch{}
  sample.addEventListener('timeupdate',()=>{const d=sample.duration||9.5;if(loopOn&&sample.currentTime>=LOOP[1]){sample.currentTime=LOOP[0];}stage?.style.setProperty('--pos',String(Math.min(1,sample.currentTime/d)));if(timeEl)timeEl.textContent=fmt(sample.currentTime);});
  sample.addEventListener('ended',()=>{sampleIdle('نمونه تمام شد. برای شنیدن دوباره، پخش را بزن.');});
  sample.addEventListener('error',()=>{sampleIdle('صدا دریافت نشد؛ اتصال را بررسی کن و دوباره امتحان کن.');});
  return sample;}
playBtn&&on(playBtn,'click',async()=>{const a=ensureSample();if(!a.paused){a.pause();sampleIdle('پخش متوقف شد.');return;}const g=++sampleGen;status.textContent='در حال آماده‌کردن نمونه…';a.playbackRate=rate;if(loopOn&&(a.currentTime<LOOP[0]||a.currentTime>LOOP[1]))a.currentTime=LOOP[0];
  try{await a.play();if(g!==sampleGen){a.pause();return;}stage.classList.add('is-playing');playBtn.setAttribute('aria-pressed','true');playBtn.querySelector('.st-sr').textContent='توقف نمونهٔ صوتی';status.textContent=`در حال پخش با سرعت ${faDigits(String(rate).replace('.','٫'))}×${loopOn?'، تکرار بخش انتخابی':''}`;}
  catch{if(g===sampleGen)sampleIdle('پخش انجام نشد. دوباره دکمهٔ پخش را بزن.');}});
$$('.pr-speed [data-rate]').forEach(b=>on(b,'click',()=>{rate=Number(b.dataset.rate);$$('.pr-speed [data-rate]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(sample)sample.playbackRate=rate;if(status)status.textContent=sample&&!sample.paused?`سرعت پخش: ${faDigits(String(rate).replace('.','٫'))}×`:`سرعت ${faDigits(String(rate).replace('.','٫'))}× انتخاب شد؛ برای شنیدن، پخش را بزن.`;}));
const loopBtn=$('#demo-loop');loopBtn&&on(loopBtn,'click',()=>{loopOn=!loopOn;loopBtn.setAttribute('aria-pressed',String(loopOn));stage.classList.toggle('is-looping',loopOn);if(loopOn&&sample&&!sample.paused&&(sample.currentTime<LOOP[0]||sample.currentTime>LOOP[1]))sample.currentTime=LOOP[0];if(status)status.textContent=loopOn?'بخش انتخابی (A تا B) پشت‌سرهم تکرار می‌شود.':'تکرار بخش خاموش شد.';});

/* metronome demo: WebAudio look-ahead scheduler, created on first click only */
let ctx=null,metroOn=false,bpm=72,nextTime=0,beat=0,timer=0;const metroBtn=$('#demo-metro'),bpmOut=$('#demo-bpm'),pads=$$('.pr-beats i'),visualTimers=new Set();
function click(time,accent){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=accent?1500:1000;g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(accent?.5:.32,time+.002);g.gain.exponentialRampToValueAtTime(.0001,time+.06);o.connect(g).connect(ctx.destination);o.start(time);o.stop(time+.07);o.onended=()=>{o.disconnect();g.disconnect();};}
function flash(b,delay){const id=setTimeout(()=>{visualTimers.delete(id);pads.forEach((p,i)=>p.classList.toggle('hit',i===b));const off=setTimeout(()=>{visualTimers.delete(off);pads[b]?.classList.remove('hit');},110);visualTimers.add(off);},Math.max(0,delay));visualTimers.add(id);}
function schedule(){while(nextTime<ctx.currentTime+.12){click(nextTime,beat===0);flash(beat,(nextTime-ctx.currentTime)*1000);nextTime+=60/bpm;beat=(beat+1)%4;}}
function stopMetro(){metroOn=false;clearInterval(timer);timer=0;visualTimers.forEach(clearTimeout);visualTimers.clear();pads.forEach(p=>p.classList.remove('hit'));if(metroBtn){metroBtn.setAttribute('aria-pressed','false');metroBtn.textContent='شنیدن مترونوم';}if(ctx&&ctx.state==='running')ctx.suspend().catch(()=>{});}
metroBtn&&on(metroBtn,'click',async()=>{if(metroOn){stopMetro();return;}try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();}catch{metroBtn.textContent='صدا در این مرورگر پخش نشد';return;}metroOn=true;beat=0;nextTime=ctx.currentTime+.06;schedule();timer=setInterval(schedule,25);metroBtn.setAttribute('aria-pressed','true');metroBtn.textContent='توقف مترونوم';});
$$('[data-bpm]').forEach(b=>on(b,'click',()=>{bpm=Math.min(240,Math.max(30,bpm+Number(b.dataset.bpm)));if(bpmOut)bpmOut.textContent=faDigits(bpm);}));
function stopAll(){stopSample();stopMetro();}
on(document,'visibilitychange',()=>{if(document.hidden)stopAll();});on(window,'pagehide',stopAll);
$$('.discover-trigger,[data-open-assistant]').forEach(b=>on(b,'click',stopAll));
$$('[data-open-assistant]').forEach(b=>on(b,'click',()=>{const l=$('.ha-launcher');if(l)l.click();else location.href='portal.html';}));

/* ---------------------------------------------------------- teachers: group + search */
(()=>{const root=$('#masters');if(!root)return;const cards=$$('.st-teacher',root),buttons=$$('[data-group]',root),input=$('#master-search'),out=$('#teacher-results'),empty=$('#teacher-empty');let group='all';
  function apply(){const q=normalize(input.value);let n=0;cards.forEach(c=>{const show=(group==='all'||c.dataset.groups.split(' ').includes(group))&&normalize(c.dataset.search).includes(q);c.hidden=!show;if(show)n++;});out.textContent=faDigits(n)+' استاد';empty.hidden=n!==0;}
  buttons.forEach(b=>on(b,'click',()=>{group=b.dataset.group;buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));apply();}));on(input,'input',apply);apply();})();

/* ---------------------------------------------------------- instruments: family + search + fold */
(()=>{const root=$('#instruments');if(!root)return;const cards=$$('.st-inst',root),buttons=$$('[data-family]',root).filter(b=>b.tagName==='BUTTON'),input=$('#instrument-search'),out=$('#instrument-results'),empty=$('#instrument-empty');let family='all',expanded=false;
  const more=document.createElement('button');more.type='button';more.className='st-more';more.setAttribute('aria-expanded','false');$('.st-inst-grid',root).after(more);
  const limit=()=>matchMedia('(max-width: 767px)').matches?6:12;
  function apply(){const q=normalize(input.value),filtered=!!q||family!=='all';let n=0,shown=0;cards.forEach(c=>{const match=(family==='all'||c.dataset.family===family)&&normalize(c.dataset.name).includes(q);c.hidden=!match;if(match){n++;c.classList.toggle('is-folded',!filtered&&!expanded&&shown>=limit());shown++;}else c.classList.remove('is-folded');});
    out.textContent=faDigits(n)+' ساز و مسیر آموزشی';empty.hidden=n!==0;more.hidden=filtered||cards.length<=limit();more.setAttribute('aria-expanded',String(expanded));more.textContent=expanded?'نمایش کوتاه‌تر ↑':`دیدن همهٔ ${faDigits(cards.length)} ساز ↓`;}
  on(more,'click',()=>{const first=!expanded?cards.find(c=>c.classList.contains('is-folded')):null;expanded=!expanded;apply();if(first)first.focus();else root.scrollIntoView({block:'start',behavior:reduce.matches?'auto':'smooth'});});
  buttons.forEach(b=>on(b,'click',()=>{family=b.dataset.family;buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));apply();}));on(input,'input',apply);on(window,'resize',()=>apply(),{passive:true});apply();})();

/* ---------------------------------------------------------- weekly board (existing published schedule) */
(()=>{const days=$('.st-days'),panel=$('#st-day-panel');if(!days||!panel)return;
  const week=[['شنبه',['هنگ درام','داربوکا','جیمبی','دف','ارف','ویولن','نقاشی','عکاسی و فیلم‌برداری']],['یکشنبه',['دف','کاخن','کالیمبا','موسیقی کودک','سازشناسی کودکان']],['دوشنبه',['گیتار فلامنکو','ویولن','ترومپت','آهنگسازی','تنظیم','صدابرداری','فن بیان','نقاشی','دف','دی جی']],['سه‌شنبه',['گیتار','سلفژ','آواز','کلارینت','ترومپت','نی','ویولن','تئوری موسیقی']],['چهارشنبه',['تنبک','پیانو','درام','ملودیکا','کیبورد','ویولن','ترومپت','نقاشی']],['پنجشنبه',['سنتور','تار','سه‌تار','عود','دف','تنبک','ویولن','موسیقی کودک']]];
  const icons={'گیتار فلامنکو':'guitar','گیتار':'guitar','ویولن':'violin','نی':'ney','کلارینت':'clarinet','ترومپت':'trumpet','پیانو':'piano','کیبورد':'keyboard','ملودیکا':'keyboard','دف':'daf','هنگ درام':'handpan','جیمبی':'djembe','داربوکا':'darbuka','تنبک':'tombak','کاخن':'cajon','سنتور':'santoor','عود':'oud','تار':'tar','سه‌تار':'setar','آواز':'voice','فن بیان':'voice','صدابرداری':'voice','نقاشی':'art','عکاسی و فیلم‌برداری':'camera','درام':'drums','سلفژ':'book','تئوری موسیقی':'book','آهنگسازی':'book','تنظیم':'dj','دی جی':'dj','کالیمبا':'kalimba','ارف':'child','موسیقی کودک':'child','سازشناسی کودکان':'child'};
  const pages={'گیتار فلامنکو':'flamenco-guitar','گیتار':'guitar','ویولن':'violin','نی':'ney','کلارینت':'clarinet','ترومپت':'trumpet','پیانو':'piano','کیبورد':'keyboard','ملودیکا':'melodica','دف':'daf','هنگ درام':'handpan','جیمبی':'djembe','داربوکا':'darbuka','تنبک':'tombak','کاخن':'cajon','سنتور':'santoor','عود':'oud','تار':'tar','سه‌تار':'setar','درام':'drums','کالیمبا':'kalimba'};
  const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  days.innerHTML=week.map(([d],i)=>`<button type="button" role="tab" id="st-day-${i}" aria-controls="st-day-panel" aria-selected="false" tabindex="-1">${d}<small>${faDigits(week[i][1].length)} رشته</small></button>`).join('');
  const tabs=$$('button',days);
  function select(i,focus){tabs.forEach((t,k)=>{t.setAttribute('aria-selected',String(k===i));t.tabIndex=k===i?0:-1;});panel.setAttribute('aria-labelledby','st-day-'+i);const [d,list]=week[i];
    panel.innerHTML=`<h3>${d}‌ها</h3><ul class="st-day-list">${list.map(n=>`<li><svg viewBox="0 0 100 105" aria-hidden="true"><use href="instruments.svg#${icons[n]||'book'}"></use></svg>${pages[n]?`<a href="instruments/${pages[n]}.html">${esc(n)}</a>`:`<span>${esc(n)}</span>`}</li>`).join('')}</ul><p class="st-day-note">ساعت دقیق، ظرفیت و شهریهٔ هر کلاس را از دفتر آموزشگاه بپرس. زمان کلاس هنرجویان ثبت‌نام‌شده در پرتال نمایش داده می‌شود.</p>`;
    if(focus)tabs[i].focus();}
  tabs.forEach((t,i)=>{on(t,'click',()=>select(i));on(t,'keydown',e=>{const k={ArrowLeft:1,ArrowRight:-1,ArrowDown:1,ArrowUp:-1}[e.key];if(k){e.preventDefault();select((i+k+tabs.length)%tabs.length,true);}else if(e.key==='Home'){e.preventDefault();select(0,true);}else if(e.key==='End'){e.preventDefault();select(tabs.length-1,true);}});});
  const today=(new Date().getDay()+1)%7;select(today<6?today:0);})();

/* ---------------------------------------------------------- HezarAva results: teacher avatars */
(()=>{const box=$('#guide-content');if(!box||!('MutationObserver'in window))return;const map={};$$('.st-teacher').forEach(c=>{const img=$('img',c),name=$('h3',c).textContent.replace(/^استاد\s+/,'').trim();map[name]=img.getAttribute('src');});
  const names=Object.keys(map).sort((a,b)=>b.length-a.length);
  const mo=new MutationObserver(()=>{$$('.rec-teachers strong:not([data-faces])',box).forEach(s=>{s.dataset.faces='1';const parts=s.textContent.split('·').map(x=>x.trim()).filter(Boolean);s.textContent='';parts.forEach(p=>{const n=p.replace(/^استاد\s+/,'').trim(),key=names.find(k=>n===k);const span=document.createElement('span');span.className='teacher-person';if(key){const im=document.createElement('img');im.className='teacher-avatar';im.src=map[key];im.alt='';span.append(im);}span.append(document.createTextNode(p));s.append(span);});});});
  mo.observe(box,{childList:true,subtree:true});cleanups.push(()=>mo.disconnect());})();

/* ---------------------------------------------------------- choreography */
try{
  body.classList.add('st-live');
  const motion=()=>!reduce.matches;
  if(motion())body.classList.add('st-motion');
  const pinQ=matchMedia('(min-width: 1024px) and (min-height: 700px)');
  const setPin=()=>{body.classList.toggle('st-pin',pinQ.matches&&motion());};setPin();
  pinQ.addEventListener?.('change',()=>{setPin();measure();});reduce.addEventListener?.('change',()=>{body.classList.toggle('st-motion',motion());setPin();measure();});

  /* reveal on entering view */
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target);}}),{rootMargin:'0px 0px -18% 0px',threshold:.05});
  $$('.st-path-node,.st-niche,.st-world,[data-reveal]').forEach(el=>io.observe(el));cleanups.push(()=>io.disconnect());

  /* practice layers per step */
  const steps=$$('.st-pr-step'),layers={4:$('.pr-metronome'),5:$('.pr-tuner'),6:$('.pr-record'),7:$('.pr-feedback')};let current=-1;
  function setStep(n,sub){if(!stage)return;if(n!==current){current=n;stage.dataset.step=String(n);steps.forEach((s,i)=>s.classList.toggle('is-active',i===n));Object.entries(layers).forEach(([k,el])=>el?.classList.toggle('on',Number(k)===n));if(n!==4&&metroOn)stopMetro();}
    if(n===5){const t=reduce.matches?1:sub;let tune,hz,needle;if(t<.34){tune='loose';hz='113.0';needle=22;}else if(t<.67){tune='tight';hz='107.0';needle=-26;}else{tune='ok';hz='110.0';needle=0;}stage.dataset.tune=tune;stage.style.setProperty('--tn',String(needle));const h=$('.pr-hz',stage);if(h)h.textContent=hz+' Hz';}}

  /* worlds */
  const worldsSec=$('#courses'),worlds=$$('.st-world'),worldLinks=$$('[data-world-link]');let activeWorld=-1;
  function setWorld(i){if(i===activeWorld)return;activeWorld=i;worlds.forEach((w,k)=>{w.classList.toggle('is-active',k===i);w.classList.toggle('is-past',k<i);});worldLinks.forEach((a,k)=>{a.classList.toggle('is-active',k===i);if(k===i)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current');});}
  const track=$('.st-worlds-track');
  function worldScrollTarget(i){const r=track.getBoundingClientRect(),top=scrollY+r.top,len=track.offsetHeight-innerHeight;return top+len*((i+.5)/worlds.length);}
  worldLinks.forEach((a,i)=>on(a,'click',e=>{if(!body.classList.contains('st-pin'))return;e.preventDefault();scrollTo({top:worldScrollTarget(i),behavior:reduce.matches?'auto':'smooth'});}));
  worlds.forEach((w,i)=>on(w,'focusin',()=>{if(body.classList.contains('st-pin')&&activeWorld!==i){scrollTo({top:worldScrollTarget(i),behavior:'auto'});setWorld(i);}}));

  /* dock + nav state */
  const dockLinks=$$('[data-dock]'),navLinks=$$('#st-nav a'),progressBar=$('.st-progress');
  const sectionIds=['courses','experience','portal','masters','discover','contact'];

  const entrance=$('#home'),finalSec=$('#contact'),pathSec=$('#progress');let ticking=false,vh=innerHeight;
  function frame(){ticking=false;const y=scrollY,max=doc.scrollHeight-vh;progressBar?.style.setProperty('--doc',String(max>0?Math.min(1,y/max):0));
    if(entrance&&body.classList.contains('st-motion')){const r=entrance.getBoundingClientRect();if(r.bottom>0)entrance.style.setProperty('--x',Math.min(1,Math.max(0,-r.top/r.height)).toFixed(4));}
    if(pathSec){const r=pathSec.getBoundingClientRect();if(r.top<vh&&r.bottom>0)pathSec.style.setProperty('--p',Math.min(1,Math.max(0,(vh*.7-r.top-120)/(r.height*.8))).toFixed(4));}
    if(finalSec){const r=finalSec.getBoundingClientRect();if(r.top<vh)finalSec.style.setProperty('--p',Math.min(1,Math.max(0,(vh-r.top)/vh)).toFixed(4));}
    /* worlds */
    if(body.classList.contains('st-pin')&&track){const r=track.getBoundingClientRect(),len=track.offsetHeight-vh,p=Math.min(.9999,Math.max(0,-r.top/len)),f=p*worlds.length,i=Math.floor(f);setWorld(i);worlds[i]?.style.setProperty('--wp',(f-i).toFixed(3));}
    else if(activeWorld!==-2){activeWorld=-2;worlds.forEach(w=>w.classList.remove('is-active','is-past'));}
    /* practice */
    if(steps.length){const line=vh*(innerWidth<1024?.72:.55);let n=0,sub=0;for(let i=0;i<steps.length;i++){const r=steps[i].getBoundingClientRect();if(r.top<=line){n=i;sub=Math.min(1,Math.max(0,(line-r.top)/Math.max(1,r.height)));}}setStep(n,sub);}
    /* active chapter */
    let active='';for(const id of sectionIds){const el=document.getElementById(id);if(el&&el.getBoundingClientRect().top<vh*.45)active=id;}
    navLinks.forEach(a=>{if(a.getAttribute('href')==='#'+active)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});
    dockLinks.forEach(a=>a.classList.toggle('is-active',a.dataset.dock===active||(a.dataset.dock==='masters'&&['instruments','discover'].includes(active))));}
  function request(){if(!ticking){ticking=true;requestAnimationFrame(frame);}}
  function measure(){vh=innerHeight;activeWorld=-1;request();}
  on(window,'scroll',request,{passive:true});on(window,'resize',measure,{passive:true});on(window,'orientationchange',()=>setTimeout(measure,250));
  if(window.visualViewport)on(visualViewport,'resize',()=>{if(Math.abs(innerHeight-vh)>120)measure();},{passive:true});
  /* Leaving the practice section stops the metronome demo. */
  const prSec=$('#experience');if(prSec){const po=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)stopAll();}),{threshold:0});po.observe(prSec);cleanups.push(()=>po.disconnect());}
  frame();
}catch(err){body.classList.remove('st-live','st-motion','st-pin');}

/* service worker (offline notice only; no authenticated responses are cached) */
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
addEventListener('pagehide',e=>{if(!e.persisted)cleanups.forEach(f=>{try{f();}catch{}});});
})();
