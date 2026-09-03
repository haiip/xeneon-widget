/* ---------------- Enskild spelare ---------------- */

/* Förklaringar till siffrorna i spelarvyn. */
var STAT_HELP={
  'K / D / A':'Kills, deaths och assists — dödade fiender, egna dödsfall och assisterade dödar.',
  'KDA':'(Kills + assists) delat med deaths. Över 3 räknas som starkt.',
  'Souls / min':'Själar per minut. Måttet på hur snabbt du samlar resurser.',
  'Souls':'Totalt insamlade själar, spelets valuta för föremål.',
  'Last hits':'Antal trupper du gett dödsstöten och därmed fått själar för.',
  'Denies':'Egna trupper du nekat fienden själar från.',
  'Level':'Hjältens nivå vid matchens slut.',
  'Hero damage':'Total skada gjord mot fiendehjältar.',
  'Boss damage':'Skada mot Patron, Walkers och andra objektiv.',
  'Objective damage':'Skada mot torn och objektiv.',
  'Healing':'Läkning given till dig själv och lagkamrater.',
  'Damage taken':'Skada du tagit emot under matchen.',
  'Creep kills':'Dödade trupper.',
  'Neutrals':'Dödade neutrala läger.',
  'Level':'Hjältens nivå vid matchens slut.',
  'MVP rank':'Placering i matchens sammanställning. 1 är bäst.',
  'Lane':'Vilken lane du började i.',
  'Ability points':'Intjänade förmågepoäng. Fler än de tolv du kan lägga, eftersom de tjänas in per nivå.',
  'Power-ups':'Permanenta bonusar från krukor, Golden Idol och liknande.',
  'Max health':'Hjältens maximala liv vid matchens slut, inklusive köpta föremål.',
  'Self healing':'Läkning du gett dig själv.'
};
var PSTATS=[
  ['kills','Kills'],['deaths','Deaths'],['assists','Assists'],
  ['net_worth','Souls'],['last_hits','Last hits'],['denies','Denies'],
  ['level','Level'],['player_level','Level'],['mvp_rank','MVP rank'],
  ['assigned_lane','Lane'],['ability_points','Ability points'],
  ['player_damage','Hero damage'],['hero_damage','Hero damage'],
  ['boss_damage','Boss damage'],['objective_damage','Objective damage'],
  ['player_healing','Healing'],['hero_healing','Healing'],
  ['damage_taken','Damage taken'],['self_healing','Self healing'],
  ['creep_kills','Creep kills'],['neutral_kills','Neutrals'],
  ['max_health','Max health']
];
function fmtNum(v){
  if(v>=100000)return Math.round(v/1000).toLocaleString('en-US')+'k';
  return Number(v).toLocaleString('en-US');
}

/* Fördelningen mellan grenarna, som spelets tre staplar. */

/* Dubbelklick i spelarvyn listar varenda fält matchdatan har för spelaren. */
function playerDebug(p,host){
  var flat={};
  (function walk(o,path,depth){
    if(!o||typeof o!=='object'||depth>4)return;
    for(var k in o){
      var v=o[k];
      if(v===null||v===undefined)continue;
      if(typeof v==='object'){
        if(Array.isArray(v)){
          flat[path+k]='['+v.length+' poster]';
          v.slice(0,40).forEach(function(item,i){
            if(item&&typeof item==='object')walk(item,path+k+'['+i+'].',depth+1);
            else flat[path+k+'['+i+']']=item;
          });
        }else walk(v,path+k+'.',depth+1);
      }else flat[path+k]=v;
    }
  })(p,'',0);
  var box=document.createElement('div');
  box.style.cssText='position:absolute;inset:5%;z-index:12;overflow:auto;padding:1em 1.4em;'+
    'background:rgba(8,6,4,.98);border-radius:12px;border:1px solid rgba(232,184,114,.3);'+
    'font-family:Consolas,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap';
  var keys=Object.keys(flat).sort();
  box.textContent=keys.length?
    keys.map(function(k){return k+' = '+flat[k];}).join('\n')+
      '\n\n('+keys.length+' fält · klicka för att stänga)':
    'Inga fält hittades.';
  box.addEventListener('click',function(e){e.stopPropagation();this.remove();});
  host.appendChild(box);
}

function branchOf(it){
  var s=it.slot;
  if(s==='armor')return 'vitality';
  if(s==='tech')return 'spirit';
  if(s==='weapon'||s==='vitality'||s==='spirit')return s;
  return null;
}
function buildBranches(p,items){
  var sum={weapon:0,vitality:0,spirit:0},count={weapon:0,vitality:0,spirit:0},any=false;
  playerItems(p).forEach(function(id){
    var it=items[id];if(!it)return;
    var b=branchOf(it);if(!b)return;
    sum[b]+=it.cost||0;count[b]++;any=true;
  });
  if(!any)return null;
  var total=sum.weapon+sum.vitality+sum.spirit;
  var box=document.createElement('div');box.id='branches';
  var names={weapon:'Weapon',vitality:'Vitality',spirit:'Spirit'};
  ['weapon','vitality','spirit'].forEach(function(b){
    var row=document.createElement('div');row.className='branch '+b;
    var head=document.createElement('div');head.className='bhead';
    head.appendChild(Object.assign(document.createElement('span'),
      {className:'bname',textContent:names[b]}));
    head.appendChild(Object.assign(document.createElement('span'),
      {className:'bval',textContent:count[b]+(total?'  ·  '+Math.round(sum[b]/1000)+'k':'')}));
    row.appendChild(head);
    var track=document.createElement('div');track.className='btrack';
    var fill=document.createElement('div');fill.className='bfill';
    fill.style.width=(total?Math.round(sum[b]/total*100):0)+'%';
    track.appendChild(fill);row.appendChild(track);
    attachTip(row,names[b],
      count[b]+' föremål för '+sum[b].toLocaleString('en-US')+' själar'+
      (total?', '+Math.round(sum[b]/total*100)+' % av allt du köpte':''));
    box.appendChild(row);
  });
  return box;
}

function showPlayer(p,hero,team,items,dur){
  var box=el('player');
  var L=el('pLeft'),R=el('pRight');
  L.innerHTML='';R.innerHTML='';

  var back=document.createElement('button');back.id='pBack';back.textContent='← Back to the match';
  back.addEventListener('click',function(e){e.stopPropagation();box.classList.remove('on');});
  R.appendChild(back);

  var logo=document.createElement('img');logo.className='nameimg';
  logo.src='heroes/name/'+heroFile(hero.name)+'.svg';logo.alt=hero.name;
  logo.addEventListener('error',function(){
    var h=document.createElement('h2');h.textContent=hero.name;
    h.style.fontFamily="'Reaver',serif";h.style.fontSize='var(--artist)';this.replaceWith(h);});
  L.appendChild(logo);
  var who=String(p.account_id)===String(CFG.dl)?(CFG.nm||dlName||'you'):nameOf(p.account_id);
  var t=document.createElement('div');t.id='pTeam';
  t.textContent=team.name+(who?' · '+who:'');
  t.style.color=team.key==='king'?'#E8B872':'#9DC2F0';
  L.appendChild(t);
  /* porträtt → render → ikon, så ingen hjälte står tom */
  var art=document.createElement('img');art.className='render';art.alt='';
  var chain=['heroes/portrait/'+heroFile(hero.name)+'.png',
             'heroes/'+heroFile(hero.name)+'.png',
             'heroes/icon/'+heroFile(hero.name)+'.png'];
  var step=0;art.src=chain[0];
  art.addEventListener('error',function(){
    step++;
    if(step<chain.length)this.src=chain[step];else this.remove();
  });
  L.appendChild(art);

  var grid=document.createElement('div');grid.id='pStats';
  var seen={};
  function add(v,label){
    if(seen[label])return; seen[label]=1;
    var c=document.createElement('div');c.className='stat';
    c.appendChild(Object.assign(document.createElement('b'),{textContent:v}));
    c.appendChild(Object.assign(document.createElement('span'),{textContent:label}));
    attachTip(c,label,STAT_HELP[label]||'');
    grid.appendChild(c);
  }
  add((p.kills|0)+' / '+(p.deaths|0)+' / '+(p.assists|0),'K / D / A');
  add((((p.kills|0)+(p.assists|0))/Math.max(p.deaths|0,1)).toFixed(2),'KDA');
  var spm=soulsPerMin(p.net_worth,dur);
  if(spm)add(spm,'Souls / min');
  if(Array.isArray(p.power_up_buffs)&&p.power_up_buffs.length)
    add(p.power_up_buffs.length,'Power-ups');
  PSTATS.forEach(function(pair){
    var v=p[pair[0]];
    if(typeof v==='number'&&v>0&&pair[0]!=='kills'&&pair[0]!=='deaths'&&pair[0]!=='assists')
      add(fmtNum(v),pair[1]);
  });
  R.appendChild(grid);

  var br=buildBranches(p,items);
  if(br)R.appendChild(br);

  var kit=document.createElement('div');kit.id='pItems';
  playerItems(p).forEach(function(id){
    var it=items[id];if(!it)return;
    var shop=(it.type==='upgrade')||['weapon','vitality','spirit','armor','tech'].indexOf(it.slot)>=0;
    if(!shop)return;
    var cell=document.createElement('div');cell.className='bigitem';
    var im=document.createElement('img');im.decoding='async';im.alt='';
    im.src='items/'+itemFile(it.name)+'.png';
    im.addEventListener('error',function(){cell.remove();});
    cell.appendChild(im);
    cell.appendChild(Object.assign(document.createElement('span'),{textContent:it.name}));
    var body=tipText(it.raw)||'';
    if(it.cost)body=(body?body+'  ':'')+'('+it.cost+' själar)';
    attachTip(cell,it.name,body||'Föremål köpt under matchen.');
    kit.appendChild(cell);
  });
  R.appendChild(kit);
  box.addEventListener('dblclick',function(e){
    e.stopPropagation();
    if(!box.querySelector('[data-dbg]')){
      var before=box.childElementCount;
      playerDebug(p,box);
      var added=box.lastChild;if(added)added.dataset.dbg='1';
    }
  });
  box.classList.add('on');
}
