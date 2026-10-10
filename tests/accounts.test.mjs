import test from 'node:test';
import assert from 'node:assert/strict';
import {accountLogin,accountFor,credentials,assertAccountScope} from '../supabase/functions/classroom/accounts.js';
import {hash} from '../supabase/functions/classroom/core.js';
import {assertTestWorkspaceScope} from '../supabase/functions/classroom/access.js';
import {instructorEntry} from '../public/instructor-entry.js';
import {parseHTML} from 'linkedom';

test('signup confirms without email, keeps passwords with Supabase Auth, and stores only hashed app sessions',async()=>{
 const writes=[],requests=[];
 const result=await accountLogin({action:'account_signup',email:' Teacher@Example.com ',password:'classroom-example-123'}, {
  url:'https://db.invalid',serviceKey:'server-secret',ip:'test-ip',
  db:async(table,query,method,body)=>{writes.push({table,query,method,body});return true;},
  fetcher:async(url,options)=>{requests.push({url,...options});return Response.json({id:'owner-id'});}
 });
 assert.equal(result.role,'account');assert.match(result.key,/^u_[a-f0-9]{64}$/);
 assert(requests[0].url.endsWith('/auth/v1/admin/users'));
 assert.deepEqual(JSON.parse(requests[0].body),{email:'teacher@example.com',password:'classroom-example-123',email_confirm:true});
 assert.equal(writes.at(-1).body.token_hash,await hash(result.key));assert.equal(writes.at(-1).body.owner_id,'owner-id');
 assert(!JSON.stringify(writes).includes('classroom-example-123'));assert(!JSON.stringify(result).includes('server-secret'));
 assert(!JSON.stringify(writes).includes(result.key));
});

test('login validates with Supabase, revokes the temporary upstream session, and generic errors leak no account details',async()=>{
 const urls=[];
 await accountLogin({action:'account_signin',email:'t@example.com',password:'correct-password'}, {url:'https://db.invalid',serviceKey:'secret',ip:'one',db:async()=>true,fetcher:async url=>{urls.push(url);return Response.json({user:{id:'id'},access_token:'upstream-only'});}});
 assert(urls[0].endsWith('/token?grant_type=password'));assert(urls[1].endsWith('/logout?scope=local'));
 await assert.rejects(()=>accountLogin({action:'account_signin',email:'t@example.com',password:'bad'}, {url:'https://db.invalid',serviceKey:'secret',ip:'one',db:async()=>true,fetcher:async()=>Response.json({error:'private provider detail'},{status:400})}),/Email or password is incorrect/);
 await assert.rejects(()=>accountLogin({action:'account_signup',email:'t@example.com',password:'valid-password'}, {db:async()=>false,ip:'one'}),/Too many signup/);
 assert.throws(()=>credentials({email:'bad',password:'valid-password'},true));assert.throws(()=>credentials({email:'t@example.com',password:'short'},true));
});

test('every nested instructor operation checks the owning activity, including duplicate destinations and deletion',async()=>{
 const look=(owner)=>async(table)=>table==='class_sessions'?{owner_user_id:owner,is_test:true}:table==='slide_blocks'?{slide_id:'slide'}:{session_id:'session'};
 for(const action of ['get','settings','debrief','history','join_settings','delete_session','save_block','delete_block','save_slide','delete_slide','add_block','add_slide','rotate_group']){
  await assertAccountScope({action,sessionId:'session'},'alice',look('alice'));
  await assert.rejects(()=>assertAccountScope({action,sessionId:'session'},'bob',look('alice')),/another instructor/);
 }
 await assert.rejects(()=>assertAccountScope({action:'admin_save'},'alice',look('alice')));
 await assert.rejects(()=>assertTestWorkspaceScope({action:'get',sessionId:'session'},look('alice')),/limited to the test workspace/);
});

test('opaque account sessions are checked for expiry on every request and cannot impersonate a master key',async()=>{
 assert.equal(await accountFor('master',()=>{throw new Error('unexpected');}),null);
 await assert.rejects(()=>accountFor('u_invalid',async()=>[]),/sign in again/);
 const key='u_'+'a'.repeat(64);let query;
 assert.equal(await accountFor(key,async(t,q)=>{assert.equal(t,'instructor_sessions');query=q;return [{owner_id:'alice'}];}),'alice');
 assert(query.includes('expires_at=gt.'));assert(query.includes(await hash(key)));
 await assert.rejects(()=>accountFor(key,async()=>[]),/session has ended/);
});

test('entry separates student joining, email accounts, and optional code entry with no confirmation field',()=>{
 const {document}=parseHTML(instructorEntry({brand:'sidecar',signup:true,email:'<script>'}));
 assert.equal(document.querySelector('#account-form').dataset.mode,'signup');
 assert.equal(document.querySelector('#instructor-password').getAttribute('autocomplete'),'new-password');
 assert.equal(document.querySelector('#instructor-password').getAttribute('minlength'),'8');
 assert(document.querySelector('[data-action="join"]'));
 assert(document.querySelector('details #login'));assert(!document.querySelector('script'));
 assert.equal(document.querySelectorAll('#account-form input[type="password"]').length,1);
});
