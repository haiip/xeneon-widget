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
  'Max health':'Hjältens maximala liv vid matchens slut, inklusive köpta föremål.',
  'Self healing':'Läkning du gett dig själv.'
};
var PSTATS=[
  ['kills','Kills'],['deaths','Deaths'],['assists','Assists'],
  ['net_worth','Souls'],['last_hits','Last hits'],['denies','Denies'],
  ['player_level','Level'],['level','Level'],
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
  PSTATS.forEach(function(pair){
    var v=p[pair[0]];
    if(typeof v==='number'&&v>0&&pair[0]!=='kills'&&pair[0]!=='deaths'&&pair[0]!=='assists')
      add(fmtNum(v),pair[1]);
  });
  R.appendChild(grid);

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
  box.classList.add('on');
}
