const {test}=require('node:test');const assert=require('node:assert/strict');
const key='avaye-hezardastan.session.v1';
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.test',aud:'authenticated',role:'authenticated'};
const jwt=exp=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',exp})).toString('base64url'),Buffer.from('test-signature').toString('base64url')].join('.');
test('official auth SDK persists across fresh clients, refreshes expired tokens once and clears logout',async()=>{
 const {createPortalAuth}=await import('../auth/browser/session.js');const data=new Map();let rotations=0;
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const fetch=async(url,options)=>{if(url.includes('/token?grant_type=refresh_token')){rotations++;return Response.json({access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'rotated-test-refresh',expires_in:3600,token_type:'bearer',user});}if(url.endsWith('/logout?scope=local'))return new Response(null,{status:204});return Response.json({user,...user})};
 const options={storage,fetch};const first=createPortalAuth('https://academy.test','public-test-key',options);let result=await first.setSession({access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'test-refresh'});assert.equal(result.error,null);assert.ok(data.has(key));await first.stopAutoRefresh();
 const second=createPortalAuth('https://academy.test','public-test-key',options);result=await second.getSession();assert.equal(result.data.session.user.id,user.id);assert.equal(rotations,0);await second.stopAutoRefresh();
 const expired=JSON.parse(data.get(key));expired.expires_at=Math.floor(Date.now()/1000)-100;expired.access_token=jwt(expired.expires_at);data.set(key,JSON.stringify(expired));
 const third=createPortalAuth('https://academy.test','public-test-key',options);const all=await Promise.all([third.getSession(),third.getSession(),third.getSession()]);assert.equal(rotations,1);for(const r of all)assert.equal(r.data.session.refresh_token,'rotated-test-refresh');
 result=await third.signOut({scope:'local'});assert.equal(result.error,null);assert.equal(data.has(key),false);await third.stopAutoRefresh();
});
