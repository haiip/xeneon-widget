var mem={};
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);return v;}
  catch(e){if(v===undefined)return mem[k]||null;mem[k]=v;return v;}}
var qs=new URLSearchParams(location.search);
var CFG={cid:qs.get('cid')||ls('xe_cid')||'', rt:qs.get('rt')||ls('xe_rt')||'',
  guild:qs.get('guild')||ls('xe_guild')||'', dl:qs.get('dl')||ls('xe_dl')||'', wx:qs.get('wx')||ls('xe_wx')||'', back:parseInt(qs.get('back')||ls('xe_back')||'0',10)||0};
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
