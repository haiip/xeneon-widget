/* ---------------- Väder (Open-Meteo, ingen nyckel) ---------------- */
var WXT={0:'Klart',1:'Mest klart',2:'Halvklart',3:'Mulet',45:'Dimma',48:'Underkyld dimma',
 51:'Duggregn',53:'Duggregn',55:'Tätt duggregn',56:'Underkylt duggregn',57:'Underkylt duggregn',
 61:'Lätt regn',63:'Regn',65:'Kraftigt regn',66:'Underkylt regn',67:'Underkylt regn',
 71:'Lätt snö',73:'Snö',75:'Kraftig snö',77:'Kornsnö',
 80:'Regnskurar',81:'Regnskurar',82:'Kraftiga skurar',85:'Snöbyar',86:'Snöbyar',
 95:'Åska',96:'Åska med hagel',99:'Åska med hagel'};
function wxIcon(code,size){
  var c=code,A='#F0CB93',B='#CBD5E4',W='2.4';
  function svg(inner){return '<svg viewBox="0 0 48 48" width="100%" height="100%" fill="none" '+
    'stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg>';}
  var sun='<circle cx="24" cy="24" r="9" stroke="'+A+'" stroke-width="'+W+'"/>'+
    '<path d="M24 6v4M24 38v4M6 24h4M38 24h4M11 11l3 3M34 34l3 3M37 11l-3 3M14 34l-3 3" stroke="'+A+'" stroke-width="'+W+'"/>';
  var cloud='<path d="M16 34h17a7 7 0 0 0 .6-14 10 10 0 0 0-19 2.5A6 6 0 0 0 16 34z" stroke="'+B+'" stroke-width="'+W+'"/>';
  if(c===0)return svg(sun);
  if(c===1||c===2)return svg('<circle cx="19" cy="19" r="6.5" stroke="'+A+'" stroke-width="'+W+'"/>'+
    '<path d="M19 6v3M6 19h3M10 10l2 2" stroke="'+A+'" stroke-width="'+W+'"/>'+cloud);
  if(c===3)return svg(cloud);
  if(c===45||c===48)return svg(cloud+'<path d="M12 40h24M16 44h16" stroke="'+B+'" stroke-width="'+W+'"/>');
  if(c>=71&&c<=77||c===85||c===86)return svg(cloud+'<path d="M18 39v4M24 41v4M30 39v4" stroke="'+B+'" stroke-width="'+W+'"/>');
  if(c>=95)return svg(cloud+'<path d="M26 37l-6 6h6l-3 5" stroke="'+A+'" stroke-width="'+W+'"/>');
  return svg(cloud+'<path d="M18 38l-2 5M24 38l-2 5M30 38l-2 5" stroke="#8FB6E8" stroke-width="'+W+'"/>');
}
var wxTimer=null;
async function wxPoll(){
  if(!CFG.wx){el('wx').classList.remove('on');return;}
  var p=CFG.wx.split(',');
  try{
    var u='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(p[0])+
      '&longitude='+encodeURIComponent(p[1])+
      '&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code'+
      '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2';
    var r=await fetch(u,{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    var j=await r.json();
    var cur=j.current||{};
    el('wxTemp').textContent=Math.round(cur.temperature_2m)+'°';
    el('wxText').textContent=WXT[cur.weather_code]||'';
    el('wxIcon').innerHTML=wxIcon(cur.weather_code);
    if(j.daily&&j.daily.temperature_2m_max)
      el('wxRange').textContent='Högst '+Math.round(j.daily.temperature_2m_max[0])+
        '°  ·  lägst '+Math.round(j.daily.temperature_2m_min[0])+'°';
    el('wxPlace').textContent=p[2]?decodeURIComponent(p[2]):'';
    /* fyra kommande timmar */
    var box=el('wxHours');box.innerHTML='';
    if(j.hourly&&j.hourly.time){
      var now=Date.now(),start=-1;
      for(var i=0;i<j.hourly.time.length;i++){
        if(new Date(j.hourly.time[i]).getTime()>now){start=i;break;}
      }
      if(start>=0)for(var k=start;k<start+4&&k<j.hourly.time.length;k++){
        var d=new Date(j.hourly.time[k]);
        var cell=document.createElement('div');cell.className='hr';
        var lab=document.createElement('span');
        lab.textContent=('0'+d.getHours()).slice(-2)+':00';
        var ic=document.createElement('div');
        ic.innerHTML=wxIcon(j.hourly.weather_code[k]);
        ic.style.width='100%';ic.style.display='grid';ic.style.placeItems='center';
        var t=document.createElement('b');
        t.textContent=Math.round(j.hourly.temperature_2m[k])+'°';
        cell.appendChild(lab);cell.appendChild(ic);cell.appendChild(t);
        box.appendChild(cell);
      }
    }
    el('wx').classList.add('on');
  }catch(e){el('wx').classList.remove('on');}
}
