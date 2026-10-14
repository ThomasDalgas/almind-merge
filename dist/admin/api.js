import {SCORE_CONFIG} from '../score-config.js';
export function createAdminApi({config=SCORE_CONFIG,fetcher=fetch,storage=sessionStorage,now=Date.now}={}){
 const key='almindgames-admin-session-v1';let session=null,refresh=null,generation=0;
 try{session=JSON.parse(storage.getItem(key));}catch{}
 function clear(){generation++;session=null;storage.removeItem(key);}
 function save(data,version){
  if(version!==generation)throw new Error('Login blev afbrudt. Prøv igen.');
  if(!data.access_token||!data.refresh_token)throw new Error('Login kunne ikke bekræftes.');
  session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||now()/1000+data.expires_in};
  storage.setItem(key,JSON.stringify(session));
 }
 async function request(path,body,token){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const headers={apikey:config.key,'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
   const response=await fetcher(config.url+path,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
   const data=await response.json();
   if(!response.ok){const error=new Error(data.message||data.msg||data.error_description||'Tjenesten kunne ikke kontaktes.');error.status=response.status;throw error;}
   return data;
  }finally{clearTimeout(timer);}
 }
 async function token(){
  if(!session)throw new Error('Log ind som administrator.');
  if(session.expires_at>now()/1000+60)return session.access_token;
  if(!refresh){const version=generation;refresh=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(data=>save(data,version)).catch(error=>{if(version===generation)clear();throw error;}).finally(()=>{refresh=null;});}
  await refresh;return session?.access_token;
 }
 return {
  get signedIn(){return Boolean(session);},
  sendCode:email=>request('/auth/v1/otp',{email,create_user:false}),
  async verifyCode(email,code){const version=generation;save(await request('/auth/v1/verify',{email,token:code,type:'email'}),version);},
  async password(email,password){const version=generation;save(await request('/auth/v1/token?grant_type=password',{email,password}),version);},
  async rpc(name,args={}){const version=generation;const data=await request('/rest/v1/rpc/'+name,args,await token());if(version!==generation)throw new Error('Du er logget ud.');return data;},
  async logout(){const old=session?.access_token;clear();if(old)try{await request('/auth/v1/logout?scope=local',{},old);}catch{}},
  clear
 };
}
