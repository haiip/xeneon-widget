var mem={};
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);return v;}
  catch(e){if(v===undefined)return mem[k]||null;mem[k]=v;return v;}}
var qs=new URLSearchParams(location.search);
var CFG={cid:qs.get('cid')||ls('xe_cid')||'', rt:qs.get('rt')||ls('xe_rt')||'',
  guild:qs.get('guild')||ls('xe_guild')||'', dl:qs.get('dl')||ls('xe_dl')||'', nm:qs.get('nm')||ls('xe_nm')||'', wx:qs.get('wx')||ls('xe_wx')||'', back:parseInt(qs.get('back')||ls('xe_back')||'0',10)||0};
var REDIRECT=location.origin+location.pathname;
var SCOPES='user-read-playback-state user-modify-playback-state user-read-currently-playing';
var el=function(id){return document.getElementById(id);};
function esc(s){return String(s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

/* Kort spärr efter vyväxling, så samma tryck inte går vidare till nästa vy. */
var uiLock=0;
function lockUI(ms){uiLock=Date.now()+(ms||650);}
function uiLocked(){return Date.now()<uiLock;}

/* ---- Tooltip som fungerar med både mus och touch ---- */
var tipHideTimer=null;
function tipText(o){
  /* letar igenom hela objektet efter en riktig beskrivning */
  if(!o||typeof o!=='object')return '';
  var best='',bestScore=-1;
  (function walk(node,keyPath,depth){
    if(!node||depth>4)return;
    if(typeof node==='string'){
      var txt=stripTags(node);
      if(txt.length<12||txt.indexOf(' ')<0)return;
      var score=txt.length;
      if(/desc/i.test(keyPath))score+=400;
      if(/tooltip/i.test(keyPath))score+=250;
      if(/flavor|lore/i.test(keyPath))score+=60;
      if(/name|class|image|url|icon|path/i.test(keyPath))score-=500;
      if(score>bestScore){bestScore=score;best=txt;}
      return;
    }
    if(typeof node!=='object')return;
    for(var k in node)walk(node[k],keyPath+'.'+k,depth+1);
  })(o,'',0);
  return best;
}
function stripTags(s){
  return String(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function showTip(target,title,body){
  var t=el('tip');if(!t)return;
  t.innerHTML='';
  if(title)t.appendChild(Object.assign(document.createElement('b'),{textContent:title}));
  if(body)t.appendChild(document.createTextNode(body));
  t.classList.add('on');
  var r=target.getBoundingClientRect(),tr=t.getBoundingClientRect();
  var x=Math.min(Math.max(8,r.left+r.width/2-tr.width/2),window.innerWidth-tr.width-8);
  var y=r.top-tr.height-10;
  if(y<8)y=Math.min(r.bottom+10,window.innerHeight-tr.height-8);
  t.style.left=x+'px';t.style.top=y+'px';
  clearTimeout(tipHideTimer);
  tipHideTimer=setTimeout(hideTip,4000);
}
function hideTip(){var t=el('tip');if(t)t.classList.remove('on');}
/* fäster förklaring på ett element: hovring för mus, tryck för touch */
function attachTip(node,title,body){
  if(!body&&!title)return node;
  node.addEventListener('pointerenter',function(){showTip(node,title,body);});
  node.addEventListener('pointerleave',hideTip);
  node.addEventListener('click',function(e){e.stopPropagation();showTip(node,title,body);});
  return node;
}

/* Hjältarnas etiketter från spelets hjältesida. Fyll på allteftersom. */
var HERO_TAGS={
  abrams:['Tank','Brawler','Bull-headed'],
  apollo:['Finesse','Mobility','A cut above'],
  bebop:['Hook','Bomb','Punch'],
  billy:['Punk','Chaotic','G.O.A.T.'],
  calico:['Tricksy','Slippery','Burst damage'],
  celeste:['Performer','Disruptive','Dazzling'],
  doorman:['Disorienting','Map control','Mind games'],
  thedoorman:['Disorienting','Map control','Mind games'],
  drifter:['Stalker','Bloodthirsty','Cruel'],
  dynamo:['Teamplay','Initiator','Clutch'],
  graves:['Morbid','Area denial','Necromancer'],
  greytalon:['Precision','Hunter','Area denial'],
  haze:['Assassin','Stealthy','Lethal'],
  holliday:['Crackshot','Explosive','Apprehender'],
  infernus:['Arsonist','Explosive','Burn rubber'],
  ivy:['Team-up','Disruptor','Rock solid'],
  kelvin:['Protector','Explorer','Ice cold'],
  ladygeist:['Lifesteal','Self damage','Fatale'],
  lash:['Initiator','High flying','Arrogant'],
  mcginnis:['Inventor','Support','Disruption'],
  mina:['Harasser','Nimble','Vexing'],
  mirage:['Bodyguard','Traveller','Focused'],
  mokrill:['Tag-team','Initiator','Burrower'],
  moandkrill:['Tag-team','Initiator','Burrower'],
  paige:['Helpful','Protector','Booksmart'],
  paradox:['Calculated','Disruptor','Tactician'],
  pocket:['Trickster','Burst damage','Frogs'],
  rem:['Helpful','Tiny','Zzzzz'],
  seven:['High voltage','Merciless','Area denial'],
  shiv:['Rage','Bleed','Repeat'],
  silver:['Feral','Hot mess','Transformation'],
  sinclair:['Trickster','Copycat','Versatile'],
  venator:['Devout','Arms expert','Tactical'],
  victor:['You','Can\u2019t','Kill me'],
  vindicta:['Sniper','Soaring','One shot kill'],
  viscous:['Evasive','Disruptor','Gooey'],
  vyper:['Gunner','Slippery','Rat-a-tat'],
  warden:['Initiator','Fearless','One man army'],
  wraith:['Duelist','Isolator','Telekinetic'],
  yamato:['Relentless','Acrobatics','Pursuer']
};
function tagsFor(name){
  return HERO_TAGS[String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'')]||[];
}
function buildTags(name){
  var list=tagsFor(name);
  if(!list.length)return null;
  var box=document.createElement('div');box.className='tags';
  list.forEach(function(t){
    box.appendChild(Object.assign(document.createElement('span'),
      {className:'tag',textContent:t}));
  });
  return box;
}
