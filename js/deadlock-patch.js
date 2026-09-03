/* ---------------- Patch notes ----------------
   Källa: deadlock-api /v2/patches, som slår ihop forumets changelog med
   Steams nyhetsflöde. /v1/patches finns kvar som reserv. */
var patchOpen=false,patchList=null,patchAt=0,patchFetched=0,patchFilter='';

function patchDate(d){
  if(!d||isNaN(d))return '';
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}
function patchAge(d){
  if(!d||isNaN(d))return '';
  var h=(Date.now()-d.getTime())/3600000;
  if(h<1)return Math.max(1,Math.round(h*60))+' min ago';
  if(h<48)return Math.round(h)+' h ago';
  return Math.round(h/24)+' d ago';
}

/* HTML -> rader. Listpunkter och radbrytningar blir egna rader. */
function patchLines(html){
  var s=String(html||'');
  s=s.replace(/<\s*(script|style)[\s\S]*?<\/\1>/gi,'');
  s=s.replace(/<\s*br\s*\/?>/gi,'\n');
  s=s.replace(/<\s*li[^>]*>/gi,'\n\u2022 ');
  s=s.replace(/<\/\s*(p|div|li|ul|ol|h\d|tr)\s*>/gi,'\n');
  s=s.replace(/<[^>]*>/g,'');
  s=s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
     .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,'\u2019')
     .replace(/&#(\d+);/g,function(m,n){return String.fromCharCode(+n);});
  return s.split('\n').map(function(l){return l.replace(/\s+/g,' ').trim();})
          .filter(function(l){return l.length>0;});
}

async function dlLoadPatches(force){
  if(patchList&&!force&&Date.now()-patchFetched<30*60*1000)return patchList;
  var raw=await dlJsonAny(['/v2/patches','/v1/patches']);
  var arr=Array.isArray(raw)?raw:(raw&&(raw.items||raw.patches||raw.data))||[];
  patchList=arr.map(function(p){
    var g=p.guid&&typeof p.guid==='object'?p.guid.text:p.guid;
    return {title:String(p.title||'').trim(),
            date:new Date(p.pub_date||p.pubDate||p.date||p.published||0),
            link:p.link||g||'',
            source:String(p.source||'forum').toLowerCase(),
            html:p.content||p.content_encoded||p.contentEncoded||p.description||''};
  }).filter(function(p){return p.title;})
    .sort(function(a,b){return b.date-a.date;})
    .slice(0,15);
  patchFetched=Date.now();
  return patchList;
}

/* Hittar hjältar och föremål som nämns, och avgör vilka rader som är rubriker. */
function patchIndex(lines,heroes,items){
  var hero=[],item=[];
  Object.keys(heroes||{}).forEach(function(id){
    var h=heroes[id];
    if(!h.playable||!h.name)return;
    hero.push({name:h.name,key:heroFile(h.name),hero:h,
               re:new RegExp('(^|[^A-Za-z])'+esc4re(h.name)+'([^A-Za-z]|$)','i')});
  });
  var seen={};
  Object.keys(items||{}).forEach(function(id){
    var it=items[id];
    if(!it.name||it.name.length<5)return;         /* för korta namn ger falska träffar */
    var k=itemFile(it.name);
    if(seen[k])return; seen[k]=1;
    item.push({name:it.name,key:k,item:it,
               re:new RegExp('(^|[^A-Za-z])'+esc4re(it.name)+'([^A-Za-z]|$)','i')});
  });

  var out=[],hits={};
  lines.forEach(function(text){
    var bare=text.replace(/^[\u2022\-\u2013\s]+/,'').replace(/[:\s]+$/,'').trim();
    var row={text:text,tags:[],head:null};
    /* kort rad som exakt är ett hjälte- eller föremålsnamn = rubrik */
    hero.forEach(function(h){
      if(!h.re.test(text))return;
      row.tags.push('h:'+h.key);
      hits['h:'+h.key]=(hits['h:'+h.key]||0)+1;
      if(bare.toLowerCase()===h.name.toLowerCase())row.head={kind:'hero',ref:h};
    });
    item.forEach(function(i){
      if(!i.re.test(text))return;
      row.tags.push('i:'+i.key);
      hits['i:'+i.key]=(hits['i:'+i.key]||0)+1;
      if(!row.head&&bare.toLowerCase()===i.name.toLowerCase())row.head={kind:'item',ref:i};
    });
    out.push(row);
  });

  /* rader utan egen träff ärver rubriken de står under */
  var cur=null;
  out.forEach(function(r){
    if(r.head)cur=r.head.kind==='hero'?'h:'+r.head.ref.key:'i:'+r.head.ref.key;
    else if(!r.tags.length&&cur)r.tags.push(cur);
  });

  var affected=hero.filter(function(h){return hits['h:'+h.key];})
    .sort(function(a,b){return hits['h:'+b.key]-hits['h:'+a.key]||a.name.localeCompare(b.name);});
  return {rows:out,affected:affected,hits:hits};
}
function esc4re(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function showPatch(on){
  patchOpen=!!on; window.__patchOpen=patchOpen;
  document.body.classList.toggle('patch',patchOpen);
  el('patch').classList.toggle('on',patchOpen);
  el('listView').classList.toggle('off',patchOpen||!!window.__heroOpen||!!window.__itemsOpen);
  if(!patchOpen)return;
  closeMatch();
  buildPatch();
}

async function buildPatch(force){
  var doc=el('patchDoc'),list=el('patchList');
  if(!doc)return;
  if(!patchList||force){
    doc.innerHTML='<div class="pmsg">Loading patch notes…</div>';
    list.innerHTML='';
    try{await dlLoadPatches(force);}
    catch(e){doc.innerHTML='';
      doc.appendChild(Object.assign(document.createElement('div'),
        {className:'pmsg',textContent:'Could not load patch notes. ('+e.message+')'}));
      return;}
    patchAt=0;
  }
  if(!patchList.length){doc.innerHTML='<div class="pmsg">No patch notes found.</div>';return;}
  renderPatchList();
  await renderPatch();
}

function renderPatchList(){
  var list=el('patchList');list.innerHTML='';
  patchList.forEach(function(p,i){
    var c=document.createElement('div');
    c.className='pitem'+(i===patchAt?' on':'')+(p.source==='steam'?' steam':'');
    c.appendChild(Object.assign(document.createElement('b'),{textContent:p.title}));
    var d=document.createElement('span');
    d.textContent=patchDate(p.date)+(i===0?'  ·  latest':'');
    c.appendChild(d);
    c.addEventListener('click',function(e){
      e.stopPropagation();
      if(patchAt===i)return;
      patchAt=i;patchFilter='';renderPatchList();renderPatch();
    });
    list.appendChild(c);
  });
}

async function renderPatch(){
  var p=patchList[patchAt],doc=el('patchDoc'),rail=el('patchHeroes');
  doc.innerHTML='';rail.innerHTML='';
  var heroes={},items={};
  try{heroes=await dlLoadHeroes();}catch(e){}
  try{items=await dlLoadItems();}catch(e){}
  var idx=patchIndex(patchLines(p.html),heroes,items);

  var head=document.createElement('div');head.className='phead';
  head.appendChild(Object.assign(document.createElement('h3'),{textContent:p.title}));
  var sub=document.createElement('span');
  sub.textContent=patchDate(p.date)+'  ·  '+patchAge(p.date)+
    '  ·  '+(p.source==='steam'?'Steam news':'Forum changelog');
  head.appendChild(sub);
  doc.appendChild(head);

  var body=document.createElement('div');body.className='pbody';
  doc.appendChild(body);

  /* hjälterälsen till höger — tryck filtrerar texten */
  var all=document.createElement('div');
  all.className='pface all'+(patchFilter?'':' on');
  all.appendChild(Object.assign(document.createElement('span'),{textContent:'All'}));
  all.addEventListener('click',function(e){e.stopPropagation();patchFilter='';renderPatch();});
  rail.appendChild(all);
  if(!idx.affected.length){
    rail.appendChild(Object.assign(document.createElement('div'),
      {className:'pmsg small',textContent:'No hero named in this patch.'}));
  }
  idx.affected.forEach(function(h){
    var key='h:'+h.key;
    var cell=document.createElement('div');
    cell.className='pface'+(patchFilter===key?' on':'');
    cell.appendChild(heroIcon(h.hero,'pico'));
    cell.appendChild(Object.assign(document.createElement('span'),{textContent:h.name}));
    cell.appendChild(Object.assign(document.createElement('b'),
      {textContent:idx.hits[key]}));
    cell.addEventListener('click',function(e){
      e.stopPropagation();
      patchFilter=(patchFilter===key)?'':key;
      renderPatch();
    });
    rail.appendChild(cell);
  });

  var shown=0;
  idx.rows.forEach(function(r){
    if(patchFilter&&r.tags.indexOf(patchFilter)<0)return;
    shown++;
    if(r.head){
      var h=document.createElement('div');h.className='phit';
      if(r.head.kind==='hero')h.appendChild(heroIcon(r.head.ref.hero,'pico sm'));
      else{
        var im=document.createElement('img');im.className='pico sm';im.decoding='async';im.alt='';
        im.src='items/'+r.head.ref.key+'.png';
        im.addEventListener('error',function(){this.remove();});
        h.appendChild(im);
      }
      h.appendChild(Object.assign(document.createElement('b'),{textContent:r.head.ref.name}));
      body.appendChild(h);
      return;
    }
    var line=document.createElement('div');
    line.className='pline'+(/^[\u2022]/.test(r.text)?' bul':'');
    line.textContent=r.text.replace(/^\u2022\s*/,'');
    body.appendChild(line);
  });
  if(!shown)body.appendChild(Object.assign(document.createElement('div'),
    {className:'pmsg',textContent:'Nothing about that hero in this patch.'}));

  if(p.link){
    var lk=document.createElement('div');lk.className='plink';
    lk.textContent=p.link.replace(/^https?:\/\//,'');
    body.appendChild(lk);
  }
  body.scrollTop=0;
}

el('patchBtn').addEventListener('click',function(e){e.stopPropagation();
  goSection(patchOpen?'matches':'patch');});
el('patchBack').addEventListener('click',function(e){e.stopPropagation();
  goSection('matches');});
el('patchRefresh').addEventListener('click',function(e){e.stopPropagation();
  patchFilter='';buildPatch(true);});
