/* Supabase owns persistence, token rotation and cross-tab session events. */
const portalAuth=AcademyAuth.createPortalAuth(SUPABASE_ENDPOINT,KEY);
window.portalSessionReady=true;
let portalRefreshTask=null,portalRestoreTask=null,portalLastRefresh=0;
function clearPortalAccount(){
 token=null;uid=null;admin=false;office=false;role='guest';currentTeacherId=null;page='login';
 for(const key of Object.keys(db))db[key]=[];
 enrollmentRows=[];monthRows=[];receiptRows=[];monthCalendar=[];activityRows=[];bankAccount=null;learnerProfiles=[];learnerListMode='active';
 $('loginbtn').textContent='ورود به حساب';$('loginbtn').onclick=login;
 $('notice').textContent='برای مشاهدهٔ اطلاعات، وارد حساب خود شوید.';
 $('portal-refresh').hidden=true;$('portal-refresh-status').textContent='';
 if(modal.open)modal.close();render();
}
async function portalSignOut(){
 const result=await portalAuth.signOut({scope:'local'});
 if(result.error){toast('خروج انجام نشد؛ ارتباط اینترنت را بررسی کنید.');return;}
 try{sessionStorage.removeItem('academy-page')}catch{}clearPortalAccount();
}
const portalReloadData=reload;
reload=function(){
 if(portalRefreshTask)return portalRefreshTask;
 const account=uid;
 $('portal-refresh').disabled=true;$('portal-refresh').textContent='در حال دریافت…';
 portalRefreshTask=(async()=>{await portalReloadData();if(uid!==account)return;portalLastRefresh=Date.now();$('portal-refresh-status').textContent='به‌روز شد · '+new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});})().finally(()=>{portalRefreshTask=null;$('portal-refresh').disabled=false;$('portal-refresh').textContent='↻ به‌روزرسانی';$('portal-refresh').hidden=!token;});
 return portalRefreshTask;
};
async function portalRestore(){
 if(portalRestoreTask)return portalRestoreTask;
 portalRestoreTask=(async()=>{
  try{
   const saved=await portalAuth.getSession();if(saved.error)throw saved.error;
   if(!saved.data.session)return;
   const verified=await portalAuth.getUser();if(verified.error)throw verified.error;
   await completeLogin({...saved.data.session,user:verified.data.user},{restoring:true});
   $('portal-refresh').hidden=false;
  }catch(e){
   if(e.status===401||e.status===403||e.name==='AuthSessionMissingError'){
    await portalAuth.signOut({scope:'local'});clearPortalAccount();toast('نشست ورود پایان یافته؛ دوباره وارد شوید.');
   }else{
    $('notice').textContent='بازیابی حساب به اینترنت نیاز دارد؛ به‌روزرسانی را بزنید.';
    $('portal-refresh').hidden=false;toast('ارتباط برقرار نشد؛ ورود ذخیره‌شده پاک نشده است.');
   }
  }
 })().finally(()=>{portalRestoreTask=null;});return portalRestoreTask;
}
$('portal-refresh').onclick=async()=>{try{if(role==='guest')await portalRestore();else{await reload();toast('اطلاعات پرتال به‌روز شد');}}catch(e){toast('دریافت اطلاعات ناموفق بود؛ دوباره به‌روزرسانی کنید.');}};
portalAuth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_OUT'){clearPortalAccount();return;}
 if(session){
  if(uid&&uid!==session.user.id){clearPortalAccount();setTimeout(()=>portalRestore(),0);return;}
  token=session.access_token;
 }
});
function portalAutoRefresh(){if(token&&role!=='guest'&&!document.hidden&&!modal.open&&Date.now()-portalLastRefresh>25000)reload().catch(()=>{$('portal-refresh-status').textContent='ارتباط قطع است؛ دوباره تلاش می‌کنیم';});}
setInterval(portalAutoRefresh,30000);
window.addEventListener('focus',portalAutoRefresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)portalAutoRefresh();});
portalRestore();
