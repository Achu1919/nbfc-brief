/* NBFC Brief: Topics, hub pages and peer pages. Loaded on demand after search.js; reads the search index
   (search.js) and the tags, categories and cards the 7 AM publish writes. Identical file in both repos; app.js tells
   it which edition it is (window.__NB.priv). Nothing here fetches anything; it reads the search index the app already built. */
(function(){'use strict';
var NB=window.__NB,SR=window.NBSearch,esc=NB.esc,PRIV=!!NB.priv,HUBS=NB.HUBS,HUB=NB.HUB;
function M(){return NB.M;}
function ix(){return SR.ix();}
var PEERK={'muthoot-finance':'muthoot',manappuram:'manappuram','iifl-finance':'iifl','shriram-finance':'shriram','bajaj-finance':'bajaj'};
var PEERORD=['muthoot-finance','manappuram','iifl-finance','shriram-finance','bajaj-finance'];
var MFLCO={'muthoot-fincorp':1,'muthoot-microfin':1};
function lab(g,s){return SR.label(g,s);}
function clip(s,n){return NB.clip(String(s||''),n);}
function clean(s){return NB.noCites(NB.stripMd(String(s||'')));}
/* titles: drop the brief's list numbering and the [CIRCULAR]/[DRAFT] label (the label becomes the kind / status) */
var TAGRX=/\[(CIRCULAR|DRAFT|NOTIFICATION|PRESS RELEASE|DIRECTIONS?|MASTER DIRECTION|CONTEXT|GUIDELINES|AMENDMENT|CONSULTATION|FAQS?|REGULATIONS?)\]/i;
function ttl(t){return clean(t).replace(/^\s*\d{1,2}[.)]\s+/,'').replace(/^\[[A-Za-z][A-Za-z &\/-]*\]\s*/,'');}
function isCirc(d){return !!d.reg||TAGRX.test(d.t)||(d.k==='Circular'&&!!(d.rg&&d.rg.rf&&/\d/.test(d.rg.rf)));}
/* sub-headings and one-word rows of the rules desk ("RBI drafts", "IBBI", "What is in the market that is not an NBFC circular") are not items */
function junk(d){var t=ttl(d.t);return /not an nbfc circular|^deep dive in\b/i.test(t)||/^[A-Z]{2,5}$/.test(t)||(d.k==='Circular'&&!isCirc(d)&&t.length<18);}
/* Regulation keeps circulars, the regulatory calendar and items filed under regulation; market notes from the rules desk stay in their own topic */
function regKeep(d){return isCirc(d)||d.k==='Calendar'||(d.c==='regulation'&&d.k!=='Circular')||(!d.c&&d.k!=='Circular');}
function plural(n,a,b){return n+' '+(n===1?a:(b||a+'s'));}
/* ---------- the feed for a hub, from the index ---------- */
var C={gen:null,by:{}};
function secOnly(d){var s=String(d.s||'');return (d.k==='News'||d.k==='Rules')&&s.slice(s.lastIndexOf(' \u00b7 ')+3)===d.t;}
function hubDocs(slug){var X=ix();if(!X)return [];if(C.gen!==X.gen+'|'+X.docs.length){C={gen:X.gen+'|'+X.docs.length,by:{}};}
  if(C.by[slug])return C.by[slug];var seen={},out=[];
  X.docs.forEach(function(d,i){if(secOnly(d)&&d.k!=='Weekly')return;if(junk(d))return;if(slug==='regulation'&&!regKeep(d))return;if(!NB.hubHas(slug,d.tg,d.k,d.s,d.c))return;
    if(slug==='peers'&&d.k==='Weekly'&&!(d.tg.companies||[]).some(function(c){return !MFLCO[c];}))return;
    var f=d.k+'|'+(d._t||NB.flatT(d.t)).slice(0,48);if(seen[f])return;seen[f]=1;out.push({d:d,i:i});});
  out.sort(function(a,b){return a.d.d<b.d.d?1:a.d.d>b.d.d?-1:a.i-b.i;});
  return (C.by[slug]=out.map(function(x){return x.d;}));}
function coDocs(co){var X=ix();if(!X)return [];var seen={},out=[];
  X.docs.forEach(function(d,i){if(secOnly(d)&&d.k!=='Weekly')return;if(junk(d))return;if((d.tg.companies||[]).indexOf(co)<0)return;var f=(d._t||'').slice(0,48);if(seen[f])return;seen[f]=1;out.push({d:d,i:i});});
  out.sort(function(a,b){return a.d.d<b.d.d?1:a.d.d>b.d.d?-1:a.i-b.i;});return out.map(function(x){return x.d;});}
function stats(slug){var L=hubDocs(slug),ed={};L.forEach(function(d){ed[d.d]=(ed[d.d]||0)+1;});
  var days=M().days.slice(0,14).map(function(d){return d.id;}).reverse(),ser=days.map(function(id){return ed[id]||0;});
  var top=L.filter(function(d){return d.k!=='Weekly'&&d.k!=='Gold';})[0]||L[0]||null;
  return {n:L.length,eds:Object.keys(ed).length,ser:ser,top:top};}
/* edition counts straight from the day-level tags (latest.json days[]), before the index is ready */
function tagEds(slug){return M().days.filter(function(d){return d.tags&&NB.hubHas(slug,d.tags,'','',null);}).length;}
function dayHas(id,slug){if(!ix())return null;var L=hubDocs(slug);if(!L._m){L._m={};L.forEach(function(d){L._m[d.d]=1;});}return !!L._m[id];}
/* ---------- bits ---------- */
function bars(ser,w,h){var mx=Math.max.apply(0,ser.concat([1])),bw=w/ser.length;
  return '<svg class="hspk" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true" focusable="false">'+ser.map(function(v,i){var bh=v?Math.max(2,Math.round((h-1)*v/mx)):1;
    return '<rect x="'+(i*bw+1).toFixed(1)+'" y="'+(h-bh)+'" width="'+Math.max(1,bw-2).toFixed(1)+'" height="'+bh+'" rx="1"'+(v?'':' class="z"')+'/>';}).join('')+'</svg>';}
function summ(d){var s=d.sm||d.b||'';if(d.imp){var k=s.indexOf(d.imp);if(k>0)s=s.slice(0,k);}
  s=s.replace(/(?:^|\s)(?:Possible impact on Muthoot Fincorp|Why it matters[^:]{0,24}|MFL (?:impact|note|angle)|FP&A [a-z]+):\s.*$/i,'').trim();s=clean(s);if(window.NBCU&&NBCU.cleanSum)s=NBCU.cleanSum(s);return clip(s,260);}
function srcA(src){return src&&src.u&&/^https?:/.test(src.u)?'<a href="'+esc(src.u)+'" target="_blank" rel="noopener noreferrer">'+esc(clip(src.l||'source',40))+'</a>':'';}
function kindL(d){var tg=(String(d.t).match(TAGRX)||[])[1];if(tg)return tg.charAt(0)+tg.slice(1).toLowerCase();return {Story:'Top story',Circular:'Circular',Calendar:'Calendar',MFL:NB.mflLabel||'Muthoot Fincorp',Weekly:'Weekly',Gold:'Gold rates'}[d.k]||String(d.s||'').split(' \u00b7 ').pop()||d.k;}
function fcard(d,page){var c=d.c&&d.c!==page?NB.hubChip(d.c):'',s=summ(d),a=srcA(d.src);
  return '<article class="fi g"'+(d.c?' data-hub="'+d.c+'"':'')+'><div class="tagrow">'+c+'<span class="fk">'+esc(clip(kindL(d),40))+'</span></div>'+
    '<h3>'+esc(clip(ttl(d.t),160))+'</h3>'+(s&&s!==ttl(d.t)?'<p class="sum">'+esc(s)+'</p>':'')+(d.imp?NB.impLine(clip(clean(d.imp),220),window.NBCU&&NBCU.impactLabel):'')+
    '<div class="sc-f"><span class="by">'+(a?'Source: '+a:'')+'</span><a class="more press" href="'+esc(d.h)+'">Read full report<span class="sr">: '+esc(clip(d.t,60))+'</span> <span aria-hidden="true">\u2192</span></a></div></article>';}
function feed(L,page,lim){lim=lim||24;if(!L.length)return '<div class="g card" data-st><p class="note" style="margin:0">Nothing filed under this topic yet.</p></div>';
  var h='',cur='';L.slice(0,lim).forEach(function(d){if(d.d!==cur){if(cur)h+='</div>';cur=d.d;h+='<h3 class="fday" data-st>'+esc(NB.shortDay(d.d))+'</h3><div class="fgrp">';}h+=fcard(d,page);});
  h+='</div>';if(L.length>lim)h+='<div class="fmore" data-st><button type="button" class="pill press" data-hmore="'+lim+'">Show more ('+(L.length-lim)+')</button></div>';return h;}
function hubHd(slug,sub,back){var h=HUB[slug];
  return '<div class="hd hubhd g" data-st="h" data-hub="'+slug+'">'+(back!==false?'<a class="hback press" href="'+(back||'#/topics')+'"><span aria-hidden="true">\u2039</span> '+(back&&back!=='#/topics'?'Back':'Topics')+'</a>':'')+
    '<div class="hh"><span class="hh-i">'+NB.hubIcon(slug,24)+'</span><div><p class="greet">Topic</p><h1>'+esc(h.n)+'</h1></div></div><p class="hsub" id="hsub">'+sub+'</p></div>';}
function subOf(slug){var X=ix();if(!X)return esc(HUB[slug].d)+' \u00b7 '+plural(tagEds(slug),'edition');var s=stats(slug);
  return esc(HUB[slug].d)+' \u00b7 <span class="num">'+plural(s.n,'item')+'</span> in <span class="num">'+plural(s.eds,'edition')+'</span>';}
function loading(){return '<div class="g card hload" data-st role="status"><span class="sk-l"></span><span class="sk-l s"></span><span class="sr">Building the topic index\u2026</span></div>';}
/* ---------- Topics ---------- */
function tile(h,i){var X=ix(),s=X?stats(h.s):null;
  return '<a class="htile g press" href="#/topic/'+h.s+'" data-hub="'+h.s+'" data-tile="'+i+'">'+
    '<span class="ht-top"><span class="hh-i">'+NB.hubIcon(h.s,20)+'</span>'+(s?bars(s.ser,56,22):'<span class="hspk sk"></span>')+'</span>'+
    '<span class="ht-n">'+esc(h.n)+'</span>'+
    '<span class="ht-c num">'+(s?plural(s.n,'item')+' \u00b7 '+plural(s.eds,'edition'):plural(tagEds(h.s),'edition'))+'</span>'+
    '<span class="ht-h">'+(s&&s.top?esc(clip(ttl(s.top.t),110)):s?'Nothing filed yet':'<span class="sk-l"></span>')+'</span>'+
    '<span class="ht-d">'+(s&&s.top?'Latest \u00b7 '+esc(NB.shortDay(s.top.d)):'\u00a0')+'</span></a>';}
function topicsHtml(){var n=M().days.length;
  return '<div class="hd hubhd big g" data-st="h"><p class="greet">Browse by topic</p><h1>Topics</h1><p class="hsub">'+plural(HUBS.length,'topic')+' across <span class="num">'+plural(n,'edition')+'</span>. Each one gathers every item tagged to it, newest first.</p></div>'+
    '<nav class="hub-grid" aria-label="Topics" id="hubGrid">'+HUBS.map(tile).join('')+'</nav>'+NB.foot();}
/* ---------- Regulation ---------- */
var REF=/\b(RBI\/20\d\d-\d\d\/\d+|(?:DoR|DOR|DNBR|DNBS|FIDD|DPSS|DCM|FMRD|CO\.)[\w.\/-]*?\/20\d\d-\d\d|SEBI\/[A-Z0-9\/_-]+\/20\d\d\/\d+|IBBI\/[\w\/.-]+\/20\d\d(?:-\d\d)?(?:\/\d+)?)/;
function regOf(d){var r=d.reg||{},g=d.rg||{},txt=d.t+' '+d.b,o={};
  o.regulator=r.regulator||((d.tg.regulators||[]).filter(function(x){return x!=='govt';})[0])||'';
  o.ref_no=r.ref_no||(g.rf&&clip(g.rf,60))||((txt.match(REF)||[])[1])||'';
  o.applies=Array.isArray(r.applies_to)?r.applies_to.join(', '):(r.applies_to||g.ap||'');
  o.effective=r.effective||g.ef||'';o.issued=r.issued||'';o.url=r.url||(d.src&&d.src.u)||'';
  var st=r.status||'',tg=(d.t.match(TAGRX)||[])[1]||'';if(!st&&/draft|consultation/i.test(tg))st='draft';if(!st){var low=(txt+' '+(g.st||'')).toLowerCase();st=d.k==='Calendar'||/deadline|last date|comments? by|due by/.test(low)?'deadline':/\bdraft|consultation|comments invited|exposure draft/.test(low)?'draft':/in force|effective from|comes into (?:force|effect)|now applies/.test(low)?'in-force':d.d===ix().latest&&d.k==='Circular'?'new':'';}
  o.status=st;return o;}
function regCard(d){var r=regOf(d),st=NB.RSTAT[r.status],s=summ(d);
  var dl=[['Ref no.',r.ref_no],['Applies to',r.applies],['Issued',r.issued],['Effective',r.effective]].filter(function(x){return x[1];});
  return '<article class="fi rc g" data-hub="regulation"><div class="tagrow">'+(r.regulator?'<span class="rgb">'+esc(r.regulator.toUpperCase())+'</span>':'')+(st?'<span class="st st-'+r.status+'">'+st+'</span>':'')+'<span class="fk">'+esc(kindL(d))+'</span></div>'+
    '<h3>'+esc(clip(ttl(d.t),160))+'</h3>'+(dl.length?'<dl class="rf">'+dl.map(function(x){return '<div><dt>'+x[0]+'</dt><dd class="'+(x[0]==='Ref no.'?'num':'')+'">'+esc(clip(clean(x[1]),120))+'</dd></div>';}).join('')+'</dl>':'')+
    (s&&s!==ttl(d.t)?'<p class="sum">'+esc(s)+'</p>':'')+(d.imp?NB.impLine(clip(clean(d.imp),220),window.NBCU&&NBCU.impactLabel):'')+
    '<div class="sc-f"><span class="by">'+(r.url&&/^https?:/.test(r.url)?'<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">Circular <span aria-hidden="true">\u2197</span><span class="sr"> (opens the source)</span></a>':'')+'</span><a class="more press" href="'+esc(d.h)+'">Read full report<span class="sr">: '+esc(clip(d.t,60))+'</span> <span aria-hidden="true">\u2192</span></a></div></article>';}
var MON={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function dateIn(s){s=String(s||'');var m=s.match(/(20\d\d)-(\d\d)-(\d\d)/);if(m)return m[0];
  m=s.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d\d)\b/i);
  if(m){var d=new Date(Date.UTC(+m[3],MON[m[2].toLowerCase().slice(0,3)],+m[1]));return d.toISOString().slice(0,10);}return null;}
function deadlines(){var E=M().ext&&M().ext.deadlines,today=NB.todayIST(),out=[];
  if(Array.isArray(E))out=E.filter(function(x){return x&&x.date&&x.date>=today;}).map(function(x){return {date:x.date,title:x.title,reg:x.regulator,ref:x.ref_no,url:x.url,h:x.url,dt:typeof x.date_text==='string'?x.date_text:'',sid:typeof x.story_id==='string'?x.story_id:''};});
  else{var seen={};(ix()?hubDocs('regulation'):[]).forEach(function(d){if(d.k!=='Calendar'&&!(d.rg&&d.rg.dl))return;var dt=dateIn(d.t)||dateIn(d.rg&&d.rg.dl)||dateIn(d.b);if(!dt||dt<today)return;
    var t=clean(d.t).replace(/^\d{1,2}\s+\w+\s+20\d\d\s*[:\u2013\u2014-]\s*/,'');var f=dt+NB.flatT(t).slice(0,24);if(seen[f])return;seen[f]=1;
    out.push({date:dt,title:t.length>4?t:clean(d.b),reg:regOf(d).regulator,h:d.h});});}
  out.sort(function(a,b){return a.date<b.date?-1:1;});return out.slice(0,10);}
function dlStrip(){var L=deadlines(),today=+NB.dt(NB.todayIST());if(!L.length)return '';
  return '<div class="sec" data-st><h2 id="h-dl">Upcoming deadlines</h2><span class="aside">'+(M().ext&&M().ext.deadlines?'from the regulatory calendar':'from the regulatory calendar in the briefs')+'</span></div>'+
    /* a proper scroller: clipped inside its own box (no page overflow), edge fade where more cards wait (cu.js) */
    '<div class="hsc" data-st><ul class="dls fx-sc" role="list" aria-labelledby="h-dl">'+L.map(function(x){var n=Math.round((+NB.dt(x.date)-today)/864e5),d=NB.dt(x.date);
      /* a deadline with a story thread opens its timeline; the source stays one tap away */
      var th=null;try{th=x.sid&&window.NBCU?NBCU.thread(x.sid):null;}catch(e){}var href=th?'#/story/'+th.id:(x.h||'#/topic/regulation'),ext=!th&&/^https?:/.test(href);
      return '<li'+(th?' class="dl-th"':'')+'><a class="dl g press" href="'+esc(href)+'"'+(ext?' target="_blank" rel="noopener noreferrer"':'')+'><span class="dl-d"><b class="num">'+d.getDate()+'</b><span>'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]+'</span></span>'+
        '<span class="dl-b"><span class="dl-n num">'+(x.dt?esc(x.dt)+' \u00b7 '+(n===0?'ends today':n===1?'ends tomorrow':'ends in '+n+' days'):n===0?'Today':n===1?'Tomorrow':'In '+n+' days')+(x.reg?' \u00b7 '+esc(String(x.reg).toUpperCase()):'')+'</span><span class="dl-t">'+esc(clip(x.title,110))+'</span>'+(th?'<span class="dl-k"><i aria-hidden="true"></i>Timeline</span>':'')+'</span></a>'+
        (th&&/^https?:/.test(x.h||'')?'<a class="dl-x press" href="'+esc(x.h)+'" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">\u2197</span><span class="sr">Source for '+esc(clip(x.title,60))+' (opens in a new tab)</span></a>':'')+'</li>';}).join('')+'</ul></div>';}
var RF=[['','All'],['rbi','RBI'],['sebi','SEBI'],['ibbi','IBBI'],['draft','Drafts'],['deadline','Deadlines']];
function regFilter(L,f){if(!f)return L;if(f==='draft'||f==='deadline')return L.filter(function(d){return regOf(d).status===f;});
  return L.filter(function(d){return (d.tg.regulators||[]).indexOf(f)>=0||String(d.reg&&d.reg.regulator||'').toLowerCase()===f;});}
function regFeed(L,lim){lim=lim||24;if(!L.length)return '<div class="g card" data-st><p class="note" style="margin:0">No items match this filter.</p></div>';
  var h='',cur='';L.slice(0,lim).forEach(function(d){if(d.d!==cur){if(cur)h+='</div>';cur=d.d;h+='<h3 class="fday" data-st>'+esc(NB.shortDay(d.d))+'</h3><div class="fgrp">';}h+=isCirc(d)||d.k==='Calendar'?regCard(d):fcard(d,'regulation');});
  h+='</div>';if(L.length>lim)h+='<div class="fmore" data-st><button type="button" class="pill press" data-hmore="'+lim+'">Show more ('+(L.length-lim)+')</button></div>';return h;}
function chips(list,cur,attr,label){return '<div class="pills hf" role="group" aria-label="'+esc(label)+'" data-st>'+list.map(function(x){return '<button type="button" class="pill press" '+attr+'="'+x[0]+'" aria-pressed="'+(x[0]===cur)+'">'+esc(x[1])+(x[2]!=null?' <span class="num">'+x[2]+'</span>':'')+'</button>';}).join('')+'</div>';}
/* ---------- Muthoot Fincorp ---------- */
var NCDL='Status only; not an offer or a recommendation';
function ncdCard(){var N=M().ext&&M().ext.mfl_ncd;
  if(N&&typeof N==='object'){var B=Array.isArray(N.bids)?N.bids.filter(function(b){return b&&b.date&&typeof b.times_subscribed==='number';}):[];
    var facts=[['Issue',N.issue],['Opens',N.open&&NB.shortDay(N.open)],['Closes',N.close&&NB.shortDay(N.close)],['Size',N.size_cr!=null?'\u20b9'+Number(N.size_cr).toLocaleString('en-IN')+' cr':''],['Rating',N.rating],['Coupon',N.coupon_range],['Status',N.status&&String(N.status).charAt(0).toUpperCase()+String(N.status).slice(1)]].filter(function(x){return x[1];});
    var ch='';if(B.length){var mx=Math.max.apply(0,B.map(function(b){return b.times_subscribed;}).concat([1])),w=300,hh=96,bw=w/B.length;
      ch='<figure class="ncdc"><svg viewBox="0 0 '+w+' '+(hh+18)+'" width="100%" height="'+(hh+18)+'" role="img" aria-label="Subscription by day: '+esc(B.map(function(b){return NB.dm(b.date)+' '+b.times_subscribed+' times';}).join(', '))+'">'+
        B.map(function(b,i){var h=Math.max(2,Math.round(hh*b.times_subscribed/mx)),x=i*bw+bw*.18;return '<rect x="'+x.toFixed(1)+'" y="'+(hh-h)+'" width="'+(bw*.64).toFixed(1)+'" height="'+h+'" rx="3"/><text x="'+(x+bw*.32).toFixed(1)+'" y="'+(hh+14)+'" text-anchor="middle">'+esc(NB.dm(b.date))+'</text>';}).join('')+'</svg>'+
        '<figcaption class="num">'+esc(B.map(function(b){return NB.dm(b.date)+': '+b.times_subscribed+'x';}).join(' \u00b7 '))+'</figcaption></figure>';}
    var src=N.source&&(N.source.url||typeof N.source==='string')?(typeof N.source==='string'?{l:'source',u:N.source}:{l:N.source.name||'source',u:N.source.url}):null;
    return '<section aria-labelledby="h-ncd"><div class="sec" data-st><h2 id="h-ncd">NCD issue</h2><span class="aside">'+NCDL+'</span></div><div class="g card ncd" data-st>'+
      '<p class="ncdl">'+NCDL+'</p>'+(facts.length?'<dl class="rf">'+facts.map(function(x){return '<div><dt>'+x[0]+'</dt><dd>'+esc(String(x[1]))+'</dd></div>';}).join('')+'</dl>':'')+ch+(src?'<p class="by">Source: '+srcA(src)+'</p>':'')+'</div></section>';}
  var d=hubDocs('muthoot-fincorp').filter(function(x){return (x.tg.topics||[]).indexOf('ncd')>=0||/\bNCD/.test(x.t);})[0];if(!d)return '';
  return '<section aria-labelledby="h-ncd"><div class="sec" data-st><h2 id="h-ncd">NCD status</h2><span class="aside">latest mention \u00b7 '+esc(NB.shortDay(d.d))+'</span></div><div class="g card ncd" data-st>'+
    '<p class="ncdl">'+NCDL+'</p><h3>'+esc(clip(ttl(d.t),160))+'</h3>'+(summ(d)?'<p class="sum">'+esc(summ(d))+'</p>':'')+
    '<div class="sc-f"><span class="by">'+(srcA(d.src)?'Source: '+srcA(d.src):'')+'</span><a class="more press" href="'+esc(d.h)+'">Read full report <span aria-hidden="true">\u2192</span></a></div></div></section>';}
/* ---------- peers ---------- */
/* Peer Intelligence (cu.js): empty string when there are no entries or cu.js is missing */
function cu(f,a){var C=window.NBCU;if(!C||!C[f])return '';try{return C[f](a)||'';}catch(e){return '';}}
function peerName(co){return lab('companies',co)||co;}
function peerTile(co){var k=PEERK[co],day=M().days[0],full=NB.M.byId[day.id];var it=k&&full&&!full.stub?NB.item(full,k):null,n=coDocs(co).length;
  return '<a class="ptile g press" href="#/peer/'+co+'" data-hub="peers"><span class="pt-n">'+esc(peerName(co))+'</span>'+
    (it?'<span class="pt-v num">\u20b9'+esc(String(it.value).replace(/^\u20b9/,''))+'</span>'+NB.chg(it):'<span class="pt-v none">'+(k?'no close today':'not listed in the tables')+'</span>')+
    (k?NB.gChart(k,day.id,96,26,false):'')+'<span class="pt-c num">'+plural(n,'mention')+cu('tileNote',co)+'</span></a>';}
function peersBlock(){var X=ix(),cnt={};if(X)hubDocs('peers').forEach(function(d){(d.tg.companies||[]).forEach(function(c){if(!MFLCO[c]&&!PEERK[c])cnt[c]=(cnt[c]||0)+1;});});
  var others=Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a];}).slice(0,16);
  return cu('piSlot')+'<section aria-labelledby="h-pl"><div class="sec" data-st><h2 id="h-pl">Listed gold-loan &amp; NBFC peers</h2><span class="aside">NSE close</span></div><div class="ptiles" data-st>'+PEERORD.map(peerTile).join('')+'</div>'+
    '<p class="note" data-st>Muthoot Finance is a separate listed company and a peer, not Muthoot Fincorp.</p></section>'+
    (others.length?'<section aria-labelledby="h-po"><div class="sec" data-st><h2 id="h-po">Other companies in the briefs</h2></div><div class="pills wrapp" data-st>'+others.map(function(c){return '<a class="pill press" href="#/peer/'+c+'">'+esc(peerName(c))+' <span class="num">'+cnt[c]+'</span></a>';}).join('')+'</div></section>':'');}
function peerHtml(co){var k=PEERK[co],nm=peerName(co),L=coDocs(co),day=M().days[0],full=NB.M.byId[day.id],it=k&&full&&!full.stub?NB.item(full,k):null;
  var ser=k?NB.gSeries(k,day.id):[],facts=[];
  if(it){facts.push(['Last close','\u20b9'+String(it.value).replace(/^\u20b9/,'')]);if(it.change)facts.push(['Day change',it.change]);if(it.asof||it.as_of)facts.push(['As of',it.asof||it.as_of]);}
  if(ser.length>1){var v=ser.map(function(p){return p.v;});facts.push(['Range in the briefs','\u20b9'+Math.min.apply(0,v).toLocaleString('en-IN')+' \u2013 \u20b9'+Math.max.apply(0,v).toLocaleString('en-IN')+' ('+ser.length+' closes since '+NB.dm(ser[0].d)+')']);}
  var eds={};L.forEach(function(d){eds[d.d]=1;});facts.push(['Mentions',plural(L.length,'item')+' in '+plural(Object.keys(eds).length,'edition')]);
  var src=it&&(it.source||it.url);
  return '<div class="hd hubhd g" data-st="h" data-hub="peers"><a class="hback press" href="#/topic/peers"><span aria-hidden="true">\u2039</span> Peers</a><div class="hh"><span class="hh-i">'+NB.hubIcon('peers',24)+'</span><div><p class="greet">Peer</p><h1>'+esc(nm)+'</h1></div></div>'+
    '<p class="hsub">'+(co==='muthoot-finance'?'A separate listed company and a peer, not Muthoot Fincorp.':MFLCO[co]?'Group company.':'Company in the briefs.')+'</p></div>'+
    (k?'<section aria-labelledby="h-pc"><div class="sec" data-st><h2 id="h-pc">Price</h2><span class="aside">NSE close, from the briefs</span></div><div class="g card pchart" data-st><div class="gx-in" data-gk="'+k+'" data-gd="'+day.id+'">'+NB.gChartBlock(k,day.id)+'</div></div></section>':
      '<div class="g card" data-st><p class="note" style="margin:0">No price series: the briefs do not track a share price for '+esc(nm)+'.</p></div>')+
    '<section aria-labelledby="h-pf"><div class="sec" data-st><h2 id="h-pf">Key facts</h2></div><div class="g card" data-st><dl class="rf">'+facts.map(function(x){return '<div><dt>'+esc(x[0])+'</dt><dd class="num">'+esc(String(x[1]))+'</dd></div>';}).join('')+'</dl>'+
      (src&&/^https?:/.test(src)?'<p class="by">Source: <a href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">price source</a></p>':'')+'</div></section>'+cu('piHistory',co)+
    '<section aria-labelledby="h-pn"><div class="sec" data-st><h2 id="h-pn">News</h2><span class="aside num">'+plural(L.length,'item')+'</span></div><div id="hfeed">'+feed(L,'peers')+'</div></section>'+NB.foot();}
/* ---------- pages ---------- */
var ST={f:'',lim:24};
function hubBody(slug){var X=ix();if(!X)return loading();var L=hubDocs(slug),day=M().days[0],full=NB.M.byId[day.id];
  if(slug==='regulation'){var cnt=function(f){return regFilter(L,f).length;};
    return dlStrip()+cu('regTracked')+'<section aria-labelledby="h-rf"><div class="sec" data-st><h2 id="h-rf">Circulars &amp; updates</h2></div>'+chips(RF.map(function(x){return [x[0],x[1],cnt(x[0])];}),ST.f,'data-hf','Filter regulation items')+'<div id="hfeed">'+regFeed(regFilter(L,ST.f),ST.lim)+'</div></section>';}
  var pre='';
  if(slug==='muthoot-fincorp'){pre=ncdCard();var mb=full&&!full.stub&&NB.mflBlock?NB.mflBlock(full):'';if(mb)pre+=mb;}
  if(slug==='peers')pre=peersBlock();
  if(slug==='gold'){var gd=M().days.filter(function(d){var f=NB.M.byId[d.id];return f&&!f.stub&&f.gold;})[0];pre=gd?NB.goldCard(NB.M.byId[gd.id],true):'';L=L.filter(function(d){return d.k!=='Gold';});}
  if(slug==='markets'){pre='<section aria-labelledby="h-mc"><div class="sec" data-st><h2 id="h-mc">Nifty 50</h2><a class="aside" href="#/'+day.id+'/markets">All numbers \u2192</a></div><div class="g card pchart" data-st><div class="gx-in" data-gk="nifty" data-gd="'+day.id+'">'+NB.gChartBlock('nifty',day.id)+'</div></div></section>';}
  var label=slug==='muthoot-fincorp'?'News timeline':slug==='peers'?'Peer news':slug==='gold'?'Gold-loan news':'Latest';
  return pre+'<section aria-labelledby="h-hf"><div class="sec" data-st><h2 id="h-hf">'+label+'</h2><span class="aside num">'+plural(L.length,'item')+'</span></div><div id="hfeed">'+feed(L,slug,ST.lim)+'</div></section>';}
function hubHtml(slug){if(!HUB[slug])return '<div class="hd" data-st="h"><p class="greet">Topics</p><h1>Topic not found</h1></div><div class="g card empty" data-st><p>There is no topic called \u201c'+esc(slug)+'\u201d. <a href="#/topics">See all topics</a>.</p></div>';
  return hubHd(slug,subOf(slug))+cu('hubThreads',slug)+'<div id="hbody">'+hubBody(slug)+'</div>'+NB.foot();}
function html(view,key,pq){ST={f:'',lim:24};var m=String(pq||'').match(/(?:^|&)f=([a-z-]+)/);if(m)ST.f=m[1];
  if(view==='topics')return topicsHtml();if(view==='peer')return peerHtml(key);return hubHtml(key);}
function title(view,key){return view==='topics'?'Topics':view==='peer'?peerName(key):HUB[key]?HUB[key].n:'Topics';}
function springIn(root){if(NB.RM.matches)return;var T=root.querySelectorAll('[data-tile]');
  T.forEach(function(t,i){if(!t.animate)return;t.animate([{opacity:0,transform:'translateY(14px) scale(.96)'},{opacity:1,transform:'none'}],{duration:NB.SPRINGS.Rise?NB.SPRINGS.Rise.ms:420,easing:NB.SPRINGS.Rise?NB.SPRINGS.Rise.easing:'cubic-bezier(.2,.9,.25,1.05)',delay:i*NB.STAGGER,fill:'backwards'});});}
var CUR=null;
function mount(root,view,key,pq){CUR={root:root,view:view,key:key};
  if(view==='peer'&&window.NBCU&&NBCU.piFocus)NBCU.piFocus(root,pq);
  /* earlier quarters arrive with data/peer_intel.json (idle prefetch, or now on first use): redraw that section */
  if(view==='peer'&&window.NBCU)NBCU.onPeer(function(){if(!CUR||CUR.root!==root||!root.isConnected)return;var y=window.scrollY;root.innerHTML=peerHtml(key);window.scrollTo(0,y);if(NBCU.piFocus)NBCU.piFocus(root,pq);});
  if(view==='topics')springIn(root);
  if(!root.dataset.hb){root.dataset.hb=1;root.addEventListener('click',onClick);}
  if(ix()&&!ix().stale)return;
  SR.ensure().then(function(){if(!CUR||CUR.root!==root||!root.isConnected)return;var y=window.scrollY;
    if(view==='topics'){var g=root.querySelector('#hubGrid');if(g){g.innerHTML=HUBS.map(tile).join('');}return;}
    if(view==='peer'){root.innerHTML=peerHtml(key);window.scrollTo(0,y);if(window.NBCU&&NBCU.piFocus)NBCU.piFocus(root,pq);return;}
    var hb=root.querySelector('#hbody'),hs=root.querySelector('#hsub');if(hb)hb.innerHTML=hubBody(key);if(hs&&HUB[key])hs.innerHTML=subOf(key);window.scrollTo(0,y);}).catch(function(){
    var hb=root.querySelector('#hbody .hload,.hload');if(hb)hb.outerHTML='<div class="g card" data-st><p class="note" style="margin:0">The topic index could not be built (offline?). Try again when you are online.</p></div>';});}
function onClick(e){var t=e.target.closest('button');if(!t||!CUR)return;var root=CUR.root;
  if(t.dataset.hf!=null){ST.f=t.dataset.hf;ST.lim=24;root.querySelectorAll('[data-hf]').forEach(function(b){b.setAttribute('aria-pressed',String(b===t));});
    var fd=root.querySelector('#hfeed');if(fd)fd.innerHTML=regFeed(regFilter(hubDocs('regulation'),ST.f),ST.lim);
    try{history.replaceState(null,'','#/topic/regulation'+(ST.f?'?f='+ST.f:''));}catch(x){}return;}
  if(t.dataset.hmore){ST.lim+=24;var f2=root.querySelector('#hfeed');if(!f2)return;
    var L=CUR.view==='peer'?coDocs(CUR.key):hubDocs(CUR.key);if(CUR.key==='gold')L=L.filter(function(d){return d.k!=='Gold';});
    f2.innerHTML=CUR.key==='regulation'?regFeed(regFilter(L,ST.f),ST.lim):feed(L,CUR.view==='peer'?'peers':CUR.key,ST.lim);
    var a=f2.querySelectorAll('.fi')[ST.lim-24];if(a){a.setAttribute('tabindex','-1');a.focus({preventScroll:false});}return;}
  }
/* Today's "Latest circulars" fallback: RBI / SEBI / IBBI circulars and calendar items in the last 10 days, from the index */
function circulars(){return SR.ensure().then(function(){var X=ix(),cut=new Date(+NB.dt(X.latest)-10*864e5).toISOString().slice(0,10),seen={};
  return hubDocs('regulation').filter(function(d){if(d.d<cut)return false;if(!isCirc(d))return false;
    var r=(d.tg.regulators||[]).concat(d.reg&&d.reg.regulator?[String(d.reg.regulator).toLowerCase()]:[]);if(!r.some(function(x){return x==='rbi'||x==='sebi'||x==='ibbi';}))return false;
    var f=NB.flatT(d.t).slice(0,40);if(seen[f])return false;seen[f]=1;return true;}).slice(0,10).map(function(d){var r=regOf(d);return {date:d.d,title:ttl(d.t),href:d.h,reg:{regulator:r.regulator,ref_no:r.ref_no,status:r.status,url:r.url}};});});}
window.NBHubs={html:html,mount:mount,title:title,circulars:circulars,dayHas:dayHas,_docs:hubDocs};
})();
