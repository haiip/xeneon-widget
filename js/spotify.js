/* ---------------- auth ---------------- */
function rand(n){var a=new Uint8Array(n);crypto.getRandomValues(a);
  return Array.prototype.map.call(a,function(b){return ('0'+b.toString(16)).slice(-2);}).join('');}
function b64url(buf){var s='',b=new Uint8Array(buf);
  for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function challenge(v){return b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));}
async function login(){
  var cid=el('inCid').value.trim();
  if(!cid){note('Fyll i Client ID först.','warn');return;}
  ls('xe_cid',cid);CFG.cid=cid;
  var v=rand(48);ls('xe_verifier',v);
  location.href='https://accounts.spotify.com/authorize?'+new URLSearchParams({
    client_id:cid,response_type:'code',redirect_uri:REDIRECT,
    code_challenge_method:'S256',code_challenge:await challenge(v),scope:SCOPES});
}
async function exchange(code){
  var r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'authorization_code',code:code,redirect_uri:REDIRECT,
      client_id:ls('xe_cid')||'',code_verifier:ls('xe_verifier')||''})});
  var j=await r.json();
  if(j.refresh_token){CFG.rt=j.refresh_token;ls('xe_rt',j.refresh_token);
    tok={v:j.access_token,exp:Date.now()+(j.expires_in-60)*1000};
    note('Inloggad. Gå vidare till steg 2.','ok');}
  else note('Inloggningen misslyckades: '+(j.error_description||j.error||'okänt fel'),'warn');
  history.replaceState({},'',REDIRECT);
}
var tok=null;
async function token(){
  if(tok&&tok.exp>Date.now())return tok.v;
  if(!CFG.rt||!CFG.cid)return null;
  var r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:CFG.rt,client_id:CFG.cid})});
  if(!r.ok)return null;
  var j=await r.json();
  if(j.refresh_token){CFG.rt=j.refresh_token;ls('xe_rt',j.refresh_token);}
  tok={v:j.access_token,exp:Date.now()+((j.expires_in||3600)-60)*1000};
  return tok.v;
}
var spWait=0,spFail=0;                       /* tidpunkt då vi får fråga igen */
async function api(path,method){
  if(Date.now()<spWait)return {err:429,wait:Math.ceil((spWait-Date.now())/1000)};
  var t=await token();
  if(!t)return {authfail:true};
  var r=await fetch('https://api.spotify.com/v1'+path,{method:method||'GET',headers:{Authorization:'Bearer '+t}});
  if(r.status===401){
    tok=null;
    var t2=await token();
    if(!t2)return {authfail:true};
    r=await fetch('https://api.spotify.com/v1'+path,{method:method||'GET',
      headers:{Authorization:'Bearer '+t2}});
  }
  if(r.status===429){
    var ra=parseInt(r.headers.get('Retry-After')||'0',10);
    if(isNaN(ra))ra=0;
    spFail=Math.min(spFail+1,4);
    var back=Math.max(ra, 30*Math.pow(2,spFail-1));   /* 30, 60, 120, 240 s */
    spWait=Date.now()+(back+2)*1000;
    return {err:429,wait:back};
  }
  spFail=0;
  if(r.status===204||r.status===202)return {empty:true};
  if(!r.ok)return {err:r.status};
  var txt=await r.text();return txt?JSON.parse(txt):{empty:true};
}

/* ---------------- uppspelning ---------------- */
var state={id:null,playing:false,pos:0,dur:0,at:0,shuffle:false,repeat:'off'};
async function poll(){
  var d=await api('/me/player');
  if(d&&d.authfail){idle(true,'Spotify-anslutningen behöver förnyas — kör setup igen');return;}
  if(d&&d.err===403){idle(true,'Spotify nekar åtkomst (403). Kräver Premium.');return;}
  if(d&&d.err===429){idle(true,waitText());return;}
  if(d&&d.err){idle(true,'Spotify svarade '+d.err);return;}
  if(!d||d.empty||!d.item){idle(true,'Inget spelas just nu');return;}
  idle(false);
  state.playing=!!d.is_playing;
  state.pos=d.progress_ms||0;state.dur=d.item.duration_ms||0;state.at=Date.now();
  document.body.classList.toggle('paused',!state.playing);
  el('playPath').setAttribute('d',state.playing?'M7 5h3.6v14H7zm6.4 0H17v14h-3.6z':'M7 4l13 8-13 8z');
  el('device').textContent=d.device?d.device.name:'';
  state.shuffle=!!d.shuffle_state; state.repeat=d.repeat_state||'off';
  el('btnShuffle').classList.toggle('active',state.shuffle);
  el('btnRepeat').classList.toggle('active',state.repeat!=='off');
  if(d.device&&typeof d.device.volume_percent==='number'&&Date.now()-volTouched>2500)
    setVolUI(d.device.volume_percent);
  if(d.item.id!==state.id){
    var first=state.id===null;
    state.id=d.item.id;
    queuePoll();
    swapTrack(d.item,first);
  }
}

/* Tonar ut, byter innehåll, tonar in igen — istället för ett hårt hopp. */
var swapTimer=null,wxLast=0;
function swapTrack(item,instant){
  var imgs=(item.album&&item.album.images)||[];
  var url=imgs.length?imgs[0].url:'';
  function paint(){
    el('title').textContent=item.name||'';
    el('artist').textContent=(item.artists||[]).map(function(a){return a.name;}).join(', ');
    el('album').textContent=item.album?item.album.name:'';
    if(url){
      el('art').src=url;              /* osynlig bild för färgutdrag */
      el('artView').src=url;
      el('bg').style.backgroundImage='url("'+url+'")';
    }
    document.body.classList.remove('swap');
  }
  clearTimeout(swapTimer);
  if(instant){paint();return;}
  document.body.classList.add('swap');
  swapTimer=setTimeout(paint,170);
}
function idle(on,msg){
  if(msg)el('idleMsg').textContent=msg;
  el('idle').classList.toggle('on',on);
  document.body.classList.toggle('idle',on);
  if(on&&CFG.wx&&Date.now()-wxLast>10*60*1000){wxLast=Date.now();wxPoll();}
  el('artWrap').style.visibility=on?'hidden':'visible';
  el('head').style.visibility=on?'hidden':'visible';
  el('foot').style.visibility=on?'hidden':'visible';
  if(on){state.id=null;el('played').style.width='0';document.body.classList.add('paused');}
}
function waitText(){
  var left=Math.max(0,Math.ceil((spWait-Date.now())/1000));
  return left?'Spotify pausade oss · '+left+' s kvar':'Återansluter…';
}
function ms(x){var s=Math.floor(x/1000);return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
function tick(){
  if(spWait>Date.now()&&el('idle').classList.contains('on'))
    el('idleMsg').textContent=waitText();
  var now=new Date();
  var hhmm=('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);
  el('clock').textContent=hhmm;
  el('now').textContent=hhmm;
  el('date').textContent=now.toLocaleDateString('sv-SE',
    {weekday:'long',day:'numeric',month:'long'});
  if(!state.dur)return;
  var p=state.pos+(state.playing?Date.now()-state.at:0);
  if(p>state.dur)p=state.dur;
  el('played').style.width=(p/state.dur*100)+'%';
  el('tCur').textContent=ms(p); el('tTot').textContent=ms(state.dur);
}

/* omslagets färger driver bakgrunden */
el('art').addEventListener('load',function(){
  try{
    var c=document.createElement('canvas');c.width=c.height=14;
    var x=c.getContext('2d');x.drawImage(el('art'),0,0,14,14);
    var d=x.getImageData(0,0,14,14).data,best=[123,224,160],sat=-1,sum=[0,0,0],n=0;
    for(var i=0;i<d.length;i+=4){
      var r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
      sum[0]+=r;sum[1]+=g;sum[2]+=b;n++;
      var s=(mx-mn)*(mx>40&&mx<246?1:.25);
      if(s>sat){sat=s;best=[r,g,b];}
    }
    var lum=best[0]*.299+best[1]*.587+best[2]*.114;
    if(lum<90){var k=115/Math.max(lum,1);best=best.map(function(v){return Math.min(255,Math.round(v*k));});}
    /* en andra färg med tydligt annan nyans, så molnen inte blir enfärgade */
    var second=best,bestDiff=-1;
    for(var j=0;j<d.length;j+=4){
      var r2=d[j],g2=d[j+1],b2=d[j+2],mx2=Math.max(r2,g2,b2),mn2=Math.min(r2,g2,b2);
      if(mx2<45||mx2>245)continue;
      var s2=mx2-mn2;
      var diff=Math.abs(r2-best[0])+Math.abs(g2-best[1])+Math.abs(b2-best[2]);
      var score=s2*0.6+diff*0.9;
      if(score>bestDiff){bestDiff=score;second=[r2,g2,b2];}
    }
    var lum2=second[0]*.299+second[1]*.587+second[2]*.114;
    if(lum2<80){var k2=105/Math.max(lum2,1);second=second.map(function(v){return Math.min(255,Math.round(v*k2));});}
    var avg=sum.map(function(v){return Math.round(v/n);});
    var g1=avg.map(function(v,i){return Math.min(255,Math.round(v*.6+best[i]*.28));});
    var g2=avg.map(function(v){return Math.round(v*.22+14);});
    var root=document.documentElement.style;
    root.setProperty('--accent','rgb('+best.join(',')+')');
    root.setProperty('--accent2','rgb('+second.join(',')+')');
    root.setProperty('--g1','rgb('+g1.join(',')+')');
    root.setProperty('--g2','rgb('+g2.join(',')+')');
  }catch(e){}
});

/* kö */
async function queuePoll(){
  if(Date.now()<spWait)return;
  var q=await api('/me/player/queue'),box=el('next');
  if(!q||q.err||!q.queue||!q.queue.length){box.classList.remove('on');return;}
  var t=q.queue[0],imgs=(t.album&&t.album.images)||t.images||[];
  el('nextArt').src=imgs.length?imgs[imgs.length-1].url:'';
  el('nextTxt').innerHTML='<i>Nästa</i><b>'+esc(t.name||'')+'</b>'+
    ((t.artists&&t.artists.length)?' — '+esc(t.artists.map(function(a){return a.name;}).join(', ')):'');
  box.classList.add('on');
}

/* volym */
var vol=50,volTouched=0,volTimer=null;
function setVolUI(v){
  vol=Math.max(0,Math.min(100,Math.round(v)));
  el('volFill').style.width=vol+'%';
  el('volFill').style.setProperty('--vp',vol+'%');
  el('volNum').textContent=vol+'%';
  el('vol').classList.add('on');
}
function pushVol(delay){
  clearTimeout(volTimer);
  volTimer=setTimeout(async function(){
    var r=await api('/me/player/volume?volume_percent='+vol,'PUT');
    if(r&&r.err===403)el('vol').classList.remove('on');
  },delay||320);
}
function nudgeVol(step){setVolUI(vol+step);volTouched=Date.now();pushVol();}
function volFromX(bar,x){
  var r=bar.getBoundingClientRect();
  if(!r.width)return;
  setVolUI((x-r.left)/r.width*100);volTouched=Date.now();pushVol(260);
}
el('volDown').addEventListener('click',function(e){e.stopPropagation();nudgeVol(-5);});
el('volUp').addEventListener('click',function(e){e.stopPropagation();nudgeVol(5);});

/* Reglaget tar emot både tryck och drag. iCUE äter ibland horisontella drag
   (det är samma gest som byter sida på panelen), så tryck ska räcka. */
var volBar=el('volBar'),volDrag=false,lastVolAt=0;
function volEvent(e,x){
  e.stopPropagation();
  if(Date.now()-lastVolAt<60)return;   /* samma tryck kan komma som flera händelser */
  lastVolAt=Date.now();
  volFromX(volBar,x);
}
volBar.addEventListener('pointerdown',function(e){
  volDrag=true;try{this.setPointerCapture(e.pointerId);}catch(err){}
  volEvent(e,e.clientX);
});
volBar.addEventListener('pointermove',function(e){if(volDrag)volEvent(e,e.clientX);});
volBar.addEventListener('pointerup',function(e){volDrag=false;e.stopPropagation();});
volBar.addEventListener('pointercancel',function(){volDrag=false;});
volBar.addEventListener('touchstart',function(e){
  if(e.touches&&e.touches.length)volEvent(e,e.touches[0].clientX);},{passive:true});
volBar.addEventListener('touchmove',function(e){
  if(e.touches&&e.touches.length)volEvent(e,e.touches[0].clientX);},{passive:true});
volBar.addEventListener('click',function(e){volEvent(e,e.clientX);});

/* spola i låten */
el('track').addEventListener('pointerdown',async function(e){
  e.stopPropagation();
  if(!state.dur)return;
  var r=this.getBoundingClientRect();
  var p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
  state.pos=Math.round(p*state.dur);state.at=Date.now();
  el('played').style.width=(p*100)+'%';
  await api('/me/player/seek?position_ms='+state.pos,'PUT');
});

/* ---------------- Discord ---------------- */
var dcData=null,seenVoice={},firstDc=true;
var dcWait=0;
async function dcPoll(){
  if(Date.now()<dcWait)return;
  if(!CFG.guild){dcMsg('Inget server-ID inlagt. Öppna inställningarna uppe till vänster.');return;}
  try{
    var r=await fetch('https://discord.com/api/guilds/'+encodeURIComponent(CFG.guild)+'/widget.json',{cache:'no-store'});
    if(r.status===429){
      var ra=parseInt(r.headers.get('Retry-After')||'60',10);
      dcWait=Date.now()+(isNaN(ra)?60:ra+2)*1000;return;}
    if(r.status===403){dcMsg('Serverwidgeten är avstängd. Slå på den i Serverinställningar → Engagemang.');return;}
    if(r.status===404){dcMsg('Hittar ingen server med det ID:t.');return;}
    if(!r.ok){dcMsg('Discord svarar inte just nu ('+r.status+').');return;}
    dcData=await r.json();
    renderDiscord();renderVoice();notifyJoins();
  }catch(e){dcMsg('Kunde inte nå Discord.');}
}
function dcMsg(t){
  dcData=null;el('dcBody').innerHTML='';
  var d=document.createElement('div');d.id='dcMsg';d.textContent=t;el('dcBody').appendChild(d);
  el('voice').classList.remove('on');
}
function voiceGroups(){
  if(!dcData)return [];
  var chans=(dcData.channels||[]).slice().sort(function(a,b){return (a.position||0)-(b.position||0);});
  var by={};
  (dcData.members||[]).forEach(function(m){if(m.channel_id)(by[m.channel_id]=by[m.channel_id]||[]).push(m);});
  return chans.map(function(c){return {name:c.name,people:by[c.id]||[]};});
}
function face(m){var i=document.createElement('img');i.src=m.avatar_url||'';i.alt='';return i;}
function renderDiscord(){
  var groups=voiceGroups(),body=el('dcBody');
  el('dcCount').textContent=(dcData.presence_count||0)+' online';
  body.innerHTML='';
  if(!groups.length){dcMsg('Servern har inga röstkanaler att visa.');return;}
  var live=groups.filter(function(g){return g.people.length;});
  (live.length?live:groups).forEach(function(g){
    var c=document.createElement('div');c.className='chan'+(g.people.length?' live':'');
    var h=document.createElement('h4');h.innerHTML='<span>#</span>';
    h.appendChild(document.createTextNode(g.name));c.appendChild(h);
    var who=document.createElement('div');who.className='who';
    if(!g.people.length){var e2=document.createElement('div');e2.className='empty';e2.textContent='Tomt';who.appendChild(e2);}
    else g.people.slice(0,6).forEach(function(m){
      var row=document.createElement('div');
      if(m.mute||m.deaf||m.self_mute||m.self_deaf)row.className='muted';
      row.appendChild(face(m));row.appendChild(document.createTextNode(m.username));who.appendChild(row);
    });
    if(g.people.length>6){var more=document.createElement('div');more.className='empty';
      more.textContent='+'+(g.people.length-6)+' till';who.appendChild(more);}
    c.appendChild(who);body.appendChild(c);
  });
}
function renderVoice(){
  var live=voiceGroups().filter(function(g){return g.people.length;}),v=el('voice');
  if(!live.length){v.classList.remove('on');return;}
  var total=live.reduce(function(n,g){return n+g.people.length;},0);
  var faces=el('voiceFaces');faces.innerHTML='';
  live[0].people.slice(0,5).forEach(function(m){faces.appendChild(face(m));});
  var label='<b>'+esc(live[0].name)+'</b>';
  if(live.length>1)label+=' + '+(live.length-1)+' kanal'+(live.length>2?'er':'')+' till';
  el('voiceName').innerHTML=label+' · '+total+' i röst';
  v.classList.add('on');
}
function toast(txt,avatar){
  var t=document.createElement('div');t.className='toast';
  if(avatar){var i=document.createElement('img');i.src=avatar;t.appendChild(i);}
  var s=document.createElement('span');s.textContent=txt;t.appendChild(s);
  el('toasts').appendChild(t);
  setTimeout(function(){t.style.transition='opacity .4s';t.style.opacity='0';
    setTimeout(function(){t.remove();},450);},7000);
}
function notifyJoins(){
  var now={};
  voiceGroups().forEach(function(g){g.people.forEach(function(m){now[m.id]=g.name;});});
  if(!firstDc){
    Object.keys(now).forEach(function(id){
      if(!seenVoice[id]){
        var m=(dcData.members||[]).filter(function(x){return x.id===id;})[0];
        toast((m?m.username:'Någon')+' gick in i '+now[id],m&&m.avatar_url);
      }
    });
  }
  firstDc=false;seenVoice=now;
}
