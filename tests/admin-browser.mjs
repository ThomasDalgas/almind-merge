import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
 let player={id:'00000000-0000-4000-8000-000000000001',nickname:'Thomas',blocked:false,name_claimed:true,admin_revision:0};
 await p.route('https://*.supabase.co/**',async route=>{
  const req=route.request(),url=req.url(),args=req.postDataJSON();let data={};
  if(url.includes('/token?')||url.endsWith('/verify'))data={access_token:'admin',refresh_token:'refresh',expires_in:3600};
  else if(url.endsWith('ag_admin_me'))data={email:'admin@example.test',games:[{title:'Almind-Merge'}]};
  else if(url.endsWith('ag_admin_players'))data={players:[{...player,best:36704}],total:1};
  else if(url.endsWith('ag_admin_player'))data={player,devices:2,best:36704,rounds:[{score:36704,started_at:'2026-10-14T12:00:00Z'}],history:[],has_code:true};
  else if(url.endsWith('ag_admin_update_player')){writes.push(args);assert.equal(args.p_expected_revision,player.admin_revision);player={...player,admin_revision:player.admin_revision+1};if(args.p_action==='rename')player.nickname=args.p_name;if(args.p_action==='archive'){player.blocked=true;player.name_claimed=false;}if(args.p_action==='restore'){player.blocked=false;player.name_claimed=true;}data={player,code:args.p_action==='reset_code'?'ABCDE-12345':null};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await p.goto(BASE_URL+'/admin/');await p.locator('#email').fill('admin@example.test');await p.locator('#email-form button').click();await p.locator('#otp').fill('123456');await p.locator('#otp-form button').click();await p.locator('.player-row').click();await p.waitForFunction(()=>document.querySelector('#best').textContent==='36.704');
 await p.screenshot({path:'/tmp/almind-admin-desktop.png',fullPage:true});
 await p.locator('#nickname').fill('Thomas Test');await p.locator('#rename-form button').click();assert.equal(writes.length,0);await p.locator('#confirm-submit').click();await p.waitForFunction(()=>document.querySelector('#player-title').textContent==='Thomas Test');
 await p.locator('#reset-code').click();await p.locator('#confirm-submit').click();await p.waitForFunction(()=>document.querySelector('#new-code').textContent.includes('ABCDE-12345'));
 await p.locator('#archive').click();await p.locator('#confirm-name').fill('Wrong');await p.locator('#confirm-submit').click();assert.equal(writes.length,2);await p.locator('#confirm-name').fill('Thomas Test');await p.locator('#confirm-submit').click();await p.locator('#restore').waitFor({state:'visible'});assert.equal(await p.locator('#code-result').isVisible(),false);await p.locator('#restore').click();await p.locator('#confirm-submit').click();await p.locator('#archive').waitFor({state:'visible'});assert.equal(writes.length,4);
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'/tmp/almind-admin-mobile.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.locator('#logout').click();assert.equal(await p.locator('#workspace').isVisible(),false);assert.equal(await p.locator('#new-code').textContent(),'');assert.equal(await p.evaluate(()=>sessionStorage.getItem('almindgames-admin-session-v1')),null);
 assert.deepEqual(errors,[]);console.log('PASS OTP login, desktop/mobile layout, confirmed rename/code/archive/restore, code clearing, logout');
}finally{await b.close();}
