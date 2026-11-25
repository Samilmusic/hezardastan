/* Learning page: the opt-in practice-room demonstration and its scroll choreography.
   Sound only after an explicit action; the page is complete without this file. */
(()=>{'use strict';
const doc=document.documentElement,body=document.body,$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)'),faDigits=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const normalize=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s‌‏/،,-]/g,'').toLowerCase();
const cleanups=[];const on=(t,e,f,o)=>{t.addEventListener(e,f,o);cleanups.push(()=>t.removeEventListener(e,f,o));};

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
  $$('.st-path-node,.st-niche,.st-world,.st-section-head,.st-hava').forEach(el=>io.observe(el));cleanups.push(()=>io.disconnect());

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
  const sectionIds=[];

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
    dockLinks.forEach(a=>a.classList.toggle('is-active',a.dataset.dock===active||(a.dataset.dock==='masters'&&['instruments','week'].includes(active))));}
  function request(){if(!ticking){ticking=true;requestAnimationFrame(frame);}}
  function measure(){vh=innerHeight;activeWorld=-1;request();}
  on(window,'scroll',request,{passive:true});on(window,'resize',measure,{passive:true});on(window,'orientationchange',()=>setTimeout(measure,250));
  if(window.visualViewport)on(visualViewport,'resize',()=>{if(Math.abs(innerHeight-vh)>120)measure();},{passive:true});
  /* Leaving the practice section stops the metronome demo. */
  const prSec=$('#practice');if(prSec){const po=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)stopAll();}),{threshold:0});po.observe(prSec);cleanups.push(()=>po.disconnect());}
  frame();
}catch(err){body.classList.remove('st-live','st-motion','st-pin');}

addEventListener('pagehide',e=>{if(!e.persisted)cleanups.forEach(f=>{try{f();}catch{}});});
})();
