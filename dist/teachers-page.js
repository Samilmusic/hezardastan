/* Teachers page: group filter and search over the published teacher list. */
(()=>{'use strict';const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const faDigits=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const normalize=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s‌‏/،,-]/g,'').toLowerCase();
const cards=$$('.st-teacher'),buttons=$$('[data-group]'),input=$('#master-search'),out=$('#teacher-results'),empty=$('#teacher-empty');if(!cards.length||!input)return;let group='all';
function apply(){const q=normalize(input.value);let n=0;cards.forEach(c=>{const show=(group==='all'||c.dataset.groups.split(' ').includes(group))&&normalize(c.dataset.search).includes(q);c.hidden=!show;if(show)n++;});out.textContent=faDigits(n)+' استاد';empty.hidden=n!==0;}
buttons.forEach(b=>b.addEventListener('click',()=>{group=b.dataset.group;buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));apply();}));
input.addEventListener('input',apply);
$('[data-reset]')?.addEventListener('click',()=>{input.value='';group='all';buttons.forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.group==='all')));apply();input.focus();});
/* a link to #t-key highlights that teacher */
const mark=()=>{const t=location.hash&&document.getElementById(location.hash.slice(1));if(t&&t.classList.contains('st-teacher')){cards.forEach(c=>c.classList.toggle('is-target',c===t));}};
addEventListener('hashchange',mark);apply();mark();})();
