/* Courses page: instrument library family filter and search. */
(()=>{'use strict';const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const faDigits=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const normalize=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s‌‏/،,-]/g,'').toLowerCase();
const root=$('#instruments');if(!root)return;const cards=$$('.st-inst',root),buttons=$$('button[data-family]',root),input=$('#instrument-search'),out=$('#instrument-results'),empty=$('#instrument-empty');let family='all';
function apply(){const q=normalize(input.value);let n=0;cards.forEach(c=>{const m=(family==='all'||c.dataset.family===family)&&normalize(c.dataset.name).includes(q);c.hidden=!m;if(m)n++;});
  out.textContent=faDigits(n)+' ساز'+(family!=='all'?' · '+family:'');empty.hidden=n!==0;}
buttons.forEach(b=>b.addEventListener('click',()=>{family=b.dataset.family;buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));apply();}));
input.addEventListener('input',apply);apply();})();
