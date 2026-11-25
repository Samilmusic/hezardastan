/* Schedule page: teaching days by subject and teacher (no times, students or bookings). */
(()=>{'use strict';
const doc=document.documentElement,body=document.body,$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)'),faDigits=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const normalize=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s‌‏/،,-]/g,'').toLowerCase();
const cleanups=[];const on=(t,e,f,o)=>{t.addEventListener(e,f,o);cleanups.push(()=>t.removeEventListener(e,f,o));};

/* ---------------------------------------------------------- weekly schedule
   Source: the public registration endpoint (teachers + subject_days), the same data the online registration uses.
   Fallback: the academy's published weekly poster. Only teaching days are shown; no times, students or bookings. */
(()=>{const root=$('#week');if(!root)return;const dayBar=$('.wk-days',root),panel=$('#wk-panel'),status=$('#wk-status'),search=$('#wk-search'),who=$('#wk-teacher');
  const ENDPOINT='https://azastzjxnzjaloxmnbfd.supabase.co/functions/v1/student-enrollment',KEY='sb_publishable_BPYP79Lh70nWiwxExhRBvw_dRgVsed7';
  // weekday index as used by the server: 0 = یکشنبه … 6 = شنبه
  const NAMES=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'],ORDER=[6,0,1,2,3,4];
  const POSTER=[[6,['هنگ درام','داربوکا','جیمبی','دف','ارف','ویولن','نقاشی','عکاسی و فیلم‌برداری']],[0,['دف','کاخن','کالیمبا','موسیقی کودک','سازشناسی کودکان']],[1,['گیتار فلامنکو','ویولن','ترومپت','آهنگسازی','تنظیم','صدابرداری','فن بیان','نقاشی','دف','دی جی']],[2,['گیتار','سلفژ','آواز','کلارینت','ترومپت','نی','ویولن','تئوری موسیقی']],[3,['تنبک','پیانو','درام','ملودیکا','کیبورد','ویولن','ترومپت','نقاشی']],[4,['سنتور','تار','سه‌تار','عود','دف','تنبک','ویولن','موسیقی کودک']]];
  const PAGES={'گیتار فلامنکو':'flamenco-guitar','گیتار':'guitar','ویولن':'violin','نی':'ney','کلارینت':'clarinet','ترومپت':'trumpet','پیانو':'piano','کیبورد':'keyboard','ملودیکا':'melodica','دف':'daf','هنگ درام':'handpan','جیمبی':'djembe','داربوکا':'darbuka','تنبک':'tombak','کاخن':'cajon','سنتور':'santoor','عود':'oud','تار':'tar','سه‌تار':'setar','درام':'drums','کالیمبا':'kalimba'};
  const key=s=>normalize(s);const words=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200f\s]+/g,' ').trim().split(' ').filter(w=>w&&w!=='و');const same=(a,b)=>{const A=words(a),B=words(b);return key(a)===key(b)||A.length>0&&A.every(w=>B.includes(w))||B.length>0&&B.every(w=>A.includes(w))&&B.length>1;};const pageFor=s=>{const k=key(s);const hit=Object.keys(PAGES).find(n=>key(n)===k);return hit?PAGES[hit]:null;};
  let TD=[];try{TD=JSON.parse($('#teacher-data').textContent);}catch{}const faces={};TD.forEach(t=>{faces[t.name]=t.photo;});
  // static teacher ↔ subject list from the published teacher cards (fallback only)
  const staticTeachers=TD.map(t=>({name:t.name,subjects:t.subjects}));
  let rows=[],source='',day=null,loaded=false;
  function fromPoster(){const out=[];for(const [d,subs] of POSTER)for(const sub of subs){const teachers=staticTeachers.filter(t=>t.subjects.some(x=>same(sub,x))).map(t=>t.name);out.push({day:d,subject:sub,teachers});}return out;}
  function fromLive(list){const map=new Map();for(const t of list){if(!t||typeof t.name!=='string')continue;for(const sub of (Array.isArray(t.subjects)?t.subjects:[])){for(const d of (t.subject_days?.[sub]||[])){if(!Number.isInteger(d)||d<0||d>6)continue;const k=d+'|'+key(sub);if(!map.has(k))map.set(k,{day:d,subject:String(sub).slice(0,60),teachers:[]});const r=map.get(k);if(!r.teachers.includes(t.name))r.teachers.push(String(t.name).slice(0,40));}}}
    // keep poster subjects that no teacher record covers, so the published day list stays complete
    for(const p of fromPoster()){const k=p.day+'|'+key(p.subject);if(![...map.values()].some(r=>r.day===p.day&&same(p.subject,r.subject)))map.set(k,{...p,teachers:[]});}
    return [...map.values()];}
  const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
  function tabs(){dayBar.replaceChildren();const opts=[['all','همهٔ روزها'],...ORDER.map(d=>[String(d),NAMES[d]])];opts.forEach(([v,label])=>{const b=el('button','',label);b.type='button';b.setAttribute('role','tab');b.id='wk-tab-'+v;b.dataset.day=v;b.setAttribute('aria-controls','wk-panel');const n=v==='all'?rows.length:rows.filter(r=>String(r.day)===v).length;b.append(el('small','',faDigits(n)));dayBar.append(b);});
    $$('button',dayBar).forEach((b,i,all)=>{on(b,'click',()=>select(b.dataset.day));on(b,'keydown',e=>{const k={ArrowLeft:1,ArrowRight:-1}[e.key];let j=null;if(k)j=(i+k+all.length)%all.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=all.length-1;if(j!=null){e.preventDefault();select(all[j].dataset.day);all[j].focus();}});});}
  function select(v){day=v;$$('button',dayBar).forEach(b=>{const on_=b.dataset.day===v;b.setAttribute('aria-selected',String(on_));b.tabIndex=on_?0:-1;});panel.setAttribute('aria-labelledby','wk-tab-'+v);draw();}
  function draw(){if(!loaded)return;const q=key(search.value);const w=who?who.value:'';const list=rows.filter(r=>(day==='all'||String(r.day)===day)&&(!w||r.teachers.includes(w))&&(!q||key(r.subject).includes(q)||r.teachers.some(t=>key(t).includes(q))));
    panel.replaceChildren();if(!list.length){const e=el('div','wk-empty');e.append(el('b','',q?'موردی با این نام پیدا نشد.':'برای این روز کلاسی منتشر نشده است.'),el('p','',q?'نام ساز یا استاد را کوتاه‌تر بنویس یا «همهٔ روزها» را انتخاب کن.':'روز دیگری را انتخاب کن یا با دفتر تماس بگیر.'));panel.append(e);status.textContent=(q||w)?'نتیجه‌ای پیدا نشد':'';const rb=el('button','st-btn st-btn--secondary','پاک کردن فیلترها');rb.type='button';on(rb,'click',()=>{search.value='';if(who)who.value='';select('all');});if(q||w||day!=='all')e.append(rb);return;}
    const groups=day==='all'?ORDER.map(d=>[d,list.filter(r=>r.day===d)]).filter(g=>g[1].length):[[Number(day),list]];
    for(const [d,items] of groups){const sec=el('section','wk-group');if(day==='all')sec.append(el('h3','wk-day-title',NAMES[d]));const ul=el('ul','wk-rows');items.sort((a,b)=>a.subject.localeCompare(b.subject,'fa'));
      for(const r of items){const li=el('li','wk-row');const s=el('div','wk-subject');const page=pageFor(r.subject);if(page){const a=el('a','',r.subject);a.href='instruments/'+page+'.html';s.append(a);}else s.append(el('span','',r.subject));li.append(s);
        const t=el('div','wk-teachers');if(r.teachers.length){for(const n of r.teachers){const p=el('span','wk-person');if(faces[n]){const im=el('img');im.src=faces[n];im.alt='';im.loading='lazy';im.width=32;im.height=32;p.append(im);}p.append(el('span','','استاد '+n));t.append(p);}}else t.append(el('span','wk-ask','استاد: از دفتر بپرس'));li.append(t);
        li.append(el('div','wk-when',NAMES[r.day]+' · ساعت با هماهنگی'));ul.append(li);}
      sec.append(ul);panel.append(sec);}
    status.textContent=faDigits(list.length)+' کلاس'+(q?' برای «'+search.value.trim().slice(0,40)+'»':'')+(w?' · استاد '+w:'')+(source==='poster'?' · برنامهٔ منتشرشده':'');}
  async function load(){status.textContent='در حال دریافت برنامه…';panel.setAttribute('aria-busy','true');panel.replaceChildren(el('div','wk-loading','در حال دریافت برنامهٔ روزها…'));
    try{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),9000);const r=await fetch(ENDPOINT,{method:'POST',signal:ctl.signal,headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'teachers'})});clearTimeout(tm);if(!r.ok)throw Error('status');const data=await r.json();if(!Array.isArray(data)||!data.length)throw Error('empty');rows=fromLive(data);source='live';}
    catch{rows=fromPoster();source='poster';}
    loaded=true;panel.setAttribute('aria-busy','false');if(who){const names=[...new Set(rows.flatMap(r=>r.teachers))].sort((a,b)=>a.localeCompare(b,'fa'));for(const n of names){const o=document.createElement('option');o.value=n;o.textContent='استاد '+n;who.append(o);}}tabs();const today=new Date().getDay();select(ORDER.includes(today)?String(today):'all');
    if(source==='poster'){const n=el('p','wk-fallback','فهرست زندهٔ استادها در دسترس نبود؛ برنامهٔ منتشرشدهٔ آموزشگاه نمایش داده شد. برای اطمینان با دفتر تماس بگیر.');panel.before(n);}}
  on(search,'input',draw);if(who)on(who,'change',draw);
  load();
})();

})();
