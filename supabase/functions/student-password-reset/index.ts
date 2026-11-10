import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const normalize=(s:unknown)=>String(s??'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[\s\u200c\u200e\u200f]/g,'');
const origins=['https://avayehezardastan.com','https://www.avayehezardastan.com','https://avaye-hezardastan.sajjadalirezaie7.chatgpt.site'];
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'apikey,content-type,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return respond({message:'درخواست نامعتبر'},405);
 try{
  const raw=await req.text();if(raw.length>3000)return respond({message:'درخواست بیش از حد بزرگ است'},413);
  const body=JSON.parse(raw),nationalId=normalize(body.national_id),code=normalize(body.temporary_code).replace(/-/g,'').toUpperCase(),password=body.password;
  if(!/^\d{10}$/.test(nationalId)||!/^[A-F0-9]{16}$/.test(code))return respond({message:'کد ملی و رمز موقت ۱۶ کاراکتری را کامل وارد کنید'},400);
  if(typeof password!=='string'||password.length<6||password.length>128||password.toUpperCase()===code)return respond({message:'یک رمز جدید با حداقل ۶ کاراکتر، متفاوت از رمز موقت، انتخاب کنید'},400);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  for(const bucket of ['student-reset-ip:'+await digest(ip),'student-reset-id:'+await digest(nationalId)]){
   const {data,error}=await db.rpc('enrollment_rate_limit',{bucket_key:bucket});
   if(error||!data)return respond({message:'تعداد تلاش‌ها زیاد است؛ بعداً تلاش کنید یا با دفتر تماس بگیرید'},429);
  }
  const {data:reset,error}=await db.rpc('consume_student_password_reset',{national_id_input:nationalId,temporary_code:code});
  if(error||!reset?.valid)return respond({message:'رمز موقت نادرست، استفاده‌شده یا منقضی است؛ در صورت نیاز از دفتر رمز جدید بگیرید'},400);
  const {error:updateError}=await db.auth.admin.updateUserById(reset.user_id,{password});
  if(updateError)return respond({message:'ثبت رمز جدید انجام نشد و رمز موقت مصرف شد؛ از دفتر رمز موقت جدید بگیرید'},503);
  const {error:logError}=await db.from('academy_activity').insert({actor:reset.user_id,action:'password_reset_completed',entity_id:reset.student_id,details:{}});
  if(logError)console.error('password_reset_audit_failed');
  return respond({changed:true});
 }catch{return respond({message:'بازیابی انجام نشد؛ اطلاعات را بررسی و دوباره تلاش کنید'},400)}
});
