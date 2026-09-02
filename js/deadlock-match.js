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
                    cost:it.cost||it.item_tier||0};
  });
  return dlItems;
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
    var head=document.createElement('div');head.id='matchInfo';
    var mins=m.match_duration_s?Math.round(m.match_duration_s/60)+' min':'';
    var when=m.start_time?new Date(m.start_time*1000).toLocaleString('en-GB',
      {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    head.textContent='Match '+m.match_id+(mins?'  ·  '+mins:'')+(when?'  ·  '+when:'');
    el('dlDetail').insertBefore(head,el('teams'));
    TEAMS.forEach(function(t,ti){
      var col=document.createElement('div');col.className='team '+t.key;
      var h=document.createElement('h5');
      h.appendChild(Object.assign(document.createElement('div'),
        {className:'patron',style:'background-image:url(ui/patron-'+t.icon+'.png)'}));
      var mine=players.filter(function(p){return String(p.account_id)===String(CFG.dl);})[0];
      var won=mine&&teamOf(mine)===ti?dlWon(m):(mine?!dlWon(m):false);
      var ttl=document.createElement('img');ttl.className='ttl';
      ttl.src='ui/title-'+t.title+'.png';ttl.alt=t.name;
      ttl.addEventListener('error',function(){
        this.replaceWith(Object.assign(document.createElement('span'),{textContent:t.name}));});
      h.appendChild(ttl);
      if(mine){var res=document.createElement('span');res.className='tres '+(won?'w':'l');
        res.textContent=won?'Victory':'Defeat';h.appendChild(res);}
      col.appendChild(h);
      var topNW=players.reduce(function(a,b){return (b.net_worth||0)>(a.net_worth||0)?b:a;},players[0]);
      players.filter(function(p){return teamOf(p)===ti;}).forEach(function(p){
        var hero=heroes[p.hero_id]||{name:'Hero '+p.hero_id,img:''};
        var wrap=document.createElement('div');wrap.className='prow';
        if(String(p.account_id)===String(CFG.dl))wrap.className+=' me';
        wrap.appendChild(Object.assign(document.createElement('div'),
          {className:'rowbg',style:'background-image:url(heroes/bg/'+heroFile(hero.name)+'.jpg)'}));
        var row=document.createElement('div');row.className='row';
        row.appendChild(heroIcon(hero));
        var nm=document.createElement('span');nm.className='nm';
        nm.textContent=hero.name+(String(p.account_id)===String(CFG.dl)?' (you)':'');
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
          mv.title='Most souls in the match';row.appendChild(mv);
        }
        wrap.style.cursor='pointer';
        wrap.addEventListener('click',function(e){
          e.stopPropagation();
          showPlayer(p,hero,t,items,m.match_duration_s||
            (j.match_info&&j.match_info.duration_s)||j.duration_s);
        });
        wrap.appendChild(row);
        col.appendChild(wrap);
        var ids=playerItems(p);
        if(ids.length){
          var kit=document.createElement('div');kit.className='kit';
          ids.slice(-12).forEach(function(id){
            var it=items[id];
            if(!it)return;                        /* okänt id */
            var shop=(it.type==='upgrade')||
                     ['weapon','vitality','spirit','armor','tech'].indexOf(it.slot)>=0;
            if(!shop)return;                      /* hjälteförmågor hör inte hit */
            var ii=document.createElement('img');
            ii.decoding='async';
            ii.addEventListener('load',function(){this.classList.add('in');});
            ii.title=it.name;
            ii.src='items/'+itemFile(it.name)+'.png';
            /* saknas filen lokalt är det ingen shopvara — då ritas den inte alls */
            ii.addEventListener('error',function(){this.remove();});
            kit.appendChild(ii);
          });
          wrap.appendChild(kit);
        }
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
  if(!window.__heroOpen)el('listView').classList.remove('off');
}
el('dlBack').addEventListener('click',function(e){e.stopPropagation();closeMatch();});
el('dlRefresh').addEventListener('click',async function(e){
  e.stopPropagation();
  var b=this;b.classList.add('busy');b.textContent='…';
  dlPath=null;                                  /* prova alla varianter igen */
  await dlPoll();
  b.classList.remove('busy');b.textContent='Refresh';
});
