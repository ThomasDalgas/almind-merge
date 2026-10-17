// Uses the same anonymous Auth session and shared profile as Almind Merge on the same origin.
const config={url:'https://sxzncydqjdwnkmbypeeu.supabase.co',key:'sb_publishable__C9eRFc8imeaIDlzdr9kcQ_c9YuY4oD'};
const sessionKey=`almind-score-session:${config.url}`;
let session=null,authPending=null;
async function request(path,body,token){const response=await fetch(config.url+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok){const e=Error(data.message||data.msg||`Serverfejl ${response.status}`);e.code=data.code;throw e;}return data;}
async function loadAuth(){try{session=JSON.parse(localStorage.getItem(sessionKey))||session;}catch{}if(session?.access_token&&session.expires_at>Date.now()/1000+60)return session;const data=session?.refresh_token?await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}):await request('/auth/v1/signup',{data:{game:'almind-artilleri'}});session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Date.now()/1000+data.expires_in,user:data.user};localStorage.setItem(sessionKey,JSON.stringify(session));return session;}
async function auth(){if(!authPending)authPending=loadAuth().finally(()=>{authPending=null;});return authPending;}
export async function rpc(name,args={}){const s=await auth();return request('/rest/v1/rpc/'+name,args,s.access_token);}
export async function profile(){try{return await rpc('aa_profile');}catch(e){if(e.code==='PGRST202')return rpc('am_player_profile');throw e;}}
