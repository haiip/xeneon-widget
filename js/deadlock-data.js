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
/* Senaste anropets utfall, för raden längst upp i Deadlock-luckan.
   steam===false betyder att API:et svarade ur sin egen databas utan att
   fråga Valve — det gör den för konton som inte är vän med någon av
   deras bottar, och det är därför historiken kan ligga ett dygn efter. */
var dlNet={proxy:false,steam:null,status:0,ms:0,at:0};
/* Proxyn var förr ett enkelriktat beslut: ett enda misslyckat direktanrop
   satte dlViaProxy och sedan gick allt via allorigins resten av sessionen.
   Den är en gratis publik proxy och långsam, så en tillfällig hicka kunde
   göra widgeten trög ända till nästa omladdning. Nu provar vi direkt igen
   efter fem minuter. */
var dlProxyUntil=0;
/* Med en giltig X-API-Key byter API:et ut IP-kvoten mot nyckelkvoten,
   10 anrop i timmen blir 300. Nyckeln följer inte med genom proxyn. */
function dlHeaders(){
  return CFG.key?{'X-API-Key':CFG.key}:undefined;
}
async function dlFetch(path){
  var url=/^https?:/.test(path)?path:DL+path;
  var t0=Date.now();
  if(!dlViaProxy||Date.now()>dlProxyUntil){
    try{
      var r=await fetch(url,{cache:'no-store',headers:dlHeaders()});
      if(r.ok||r.status<500){dlViaProxy=false;dlNote(r,false,t0);return r;}
    }catch(e){dlViaProxy=true;dlProxyUntil=Date.now()+5*60*1000;}
  }
  var p=await fetch(dlProxyUrl(url),{cache:'no-store'});
  dlNote(p,true,t0);
  return p;
}
function dlNote(r,viaProxy,t0){
  dlNet.proxy=!!viaProxy;
  dlNet.status=r.status;
  dlNet.ms=Date.now()-t0;
  dlNet.at=Date.now();
  /* proxyn sväljer svarshuvudena, då vet vi inget */
  var h=null;
  if(!viaProxy){try{h=r.headers.get('Called-Steam');}catch(e){h=null;}}
  dlNet.steam=h===null?null:(h==='true');
}
var dlWait=0;
async function dlJson(path){
  if(Date.now()<dlWait)throw new Error('väntar på Deadlock-API');
  var r=await dlFetch(path);
  if(r.status===429){
    var ra=parseInt(r.headers.get('Retry-After')||'60',10);
    dlWait=Date.now()+(isNaN(ra)?60:ra+2)*1000;
    /* match-history svarar 429 med den lagrade historiken i kroppen —
       hellre lite gammal data än ingen alls medan vi väntar ut spärren */
    try{
      var body=await r.json();
      if(body&&(Array.isArray(body)?body.length:Object.keys(body).length))return body;
    }catch(e){}
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

/* ---- Spelarnamn: cachas hårt, eftersom det är tolv konton per match ---- */
var nameCache={},namePath=null,nameDead=false;
try{nameCache=JSON.parse(localStorage.getItem('xe_names')||'{}');}catch(e){nameCache={};}
function saveNames(){try{localStorage.setItem('xe_names',JSON.stringify(nameCache));}catch(e){}}
function pickName(o){
  if(!o||typeof o!=='object')return '';
  var keys=['personaname','persona_name','display_name','name','nickname','steam_name'];
  for(var i=0;i<keys.length;i++)if(typeof o[keys[i]]==='string'&&o[keys[i]].trim())return o[keys[i]];
  for(var k in o)if(o[k]&&typeof o[k]==='object'){
    var n=pickName(o[k]); if(n)return n;
  }
  return '';
}
async function fetchNames(ids){
  if(nameDead||!ids.length)return;
  var need=ids.filter(function(id){return !(id in nameCache);});
  if(!need.length)return;
  /* först ett samlat anrop, sedan ett per konto */
  var batch=['/v1/players/steam?account_ids='+need.join(','),
             '/v1/players/steam-profiles?account_ids='+need.join(',')];
  for(var b=0;b<batch.length;b++){
    try{
      var j=await dlJson(batch[b]);
      var arr=Array.isArray(j)?j:(j&&(j.players||j.profiles))||[];
      if(arr.length){
        arr.forEach(function(o){
          var id=String(o.account_id||o.accountid||o.id||'');
          var n=pickName(o);
          if(id&&n)nameCache[id]=n;
        });
        need.forEach(function(id){if(!(id in nameCache))nameCache[id]='';});
        saveNames();return;
      }
    }catch(e){}
  }
  var singles=['/v1/players/{id}/steam','/v1/players/{id}/profile','/v1/players/{id}'];
  for(var s=0;s<singles.length;s++){
    try{
      var probe=await dlJson(singles[s].replace('{id}',need[0]));
      var nm=pickName(Array.isArray(probe)?probe[0]:probe);
      if(nm){namePath=singles[s];break;}
    }catch(e){}
  }
  if(!namePath){nameDead=true;return;}          /* ingen endpoint fungerar */
  for(var i=0;i<need.length;i++){
    try{
      var one=await dlJson(namePath.replace('{id}',need[i]));
      nameCache[need[i]]=pickName(Array.isArray(one)?one[0]:one)||'';
    }catch(e){nameCache[need[i]]='';}
  }
  saveNames();
}
function nameOf(id){return nameCache[String(id)]||'';}


/* Steam-namnet: hämtas om API:et kan, annars det du skrivit in i setup. */
var dlName='';
async function dlLoadName(){
  if(CFG.nm){dlName=CFG.nm;return dlName;}
  var tries=['/v1/players/'+CFG.dl+'/steam',
             '/v1/players/steam?account_ids='+CFG.dl,
             '/v1/players/'+CFG.dl+'/profile'];
  for(var i=0;i<tries.length;i++){
    try{
      var j=await dlJson(tries[i]);
      var o=Array.isArray(j)?j[0]:j;
      var n=o&&(o.personaname||o.persona_name||o.name||o.display_name||
                (o.profile&&(o.profile.personaname||o.profile.name)));
      if(n){dlName=String(n);return dlName;}
    }catch(e){}
  }
  return '';
}

/* only_stored_history=false fanns med här förr och såg ut att hämta färskt
   från Valve. Parametern finns inte längre i API:et — MatchHistoryQuery har
   bara force_refetch — och okända query-parametrar ignoreras tyst, så det var
   ett helt vanligt anrop som dessutom låste fast dlPath.
   force_refetch är också borta: bot-vän-kollen i API:et ligger före den
   flaggan, så den gör ingenting för oss, och den kostar 1 anrop i timmen. */
function dlCandidates(id,force){
  var base='/v1/players/'+id+'/match-history';
  /* force_refetch hämtar om hela historiken från Steam och är hårt spärrad:
     1/h per IP, 5/h med nyckel, och den faller inte tillbaka på lagrad data
     vid 429 utan svarar fel. Därför bara på knappen, aldrig i pollningen. */
  return (force?[base+'?force_refetch=true']:[]).concat([
    base,
    '/v1/players/'+id+'/matches'
  ]);
}
function dlRows(j){
  if(Array.isArray(j))return j;
  if(j&&Array.isArray(j.matches))return j.matches;
  if(j&&Array.isArray(j.data))return j.data;
  return [];
}
async function dlHistory(id,force){
  var paths=dlCandidates(id,force);
  if(!force&&dlPath&&paths.indexOf(dlPath)>0)paths=[dlPath].concat(paths);
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
/* Kort etikett om varifrån senaste svaret kom. */
function dlSource(){
  var bits=[];
  if(dlNet.steam===true)bits.push('live from Steam');
  else if(dlNet.steam===false)bits.push('stored only');
  else bits.push(dlNet.proxy?'via proxy':'unknown source');
  if(dlNet.status===429)bits.push('rate limited');
  if(dlNet.ms)bits.push(dlNet.ms+' ms');
  return bits.join('  ·  ');
}
function dlMsg(t){el('dlBody').innerHTML='';
  var d=document.createElement('div');d.id='dlMsg';d.textContent=t;el('dlBody').appendChild(d);}
async function dlPoll(force){
  if(!CFG.dl){dlMsg('No Steam ID set. Open settings in the top left corner.');return;}
  try{
    var heroes={};
    try{heroes=await dlLoadHeroes();}catch(e){heroes={};}
    dlLastPoll=Date.now();
    var got=await dlHistory(CFG.dl,force);
    var arr=got.arr;
    if(!arr.length){dlMsg('The API responded but has no matches for account ID '+CFG.dl+'. Check the ID in settings.');return;}
    arr.sort(function(a,b){return (b.start_time||b.match_id||0)-(a.start_time||a.match_id||0);});
    dlAll=arr;                                  /* används av hjältevyn */
    if(!dlName)dlLoadName().then(function(){});
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
    recent.slice(0,20).forEach(function(m){
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
      var tg=buildTags(h.name);
      if(tg){tg.className='tags mtags';c.appendChild(tg);
        tintFrom('heroes/bg/'+heroFile(h.name)+'.jpg',c,'--tag');}

      var nm=document.createElement('div');nm.className='mname';
      var logo=document.createElement('img');logo.className='nameimg';logo.alt=h.name;
      logo.src='heroes/name/'+heroFile(h.name)+'.svg';
      logo.addEventListener('error',function(){
        this.replaceWith(document.createTextNode(h.name));});
      nm.appendChild(logo);
      if(dlName)nm.appendChild(Object.assign(document.createElement('span'),
        {className:'mplayer',textContent:dlName}));
      c.appendChild(nm);

      c.addEventListener('click',function(e){
        e.stopPropagation();if(uiLocked())return;showMatch(m);});
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
        age<48?Math.round(age)+' h':Math.round(age/24)+' d')+' ago  ·  '+dlSource();
      el('dlFresh').className=dlNet.steam===false?'stale':'';
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
var dlHot=0,dlTick=null,dlLastPoll=0;
/* Så länge kontot inte var prioriterat svarade API:et ur sin egen databas och
   rörde aldrig någon kvot — då kostade det inget att fråga varannan minut.
   För ett prioriterat konto räknas varje match-history-anrop: 10 i timmen per
   IP, eller 300 med API-nyckel. Utan nyckel måste vi alltså ner till ett anrop
   var sjunde minut, annars får vi 429 och faller tillbaka på lagrad data. */
function dlMinGap(){return CFG.key?30000:400000;}
function dlSchedule(){
  clearTimeout(dlTick);
  var hot=Date.now()-dlHot<15*60*1000;
  var wait=document.hidden?300000:(hot?30000:120000);
  wait=Math.max(wait,dlMinGap()-(Date.now()-dlLastPoll));
  if(Date.now()<dlWait)wait=Math.max(wait,dlWait-Date.now());
  dlTick=setTimeout(function(){dlPoll().then(dlSchedule,dlSchedule);},Math.max(wait,1000));
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
