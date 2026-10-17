const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const damageCache=new Map(),smokeCache=new Map();
const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function damaged(image,hp){
 const band=Math.ceil((100-clamp(hp,0,100))/12.5);if(!band)return image;
 const key=image.src+':'+band;if(damageCache.has(key))return damageCache.get(key);
 const w=Math.min(image.naturalWidth,768),h=Math.round(image.naturalHeight*w/image.naturalWidth),canvas=surface(w,h),c=canvas.getContext('2d');
 c.drawImage(image,0,0,w,h);c.globalCompositeOperation='source-atop';
 c.fillStyle=`rgba(38,23,19,${band*.045})`;c.fillRect(0,0,w,h);
 // Scorched paint follows the sprite alpha; no damage shape extends outside the armour.
 for(let i=0;i<band+2;i++){
  const x=w*(.14+noise(i+5)*.7),y=h*(.2+noise(i+18)*.56),r=w*(.035+noise(i+32)*.055)*(1+band*.09);
  const burn=c.createRadialGradient(x,y,0,x,y,r);burn.addColorStop(0,'#101214ec');burn.addColorStop(.32,'#211b19ce');burn.addColorStop(.64,'#66342883');burn.addColorStop(1,'#251b1700');c.fillStyle=burn;c.fillRect(x-r,y-r,r*2,r*2);
  c.strokeStyle='#b2a393aa';c.lineWidth=Math.max(1,w/550);c.beginPath();c.moveTo(x-r*.25,y+r*.12);c.lineTo(x+r*.1,y-r*.18);c.lineTo(x+r*.32,y-r*.12);c.stroke();
  c.strokeStyle='#0c0f12dd';c.lineWidth=w/220;c.beginPath();c.moveTo(x-r*.23,y+r*.18);c.lineTo(x+r*.2,y-r*.09);c.stroke();
 }
 damageCache.set(key,canvas);return canvas;
}
function smokeSprite(dark){
 const key=dark?'dark':'dust';if(smokeCache.has(key))return smokeCache.get(key);
 const canvas=surface(128,128),c=canvas.getContext('2d');
 for(let i=0;i<24;i++){const a=noise(i+4)*Math.PI*2,r=noise(i+7)*30,x=64+Math.cos(a)*r,y=64+Math.sin(a)*r,size=15+noise(i+12)*24;
 const g=c.createRadialGradient(x,y,0,x,y,size);g.addColorStop(0,dark?'#33383c45':'#b4a59640');g.addColorStop(.4,dark?'#40444829':'#8b7d6d24');g.addColorStop(1,'#55555500');c.fillStyle=g;c.fillRect(x-size,y-size,size*2,size*2);}
 smokeCache.set(key,canvas);return canvas;
}
export function smoke(c,x,y,age,strength=1,wind=0,dark=true){
 const sprite=smokeSprite(dark);c.save();
 for(let i=0;i<9;i++){const life=((age*.42+i/9)%1+1)%1,size=(12+life*55)*strength,px=x+Math.sin(i*2.4+life*3)*life*14+wind*life*2,py=y-life*72*strength;
 c.globalAlpha=Math.sin(life*Math.PI)*.65;c.translate(px,py);c.rotate(i+life*.7);c.drawImage(sprite,-size/2,-size/2,size,size);c.rotate(-i-life*.7);c.translate(-px,-py);}
 c.restore();
}
function flame(c,x,y,time,scale=1){c.save();c.globalCompositeOperation='screen';
 for(let i=0;i<6;i++){const h=(12+noise(i+1)*17+Math.sin(time*10+i*2)*5)*scale,w=(3+i%3)*scale,px=x+(i-2.5)*3*scale;
 const g=c.createLinearGradient(px,y,px,y-h);g.addColorStop(0,'#fff3c2e0');g.addColorStop(.22,'#ffb34ad0');g.addColorStop(.6,'#e4441980');g.addColorStop(1,'#bc351000');c.fillStyle=g;c.beginPath();c.moveTo(px-w,y);c.bezierCurveTo(px-w*2,y-h*.45,px+w*Math.sin(time*7+i),y-h*.9,px+Math.sin(time*9+i)*3,y-h);c.bezierCurveTo(px+w*2,y-h*.4,px+w,y-h*.2,px+w,y);c.fill();}
 c.restore();}
export function drawTank(c,p,index,dir,assets,time,impactAge=10){
 const body=assets.hull,cannon=assets.cannon,hasBody=body.complete&&body.naturalWidth,hasCannon=cannon.complete&&cannon.naturalWidth;
 const accent=index?'#e5ab87':'#91cbdf',lean=p.rotation||0,hp=p.hp??100;
 if(hp<=0){drawWreck(c,p,index,dir,assets,impactAge,time);return;}
 const recoil=impactAge<.35?Math.sin(impactAge/.35*Math.PI)*2.5:0;
 c.save();c.translate(p.x,p.y);c.rotate(lean);c.scale(dir,1);
 c.fillStyle='#10171b66';c.beginPath();c.ellipse(0,14,34,4,0,0,Math.PI*2);c.fill();
 if(hasBody){c.save();c.shadowColor='#111923';c.shadowBlur=2;c.shadowOffsetY=1;c.drawImage(damaged(body,hp),-36,-15,72,30);c.restore();}
 // Small painted identification stripe, with metal edge lighting.
 c.strokeStyle=accent;c.lineWidth=1.2;c.beginPath();c.moveTo(-22,-10);c.lineTo(-11,-11);c.stroke();
 c.restore();
 c.save();c.translate(p.x,p.y);c.rotate(lean);c.translate(-dir*recoil,-15);c.scale(dir,1);c.rotate(-p.angle*Math.PI/180-dir*lean);
 if(hasCannon){c.shadowColor='#e8e1cb';c.shadowBlur=2;c.drawImage(damaged(cannon,hp),-12,-8,62,15);c.shadowBlur=0;}
 const metal=c.createLinearGradient(0,-3,0,3);metal.addColorStop(0,'#f6e9c4');metal.addColorStop(.25,'#98a5a7');metal.addColorStop(.6,'#4d6068');metal.addColorStop(1,'#18242b');c.fillStyle=metal;
 c.beginPath();c.moveTo(9,-2.7);c.lineTo(48,-2.2);c.lineTo(50,0);c.lineTo(48,2.3);c.lineTo(9,3);c.closePath();c.fill();
 c.strokeStyle='#e9e2cb';c.lineWidth=.85;c.beginPath();c.moveTo(11,-2.7);c.lineTo(48,-2.2);c.stroke();c.fillStyle='#182128';c.fillRect(47,-2.5,3,5);c.fillStyle=accent;c.fillRect(42,-2.8,2,5.4);c.restore();
 if(hp<70)smoke(c,p.x-11*dir,p.y-10,time,(100-hp)/145+.22,0,true);
 if(hp<30)flame(c,p.x-13*dir,p.y-8,time,.45+(30-hp)/60);
 c.save();c.fillStyle='#0d1926c9';c.fillRect(p.x-15,p.y+20,30,3);c.fillStyle=hp<30?'#ed785c':accent;c.fillRect(p.x-15,p.y+20,30*hp/100,3);c.restore();
}
function drawWreck(c,p,index,dir,assets,age,time){
 const t=clamp(age,0,2.1),body=assets.hull,cannon=assets.cannon;
 c.save();c.translate(p.x,p.y);c.rotate(p.rotation||0);c.scale(dir,1);
 if(body.complete&&body.naturalWidth){const burnt=damaged(body,0),w=burnt.width,h=burnt.height;
  // Left track, torn middle armour, and right track remain recognisable image fragments.
  for(let i=0;i<3;i++){const sign=i-1,flight=Math.min(t,.95),dx=sign*flight*17,dy=Math.min(5,-Math.sin(flight/.95*Math.PI)*(i===1?20:7)+flight*5);
   c.save();c.translate(dx,dy);c.rotate(sign*Math.min(t,1)*.18);c.drawImage(burnt,w*i/3,0,w/3,h,-36+24*i,-15,24,30);c.restore();}
 }
 c.restore();
 if(cannon.complete&&cannon.naturalWidth){const travel=Math.min(t,1.2),x=p.x+dir*travel*31,y=p.y-15-76*travel+65*travel*travel;
 c.save();c.translate(x,y);c.rotate(-dir*.7+dir*travel*2.5);c.drawImage(damaged(cannon,0),-17,-5,44,11);c.restore();}
 for(let i=0;i<6;i++){const life=Math.min(t,.8+i*.08),x=p.x+(noise(i+4)-.5)*life*75,y=p.y-8-(24+noise(i+9)*35)*life+62*life*life;
 c.save();c.translate(x,Math.min(p.y+12,y));c.rotate(i+life*5);c.fillStyle=i%2?'#565957':'#272c2e';c.strokeStyle='#b2a393';c.lineWidth=.5;c.beginPath();c.moveTo(-3,-2);c.lineTo(3,-1);c.lineTo(2,2);c.lineTo(-2,1);c.closePath();c.fill();c.stroke();c.restore();}
 flame(c,p.x,p.y+2,time,1);smoke(c,p.x,p.y-6,time,1.2,0,true);
}
export function drawBlast(c,x,y,seconds,radius,{direct=false,weapon='shell',miss=false,rock=false,clarity=1}={}){
 if(miss||seconds<0||seconds>2.8)return;
 const r=radius*(direct?1.5:weapon==='heavy'?1.2:1)*clarity,t=seconds;
 c.save();
 if(t<.32){const size=Math.max(2,r*Math.sin(Math.min(1,t/.22)*Math.PI/2));const g=c.createRadialGradient(x,y,0,x,y,size);g.addColorStop(0,`rgba(255,250,228,${1-t/.34})`);g.addColorStop(.24,'#ffe6a3d0');g.addColorStop(.58,'#f9903470');g.addColorStop(1,'#db521000');c.globalCompositeOperation='screen';c.fillStyle=g;c.fillRect(x-size,y-size,size*2,size*2);c.globalCompositeOperation='source-over';}
 // A brief contrasting dust rim and incandescent fragments make the exact impact readable on small screens.
 if(clarity>1&&t<.65){const fade=Math.max(0,1-t/.65),spread=8+r*.7*Math.sqrt(t/.65);c.save();c.globalAlpha=fade*.8;c.strokeStyle='#342821';c.lineWidth=4;c.beginPath();c.ellipse(x,y-2,spread,spread*.42,0,Math.PI,Math.PI*2);c.stroke();c.strokeStyle='#ffe5ad';c.lineWidth=1.6;c.stroke();c.restore();}
 const puff=smokeSprite(direct);
 for(let i=0;i<18;i++){const a=noise(i+18)*Math.PI*2,speed=18+noise(i+7)*r,px=x+Math.cos(a)*speed*t*.55,py=y-Math.abs(Math.sin(a))*speed*t-17*t,size=12+(15+noise(i+12)*23)*Math.sqrt(t);
 c.globalAlpha=Math.max(0,1-t/2.8)*.55;c.drawImage(puff,px-size/2,py-size/2,size,size);}
 c.globalAlpha=1;
 for(let i=0;i<26;i++){const a=Math.PI+noise(i+30)*Math.PI,v=35+noise(i+11)*r*2,px=x+Math.cos(a)*v*t,py=y+Math.sin(a)*v*t+105*t*t;if(py>y+8)continue;
 c.save();c.translate(px,py);c.rotate(i+t*4);c.globalAlpha=Math.max(0,1-t/1.8);c.fillStyle=(direct||clarity>1)&&i%3===0?'#ffd19a':rock?'#8a8984':'#6b4933';c.fillRect(-1,-1,1.4+noise(i)*3.2,1+noise(i+2)*2);c.restore();}
 c.restore();
}
