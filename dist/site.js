/* Shared public-site behaviour: navigation, the HezarAva discovery dialog (loaded on first use),
   service worker. Presentation only: never reads a session, student record or financial API. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const body=document.body,reduce=matchMedia('(prefers-reduced-motion: reduce)');

/* ---------------------------------------------------------- mobile menu sheet */
const menu=$('.sx-menu'),sheet=$('#sx-sheet'),header=$('.sx-header');
function setSheet(open,focusBack){if(!menu||!sheet)return;menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'بستن فهرست':'باز کردن فهرست');
  sheet.hidden=!open;body.classList.toggle('sx-sheet-open',open);if(open)(sheet.querySelector('[aria-current]')||sheet.querySelector('a,button'))?.focus({preventScroll:true});else if(focusBack)menu.focus();}
menu?.addEventListener('click',()=>setSheet(menu.getAttribute('aria-expanded')!=='true'));
sheet?.addEventListener('click',e=>{if(e.target===sheet)setSheet(false,true);else if(e.target.closest('a,.discover-trigger'))setSheet(false);});
matchMedia('(min-width: 1024px)').addEventListener?.('change',e=>{if(e.matches)setSheet(false);});

/* ---------------------------------------------------------- tools dropdown (desktop) */
const moreBtn=$('.sx-more-btn'),drop=$('#sx-tools');
function setDrop(open,focusBack){if(!moreBtn||!drop)return;moreBtn.setAttribute('aria-expanded',String(open));drop.hidden=!open;if(!open&&focusBack)moreBtn.focus();}
moreBtn?.addEventListener('click',()=>{const open=moreBtn.getAttribute('aria-expanded')!=='true';setDrop(open);if(open)drop.querySelector('a,button')?.focus();});
drop?.addEventListener('keydown',e=>{const items=$$('a,button',drop),i=items.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const j=(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[j].focus();}});
drop?.addEventListener('click',e=>{if(e.target.closest('a,button'))setDrop(false);});
document.addEventListener('click',e=>{if(moreBtn&&!e.target.closest('.sx-more'))setDrop(false);});
document.addEventListener('focusin',e=>{if(drop&&!drop.hidden&&!e.target.closest('.sx-more'))setDrop(false);});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(menu?.getAttribute('aria-expanded')==='true')setSheet(false,true);if(moreBtn?.getAttribute('aria-expanded')==='true')setDrop(false,true);});

/* header shadow once the page has scrolled */
let ticking=false;const onScroll=()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{ticking=false;header?.classList.toggle('is-scrolled',scrollY>8);});};
addEventListener('scroll',onScroll,{passive:true});onScroll();

/* ---------------------------------------------------------- HezarAva: loaded only when someone asks for it */
const V='20261126p';let havaP=null,havaReady=false;
const css=href=>new Promise(res=>{const l=document.createElement('link');l.rel='stylesheet';l.href=href;l.onload=l.onerror=()=>res();document.head.append(l);});
const js=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=()=>res();s.onerror=()=>rej(new Error(src));document.body.append(s);});
function loadHava(){return havaP||(havaP=Promise.all([css('hezarava-guide.css?v='+V),css('hezarava-assistant.css?v='+V)])
  .then(()=>js('guide-audio.js?v='+V)).then(()=>js('guide.js?v='+V)).then(()=>js('hezarava-assistant.js?v='+V)).then(()=>{havaReady=true;})
  .catch(err=>{havaP=null;throw err;}));}
function busy(el,on){el.toggleAttribute('aria-busy',on);el.classList.toggle('is-loading',on);}
document.addEventListener('click',e=>{const t=e.target.closest('.discover-trigger,[data-open-assistant]');if(!t)return;
  if(havaReady){if(t.matches('[data-open-assistant]')){e.preventDefault();$('.ha-launcher')?.click();}return;}
  e.preventDefault();e.stopImmediatePropagation();busy(t,true);
  loadHava().then(()=>{busy(t,false);if(t.matches('[data-open-assistant]'))$('.ha-launcher')?.click();else t.click();})
    .catch(()=>{busy(t,false);location.href='contact.html';});},true);
const warm=e=>{if(e.target.closest?.('.discover-trigger'))loadHava().catch(()=>{});};
document.addEventListener('pointerover',warm,{passive:true});document.addEventListener('focusin',warm);

/* teacher portraits inside HezarAva recommendations */
(()=>{const box=$('#guide-content'),data=$('#teacher-data');if(!box||!data||!('MutationObserver'in window))return;let map={};try{JSON.parse(data.textContent).forEach(t=>{map[t.name]=t.photo;});}catch{return;}
  const names=Object.keys(map).sort((a,b)=>b.length-a.length);
  new MutationObserver(()=>{$$('.rec-teachers strong:not([data-faces])',box).forEach(s=>{s.dataset.faces='1';const parts=s.textContent.split('·').map(x=>x.trim()).filter(Boolean);s.textContent='';
    parts.forEach(p=>{const n=p.replace(/^استاد\s+/,'').trim(),key=names.find(k=>n===k);const w=document.createElement('span');w.className='teacher-person';
      if(key){const im=document.createElement('img');im.className='teacher-avatar';im.src=map[key];im.alt='';im.loading='lazy';w.append(im);}w.append(document.createTextNode(p));s.append(w);});});}).observe(box,{childList:true,subtree:true});})();

/* ---------------------------------------------------------- HezarAva bird on the homepage: one arrival flight, then a quiet idle */
(()=>{const sec=$('#discover'),bird=$('.hv-bird');if(!sec||!bird)return;let seen=false;try{seen=sessionStorage.getItem('hv-landed')==='1';}catch{}
  if(reduce.matches||seen||!('IntersectionObserver'in window)){bird.classList.add('is-perched');return;}
  bird.classList.add('is-waiting');
  const io=new IntersectionObserver(es=>{if(!es.some(e=>e.isIntersecting))return;io.disconnect();bird.classList.remove('is-waiting');bird.classList.add('is-arriving');
    const done=()=>{bird.classList.remove('is-arriving');bird.classList.add('is-perched');try{sessionStorage.setItem('hv-landed','1');}catch{}};
    bird.addEventListener('animationend',e=>{if(e.animationName==='hv-fly')done();});setTimeout(()=>{if(!bird.classList.contains('is-perched'))done();},3200);},{threshold:.35});
  io.observe(sec);})();

/* service worker (offline notice only; no authenticated responses are cached) */
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();
