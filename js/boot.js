/* ---------------- start ---------------- */
(async function(){
  if(qs.get('code')){openSetup();await exchange(qs.get('code'));return;}
  if(!CFG.cid||!CFG.rt){openSetup();el('title').textContent='Inte ansluten';return;}
  await poll();dcPoll();queuePoll();
  (function loop(){
    var wait=document.hidden?15000:(Date.now()<spWait?Math.max(spWait-Date.now(),5000):5000);
    setTimeout(function(){poll().then(loop,loop);},wait);
  })();
  setInterval(tick,250);
  setInterval(function(){if(!document.hidden)dcPoll();},30000);
  setInterval(function(){if(!document.hidden)queuePoll();},60000);
  if(CFG.dl){dlPoll().then(dlSchedule,dlSchedule);}
  if(CFG.wx){wxPoll();setInterval(function(){if(!document.hidden)wxPoll();},1800000);}
})();
