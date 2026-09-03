/* ---------------- Deadlock ---------------- */
var DL='https://api.deadlock-api.com',dlHeroes=null,dlLastMatch=null,dlFirst=true;
function dlAccountId(v){
  var t=String(v||'').trim();
  /* STEAM_0:Y:Z  ->  Z*2 + Y */
  var m=/STEAM_[0-5]:([01]):(\d+)/i.exec(t);
  if(m)return String(BigInt(m[2])*2n+BigInt(m[1]));
  /* [U:1:Z] -> Z */
  var u=/\[?U:1:(\d+)\]?/i.exec(t);
  if(u)return String(BigInt(u[1]));
  var n=t.replace(/\D/g,'').replace(/^0+/,'');
  if(!n)return '';
  /* SteamID64 -> account_id. BigInt krävs, talet är för stort för vanlig JS-precision. */
  if(n.length>=17){
    try{return (BigInt(n)-76561197960265728n).toString();}
    catch(e){return String(Number(n)-76561197960265728);}
  }
  return n;
}

/* Direktanrop först. Blockerar webbläsaren dem går resten via en öppen proxy. */
var dlViaProxy=false;
function dlProxyUrl(u){return 'https://api.allorigins.win/raw?url='+encodeURIComponent(u);}
async function dlFetch(path){
  var url=/^https?:/.test(path)?path:DL+path;
  if(!dlViaProxy){
    try{
      var r=await fetch(url,{cache:'no-store'});
      if(r.ok||r.status<500)return r;
    }catch(e){dlViaProxy=true;}
  }
  return fetch(dlProxyUrl(url),{cache:'no-store'});
}
var dlWait=0;
async function dlJson(path){
  if(Date.now()<dlWait)throw new Error('väntar på Deadlock-API');
  var r=await dlFetch(path);
  if(r.status===429){
    var ra=parseInt(r.headers.get('Retry-After')||'60',10);
    dlWait=Date.now()+(isNaN(ra)?60:ra+2)*1000;
    throw new Error('HTTP 429 — väntar '+(isNaN(ra)?60:ra)+' s');
  }
  if(!r.ok)throw new Error('HTTP '+r.status+' på '+String(path).split('?')[0]);
  return r.json();
}
async function dlJsonAny(paths){
  var last=null;
  for(var i=0;i<paths.length;i++){
    try{return await dlJson(paths[i]);}catch(e){last=e;}
  }
  throw last;
}
async function dlLoadHeroes(){
  if(dlHeroes)return dlHeroes;
  /* hjältedata ligger ibland på api-servern, ibland på assets-servern */
  var list=await dlJsonAny([
    '/v1/assets/heroes',
    'https://assets.deadlock-api.com/v1/heroes',
    'https://assets.deadlock-api.com/v2/heroes'
  ]);
  dlHeroes={};
  (list||[]).forEach(function(h){
    var img='';
    var imgs=h.images||{};
    ['icon_hero_card','minimap_image','icon_image_small','selection_image','portrait'].forEach(function(k){
      if(!img&&typeof imgs[k]==='string')img=imgs[k];
    });
    if(!img)for(var k in imgs){if(typeof imgs[k]==='string'&&/\.(png|webp|jpg)/i.test(imgs[k])){img=imgs[k];break;}}
    dlHeroes[h.id]={id:h.id,name:h.name||('Hero '+h.id),img:img,raw:h,
      playable:!(h.in_development||h.disabled||h.is_disabled)};
  });
  return dlHeroes;
}

/* Provar flera varianter av historik-anropet och kommer ihåg vilken som gav träff. */
var dlPath=null,dlAll=[];
function dlCandidates(id){return [
  '/v1/players/'+id+'/match-history?only_stored_history=false',   /* hämtar färskt från Valve */
  '/v1/players/'+id+'/match-history?force_refetch=true',
  '/v1/players/'+id+'/match-history',
  '/v1/players/'+id+'/matches'
];}
function dlRows(j){
  if(Array.isArray(j))return j;
  if(j&&Array.isArray(j.matches))return j.matches;
  if(j&&Array.isArray(j.data))return j.data;
  return [];
}
async function dlHistory(id){
  var paths=dlCandidates(id);
  if(dlPath&&paths.indexOf(dlPath)>0)paths=[dlPath].concat(paths);
  var lastErr=null;
  for(var i=0;i<paths.length;i++){
    try{
      var j=await dlJson(paths[i]);
      var rows=dlRows(j);
      if(rows.length){dlPath=paths[i];return {arr:rows,path:paths[i]};}
    }catch(e){lastErr=e;}
  }
  if(lastErr&&!dlPath)throw lastErr;
  return {arr:[],path:null};
}
async function dlProbe(raw){
  var ids=[],conv=dlAccountId(raw),plain=String(raw||'').replace(/\D/g,'');
  if(conv)ids.push(conv);
  if(plain&&plain!==conv)ids.push(plain);
  var out=[];
  for(var a=0;a<ids.length;a++){
    var cands=dlCandidates(ids[a]);
    for(var i=0;i<cands.length;i++){
      var label=cands[i].replace('/v1/players/'+ids[a],'ID '+ids[a]+' →');
      try{
        var r=await dlFetch(cands[i]);
        if(!r.ok){out.push(label+': HTTP '+r.status+(dlViaProxy?' (proxy)':''));continue;}
        var rows=dlRows(await r.json());
        out.push(label+': '+rows.length+' matcher'+(dlViaProxy?' (proxy)':''));
        if(rows.length){dlPath=cands[i];CFG.dl=ids[a];}
      }catch(e){out.push(label+': '+e.message);}
    }
  }
  return out;
}
function dlMsg(t){el('dlBody').innerHTML='';
  var d=document.createElement('div');d.id='dlMsg';d.textContent=t;el('dlBody').appendChild(d);}
async function dlPoll(){
  if(!CFG.dl){dlMsg('No Steam ID set. Open settings in the top left corner.');return;}
  try{
    var heroes={};
    try{heroes=await dlLoadHeroes();}catch(e){heroes={};}
    var got=await dlHistory(CFG.dl);
    var arr=got.arr;
    if(!arr.length){dlMsg('The API responded but has no matches for account ID '+CFG.dl+'. Check the ID in settings.');return;}
    arr.sort(function(a,b){return (b.start_time||b.match_id||0)-(a.start_time||a.match_id||0);});
    dlAll=arr;                                  /* används av hjältevyn */
    renderCareer(arr);
    var recent=arr.slice(0,20);
    var wins=recent.filter(dlWon).length;
    el('dlForm').innerHTML='Last '+recent.length+': <b>'+wins+'W '+(recent.length-wins)+'L</b> · '+
      Math.round(wins/recent.length*100)+'% winrate';
    var streak=0,w=dlWon(recent[0]);
    for(var i=0;i<recent.length&&dlWon(recent[i])===w;i++)streak++;
    el('dlStreak').textContent=streak+(w?' win streak':' loss streak');
    var pill=el('streak');
    if(w&&streak>=2){pill.innerHTML='<b>'+streak+'</b> win streak';pill.classList.add('on');}
    else pill.classList.remove('on');
    var body=el('dlBody');body.innerHTML='';
    recent.slice(0,8).forEach(function(m){
      var h=heroes[m.hero_id]||{name:'Hero '+m.hero_id,img:''};
      var v='v'+(Math.abs(Number(String(m.match_id).slice(-6))||0)%6);
      var c=document.createElement('div');c.className='match '+(dlWon(m)?'win':'loss')+' '+v;
      c.appendChild(Object.assign(document.createElement('div'),{className:'cardbg',
        style:'background-image:url(heroes/bg/'+heroFile(h.name)+'.jpg)'}));
      c.appendChild(Object.assign(document.createElement('div'),{className:'paper'}));
      c.appendChild(Object.assign(document.createElement('div'),{className:'deco'}));

      var st=document.createElement('div');st.className='mstats';
      var res=document.createElement('div');res.className='mres';
      res.textContent=dlWon(m)?'Win':'Loss';st.appendChild(res);
      var kda=document.createElement('div');kda.className='mkda';
      kda.textContent=(m.player_kills|0)+' / '+(m.player_deaths|0)+' / '+(m.player_assists|0);
      st.appendChild(kda);
      var sub=document.createElement('div');sub.className='msub';
      var parts=[];
      if(m.net_worth)parts.push(Math.round(m.net_worth/1000)+'k souls');
      var spm=soulsPerMin(m.net_worth,m.match_duration_s);
      if(spm)parts.push(spm+'/min');
      if(m.match_duration_s)parts.push(Math.round(m.match_duration_s/60)+' min');
      sub.innerHTML=esc(parts.slice(0,2).join(' \u00b7 '))+(parts[2]?'<br>'+esc(parts[2]):'');
      st.appendChild(sub);
      c.appendChild(st);

      c.appendChild(heroImg(h,'mhero'));
      var nm=document.createElement('div');nm.className='mname';
      var logo=document.createElement('img');logo.className='nameimg';logo.alt=h.name;
      logo.src='heroes/name/'+heroFile(h.name)+'.svg';
      logo.addEventListener('error',function(){
        this.replaceWith(document.createTextNode(h.name));});
      nm.appendChild(logo);
      c.appendChild(nm);

      c.addEventListener('click',function(e){e.stopPropagation();showMatch(m);});
      body.appendChild(c);
    });

    /* ny match: visa den under klockan och gå upp i tempo en stund */
    var top=recent[0];
    if(!dlFirst&&top&&top.match_id!==dlLastMatch){
      var hh=heroes[top.hero_id]||{name:'Unknown hero',img:''};
      flashMatch(top,hh);
      dlHot=Date.now();
    }
    if(top&&top.start_time){
      var age=(Date.now()-top.start_time*1000)/3600000;
      el('dlFresh').textContent='Latest match '+(age<1?Math.round(age*60)+' min':
        age<48?Math.round(age)+' h':Math.round(age/24)+' d')+' ago';
    }
    if(top)dlLastMatch=top.match_id;
    dlFirst=false;
  }catch(e){
    dlMsg('Could not load Deadlock data for account ID '+CFG.dl+'. ('+e.message+')');
  }
}
/* Hjältebild: lokal fil först, API:ets bild som reserv. */
function heroFile(name){return String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function heroIcon(hero,cls){
  var i=document.createElement('img');
  i.decoding='async';
  i.addEventListener('load',function(){this.classList.add('in');});
  i.className=cls||''; i.alt=''; i.title=hero.name||'';
  i.dataset.remote=hero.img||'';
  i.dataset.step='icon';
  i.src='heroes/icon/'+heroFile(hero.name)+'.png';
  i.addEventListener('error',function(){
    if(this.dataset.step==='icon'){this.dataset.step='render';
      this.src='heroes/'+heroFile(hero.name)+'.png';return;}
    if(this.dataset.remote&&this.src!==this.dataset.remote){this.dataset.step='remote';
      this.src=this.dataset.remote;return;}
    this.style.visibility='hidden';
  });
  return i;
}
function heroImg(hero,cls){
  var i=document.createElement('img');
  i.decoding='async';
  i.addEventListener('load',function(){this.classList.add('in');});
  i.className=cls||''; i.alt=''; i.title=hero.name||'';
  i.dataset.remote=hero.img||'';
  i.src='heroes/'+heroFile(hero.name)+'.png';
  i.addEventListener('error',function(){
    if(this.dataset.remote&&this.src!==this.dataset.remote)this.src=this.dataset.remote;
    else this.style.visibility='hidden';
  });
  return i;
}
function soulsPerMin(nw,dur){
  if(!nw||!dur)return '';
  return Math.round(nw/(dur/60)).toLocaleString('en-US');
}
function dlWon(m){
  if(!m)return false;
  if(typeof m.match_result==='number'&&typeof m.player_team==='number')
    return m.match_result===m.player_team;
  return !!m.won;
}



/* Liten resultatrad under klockan när en match dykt upp i listan. */
var dlFlashTimer=null;
function flashMatch(m,hero){
  var f=el('dlFlash'),win=dlWon(m);
  f.innerHTML='';
  f.appendChild(heroIcon(hero));
  var v=document.createElement('span');v.className=win?'w':'l';
  v.textContent=win?'Win':'Loss';f.appendChild(v);
  var n=document.createElement('span');n.textContent=hero.name;f.appendChild(n);
  var k=document.createElement('span');k.className='kda';
  k.textContent=(m.player_kills|0)+'/'+(m.player_deaths|0)+'/'+(m.player_assists|0);
  f.appendChild(k);
  if(m.net_worth){var sN=document.createElement('span');sN.className='kda';
    sN.textContent=Math.round(m.net_worth/1000)+'k';f.appendChild(sN);}
  f.classList.add('on');
  clearTimeout(dlFlashTimer);
  dlFlashTimer=setTimeout(function(){f.classList.remove('on');},25000);
}

/* Hämtar tätt en kvart efter en ny match, glest annars. */
var dlHot=0,dlTick=null;
function dlSchedule(){
  clearTimeout(dlTick);
  var hot=Date.now()-dlHot<15*60*1000;
  var wait=document.hidden?300000:(hot?30000:120000);
  if(Date.now()<dlWait)wait=Math.max(wait,dlWait-Date.now());
  dlTick=setTimeout(function(){dlPoll().then(dlSchedule,dlSchedule);},wait);
}



/* Karriärsiffror räknade ur hela historiken vi fått. */
function renderCareer(all){
  var box=el('career');box.innerHTML='';
  if(!all||!all.length){box.classList.remove('on');return;}
  var w=0,k=0,d=0,a=0,nw=0,mins=0;
  all.forEach(function(m){
    if(dlWon(m))w++;
    k+=m.player_kills|0; d+=m.player_deaths|0; a+=m.player_assists|0;
    nw+=m.net_worth|0; mins+=(m.match_duration_s||0)/60;
  });
  var n=all.length;
  function add(v,label){
    var c=document.createElement('div');c.className='stat';
    var b=document.createElement('b');b.textContent=v;
    var s2=document.createElement('span');s2.textContent=label;
    c.appendChild(b);c.appendChild(s2);box.appendChild(c);
  }
  add(n.toLocaleString('en-US'),'Games');
  add(w.toLocaleString('en-US'),'Won');
  add(Math.round(w/n*100)+'%','Winrate');
  add(((k+a)/Math.max(d,1)).toFixed(2),'KDA');
  add(k.toLocaleString('en-US'),'Kills');
  add(a.toLocaleString('en-US'),'Assists');
  if(nw)add(Math.round(nw/1000).toLocaleString('en-US')+'k','Souls');
  if(mins)add(Math.round(mins/60).toLocaleString('en-US')+' h','Played');
  box.classList.add('on');
}
