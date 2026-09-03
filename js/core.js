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
