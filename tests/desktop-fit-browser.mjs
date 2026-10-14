import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const p=await browser.newPage();await p.route('https://*.supabase.co/**',r=>{
  const url=r.request().url();let data=[];
  if(url.includes('/auth/'))data={access_token:'test',refresh_token:'test',expires_at:Date.now()/1000+3600,user:{id:'test'}};
  else if(url.includes('am_player_profile'))data={nickname:'Test',claimed:true};
  else if(url.includes('am_start_round'))data='test-round';
  else if(url.includes('am_live_'))data={players:[{nickname:'Thomas meget langt',score:18662,is_me:true,total_players:3},{nickname:'Niklas',score:21196,total_players:3},{nickname:'Silas',score:11866,total_players:3}]};
  return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await p.addInitScript(()=>localStorage.setItem('almind-score-nickname','Test'));
 await p.goto(BASE_URL+'/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);
 await p.locator('#play').click();await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');
 await p.waitForSelector('.live-player b');
 for(const [width,height] of [[1280,600],[1366,650],[1440,780],[1512,850],[1920,920],[2560,1300],[1024,768],[800,1000],[1000,500]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(100);
  const box=await p.locator('.arena-wrap').boundingBox(),toolbar=await p.locator('.arena-toolbar').boundingBox();
  assert.ok(box.y>=0&&box.y+box.height+8<=height,`${width}x${height}: entire board ${JSON.stringify(box)}`);
  assert.ok(box.x>=0&&box.x+box.width<=width);assert.ok(toolbar.y>=0&&toolbar.y+toolbar.height<=box.y+1);
  assert.ok(Math.abs(box.width/box.height-440/620)<.005,'unchanged aspect ratio');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const live=await p.locator('#live-panel').boundingBox();assert.ok(live.y>=0&&live.y+live.height<=height,`live panel visible ${width}x${height}: ${JSON.stringify(live)}`);
  const firstScore=await p.locator('.live-player b').first().boundingBox();assert.ok(firstScore.x>=live.x&&firstScore.x+firstScore.width<=live.x+live.width&&firstScore.y+firstScore.height<=live.y+live.height,'points visible without horizontal scrolling');
  console.log('PASS desktop board + live scores fit',width,height);
 }
 await p.setViewportSize({width:1440,height:780});await p.screenshot({path:'/tmp/almind-desktop-fit.png'});
 await p.locator('#pause').click();await p.locator('#highscores').scrollIntoViewIfNeeded();assert.ok(await p.locator('#highscores').isVisible());
 await p.locator('#play').click();const box=await p.locator('.arena-wrap').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=780);
 console.log('PASS pause scroll and resume');
}finally{await browser.close();}
