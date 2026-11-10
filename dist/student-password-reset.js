/* Recovery codes never establish a portal session; only a new permanent password can. */
async function issueStudentPasswordReset(id){
 if(!office)return;const s=db.students.find(s=>s.id===id);if(!s||s.archived_at){toast('پروندهٔ فعال هنرجو پیدا نشد');return}
 form('بازیابی رمز '+full(s),[field('reason','روش احراز هویت و دلیل بازنشانی')],async d=>{
  if(d.reason.trim().length<3)throw Error('روش احراز هویت را بنویسید');
  const result=await api('/rest/v1/rpc/issue_student_password_reset','POST',{student_id:s.id,reason:d.reason.trim()});
  setTimeout(()=>showStudentResetCode(s,result),0);
 });
 const help=document.createElement('p');help.className='class-form-help';help.textContent='ابتدا هویت هنرجو را با اطلاعات پرونده بررسی کنید. رمز موقت ۳۰ دقیقه اعتبار دارد و رمز موقت قبلی را باطل می‌کند.';$('fields').prepend(help);
 $('form').querySelector('[type=submit]').textContent='تأیید هویت و صدور رمز موقت';
}
function showStudentResetCode(s,result){
 form('رمز موقت آماده است',[],async()=>{});
 $('fields').innerHTML=`<section class="enrollment-summary"><h3>${esc(full(s))}</h3><p>این رمز فقط یک‌بار نمایش داده می‌شود؛ آن را به خود هنرجو تحویل دهید.</p><label>رمز موقت<input id="student-reset-code" value="${esc(result.temporary_code)}" readonly dir="ltr" autocomplete="off" style="font-size:22px;letter-spacing:2px;text-align:center"></label><button type="button" id="copy-student-reset">کپی رمز موقت</button><p>اعتبار تا ${new Date(result.expires_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',day:'numeric',month:'long'})}</p><p class="sub">هنرجو در ورود، گزینهٔ «ورود با رمز موقت» را می‌زند و یک رمز شخصی جدید می‌سازد. بعد از استفاده یا ۵ تلاش نادرست، این رمز غیرفعال می‌شود.</p></section>`;
 $('copy-student-reset').onclick=async()=>{try{await navigator.clipboard.writeText($('student-reset-code').value);toast('رمز موقت کپی شد')}catch{$('student-reset-code').select();toast('رمز را انتخاب و کپی کنید')}};
 $('form').querySelector('[type=submit]').textContent='بستن';$('form').onsubmit=e=>{e.preventDefault();modal.close()};
 modal.addEventListener('close',()=>{const el=$('student-reset-code');if(el)el.value=''}, {once:true});
}
function studentPasswordRecovery(nationalId=''){
 authScreen('ورود با رمز موقت',`<p class="auth-help">رمز موقت را پس از احراز هویت از مدیر یا منشی بگیرید. پیش از ورود باید رمز شخصی جدید بسازید.</p>${authInput('national_id','کد ملی','text','inputmode="numeric" autocomplete="username" maxlength="24"')}${authInput('temporary_code','رمز موقت دفتر','text','dir="ltr" autocomplete="off" maxlength="24" autocapitalize="characters"')}${authInput('password','رمز جدید؛ حداقل ۶ کاراکتر','password','minlength="6" maxlength="128" autocomplete="new-password"')}${authInput('confirmation','تکرار رمز جدید','password','minlength="6" maxlength="128" autocomplete="new-password"')}<button type="button" class="auth-back" onclick="login()">بازگشت به ورود</button>`,'ثبت رمز جدید و ورود',async d=>{
  if(d.password!==d.confirmation)throw Error('تکرار رمز یکسان نیست');
  const response=await fetch(SUPABASE_ENDPOINT+'/functions/v1/student-password-reset',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({national_id:academyNumbers(d.national_id),temporary_code:d.temporary_code,password:d.password})});
  const result=await response.json();if(!response.ok)throw Error(result.message||'بازیابی رمز انجام نشد');
  try{const session=await studentEndpoint('login',{national_id:academyNumbers(d.national_id),password:d.password});await completeLogin(session);toast('رمز جدید ثبت شد و وارد شدید')}catch{modal.close();login();toast('رمز جدید ثبت شد؛ اکنون با آن وارد شوید')}
 });$('form').elements.national_id.value=nationalId;
}
const detailBeforePasswordRecovery=studentDetail;
studentDetail=function(id){detailBeforePasswordRecovery(id);const s=db.students.find(s=>s.id===id);if(!office||!s||s.archived_at)return;const target=$('fields').querySelector('.learner-actions')||$('fields').querySelector('.enrollment-summary');if(!target)return;const button=document.createElement('button');button.type='button';button.textContent='بازیابی رمز هنرجو';button.onclick=()=>issueStudentPasswordReset(id);target.append(button)};
