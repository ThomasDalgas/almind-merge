export function earnedPowers(previousLevel,score){
 const level=Math.max(previousLevel,Math.floor(score/6000));let shake=0,remove=0;
 for(let n=previousLevel+1;n<=level;n++)if(n%2)remove++;else shake++;
 return {level,shake,remove};
}
export function createRewardNotices({show,hide,sound,canShow,duration=3000}){
 let queue=[],timer=null,active=false;
 function next(){
  if(active||!queue.length)return;
  if(!canShow()){clear();return;}
  active=true;const notice=queue.shift();show(notice);sound(notice);
  timer=setTimeout(()=>{hide();timer=setTimeout(()=>{active=false;next();},200);},duration);
 }
 function clear(){clearTimeout(timer);queue=[];active=false;hide();}
 return {push(notice){queue.push(notice);next();},clear};
}
