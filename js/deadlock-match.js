/* ---------------- Enskild match ---------------- */
var dlItems=null,dlByClass={};
async function dlLoadItems(){
  if(dlItems)return dlItems;
  var list=await dlJsonAny(['/v1/assets/items',
    'https://assets.deadlock-api.com/v1/items','https://assets.deadlock-api.com/v2/items']);
  var arr=Array.isArray(list)?list:(list&&(list.items||list.data))||[];
  dlItems={};
  arr.forEach(function(it){
    var img=it.image||it.shop_image_small||it.shop_image||'';
    var imgs=it.images||{};
    if(!img)for(var k in imgs){if(typeof imgs[k]==='string'&&/\.(png|webp|jpg)/i.test(imgs[k])){img=imgs[k];break;}}
    var slot=it.item_slot_type||it.slot_type||it.slot||'';
    if(it.class_name)dlByClass[it.class_name]={name:it.name||it.class_name,img:img,
        type:(it.type||'').toLowerCase(),raw:it};
    dlItems[it.id]={name:it.name||it.class_name||('Item '+it.id),img:img,
                    type:(it.type||'').toLowerCase(),slot:String(slot).toLowerCase(),
                    cost:it.cost||it.item_tier||0,
                    tier:it.item_tier||0,
                    active:!!(it.is_active_item||it.activation==='instant_cast'),
                    raw:it,desc:itemDesc(it)};
  });
  return dlItems;
}

/* ---- Föremålens förklaringstext ----
   Spelets strängar innehåller HTML och platshållare av typen {s:bonus_clip_size}
   som ska bytas mot värdet i properties. Utan raw-objektet fanns ingen text alls
   att visa, vilket var därför rutorna bara innehöll slot och pris. */
function itemProp(raw,key){
  var p=raw&&(raw.properties||raw.props||raw.property_values);
  if(!p)return null;
  var v=p[key];
  if(v===undefined||v===null)return null;
  if(typeof v==='number'||typeof v==='string')return String(v);
  if(typeof v!=='object')return null;
  var n=(v.value!==undefined&&v.value!==null)?v.value:
        (v.m_strValue!==undefined?v.m_strValue:null);
  if(n===undefined||n===null)return null;
  var post=String(v.postfix||v.postfix_type||v.units||'');
  if(/percent/i.test(post))post='%';
  else if(/second/i.test(post))post='s';
  else if(/meter/i.test(post))post='m';
  else post='';
  return String(n)+post;
}
function cleanDesc(html,raw){
  var s=String(html||'');
  s=s.replace(/\{s:([A-Za-z0-9_]+)[^}]*\}/g,function(m,key){
    var v=itemProp(raw,key);
    return v===null?'':v;
  });
  s=s.replace(/<\s*br\s*\/?>/gi,' ').replace(/<\/(p|li|div|h\d)>/gi,'  ·  ');
  s=s.replace(/<[^>]*>/g,'');
  s=s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
     .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,'\u2019');
  s=s.replace(/\s*·\s*(·\s*)+/g,'  ·  ').replace(/\s+/g,' ').trim();
  s=s.replace(/^[·\s]+|[·\s]+$/g,'').trim();
  return s;
}
function itemDesc(raw){
  if(!raw||typeof raw!=='object')return '';
  var d=raw.description||raw.desc||null,parts=[];
  if(typeof d==='string')parts.push(d);
  else if(d&&typeof d==='object')
    ['desc','innate','passive','active','conditional'].forEach(function(k){
      if(typeof d[k]==='string'&&d[k].trim())parts.push(d[k]);
    });
  var out=cleanDesc(parts.join('  ·  '),raw);
  if(!out)out=cleanDesc(tipText(raw),raw);   /* reserv: leta upp valfri beskrivning */
  if(out.length>340)out=out.slice(0,337).replace(/\s+\S*$/,'')+'…';
  return out;
}
/* Slot, pris och nivå som en egen rad under texten. */
function itemMeta(it){
  var m=[];
  if(it.slot)m.push(it.slot.charAt(0).toUpperCase()+it.slot.slice(1));
  if(it.tier)m.push('Tier '+it.tier);
  if(it.cost)m.push(it.cost.toLocaleString('en-US')+' souls');
  if(it.active)m.push('Active');
  return m.join('  ·  ');
}
function itemFile(name){
  return String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function playerItems(p){
  var raw=p.items||p.item_ids||[];               /* inte abilities — det är hjälteförmågor */
  if(!Array.isArray(raw))return [];
  return raw.filter(function(x){
    if(typeof x==='number')return true;
    return !x.sold_time_s&&!x.sold;              /* sålda föremål räknas inte */
  }).map(function(x){return typeof x==='number'?x:(x.item_id||x.id);})
   .filter(function(v,i,a){return v&&a.indexOf(v)===i;});
}

/* Lag 0 = The Hidden King (guld), lag 1 = The Archmother (blå).
   title = namnplåten, icon = symbolen. */
var TEAMS=[{key:'king',name:'The Hidden King',title:'hiddenking',icon:'hiddenking'},
           {key:'mother',name:'The Archmother',title:'archmother',icon:'archmother'}];
function dlPlayers(j){
  if(!j)return [];
  var cands=[j.players,j.match_info&&j.match_info.players,j.data&&j.data.players,
             j.data&&j.data.match_info&&j.data.match_info.players];
  for(var i=0;i<cands.length;i++)if(Array.isArray(cands[i])&&cands[i].length)return cands[i];
  return [];
}

/* Resultatlist överst: lagens summor, som i spelets egen vy. */
function teamTotals(players,ti){
  var t={kills:0,souls:0,dmg:0};
  players.filter(function(p){return teamOf(p)===ti;}).forEach(function(p){
    t.kills+=p.kills|0;
    t.souls+=p.net_worth|0;
    t.dmg+=(p.player_damage||p.hero_damage||p.damage_dealt||0);
  });
  return t;
}
function big(n){return n>=1000?Math.round(n/1000)+'K':String(Math.round(n));}
function buildScoreBar(players,m){
  var bar=el('scoreBar');bar.innerHTML='';
  var mine=players.filter(function(p){return String(p.account_id)===String(CFG.dl);})[0];
  function side(ti,right){
    var t=TEAMS[ti],d=document.createElement('div');
    d.className='sbSide'+(right?' right':'');
    d.appendChild(Object.assign(document.createElement('div'),
      {className:'patron',style:'background-image:url(ui/patron-'+t.icon+'.png)'}));
    var ttl=document.createElement('img');ttl.className='ttl';ttl.alt=t.name;
    ttl.src='ui/title-'+t.title+'.png';
    ttl.addEventListener('error',function(){
      this.replaceWith(Object.assign(document.createElement('span'),
        {className:'res',textContent:t.name}));});
    d.appendChild(ttl);
    if(mine){
      var won=teamOf(mine)===ti?dlWon(m):!dlWon(m);
      d.appendChild(Object.assign(document.createElement('span'),
        {className:'res '+(won?'w':'l'),textContent:won?'Victory':'Defeat'}));
    }
    return d;
  }
  function group(ti){
    var t=teamTotals(players,ti),g=document.createElement('div');g.className='sbGroup';
    [[String(t.kills),'Kills'],[big(t.souls),'Souls'],[big(t.dmg),'Damage']].forEach(function(pair){
      if(pair[0]==='0')return;
      var c=document.createElement('div');c.className='sbStat';
      c.appendChild(Object.assign(document.createElement('b'),{textContent:pair[0]}));
      c.appendChild(Object.assign(document.createElement('span'),{textContent:pair[1]}));
      g.appendChild(c);
    });
    return g;
  }
  bar.appendChild(side(0,false));
  var mid=document.createElement('div');mid.id='sbMid';
  mid.appendChild(group(0));mid.appendChild(group(1));
  bar.appendChild(mid);
  bar.appendChild(side(1,true));
}


function playerLabel(heroName,acct){
  var mine=String(acct)===String(CFG.dl);
  var n=mine?(CFG.nm||dlName||'you'):nameOf(acct);
  return n?heroName+' ('+n+')':heroName;
}
/* fyller i namnen när uppslagningen är klar */
function paintNames(){
  var nodes=document.querySelectorAll('#teams .nm[data-acct]');
  for(var i=0;i<nodes.length;i++){
    nodes[i].textContent=playerLabel(nodes[i].dataset.hero,nodes[i].dataset.acct);
  }
}

function teamOf(p){
  var t=p.team;
  if(typeof t!=='number')t=p.player_team;
  if(typeof t!=='number'&&typeof p.player_slot==='number')t=p.player_slot<6?0:1;
  return t===1?1:0;
}
function setDetailBg(url){
  var img=new Image();
  img.onload=function(){el('dlBg').style.backgroundImage='url('+url+')';};
  img.onerror=function(){el('dlBg').style.backgroundImage='url(ui/patrons-bg.jpg)';};
  img.src=url;
}
async function showMatch(m){
  document.body.classList.add('match');
  el('listView').classList.add('off');
  el('dlDetail').classList.add('on');
  var box=el('teams');
  box.innerHTML='<div id="dlMsg">Loading match '+m.match_id+'…</div>';
  try{
    var heroes=dlHeroes||{};
    var items={};
    try{items=await dlLoadItems();}catch(e){items={};}
    var mine0=heroes[m.hero_id];
    setDetailBg(mine0?'heroes/bg/'+heroFile(mine0.name)+'.jpg':'ui/patrons-bg.jpg');
    var j=await dlJsonAny(['/v1/matches/'+m.match_id+'/metadata','/v1/matches/'+m.match_id]);
    var players=dlPlayers(j);
    if(!players.length){box.innerHTML='<div id="dlMsg">No player data available for this match.</div>';return;}
    box.innerHTML='';
    buildScoreBar(players,m);
    var ids=players.map(function(p){return String(p.account_id||'');}).filter(Boolean);
    fetchNames(ids).then(function(){paintNames();});
    var head=document.createElement('div');head.id='matchInfo';
    var mins=m.match_duration_s?Math.round(m.match_duration_s/60)+' min':'';
    var when=m.start_time?new Date(m.start_time*1000).toLocaleString('en-GB',
      {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    head.textContent='Match '+m.match_id+(mins?'  ·  '+mins:'')+(when?'  ·  '+when:'');
    el('mHead').appendChild(head);
    TEAMS.forEach(function(t,ti){
      var col=document.createElement('div');col.className='team '+t.key;
      /* riktig MVP om matchdatan har det, annars flest själar */
      var mvp=players.filter(function(x){return Number(x.mvp_rank)===1;})[0]||null;
      var topNW=mvp||players.reduce(function(a,b){
        return (b.net_worth||0)>(a.net_worth||0)?b:a;},players[0]);
      var mvpReal=!!mvp;
      players.filter(function(p){return teamOf(p)===ti;})
        .sort(function(a,b){                       /* jag alltid överst */
          var am=String(a.account_id)===String(CFG.dl)?0:1;
          var bm=String(b.account_id)===String(CFG.dl)?0:1;
          return am-bm||(b.net_worth||0)-(a.net_worth||0);
        })
        .forEach(function(p){
        var hero=heroes[p.hero_id]||{name:'Hero '+p.hero_id,img:''};
        var wrap=document.createElement('div');wrap.className='prow';
        if(String(p.account_id)===String(CFG.dl))wrap.className+=' me';
        wrap.appendChild(Object.assign(document.createElement('div'),
          {className:'rowbg',style:'background-image:url(heroes/bg/'+heroFile(hero.name)+'.jpg)'}));

        /* hjältebilden står för sig och centreras i hela raden */
        var pic=heroIcon(hero,'phero');
        wrap.appendChild(pic);

        var main=document.createElement('div');main.className='pmain';
        var row=document.createElement('div');row.className='row';
        var nm=document.createElement('span');nm.className='nm';
        nm.dataset.acct=String(p.account_id||'');
        nm.dataset.hero=hero.name;
        nm.textContent=playerLabel(hero.name,p.account_id);
        row.appendChild(nm);
        var st=document.createElement('span');st.className='st';
        var dur=m.match_duration_s||j.match_duration_s||(j.match_info&&j.match_info.duration_s);
        var spm=soulsPerMin(p.net_worth,dur);
        st.textContent=(p.kills|0)+'/'+(p.deaths|0)+'/'+(p.assists|0)+
          (p.net_worth?'  ·  '+Math.round(p.net_worth/1000)+'k':'')+
          (spm?'  ·  '+spm+'/min':'');
        row.appendChild(st);
        if(p===topNW){
          var mv=document.createElement('img');mv.src='ui/mvp.png';mv.className='mvp';
          mv.title=mvpReal?'MVP':'Most souls in the match';row.appendChild(mv);
        }
        main.appendChild(row);
        var ids=playerItems(p);
        if(ids.length){
          var kit=document.createElement('div');kit.className='kit';
          ids.slice(-12).forEach(function(id){
            var it=items[id];
            if(!it)return;
            var shop=(it.type==='upgrade')||
                     ['weapon','vitality','spirit','armor','tech'].indexOf(it.slot)>=0;
            if(!shop)return;
            var ii=document.createElement('img');
            ii.decoding='async';
            ii.addEventListener('load',function(){this.classList.add('in');});
            ii.title=it.name;
            ii.src='items/'+itemFile(it.name)+'.png';
            ii.addEventListener('error',function(){this.remove();});
            kit.appendChild(ii);
          });
          main.appendChild(kit);
        }
        wrap.appendChild(main);
        wrap.style.cursor='pointer';
        wrap.addEventListener('click',function(e){
          e.stopPropagation();
          showPlayer(p,hero,t,items,m.match_duration_s||
            (j.match_info&&j.match_info.duration_s)||j.duration_s);
        });
        col.appendChild(wrap);
      });
      box.appendChild(col);
    });
  }catch(e){
    box.innerHTML='<div id="dlMsg">Could not load match details. ('+esc(e.message)+')</div>';
  }
}
function closeMatch(){
  el('player').classList.remove('on');
  document.body.classList.remove('match');
  var mi=document.getElementById('matchInfo');if(mi)mi.remove();
  el('dlDetail').classList.remove('on');
  if(!window.__heroOpen&&!window.__itemsOpen)el('listView').classList.remove('off');
}
el('dlBack').addEventListener('click',function(e){e.stopPropagation();closeMatch();});
el('dlRefresh').addEventListener('click',async function(e){
  e.stopPropagation();
  var b=this;b.classList.add('busy');b.textContent='…';
  dlPath=null;                                  /* prova alla varianter igen */
  await dlPoll(true);                           /* knappen får kosta ett force_refetch */
  b.classList.remove('busy');b.textContent='Refresh';
});
