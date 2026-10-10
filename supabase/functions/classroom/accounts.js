import {HttpError, hash, token, text} from './core.js';
import {actionSessionId} from './access.js';

export function credentials(body, signup=false) {
  const email=text(body.email,254).trim().toLowerCase();
  const password=text(body.password,256);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a valid email address.');
  if(!password || (signup && (password.length<8 || new TextEncoder().encode(password).length>72)))throw new HttpError(400,'Use a password with at least 8 characters and at most 72 bytes.');
  return {email,password};
}

// Supabase Auth owns password hashing. The browser receives only a revocable,
// hashed-at-rest Sidecar session, never a service key or upstream refresh token.
export async function accountLogin(body,{url,serviceKey,db,ip,fetcher=fetch}) {
  const signup=body.action==='account_signup';
  const {email,password}=credentials(body,signup);
  const period=Math.floor(Date.now()/(signup?3600000:60000));
  for(const scope of [ip,email]) {
    const allowed=await db('rpc/classroom_instructor_login_limit','','POST',{p_bucket:await hash('account:'+body.action+':'+scope+':'+period)});
    if(!allowed)throw new HttpError(429,signup?'Too many signup attempts. Try again in an hour.':'Too many sign-in attempts. Wait a minute and try again.');
  }
  const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
  const response=await fetcher(url+'/auth/v1/'+(signup?'admin/users':'token?grant_type=password'),{
    method:'POST',headers,body:JSON.stringify(signup?{email,password,email_confirm:true}:{email,password}),signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw new HttpError(response.status===429?429:400,signup?'Could not create this account. If you already registered, choose Sign in. Otherwise, check your email and password.':'Email or password is incorrect. Please try again.');
  const result=await response.json(),user=signup?result:result.user;
  if(!user?.id)throw new HttpError(502,'Sign-in did not finish. Please try again.');
  if(!signup && result.access_token)await fetcher(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{...headers,Authorization:'Bearer '+result.access_token},signal:AbortSignal.timeout(5000)}).catch(()=>{});
  const key='u_'+token(),expires_at=new Date(Date.now()+7*86400000).toISOString();
  await db('instructor_sessions','expires_at=lt.'+new Date().toISOString(),'DELETE');
  await db('instructor_sessions','','POST',{owner_id:user.id,token_hash:await hash(key),expires_at});
  return {key,role:'account',expires_at};
}

export async function accountFor(key,db) {
  if(!key.startsWith('u_'))return null;
  if(!/^u_[a-f0-9]{64}$/.test(key))throw new HttpError(401,'Please sign in again.');
  const rows=await db('instructor_sessions','token_hash=eq.'+await hash(key)+'&expires_at=gt.'+new Date().toISOString()+'&select=owner_id');
  if(!rows[0])throw new HttpError(401,'Your session has ended. Please sign in again.');
  return rows[0].owner_id;
}

export async function assertAccountScope(body,ownerId,lookup) {
  if(['list','create','generate_template','activity_models','transcribe_description','account_logout'].includes(body.action))return;
  const session=await lookup('class_sessions',await actionSessionId(body,lookup));
  if(session.owner_user_id!==ownerId)throw new HttpError(403,'This activity belongs to another instructor.');
}
