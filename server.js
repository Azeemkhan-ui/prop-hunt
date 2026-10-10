// PROP HUNT 3D - online server. No dependencies: just run `node server.js`
// It serves the game page (index.html) AND the WebSocket game on the same address.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||8080;
const server=http.createServer((req,res)=>{
  if(req.url=='/health'){res.end('ok');return}
  try{const h=fs.readFileSync(path.join(__dirname,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(h)}
  catch(e){res.writeHead(500);res.end('index.html is missing next to server.js')}
});
// ---------- minimal WebSocket (RFC 6455) ----------
function frame(str){const b=Buffer.from(str),n=b.length;let h;
  if(n<126)h=Buffer.from([0x81,n]);else if(n<65536){h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}
  else{h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}return Buffer.concat([h,b])}
let uid=0;
server.on('upgrade',(req,sock)=>{
  const key=req.headers['sec-websocket-key'];if(!key){sock.destroy();return}
  const acc=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+acc+'\r\n\r\n');
  sock.setNoDelay(true);
  const c={id:++uid,sock,room:null,name:'Player',buf:Buffer.alloc(0),frag:[],slot:0};
  c.send=o=>{if(!sock.destroyed)sock.write(frame(JSON.stringify(o)))};
  sock.on('data',d=>{c.buf=Buffer.concat([c.buf,d]);parse(c)});
  sock.on('close',()=>leave(c));sock.on('error',()=>sock.destroy());
});
function parse(c){for(;;){const b=c.buf;if(b.length<2)return;
  const fin=b[0]&128,op=b[0]&15,masked=b[1]&128;let len=b[1]&127,off=2;
  if(len==126){if(b.length<4)return;len=b.readUInt16BE(2);off=4}
  else if(len==127){if(b.length<10)return;len=Number(b.readBigUInt64BE(2));off=10}
  if(len>8192){c.sock.destroy();return}
  const need=off+(masked?4:0)+len;if(b.length<need)return;
  let p=b.subarray(off+(masked?4:0),need);
  if(masked){const m=b.subarray(off,off+4);p=Buffer.from(p);for(let i=0;i<p.length;i++)p[i]^=m[i&3]}
  c.buf=b.subarray(need);
  if(op==8){c.sock.end();return}
  if(op==9){c.sock.write(Buffer.concat([Buffer.from([0x8a,p.length]),p]));continue}
  if(op==1||op==0){if(op==1)c.frag=[p];else c.frag.push(p);if(fin){const s=Buffer.concat(c.frag).toString();c.frag=[];try{msg(c,s)}catch(e){console.error(e)}}}
}}
// ---------- game rooms ----------
const rooms=new Map(),now=()=>Date.now()/1000,rnd=n=>Math.random()*n|0;
const HIDE=30,HUNT=120;
function mkCode(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ';let s;do{s='';for(let i=0;i<4;i++)s+=A[rnd(A.length)]}while(rooms.has(s));return s}
function bcast(r,o,pred){const m=frame(JSON.stringify(o));for(const c of r.m)if(!c.sock.destroyed&&(!pred||pred(c)))c.sock.write(m)}
const info=r=>r.m.map(c=>({id:c.id,slot:c.slot,name:c.name}));
const lobby=r=>bcast(r,{t:'lobby',code:r.code,host:r.host.id,players:info(r)});
function join(c,r,name){
  c.name=String(name||'Player').replace(/[<>&"']/g,'').trim().slice(0,12)||'Player';
  let s=0;while(r.m.some(x=>x.slot==s))s++;c.slot=s;r.m.push(c);c.room=r;if(!r.host)r.host=c;
  c.caught=false;c.prop=-1;c.hunter=false;c.x=null;
  c.send({t:'joined',id:c.id,code:r.code,host:r.host.id,players:info(r)});lobby(r)}
function leave(c){const r=c.room;if(!r)return;
  r.m=r.m.filter(x=>x!==c);c.room=null;
  if(!r.m.length){rooms.delete(r.code);return}
  if(r.host===c)r.host=r.m[0];
  bcast(r,{t:'left',id:c.id});
  if(r.ph=='hide'||r.ph=='hunt'){
    if(c.hunter)end(r,false,'The Hunter left the game.');
    else if(r.m.length<2)end(r,false,'Not enough players.');
    else checkWin(r)}
  lobby(r)}
function end(r,hw,reason){if(r.ph=='end'||r.ph=='lobby')return;r.ph='end';bcast(r,{t:'end',hw,reason})}
function checkWin(r){const hs=r.m.filter(c=>!c.hunter);if(!hs.length)return end(r,false,'Not enough players.');
  if(hs.every(c=>c.caught))end(r,true,'The Hunter caught all Hiders.')}
function startMatch(r,c){
  if(r.m.length<2)return c.send({t:'err',m:'Need at least 2 players'});
  const ms=r.m.slice().sort((a,b)=>a.slot-b.slot),h=ms[r.round%ms.length];
  r.m.forEach(x=>{x.caught=false;x.prop=-1;x.hunter=x===h;x.x=null;x.pt=now();x.tc=0});
  r.chk=new Set();r.ph='hide';r.t=HIDE;r.tk=0;
  bcast(r,{t:'start',seed:rnd(2147483647),round:r.round,hunter:h.id,players:info(r)});
  r.round++}
const num=(v,a,b)=>typeof v=='number'&&isFinite(v)&&v>=a&&v<=b;
function msg(c,s){let o;try{o=JSON.parse(s)}catch(e){return}if(!o||typeof o.t!='string')return;const r=c.room;
  switch(o.t){
  case 'create':if(r)return;{const rm={code:mkCode(),m:[],host:null,ph:'lobby',round:0,t:0,chk:new Set()};rooms.set(rm.code,rm);join(c,rm,o.name)}break;
  case 'join':{if(r)return;const rm=rooms.get(String(o.code||'').toUpperCase().trim());
    if(!rm)return c.send({t:'err',m:'Room not found'});
    if(rm.m.length>=8)return c.send({t:'err',m:'Room is full (8 players)'});
    if(rm.ph=='hide'||rm.ph=='hunt')return c.send({t:'err',m:'Match already in progress'});
    join(c,rm,o.name);break}
  case 'start':case 'next':if(r&&r.host===c&&(r.ph=='lobby'||r.ph=='end'))startMatch(r,c);break;
  case 'leave':leave(c);break;
  case 'pos':{if(!r||(r.ph!='hide'&&r.ph!='hunt')||c.caught)return;if(c.hunter&&r.ph=='hide')return;
    if(!num(o.x,0,1000)||!num(o.y,0,640)||!num(o.gy,0,3)||!num(o.ang,-10,10)||!num(o.jy,-1,4)||(o.fl!==0&&o.fl!==1))return;
    const t=now();
    if(c.x!==null){const dt=Math.min(t-c.pt,1),d=Math.hypot(o.x-c.x,o.y-c.y),lim=(c.hunter?130:105)*1.6*1.4*dt+25;
      if(d>lim){c.send({t:'fix',x:c.x,y:c.y});return}}
    c.x=o.x;c.y=o.y;c.fl=o.fl;c.gy=o.gy;c.ang=o.ang;c.jy=o.jy;c.pt=t;break}
  case 'prop':{if(!r||r.ph!='hide'||c.hunter||c.caught)return;if(!Number.isInteger(o.p)||o.p<0||o.p>7)return;
    c.prop=o.p;bcast(r,{t:'prop',id:c.id,p:o.p},x=>!x.hunter);break}
  case 'tag':{if(!r||r.ph!='hunt'||!c.hunter)return;const t=now();if(t-(c.tc||0)<.45)return;c.tc=t;
    if(o.k=='p'){const v=r.m.find(x=>x.id===o.id);if(!v||v.hunter||v.caught||v.prop<0||v.x===null||c.x===null)return;
      if(Math.hypot(v.x-c.x,v.y-c.y)>300||Math.abs(v.gy-c.gy)>1.6)return;
      v.caught=true;bcast(r,{t:'caught',id:v.id});checkWin(r)}
    else if(o.k=='o'){if(!Number.isInteger(o.id)||o.id<0||o.id>=48||r.chk.has(o.id))return;r.chk.add(o.id);bcast(r,{t:'chk',o:o.id})}
    break}
  }}
// ---------- loops ----------
let last=now();
setInterval(()=>{const t=now(),dt=t-last;last=t;
  for(const r of rooms.values()){if(r.ph!='hide'&&r.ph!='hunt')continue;
    r.t-=dt;r.tk-=dt;
    if(r.tk<=0){r.tk=1;bcast(r,{t:'tick',ph:r.ph,tm:Math.max(0,r.t)})}
    if(r.t<=0){
      if(r.ph=='hide'){r.ph='hunt';r.t=HUNT;
        r.m.forEach(c=>{if(!c.hunter&&c.prop<0)c.prop=rnd(8)});
        bcast(r,{t:'props',list:r.m.filter(c=>!c.hunter).map(c=>[c.id,c.prop])});
        bcast(r,{t:'phase',ph:'hunt',tm:HUNT})}
      else end(r,false,'Time ran out. Hiders survive!')}}
},100);
setInterval(()=>{
  for(const r of rooms.values()){if(r.ph!='hide'&&r.ph!='hunt')continue;
    const list=r.m.filter(c=>!c.caught&&c.x!==null).map(c=>[c.id,c.x,c.y,c.fl,c.gy,c.ang,c.jy]);
    for(const c of r.m){if(c.hunter&&r.ph=='hide'){c.send({t:'snap',p:[]});continue}
      c.send({t:'snap',p:list.filter(a=>a[0]!==c.id)})}}
},66);
server.listen(PORT,()=>console.log('PROP HUNT 3D server running on port '+PORT));
