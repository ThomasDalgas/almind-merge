import test from 'node:test';import assert from 'node:assert/strict';import {createSettingsStore} from '../site/merge-3d-test/settings.js';
const makeStorage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}};
test('all settings persist immediately and are isolated per profile',()=>{const s=makeStorage(),a=createSettingsStore(s,'a');const expected={touch_mode:1,aim_sensitivity:2.3,sound_enabled:false,invert_vertical_view:true};assert.equal(a.save(JSON.stringify(expected)),true);assert.deepEqual(JSON.parse(createSettingsStore(s,'a').load()),expected);assert.deepEqual(JSON.parse(createSettingsStore(s,'b').load()),{})});
test('invalid stored settings cannot break game startup',()=>{const s=makeStorage(),a=createSettingsStore(s);s.setItem('almind3d-settings:guest','broken');assert.equal(a.load(),'{}');a.save(JSON.stringify({touch_mode:42,aim_sensitivity:999,sound_enabled:'false',invert_vertical_view:false}));assert.deepEqual(JSON.parse(a.load()),{aim_sensitivity:3,invert_vertical_view:false});});
const profileAPI=()=>{let remote={};return {get value(){return remote},async settings3d(id,patch,seed=false){if(!seed||!Object.keys(remote).length)remote={...remote,...patch};return {...remote}}}};
test('settings follow the profile across separate device stores without stale overwrite',async()=>{
 const api=profileAPI(),phone=createSettingsStore(makeStorage(),'a',{api}),desktop=createSettingsStore(makeStorage(),'a',{api});
 await phone.init();await desktop.init();
 phone.save(JSON.stringify({sound_enabled:false,aim_sensitivity:2}));await phone.flush();
 // Desktop only changes inversion; it must not overwrite the phone fields.
 desktop.save(JSON.stringify({invert_vertical_view:true}));await desktop.flush();
 const tablet=createSettingsStore(makeStorage(),'a',{api});await tablet.init();
 assert.deepEqual(JSON.parse(tablet.load()),{sound_enabled:false,aim_sensitivity:2,invert_vertical_view:true});
 const stale=makeStorage();stale.setItem('almind3d-settings:a',JSON.stringify({sound_enabled:true}));
 const oldDevice=createSettingsStore(stale,'a',{api});await oldDevice.init();assert.equal(JSON.parse(oldDevice.load()).sound_enabled,false);
});
test('offline edits survive reload and retry; guest settings stay local',async()=>{
 const remote=profileAPI();let online=false,calls=0;
 const api={async settings3d(...args){calls++;if(!online)throw Error('offline');return remote.settings3d(...args)}};
 const storage=makeStorage(),first=createSettingsStore(storage,'a',{api});
 await first.init();first.save(JSON.stringify({touch_mode:1}));await first.flush();
 online=true;const reload=createSettingsStore(storage,'a',{api});await reload.init();assert.equal(remote.value.touch_mode,1);
 const count=calls,guest=createSettingsStore(makeStorage(),'guest',{api});await guest.init();guest.save('{"sound_enabled":false}');await guest.flush();assert.equal(calls,count);
});
test('an edit during a pending upload is not cleared by the old response',async()=>{
 let release;const sent=[];const api={settings3d(id,patch){sent.push(patch);return new Promise(r=>{release=r})}};
 const a=createSettingsStore(makeStorage(),'a',{api});a.save('{"aim_sensitivity":1}');const uploading=a.flush();
 a.save('{"aim_sensitivity":2}');release({});await uploading;
 const next=a.flush();assert.deepEqual(sent,[{aim_sensitivity:1},{aim_sensitivity:2}]);release({});await next;
});
