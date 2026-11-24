/* Local microphone owner and reliable recording lifecycle. Audio is uploaded only by the existing explicit publish flows. */
(()=>{'use strict';
let lock=null;
function release(id){if(lock?.id!==id)return;const old=lock;lock=null;old.stream?.getTracks().forEach(t=>t.stop());}
async function acquire(id){if(lock)throw Error('ابتدا ضبط یا تیونرِ فعال را متوقف کنید.');const entry={id,stream:null};lock=entry;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('مرورگر به میکروفون دسترسی ندارد؛ سایت را در Safari یا Chrome باز کنید.');const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});if(lock!==entry){stream.getTracks().forEach(t=>t.stop());throw Error('درخواست میکروفون لغو شد.');}entry.stream=stream;return stream;}catch(e){release(id);throw e;}}
function recorder({valid=()=>true,onTick=()=>{},onComplete=()=>{},onError=()=>{},onState=()=>{}}={}){
 const id='record-'+crypto.randomUUID();let media=null,stream=null,chunks=[],timer=null,finishTimer=null,start=0,stopping=false,cancelled=false,settled=false,problem=null,elapsed=0;
 const clean=()=>{clearInterval(timer);clearTimeout(finishTimer);release(id);};
 const fail=e=>{if(settled)return;settled=true;clean();onState('idle');if(!cancelled)onError(e);};
 const stop=()=>{if(stopping||settled)return;stopping=true;elapsed=start?Math.max(.01,Math.min(180,(performance.now()-start)/1000)):0;onState('finishing');clearInterval(timer);if(!media){cancelled=true;clean();return;}if(media.state!=='inactive'){try{media.stop();}catch(e){fail(e);return;}}finishTimer=setTimeout(()=>fail(Error('پایان ضبط از مرورگر دریافت نشد؛ دوباره ضبط کنید یا فایل آماده بفرستید.')),10000);};
 const cancel=()=>{cancelled=true;if(!media){settled=true;clean();return;}stop();};
 async function begin(){onState('requesting');try{if(!window.MediaRecorder)throw Error('ضبط در این مرورگر پشتیبانی نمی‌شود؛ فایل آماده انتخاب کنید.');stream=await acquire(id);if(cancelled||!valid()){cancel();return;}const types=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('فرمت ضبط سازگار پیدا نشد؛ MP3 یا M4A آماده انتخاب کنید.');media=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:128000});media.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};media.onerror=e=>{problem=e.error||Error('ضبط توسط مرورگر متوقف شد.');};media.onstop=()=>{if(settled)return;settled=true;const seconds=elapsed||Math.min(180,(performance.now()-start)/1000),type=String(media.mimeType||mime).split(';')[0],ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm',file=new File(chunks,'practice.'+ext,{type});clean();onState('idle');if(cancelled||!valid())return;if(file.size<64||seconds<.15){onError(Error('صدای کافی ثبت نشد؛ کمی طولانی‌تر ضبط کنید.'));return;}if(file.size>12582912){onError(Error('حجم ضبط بیش از ۱۲ مگابایت است؛ نمونهٔ کوتاه‌تری ضبط کنید.'));return;}onComplete({file,duration:Math.max(.01,Math.round(seconds*100)/100),interrupted:!!problem});};
 // One finalized container is more reliable than concatenating fragmented MP4 chunks on mobile Safari.
 media.start();start=performance.now();onState('recording');onTick(0);timer=setInterval(()=>{const n=Math.floor((performance.now()-start)/1000);onTick(Math.min(180,n));if(n>=180)stop();},250);
 }catch(e){fail(Error(e.name==='NotAllowedError'?'اجازهٔ میکروفون داده نشد؛ از تنظیمات مرورگر اجازه بدهید یا فایل آماده انتخاب کنید.':e.message||'ضبط شروع نشد.'));}}
 return {start:begin,stop,cancel,get state(){return settled?'idle':stopping?'finishing':media?.state||'requesting';}};
}
window.AcademyAudio={acquire,release,recorder,get busy(){return !!lock;}};
})();
