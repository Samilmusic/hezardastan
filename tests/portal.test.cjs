const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const {JSDOM}=require('../auth/browser/node_modules/jsdom');
const root=path.join(__dirname,'../dist');
function portal({saved=true,staff=true,offline=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'portal.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://academy.test/portal',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.setInterval=()=>0;w.setTimeout=()=>0;w.requestAnimationFrame=()=>0;w.MutationObserver=class{observe(){}disconnect(){}};
 const uid='11111111-1111-4111-8111-111111111111';
 let session=saved?{access_token:'test-token',refresh_token:'test-refresh',user:{id:uid,email:'staff@example.test'}}:null;
 let listener;const calls=[];
 const auth={async getSession(){return {data:{session},error:null}},async getUser(){if(offline)throw Error('offline');return {data:{user:session.user},error:null}},async setSession(){session={access_token:'test-token',user:{id:uid,email:'staff@example.test'}};return {data:{session},error:null}},async signOut(){session=null;listener?.('SIGNED_OUT',null);return {error:null}},onAuthStateChange(cb){listener=cb;return {data:{subscription:{unsubscribe(){}}}}}};
 w.AcademyAuth={createPortalAuth:()=>auth};
 const rows={academy_staff:staff?[{role:'admin',teacher_id:null}]:[],teachers:[{id:'teacher',name:'استاد تست',subjects:['پیانو']}],students:[{id:'student',user_id:uid,first_name:'هنرجو',last_name:'آزمایشی',teacher_id:'teacher',weekday:1,opening_credit:0,opening_debt:0}],academy_months:[{key:'1405/08',starts_on:'2026-10-23',ends_on:'2026-11-21'}],enrollment_requests:[{id:'request',user_id:'other',national_id:'0000000000',status:'pending',details:{first_name:'هنرجو',last_name:'آزمایشی',father_name:'تست',mobile:'09000000000',birth_date:'2000-01-01',teacher_id:'teacher',subject:'پیانو',weekday:1,class_time:'17:00',address:'نشانی آزمایشی',home_phone:'-'}}]};
 w.fetch=async(url,opts={})=>{if(offline)throw Error('offline');calls.push({url,opts});const table=url.split('/rest/v1/')[1]?.split('?')[0];return {ok:true,status:200,json:async()=>table?.startsWith('rpc/')?{}:(rows[table]||[])}};
 for(const f of ['persian-dates.js','app.js','tuition.js','teachers.js','enrollment.js','portal-session.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f}).runInContext(dom.getInternalVMContext());
 return {dom,w,run:s=>vm.runInContext(s,dom.getInternalVMContext()),rows,calls,auth};
}
test('reload restores session, rechecks role, keeps page and manual refresh fetches new registrations',async()=>{
 const p=portal();await p.run('portalRestoreTask');assert.equal(p.run('role'),'admin');assert.match(p.w.document.querySelector('#notice').textContent,/مدیر/);
 p.run("go('monthly')");assert.match(p.w.document.querySelector('#content').textContent,/شهریهٔ ماهانه/);assert.equal(p.w.document.querySelectorAll('.tuition-month').length,0);
 p.rows.enrollment_requests.push({...p.rows.enrollment_requests[0],id:'new'});await p.w.document.querySelector('#portal-refresh').onclick();assert.equal(p.run('enrollmentRows.length'),2);assert.equal(p.run('page'),'monthly');
 p.run("go('enrollments')");await p.run('portalRestore()');assert.equal(p.run('page'),'enrollments');assert.ok(p.calls.some(c=>c.url.includes('academy_staff?')));
 await p.run('portalSignOut()');assert.equal(p.run('role'),'guest');assert.equal(p.run('enrollmentRows.length'),0);assert.equal((await p.auth.getSession()).data.session,null);p.dom.window.close();
});
test('network loss preserves saved login for retry; an unassigned staff email is rejected',async()=>{
 const p=portal({offline:true});await p.run('portalRestoreTask');assert.ok((await p.auth.getSession()).data.session);assert.match(p.w.document.querySelector('#notice').textContent,/اینترنت/);p.dom.window.close();
 const q=portal({staff:false});await q.run('portalRestoreTask');assert.equal(q.run('role'),'guest');assert.equal((await q.auth.getSession()).data.session,null);q.dom.window.close();
});
test('approval form has four statuses, teacher-specific subjects and atomic payload; tuition opens with receipts',async()=>{
 const p=portal();await p.run('portalRestoreTask');p.run("reviewEnrollment('request')");
 const f=p.w.document.querySelector('#form');assert.equal(f.elements.subject.value,'پیانو');assert.equal(f.elements.month_key.value,'1405/08');assert.equal(f.querySelectorAll('.tuition-setup select').length,5);assert.equal(f.querySelector('.enrollment-summary').parentElement.id,'fields');
 f.elements.p1.value='true';f.elements.p3.value='true';await f.onsubmit({preventDefault(){},target:f});
 const call=p.calls.find(c=>c.url.includes('approve_enrollment_with_tuition'));assert.ok(call);assert.deepEqual(JSON.parse(call.opts.body).data.paid,[true,false,true,false]);assert.equal(p.calls.filter(c=>c.url.includes('rpc/enrollment_action')).length,0);
 p.run("monthRows=[{id:'month',student_id:'student',month_key:'1405/08',paid:[true,false,true,false],dates:['2026-10-26','2026-11-02','2026-11-09','2026-11-16'],note:''}];receiptRows=[{id:'receipt',tuition_id:'month',slots:[2],amount:500000,method:'card',reference:'test-reference',status:'pending'}];go('monthly')");
 assert.equal(p.w.document.querySelectorAll('.tuition-slot').length,4);assert.match(p.w.document.querySelector('#content').textContent,/test-reference/);assert.equal(p.w.document.querySelectorAll('td[data-label]').length,5);
 p.run("editMonth('student','1405/08')");assert.equal(f.elements.p1.value,'true');assert.equal(f.elements.p2.value,'false');assert.ok(p.w.document.querySelector('#modal').open);p.dom.window.close();
});
test('the first four weekday occurrences are stable across a Jalali month',async()=>{const p=portal();await p.run('portalRestoreTask');assert.deepEqual(Array.from(p.run("tuitionDates('1405/08',1)")),['2026-10-26','2026-11-02','2026-11-09','2026-11-16']);p.dom.window.close()});
