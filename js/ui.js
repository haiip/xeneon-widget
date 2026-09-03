/* ---------------- Deadlock-luckan ---------------- */
var sheetOpen=false,gStart=null,sheetTimer=null;
var SHEET_IDLE=20000;              /* stänger 20 s efter senaste beröring */
function sheetIdle(){
  clearTimeout(sheetTimer);
  if(sheetOpen)sheetTimer=setTimeout(function(){openSheet(false);},SHEET_IDLE);
}
function openSheet(on){
  lockUI(700);
  gStart=null;                       /* samma beröring ska inte räknas som gest igen */
  sheetOpen=!!on;
  var gt=el('gripText'); if(gt)gt.textContent=sheetOpen?'Stäng':'Deadlock';
  if(!sheetOpen){closeMatch();showHeroes(false);}
  el('vDeadlock').classList.toggle('open',sheetOpen);
  document.body.classList.toggle('sheet',sheetOpen);
  clearTimeout(sheetTimer);
  if(sheetOpen){dlPoll();sheetIdle();}
}
/* varje beröring inne i luckan startar om nedräkningen */
['pointerdown','pointermove','wheel','scroll','click'].forEach(function(ev){
  el('vDeadlock').addEventListener(ev,function(){if(sheetOpen)sheetIdle();},true);
});
el('grip').addEventListener('pointerdown',function(e){
  e.stopPropagation();e.preventDefault();openSheet(!sheetOpen);});
el('grip').addEventListener('click',function(e){e.stopPropagation();e.preventDefault();});
el('dlClose').addEventListener('click',function(e){e.stopPropagation();openSheet(false);});
document.addEventListener('pointerdown',function(e){
  if(e.target.closest('#gear, #setup, #foot'))return;
  gStart={x:e.clientX,y:e.clientY,t:Date.now()};
},true);
function gestureEnd(x,y){
  if(!gStart||uiLocked())return;
  var dy=y-gStart.y,dx=x-gStart.x,start=gStart;gStart=null;
  if(Math.abs(dy)<40||Math.abs(dx)>Math.abs(dy))return;   /* inte ett lodrätt drag */
  if(!CFG.dl)return;
  if(dy>0&&!sheetOpen&&start.y<window.innerHeight*0.35)openSheet(true);
  else if(sheetOpen&&(dy<0||start.y>window.innerHeight*0.75))openSheet(false);
}
document.addEventListener('pointerup',function(e){gestureEnd(e.clientX,e.clientY);},true);
document.addEventListener('pointercancel',function(){gStart=null;},true);
/* vissa pekskärmar skickar inte pointerup — lyssna på touch också */
document.addEventListener('touchend',function(e){
  var t=e.changedTouches&&e.changedTouches[0];
  if(t)gestureEnd(t.clientX,t.clientY);
},true);
document.addEventListener('touchstart',function(e){
  var t=e.touches&&e.touches[0];
  if(t&&!e.target.closest('#gear, #setup, #foot'))gStart={x:t.clientX,y:t.clientY,t:Date.now()};
},true);

/* ---------------- vyväxling ---------------- */
var backTimer=null;
function views(){return ['spotify','discord'];}
function nextView(){
  var v=views(),i=v.indexOf(document.body.dataset.view);
  return v[(i+1)%v.length];
}
function show(v){
  document.body.dataset.view=v;
  el('vSpotify').classList.toggle('on',v==='spotify');
  el('vDiscord').classList.toggle('on',v==='discord');
  el('voice').style.display=v==='spotify'?'':'none';
  clearTimeout(backTimer);
  if(v==='discord')dcPoll();
  if(v!=='spotify'&&CFG.back>0)
    backTimer=setTimeout(function(){show('spotify');},CFG.back*1000);
}
document.addEventListener('pointerdown',function(e){
  if(e.target.closest('#gear, #setup, #foot, #grip'))return;
  if(uiLocked())return;
  if(sheetOpen){
    if(e.target.closest('#vDeadlock'))return;   /* tryck inuti luckan tillhör luckan */
    openSheet(false);return;
  }
  show(nextView());
});
document.addEventListener('keydown',function(e){
  if(e.key===' '||e.key==='Enter'){e.preventDefault();show(nextView());}
});
function stop(e){e.stopPropagation();}
el('btnPlay').addEventListener('click',async function(e){stop(e);
  if(Date.now()<spWait)return;
  await api(state.playing?'/me/player/pause':'/me/player/play','PUT');
  state.playing=!state.playing;setTimeout(poll,350);});
el('btnNext').addEventListener('click',async function(e){stop(e);await api('/me/player/next','POST');setTimeout(poll,600);});
el('btnPrev').addEventListener('click',async function(e){stop(e);await api('/me/player/previous','POST');setTimeout(poll,600);});
el('btnShuffle').addEventListener('click',async function(e){stop(e);
  state.shuffle=!state.shuffle;this.classList.toggle('active',state.shuffle);
  await api('/me/player/shuffle?state='+state.shuffle,'PUT');setTimeout(poll,400);});
el('btnRepeat').addEventListener('click',async function(e){stop(e);
  var order={off:'context',context:'track',track:'off'};
  state.repeat=order[state.repeat]||'off';
  this.classList.toggle('active',state.repeat!=='off');
  await api('/me/player/repeat?state='+state.repeat,'PUT');setTimeout(poll,400);});

/* ---------------- setup ---------------- */
function note(t,cls){var n=el('authState');n.textContent=t;n.className=cls||'';}
function openSetup(){
  el('setup').classList.add('on');
  el('redir').textContent=REDIRECT;
  el('inCid').value=CFG.cid;el('inGuild').value=CFG.guild;el('inBack').value=CFG.back||'';el('inDl').value=CFG.dl;el('inWx').value=CFG.wx?decodeURIComponent(CFG.wx.split(',')[2]||''):'';
  if(CFG.rt)note('Spotify är redan ansluten.','ok');
}
el('gear').addEventListener('click',function(e){e.stopPropagation();openSetup();});
el('btnLogin').addEventListener('click',login);
el('btnClose').addEventListener('click',function(){el('setup').classList.remove('on');});
el('btnTest').addEventListener('click',async function(){
  var g=el('inGuild').value.trim(),s=el('dcState');
  if(!g){s.textContent='Fyll i server-ID först.';s.className='warn';return;}
  s.textContent='Testar…';s.className='';
  try{
    var r=await fetch('https://discord.com/api/guilds/'+g+'/widget.json',{cache:'no-store'});
    if(r.status===403){s.textContent='Widgeten är avstängd i Discord. Serverinställningar → Engagemang.';s.className='warn';return;}
    if(!r.ok){s.textContent='Discord svarade '+r.status+'.';s.className='warn';return;}
    var j=await r.json();
    s.textContent='Ansluten till '+j.name+' — '+(j.presence_count||0)+' online.';s.className='ok';
  }catch(e){s.textContent='Kunde inte nå Discord.';s.className='warn';}
});
el('btnDlTest').addEventListener('click',async function(){
  var st=el('dlState'),raw=el('inDl').value;
  if(!String(raw).replace(/\D/g,'')){st.textContent='Fyll i ditt Steam-ID först.';st.className='warn';return;}
  st.textContent='Testar alla varianter…';st.className='';
  var rows=await dlProbe(raw);
  st.innerHTML=rows.map(esc).join('<br>');
  st.className=rows.join(' ').indexOf(': 0 matcher')<rows.join(' ').length&&/[1-9]\d* matcher/.test(rows.join(' '))?'ok':'warn';
  if(dlPath){ls('xe_dl',CFG.dl);el('inDl').value=CFG.dl;el('inWx').value=CFG.wx?decodeURIComponent(CFG.wx.split(',')[2]||''):'';
    st.innerHTML+='<br><b>Använder: '+esc(dlPath)+'</b>';}
});
el('btnWx').addEventListener('click',async function(){
  var q=el('inWx').value.trim(),st=el('wxState');
  if(!q){st.textContent='Skriv en ort först.';st.className='warn';return;}
  st.textContent='Söker…';st.className='';
  try{
    var r=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=sv&name='+encodeURIComponent(q));
    var j=await r.json();
    var hit=(j.results||[])[0];
    if(!hit){st.textContent='Hittade ingen ort med det namnet.';st.className='warn';return;}
    CFG.wx=hit.latitude+','+hit.longitude+','+encodeURIComponent(hit.name);
    ls('xe_wx',CFG.wx);
    st.textContent='Hittade '+hit.name+(hit.admin1?', '+hit.admin1:'')+'. Vädret hämtas härifrån.';
    st.className='ok';
    wxPoll();
  }catch(e){st.textContent='Sökningen misslyckades.';st.className='warn';}
});
el('btnMake').addEventListener('click',function(){
  CFG.cid=el('inCid').value.trim();ls('xe_cid',CFG.cid);
  CFG.guild=el('inGuild').value.trim();ls('xe_guild',CFG.guild);
  CFG.back=parseInt(el('inBack').value,10)||0;ls('xe_back',String(CFG.back));
  CFG.dl=dlAccountId(el('inDl').value);ls('xe_dl',CFG.dl);
  if(!CFG.rt){el('out').textContent='Logga in på Spotify i steg 1 först.';return;}
  var p=new URLSearchParams({cid:CFG.cid,rt:CFG.rt});
  if(CFG.guild)p.set('guild',CFG.guild);
  if(CFG.back)p.set('back',String(CFG.back));
  if(CFG.dl)p.set('dl',CFG.dl);
  if(CFG.wx)p.set('wx',CFG.wx);
  el('out').textContent='<iframe src="'+REDIRECT+'?'+p.toString()+'" width="100%" height="100%" frameborder="0"></iframe>';
});
el('btnCopy').addEventListener('click',function(){
  navigator.clipboard.writeText(el('out').textContent).then(function(){
    el('btnCopy').textContent='Kopierad';setTimeout(function(){el('btnCopy').textContent='Kopiera';},1500);});
});
