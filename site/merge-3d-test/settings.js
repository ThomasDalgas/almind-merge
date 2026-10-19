export function createSettingsStore(storage,profileId='guest'){
 const key=`almind3d-settings:${profileId}`;
 function sanitize(value){const s={};if(value&&typeof value==='object'){if(value.touch_mode===0||value.touch_mode===1)s.touch_mode=value.touch_mode;if(Number.isFinite(value.aim_sensitivity))s.aim_sensitivity=Math.min(3,Math.max(.5,value.aim_sensitivity));for(const k of ['sound_enabled','invert_vertical_view'])if(typeof value[k]==='boolean')s[k]=value[k]}return s}
 return {load(){try{return JSON.stringify(sanitize(JSON.parse(storage.getItem(key))))}catch{return '{}'}},save(json){try{storage.setItem(key,JSON.stringify(sanitize(JSON.parse(json))));return true}catch{return false}}};
}
