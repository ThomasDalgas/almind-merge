import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
 const p=await browser.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://*.supabase.co/**',r=>r.abort());await p.addInitScript(()=>localStorage.setItem('almind-score-nickname','Test'));
 await p.goto(BASE_URL+'/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').click();await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');
 const before=await p.locator('#game').boundingBox();
 await p.evaluate(async()=>{const {createLiveNotices}=await import('./live-players.js?v=gameover-notices-v1');const el=document.querySelector('#live-announcement');window.noticeTest=createLiveNotices({canNotify:()=>true,show:n=>{el.textContent=n.text;el.dataset.kind=n.kind;el.classList.add('visible');},hide:()=>el.classList.remove('visible')});noticeTest.observe({},'connected');noticeTest.observe({gameovers:[{id:'r',nickname:'Niklas',score:12345}]},'connected');});
 await p.waitForTimeout(250);assert.match(await p.locator('#live-announcement').textContent(),/Niklas · 12.345 point/);
 assert.equal(await p.locator('#live-announcement').evaluate(el=>getComputedStyle(el).transform),'none');assert.deepEqual(await p.locator('#game').boundingBox(),before);
 const toast=await p.locator('#live-announcement').boundingBox();assert.ok(toast.y>=0&&toast.y+toast.height<before.y);await p.screenshot({path:`/tmp/gameover-toast-${viewport.width}.png`});
 await p.waitForTimeout(2500);assert.ok(await p.locator('#live-announcement').evaluate(el=>el.classList.contains('visible')));await p.waitForTimeout(500);assert.equal(await p.locator('#live-announcement').evaluate(el=>el.classList.contains('visible')),false);assert.deepEqual(errors,[]);await p.close();
 }console.log('PASS mobile/desktop: sharp normal text layer, three-second toast, reserved slot without canvas shift');}finally{await browser.close();}
