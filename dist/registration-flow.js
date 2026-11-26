/* Public enrollment handoff. Existing server workflow remains authoritative. */
(()=>{'use strict';
const base=registration;
registration=async function(){
 await base();const list=document.getElementById('registration-course-list'),fields=document.getElementById('fields'),f=document.getElementById('form');
 if(!list||f.querySelector('.enroll-flow'))return;
 const heading=document.createElement('section');heading.className='enroll-flow';heading.innerHTML='<div class="enroll-steps"><b data-step="1">۱ · انتخاب کلاس</b><b data-step="2">۲ · مشخصات و درخواست</b></div><p>کلاس و زمان را انتخاب کن؛ پس از تأیید مدیر، پرداخت شهریه در پرتال فعال می‌شود.</p>';
 const course=document.createElement('section');course.className='enroll-course-step';course.setAttribute('aria-label','انتخاب کلاس و استاد');
 const personal=document.createElement('section');personal.className='enroll-personal-step';personal.setAttribute('aria-label','مشخصات هنرجو');
 const add=[...list.parentElement.children].find(e=>e.tagName==='BUTTON'&&e.textContent.includes('افزودن کلاس'));
 const summary=document.getElementById('registration-class-summary');
 for(const child of [...fields.children]){if(child===list||child===add||child===summary)course.append(child);else personal.append(child);}
 fields.append(heading,course,personal);
 const next=document.createElement('button');next.type='button';next.className='primary enroll-next';next.textContent='ادامه · مشخصات هنرجو';course.append(next);
 const back=document.createElement('button');back.type='button';back.className='enroll-back';back.textContent='بازگشت به انتخاب کلاس';personal.prepend(back);
 const submit=f.querySelector('button[type=submit]');let stage=1;
 const show=n=>{stage=n;course.hidden=n!==1;personal.hidden=n!==2;submit.hidden=n!==2;heading.querySelectorAll('[data-step]').forEach(e=>e.setAttribute('aria-current',Number(e.dataset.step)===n?'step':'false'));document.getElementById('error').textContent='';modal.scrollTop=0;f.scrollTop=0;(n===1?list.querySelector('select'):personal.querySelector('input:not([type=hidden])'))?.focus();};
 const ready=()=>[...list.querySelectorAll('fieldset')].every(box=>[...box.querySelectorAll('select')].every(s=>s.value!==''&&!s.selectedOptions[0]?.disabled));
 next.onclick=()=>{if(!ready()){document.getElementById('error').textContent='برای هر کلاس، استاد، رشته، روز و ساعت آزاد را انتخاب کن.';return}show(2)};
 back.onclick=()=>show(1);
 f.addEventListener('submit',e=>{if(stage!==2||!ready()){e.preventDefault();e.stopImmediatePropagation();show(1);document.getElementById('error').textContent='ابتدا کلاس و ساعت آزاد را انتخاب کن.';}},true);
 // Only public course names/IDs travel in the URL, never identity or passwords.
 const params=new URLSearchParams(location.search),normalize=v=>String(v||'').replace(/[\s\u200c]/g,'').replace(/ي/g,'ی').replace(/ك/g,'ک');
 const requested=params.get('subject'),teacher=params.get('teacher');
 if(requested||teacher){const box=list.querySelector('fieldset'),t=box?.querySelector('[name=teacher_id]'),s=box?.querySelector('[name=subject]');
 const match=registrationTeachers.find(x=>(!teacher||x.id===teacher)&&(!requested||x.subjects.some(v=>normalize(v)===normalize(requested))));
 if(match&&t&&s){t.value=match.id;t.dispatchEvent(new Event('change',{bubbles:true}));const value=match.subjects.find(v=>normalize(v)===normalize(requested));if(value){s.value=value;s.dispatchEvent(new Event('change',{bubbles:true}));}}
 }
 show(1);
};
window.addEventListener('hashchange',()=>{if(location.hash==='#register')registration()});
if(location.hash==='#register')registration();
})();
