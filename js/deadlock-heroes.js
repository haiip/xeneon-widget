/* ---------------- Hjältelistan ---------------- */
var heroOpen=false;
function heroSlug(n){return heroFile(n);}
async function showHeroes(on){
  heroOpen=!!on; window.__heroOpen=heroOpen;
  el('heroes').classList.toggle('on',heroOpen);
  el('listView').classList.toggle('off',heroOpen);
  el('heroBtn').textContent=heroOpen?'Matches':'Heroes';
  if(!heroOpen){el('heroSum').classList.remove('on');return;}
  closeMatch();
  var grid=el('heroGrid');
  if(grid.childElementCount)return;
  var heroes={};
  try{heroes=await dlLoadHeroes();}catch(e){}
  var list=Object.keys(heroes).map(function(id){return heroes[id];})
    .filter(function(h){return h.playable!==false;});
  if(!list.length){grid.textContent='Could not load the hero list.';return;}
  list.sort(function(a,b){return a.name.localeCompare(b.name);});
  list.forEach(function(h){
    var slug=heroSlug(h.name);
    var cell=document.createElement('div');cell.className='hcell';

    var nm=document.createElement('img');nm.className='nm';nm.alt=h.name;
    nm.src='heroes/name/'+slug+'.svg';
    nm.addEventListener('error',function(){
      this.replaceWith(Object.assign(document.createElement('div'),
        {className:'nmtext',textContent:h.name}));});
    cell.appendChild(nm);

    var por=document.createElement('img');por.className='port';por.alt='';por.decoding='async';
    por.src='heroes/portrait/'+slug+'.png';
    por.addEventListener('error',function(){
      this.src='heroes/'+slug+'.png';
      this.addEventListener('error',function(){cell.remove();});});
    cell.appendChild(por);

    var src=statSource(h);
    var dps=pickStat(src,['dps','damage_per_second','weapon_dps']);
    if(dps===null){
      var cyc=pickStat(src,['cycle_time','fire_rate_cycle_time','time_between_shots']);
      var dmg=pickStat(src,['bullet_damage','damage']);
      var pel=pickStat(src,['bullets_per_shot','pellets'])||1;
      if(cyc&&dmg)dps=Math.round(dmg*pel/cyc);
    }
    if(dps!==null){
      var d=document.createElement('div');d.className='dps';
      d.innerHTML='<b>'+Math.round(dps)+'</b>Damage Per Second';
      cell.appendChild(d);
    }

    cell.addEventListener('click',function(e){e.stopPropagation();showHeroSheet(h);});
    grid.appendChild(cell);
  });
}

function heroAbilities(h){
  var raw=h.raw||{},out=[];
  var slots=raw.items||raw.abilities||raw.ability_slots||{};
  var vals=Array.isArray(slots)?slots:Object.keys(slots).map(function(k){return slots[k];});
  vals.forEach(function(v){
    if(typeof v==='string'){
      var a=dlByClass[v];
      /* hoppa över interna namn utan riktig titel */
      if(a&&a.name&&a.name.indexOf('citadel_')!==0&&out.length<4)out.push(a);
    }else if(v&&v.name&&out.length<4){
      out.push({name:v.name,img:v.image||(v.images&&v.images.icon)||''});
    }
  });
  return out;
}

/* ---- statistikkortet byggs av API:ets siffror, inte av en bild ---- */
var SLABEL={
  max_health:'Health',health_regen:'Health regen',bullet_armor:'Bullet resist',
  bullet_resist:'Bullet resist',spirit_armor:'Spirit resist',spirit_resist:'Spirit resist',
  max_move_speed:'Move speed',sprint_speed:'Sprint speed',crouch_speed:'Crouch speed',
  stamina:'Stamina',stamina_cooldown:'Stamina cooldown',stamina_regen_per_second:'Stamina regen',
  light_melee_damage:'Light melee',heavy_melee_damage:'Heavy melee',
  weapon_power:'Weapon power',tech_power:'Spirit power',tech_range:'Spirit range',
  tech_duration:'Spirit duration',tech_cooldown:'Spirit cooldown',
  dps:'Damage per second',bullet_damage:'Bullet damage',ammo:'Ammo',clip_size:'Ammo',
  bullets_per_second:'Bullets per sec',reload_time:'Reload time',
  bullet_speed:'Bullet velocity',bullets_per_shot:'Pellets per shot',
  reload_speed:'Reload speed',fire_rate:'Fire rate',
  headshot_bonus:'Headshot bonus',falloff_start_range:'Falloff start',
  falloff_end_range:'Falloff end'
};

/* Ordning, etikett, ikon och tänkbara fältnamn — som i spelets eget kort. */
var SROWS={
 weapon:[
  ['Damage Per Second','damage_per_second',['dps','damage_per_second','weapon_dps']],
  ['Bullet Damage','bullet_damage',['bullet_damage','damage']],
  ['Pellets per shot','pellets_per_shot',['bullets_per_shot','pellets']],
  ['Ammo','ammo',['clip_size','ammo','max_ammo']],
  ['Bullets per sec','damage_per_second',['bullets_per_second','fire_rate']],
  ['Reload Time','reload_time',['reload_time','reload_duration']],
  ['Bullet Velocity','bullet_velocity',['bullet_speed','bullet_velocity']],
  ['Light Melee','light_melee',['light_melee_damage','light_melee']],
  ['Heavy Melee','heavy_melee',['heavy_melee_damage','heavy_melee']]
 ],
 vitality:[
  ['Health','health',['max_health','health']],
  ['Health Regen','health_regen',['health_regen','health_regeneration','base_health_regen']],
  ['Bullet Resist','health',['bullet_armor','bullet_resist','bullet_armor_damage_reduction',
        'bullet_resist_percent','base_bullet_resist']],
  ['Spirit Resist','health',['spirit_armor','spirit_resist','tech_armor','tech_resist',
        'tech_armor_damage_reduction','spirit_resist_percent']],
  ['Move Speed','move_speed',['max_move_speed','move_speed']],
  ['Sprint Speed','sprint_speed',['sprint_speed']],
  ['Dash Speed','dash_speed',['dash_speed','air_dash_speed','dash_distance','slide_speed']],
  ['Stamina','stamina',['stamina']],
  ['Stamina Cooldown','stamina_cooldown',['stamina_cooldown','stamina_regen_per_second']]
 ],
 spirit:[
  ['Spirit Power','spirit_power',['tech_power','spirit_power','base_tech_power','tech_damage']]
 ]
};
/* Letar igenom hela objektträdet efter första fältet som matchar. */
function deepFind(obj,keys,depth){
  if(!obj||typeof obj!=='object'||(depth||0)>4)return null;
  for(var i=0;i<keys.length;i++){
    if(keys[i] in obj){
      var v=statVal(obj[keys[i]]);
      if(v!==null&&v!==''&&!isNaN(Number(v)))return Number(v);
      if(v!==null&&v!=='')return v;
    }
  }
  var ks=Object.keys(obj);
  for(var j=0;j<ks.length;j++){
    var child=obj[ks[j]];
    if(child&&typeof child==='object'){
      var hit=deepFind(child,keys,(depth||0)+1);
      if(hit!==null)return hit;
    }
  }
  return null;
}
function weaponRaw(h){
  var raw=h.raw||{},items=raw.items||{};
  var cls=items.weapon_primary||items.weapon||items.primary_weapon;
  if(typeof cls==='string'&&dlByClass[cls])return dlByClass[cls].raw||null;
  return raw.weapon_primary||raw.weapon||null;
}
function pickStat(srcs,keys){
  for(var i=0;i<srcs.length;i++){
    var v=deepFind(srcs[i],keys);
    if(v!==null)return v;
  }
  return null;
}
function round(v,n){var p=Math.pow(10,n||2);return Math.round(v*p)/p;}
/* hjältens egen färg plockas ur bakgrundsbilden */
function tintFrom(url,el){
  var im=new Image();
  im.onload=function(){
    try{
      var c=document.createElement('canvas');c.width=c.height=10;
      var x=c.getContext('2d');x.drawImage(im,0,0,10,10);
      var d=x.getImageData(0,0,10,10).data,best=[90,58,32],sat=-1;
      for(var i=0;i<d.length;i+=4){
        var r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
        if(mx<30||mx>250)continue;
        var s2=mx-mn;
        if(s2>sat){sat=s2;best=[r,g,b];}
      }
      el.style.setProperty('--hcol','rgb('+best.join(',')+')');
    }catch(e){}
  };
  im.src=url;
}
function statGroup(key){
  if(/health|regen|resist|armor|speed|stamina|melee/.test(key))return 'vitality';
  if(/tech|spirit/.test(key))return 'spirit';
  return 'weapon';
}
function statVal(v){
  if(v&&typeof v==='object')v=('value' in v)?v.value:(v.display_value||v.base||null);
  if(v===null||v===undefined||typeof v==='object')return null;
  if(typeof v==='number')return Math.round(v*100)/100;
  return v;
}
function statSource(h){
  var raw=h.raw||{},w=weaponRaw(h);
  var wi=w&&(w.weapon_info||w.weapon_stats||w);
  return [raw.starting_stats,raw.stats,raw.hero_stats,raw.base_stats,wi,raw].filter(Boolean);
}
function collectStats(h){
  var raw=h.raw||{},src={};
  [raw.starting_stats,raw.stats,raw.hero_stats,raw.weapon_stats,raw.base_stats].forEach(function(o){
    if(o&&typeof o==='object')Object.keys(o).forEach(function(k){if(!(k in src))src[k]=o[k];});
  });
  var groups={weapon:[],vitality:[],spirit:[]};
  Object.keys(src).forEach(function(k){
    var v=statVal(src[k]);
    if(v===null||v==='')return;
    var label=SLABEL[k]||k.replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase();});
    groups[statGroup(k)].push([label,v]);
  });
  return groups;
}

async function showHeroSheet(h){
  var box=el('heroSum');box.innerHTML='';
  el('heroGrid').style.display='none';
  try{await dlLoadItems();}catch(e){}
  var slug=heroSlug(h.name);

  box.appendChild(Object.assign(document.createElement('div'),
    {id:'hBackdrop',style:'background-image:url(heroes/bg/'+slug+'.jpg)'}));

  var back=document.createElement('button');back.id='heroBack';back.textContent='← All heroes';
  back.addEventListener('click',function(e){e.stopPropagation();
    box.classList.remove('on');el('heroGrid').style.display='';});
  box.appendChild(back);

  var card=document.createElement('div');card.id='hCard';

  var logo=document.createElement('img');logo.className='nameimg';
  logo.src='heroes/name/'+slug+'.svg';logo.alt=h.name;
  logo.addEventListener('error',function(){
    var t=document.createElement('h2');t.textContent=h.name;
    t.style.cssText="font-family:'Reaver',serif;font-size:var(--artist);text-align:center;margin:.4em 0";
    this.replaceWith(t);});
  card.appendChild(logo);

  var por=document.createElement('div');por.id='hPortrait';
  por.appendChild(Object.assign(document.createElement('div'),
    {className:'bg',style:'background-image:url(heroes/bg/'+slug+'.jpg)'}));
  var render=document.createElement('img');render.className='render';
  render.src='heroes/portrait/'+slug+'.png';render.alt='';
  render.addEventListener('error',function(){
    this.src='heroes/'+slug+'.png';
    this.addEventListener('error',function(){this.remove();});});
  por.appendChild(render);
  card.appendChild(por);

  var ab=heroAbilities(h);
  if(ab.length){
    var sk=document.createElement('div');sk.id='hSkills';
    ab.forEach(function(a){
      var row=document.createElement('div');row.className='skill';
      if(a.img){var im=document.createElement('img');im.src=a.img;im.alt='';im.decoding='async';
        im.addEventListener('error',function(){this.remove();});row.appendChild(im);}
      row.appendChild(Object.assign(document.createElement('span'),{textContent:a.name}));
      sk.appendChild(row);
    });
    card.appendChild(sk);
  }

  var src=statSource(h),wrap=document.createElement('div');wrap.id='hStats';
  var titles={weapon:'Weapon Stats',vitality:'Vitality Stats',spirit:'Spirit Stats'};
  ['weapon','vitality','spirit'].forEach(function(g){
    var col=document.createElement('div');col.className='sgroup '+g;
    col.appendChild(Object.assign(document.createElement('h4'),{textContent:titles[g]}));
    var n=0;
    SROWS[g].forEach(function(def){
      var v=pickStat(src,def[2]);
      if(v===null&&g==='weapon'){
        var cyc=pickStat(src,['cycle_time','fire_rate_cycle_time','time_between_shots']);
        var dmg=pickStat(src,['bullet_damage','damage']);
        var pel=pickStat(src,['bullets_per_shot','pellets'])||1;
        if(def[0]==='Bullets per sec'&&cyc)v=round(1/cyc,2);
        if(def[0]==='Damage Per Second'&&cyc&&dmg)v=round(dmg*pel/cyc,1);
      }
      /* Spirit Power visas alltid, som i spelet, även när den är noll */
      if(v===null&&def[0]==='Spirit Power')v=0;
      if(v===null)return;
      if(typeof v==='number'){
        if(def[0]==='Bullet Velocity'&&v>2000)v=Math.round(v/25.86);
        v=round(v,2);
      }
      n++;
      var r=document.createElement('div');r.className='srow';
      r.appendChild(Object.assign(document.createElement('span'),{className:'k',textContent:def[0]}));
      var ic=document.createElement('img');ic.className='ico';ic.alt='';
      ic.src='stats/'+def[1]+'.png';
      ic.addEventListener('error',function(){this.remove();});
      r.appendChild(ic);
      r.appendChild(Object.assign(document.createElement('span'),{className:'v',textContent:v}));
      col.appendChild(r);
    });
    if(n)wrap.appendChild(col);
  });
  card.appendChild(wrap);

  /* dubbelklick listar alla fältnamn API:et har för hjälten */
  card.addEventListener('dblclick',function(e){
    e.stopPropagation();
    var keys={};
    statSource(h).forEach(function(o){
      if(o&&typeof o==='object')Object.keys(o).forEach(function(k){
        var v=statVal(o[k]); if(v!==null&&typeof v!=='object')keys[k]=v;});
    });
    var dbg=document.createElement('div');
    dbg.style.cssText='position:absolute;inset:6%;z-index:9;overflow:auto;padding:1em;'+
      'background:rgba(8,6,4,.97);border-radius:12px;font-size:13px;line-height:1.5;'+
      'font-family:Consolas,monospace;white-space:pre-wrap';
    dbg.textContent=Object.keys(keys).sort().map(function(k){return k+' = '+keys[k];}).join('\n')
      ||'Inga fält hittades.';
    dbg.addEventListener('click',function(){this.remove();});
    box.appendChild(dbg);
  });

  box.appendChild(card);
  box.classList.add('on');
}
el('heroBtn').addEventListener('click',function(e){e.stopPropagation();showHeroes(!heroOpen);});
/* ---------------- Hjältelistan ---------------- */
var heroOpen=false;
function heroSlug(n){return heroFile(n);}
async function showHeroes(on){
  heroOpen=!!on; window.__heroOpen=heroOpen;
  el('heroes').classList.toggle('on',heroOpen);
  el('listView').classList.toggle('off',heroOpen);
  el('heroBtn').textContent=heroOpen?'Matches':'Heroes';
  if(!heroOpen){el('heroSum').classList.remove('on');return;}
  closeMatch();
  var grid=el('heroGrid');
  if(grid.childElementCount)return;
  var heroes={};
  try{heroes=await dlLoadHeroes();}catch(e){}
  var list=Object.keys(heroes).map(function(id){return heroes[id];})
    .filter(function(h){return h.playable!==false;});
  if(!list.length){grid.textContent='Could not load the hero list.';return;}
  list.sort(function(a,b){return a.name.localeCompare(b.name);});
  list.forEach(function(h){
    var slug=heroSlug(h.name);
    var cell=document.createElement('div');cell.className='hcell';

    var nm=document.createElement('img');nm.className='nm';nm.alt=h.name;
    nm.src='heroes/name/'+slug+'.svg';
    nm.addEventListener('error',function(){
      this.replaceWith(Object.assign(document.createElement('div'),
        {className:'nmtext',textContent:h.name}));});
    cell.appendChild(nm);

    var por=document.createElement('img');por.className='port';por.alt='';por.decoding='async';
    por.src='heroes/portrait/'+slug+'.png';
    por.addEventListener('error',function(){
      this.src='heroes/'+slug+'.png';
      this.addEventListener('error',function(){cell.remove();});});
    cell.appendChild(por);

    var src=statSource(h);
    var dps=pickStat(src,['dps','damage_per_second','weapon_dps']);
    if(dps===null){
      var cyc=pickStat(src,['cycle_time','fire_rate_cycle_time','time_between_shots']);
      var dmg=pickStat(src,['bullet_damage','damage']);
      var pel=pickStat(src,['bullets_per_shot','pellets'])||1;
      if(cyc&&dmg)dps=Math.round(dmg*pel/cyc);
    }
    if(dps!==null){
      var d=document.createElement('div');d.className='dps';
      d.innerHTML='<b>'+Math.round(dps)+'</b>Damage Per Second';
      cell.appendChild(d);
    }

    cell.addEventListener('click',function(e){e.stopPropagation();showHeroSheet(h);});
    grid.appendChild(cell);
  });
}

function heroAbilities(h){
  var raw=h.raw||{},out=[];
  var slots=raw.items||raw.abilities||raw.ability_slots||{};
  var vals=Array.isArray(slots)?slots:Object.keys(slots).map(function(k){return slots[k];});
  vals.forEach(function(v){
    if(typeof v==='string'){
      var a=dlByClass[v];
      /* hoppa över interna namn utan riktig titel */
      if(a&&a.name&&a.name.indexOf('citadel_')!==0&&out.length<4)out.push(a);
    }else if(v&&v.name&&out.length<4){
      out.push({name:v.name,img:v.image||(v.images&&v.images.icon)||''});
    }
  });
  return out;
}

/* ---- statistikkortet byggs av API:ets siffror, inte av en bild ---- */
var SLABEL={
  max_health:'Health',health_regen:'Health regen',bullet_armor:'Bullet resist',
  bullet_resist:'Bullet resist',spirit_armor:'Spirit resist',spirit_resist:'Spirit resist',
  max_move_speed:'Move speed',sprint_speed:'Sprint speed',crouch_speed:'Crouch speed',
  stamina:'Stamina',stamina_cooldown:'Stamina cooldown',stamina_regen_per_second:'Stamina regen',
  light_melee_damage:'Light melee',heavy_melee_damage:'Heavy melee',
  weapon_power:'Weapon power',tech_power:'Spirit power',tech_range:'Spirit range',
  tech_duration:'Spirit duration',tech_cooldown:'Spirit cooldown',
  dps:'Damage per second',bullet_damage:'Bullet damage',ammo:'Ammo',clip_size:'Ammo',
  bullets_per_second:'Bullets per sec',reload_time:'Reload time',
  bullet_speed:'Bullet velocity',bullets_per_shot:'Pellets per shot',
  reload_speed:'Reload speed',fire_rate:'Fire rate',
  headshot_bonus:'Headshot bonus',falloff_start_range:'Falloff start',
  falloff_end_range:'Falloff end'
};

/* Ordning, etikett, ikon och tänkbara fältnamn — som i spelets eget kort. */
var SROWS={
 weapon:[
  ['Damage Per Second','damage_per_second',['dps','damage_per_second','weapon_dps']],
  ['Bullet Damage','bullet_damage',['bullet_damage','damage']],
  ['Pellets per shot','pellets_per_shot',['bullets_per_shot','pellets']],
  ['Ammo','ammo',['clip_size','ammo','max_ammo']],
  ['Bullets per sec','damage_per_second',['bullets_per_second','fire_rate']],
  ['Reload Time','reload_time',['reload_time','reload_duration']],
  ['Bullet Velocity','bullet_velocity',['bullet_speed','bullet_velocity']],
  ['Light Melee','light_melee',['light_melee_damage','light_melee']],
  ['Heavy Melee','heavy_melee',['heavy_melee_damage','heavy_melee']]
 ],
 vitality:[
  ['Health','health',['max_health','health']],
  ['Health Regen','health_regen',['health_regen','health_regeneration','base_health_regen']],
  ['Bullet Resist','health',['bullet_armor','bullet_resist','bullet_armor_damage_reduction',
        'bullet_resist_percent','base_bullet_resist']],
  ['Spirit Resist','health',['spirit_armor','spirit_resist','tech_armor','tech_resist',
        'tech_armor_damage_reduction','spirit_resist_percent']],
  ['Move Speed','move_speed',['max_move_speed','move_speed']],
  ['Sprint Speed','sprint_speed',['sprint_speed']],
  ['Dash Speed','dash_speed',['dash_speed','air_dash_speed','dash_distance','slide_speed']],
  ['Stamina','stamina',['stamina']],
  ['Stamina Cooldown','stamina_cooldown',['stamina_cooldown','stamina_regen_per_second']]
 ],
 spirit:[
  ['Spirit Power','spirit_power',['tech_power','spirit_power','base_tech_power','tech_damage']]
 ]
};
/* Letar igenom hela objektträdet efter första fältet som matchar. */
function deepFind(obj,keys,depth){
  if(!obj||typeof obj!=='object'||(depth||0)>4)return null;
  for(var i=0;i<keys.length;i++){
    if(keys[i] in obj){
      var v=statVal(obj[keys[i]]);
      if(v!==null&&v!==''&&!isNaN(Number(v)))return Number(v);
      if(v!==null&&v!=='')return v;
    }
  }
  var ks=Object.keys(obj);
  for(var j=0;j<ks.length;j++){
    var child=obj[ks[j]];
    if(child&&typeof child==='object'){
      var hit=deepFind(child,keys,(depth||0)+1);
      if(hit!==null)return hit;
    }
  }
  return null;
}
function weaponRaw(h){
  var raw=h.raw||{},items=raw.items||{};
  var cls=items.weapon_primary||items.weapon||items.primary_weapon;
  if(typeof cls==='string'&&dlByClass[cls])return dlByClass[cls].raw||null;
  return raw.weapon_primary||raw.weapon||null;
}
function pickStat(srcs,keys){
  for(var i=0;i<srcs.length;i++){
    var v=deepFind(srcs[i],keys);
    if(v!==null)return v;
  }
  return null;
}
function round(v,n){var p=Math.pow(10,n||2);return Math.round(v*p)/p;}
/* hjältens egen färg plockas ur bakgrundsbilden */
function tintFrom(url,el){
  var im=new Image();
  im.onload=function(){
    try{
      var c=document.createElement('canvas');c.width=c.height=10;
      var x=c.getContext('2d');x.drawImage(im,0,0,10,10);
      var d=x.getImageData(0,0,10,10).data,best=[90,58,32],sat=-1;
      for(var i=0;i<d.length;i+=4){
        var r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
        if(mx<30||mx>250)continue;
        var s2=mx-mn;
        if(s2>sat){sat=s2;best=[r,g,b];}
      }
      el.style.setProperty('--hcol','rgb('+best.join(',')+')');
    }catch(e){}
  };
  im.src=url;
}
function statGroup(key){
  if(/health|regen|resist|armor|speed|stamina|melee/.test(key))return 'vitality';
  if(/tech|spirit/.test(key))return 'spirit';
  return 'weapon';
}
function statVal(v){
  if(v&&typeof v==='object')v=('value' in v)?v.value:(v.display_value||v.base||null);
  if(v===null||v===undefined||typeof v==='object')return null;
  if(typeof v==='number')return Math.round(v*100)/100;
  return v;
}
function statSource(h){
  var raw=h.raw||{},w=weaponRaw(h);
  var wi=w&&(w.weapon_info||w.weapon_stats||w);
  return [raw.starting_stats,raw.stats,raw.hero_stats,raw.base_stats,wi,raw].filter(Boolean);
}
function collectStats(h){
  var raw=h.raw||{},src={};
  [raw.starting_stats,raw.stats,raw.hero_stats,raw.weapon_stats,raw.base_stats].forEach(function(o){
    if(o&&typeof o==='object')Object.keys(o).forEach(function(k){if(!(k in src))src[k]=o[k];});
  });
  var groups={weapon:[],vitality:[],spirit:[]};
  Object.keys(src).forEach(function(k){
    var v=statVal(src[k]);
    if(v===null||v==='')return;
    var label=SLABEL[k]||k.replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase();});
    groups[statGroup(k)].push([label,v]);
  });
  return groups;
}

async function showHeroSheet(h){
  var box=el('heroSum');box.innerHTML='';
  el('heroGrid').style.display='none';
  try{await dlLoadItems();}catch(e){}
  var slug=heroSlug(h.name);

  box.appendChild(Object.assign(document.createElement('div'),
    {id:'hBackdrop',style:'background-image:url(heroes/bg/'+slug+'.jpg)'}));

  var back=document.createElement('button');back.id='heroBack';back.textContent='← All heroes';
  back.addEventListener('click',function(e){e.stopPropagation();
    box.classList.remove('on');el('heroGrid').style.display='';});
  box.appendChild(back);

  var card=document.createElement('div');card.id='hCard';

  var logo=document.createElement('img');logo.className='nameimg';
  logo.src='heroes/name/'+slug+'.svg';logo.alt=h.name;
  logo.addEventListener('error',function(){
    var t=document.createElement('h2');t.textContent=h.name;
    t.style.cssText="font-family:'Reaver',serif;font-size:var(--artist);text-align:center;margin:.4em 0";
    this.replaceWith(t);});
  card.appendChild(logo);

  var por=document.createElement('div');por.id='hPortrait';
  por.appendChild(Object.assign(document.createElement('div'),
    {className:'bg',style:'background-image:url(heroes/bg/'+slug+'.jpg)'}));
  var render=document.createElement('img');render.className='render';
  render.src='heroes/portrait/'+slug+'.png';render.alt='';
  render.addEventListener('error',function(){
    this.src='heroes/'+slug+'.png';
    this.addEventListener('error',function(){this.remove();});});
  por.appendChild(render);
  card.appendChild(por);

  var ab=heroAbilities(h);
  if(ab.length){
    var sk=document.createElement('div');sk.id='hSkills';
    ab.forEach(function(a){
      var row=document.createElement('div');row.className='skill';
      if(a.img){var im=document.createElement('img');im.src=a.img;im.alt='';im.decoding='async';
        im.addEventListener('error',function(){this.remove();});row.appendChild(im);}
      row.appendChild(Object.assign(document.createElement('span'),{textContent:a.name}));
      sk.appendChild(row);
    });
    card.appendChild(sk);
  }

  var src=statSource(h),wrap=document.createElement('div');wrap.id='hStats';
  var titles={weapon:'Weapon Stats',vitality:'Vitality Stats',spirit:'Spirit Stats'};
  ['weapon','vitality','spirit'].forEach(function(g){
    var col=document.createElement('div');col.className='sgroup '+g;
    col.appendChild(Object.assign(document.createElement('h4'),{textContent:titles[g]}));
    var n=0;
    SROWS[g].forEach(function(def){
      var v=pickStat(src,def[2]);
      if(v===null&&g==='weapon'){
        var cyc=pickStat(src,['cycle_time','fire_rate_cycle_time','time_between_shots']);
        var dmg=pickStat(src,['bullet_damage','damage']);
        var pel=pickStat(src,['bullets_per_shot','pellets'])||1;
        if(def[0]==='Bullets per sec'&&cyc)v=round(1/cyc,2);
        if(def[0]==='Damage Per Second'&&cyc&&dmg)v=round(dmg*pel/cyc,1);
      }
      /* Spirit Power visas alltid, som i spelet, även när den är noll */
      if(v===null&&def[0]==='Spirit Power')v=0;
      if(v===null)return;
      if(typeof v==='number'){
        if(def[0]==='Bullet Velocity'&&v>2000)v=Math.round(v/25.86);
        v=round(v,2);
      }
      n++;
      var r=document.createElement('div');r.className='srow';
      r.appendChild(Object.assign(document.createElement('span'),{className:'k',textContent:def[0]}));
      var ic=document.createElement('img');ic.className='ico';ic.alt='';
      ic.src='stats/'+def[1]+'.png';
      ic.addEventListener('error',function(){this.remove();});
      r.appendChild(ic);
      r.appendChild(Object.assign(document.createElement('span'),{className:'v',textContent:v}));
      col.appendChild(r);
    });
    if(n)wrap.appendChild(col);
  });
  card.appendChild(wrap);

  /* dubbelklick listar alla fältnamn API:et har för hjälten */
  card.addEventListener('dblclick',function(e){
    e.stopPropagation();
    var keys={};
    statSource(h).forEach(function(o){
      if(o&&typeof o==='object')Object.keys(o).forEach(function(k){
        var v=statVal(o[k]); if(v!==null&&typeof v!=='object')keys[k]=v;});
    });
    var dbg=document.createElement('div');
    dbg.style.cssText='position:absolute;inset:6%;z-index:9;overflow:auto;padding:1em;'+
      'background:rgba(8,6,4,.97);border-radius:12px;font-size:13px;line-height:1.5;'+
      'font-family:Consolas,monospace;white-space:pre-wrap';
    dbg.textContent=Object.keys(keys).sort().map(function(k){return k+' = '+keys[k];}).join('\n')
      ||'Inga fält hittades.';
    dbg.addEventListener('click',function(){this.remove();});
    box.appendChild(dbg);
  });

  box.appendChild(card);
  box.classList.add('on');
}
el('heroBtn').addEventListener('click',function(e){e.stopPropagation();showHeroes(!heroOpen);});
