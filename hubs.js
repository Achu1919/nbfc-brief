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
  return '<article class="fi g" data-tap'+(d.c?' data-hub="'+d.c+'"':'')+'><div class="tagrow">'+c+'<span class="fk">'+esc(clip(kindL(d),40))+'</span></div>'+
    '<h3><a class="tap-a" href="'+esc(d.h)+'">'+esc(clip(ttl(d.t),160))+'</a></h3>'+(s&&s!==ttl(d.t)?'<p class="sum">'+esc(s)+'</p>':'')+(d.imp?NB.impLine(clip(clean(d.imp),220),window.NBCU&&NBCU.impactLabel):'')+
    '<div class="sc-f"><span class="by">'+(a?'Source: '+a:'')+'</span>'+'<span class="tap-ch" aria-hidden="true">\u203a</span>'+'</div></article>';}
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
  return '<article class="fi rc g" data-tap data-hub="regulation"><div class="tagrow">'+(r.regulator?'<span class="rgb">'+esc(r.regulator.toUpperCase())+'</span>':'')+(st?'<span class="st st-'+r.status+'">'+st+'</span>':'')+'<span class="fk">'+esc(kindL(d))+'</span></div>'+
    '<h3><a class="tap-a" href="'+esc(d.h)+'">'+esc(clip(ttl(d.t),160))+'</a></h3>'+(dl.length?'<dl class="rf">'+dl.map(function(x){return '<div><dt>'+x[0]+'</dt><dd class="'+(x[0]==='Ref no.'?'num':'')+'">'+esc(clip(clean(x[1]),120))+'</dd></div>';}).join('')+'</dl>':'')+
    (s&&s!==ttl(d.t)?'<p class="sum">'+esc(s)+'</p>':'')+(d.imp?NB.impLine(clip(clean(d.imp),220),window.NBCU&&NBCU.impactLabel):'')+
    '<div class="sc-f"><span class="by">'+(r.url&&/^https?:/.test(r.url)?'<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">Circular <span aria-hidden="true">\u2197</span><span class="sr"> (opens the source)</span></a>':'')+'</span>'+'<span class="tap-ch" aria-hidden="true">\u203a</span>'+'</div></article>';}
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
function dlStrip(rg){var L=deadlines(),today=+NB.dt(NB.todayIST());if(rg)L=L.filter(function(x){return nk(x.reg)===rg;});if(!L.length)return '';
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
  return '<section aria-labelledby="h-ncd"><div class="sec" data-st><h2 id="h-ncd">NCD status</h2><span class="aside">latest mention \u00b7 '+esc(NB.shortDay(d.d))+'</span></div><div class="g card ncd" data-tap data-st>'+
    '<p class="ncdl">'+NCDL+'</p><h3><a class="tap-a" href="'+esc(d.h)+'">'+esc(clip(ttl(d.t),160))+'</a></h3>'+(summ(d)?'<p class="sum">'+esc(summ(d))+'</p>':'')+
    '<div class="sc-f"><span class="by">'+(srcA(d.src)?'Source: '+srcA(d.src):'')+'</span>'+'<span class="tap-ch" aria-hidden="true">\u203a</span>'+'</div></div></section>';}
/* ---------- peers ---------- */
/* Peer Intelligence (cu.js): empty string when there are no entries or cu.js is missing */
function cu(f,a){var C=window.NBCU;if(!C||!C[f])return '';try{return C[f](a)||'';}catch(e){return '';}}
function peerName(co){return lab('companies',co)||co;}
/* Peers hub body: Peer Intelligence; the company list sits above it (entList) */
function peersBlock(){return cu('piSlot');}
/* ---------- list-then-detail: the companies / regulators / themes inside a hub ----------
   #/topic/<hub> opens on a list of entities; #/topic/<hub>/<entity> is that entity's own page.
   Entities come from the published tags (companies, regulators) read through the search index, so a company
   that appears in tomorrow's data gets a row without a code change. ALIAS folds other spellings of a slug.
   Hubs without a natural entity keep their plain page: Muthoot Fincorp (it is one company), Markets
   (index and rate numbers live in the Markets tab), and the private Teaching hub (lessons). */
var ALIAS={baf:'bajaj-finance','bajaj-finance-ltd':'bajaj-finance','manappuram-finance':'manappuram','muthoot-finance-ltd':'muthoot-finance',iifl:'iifl-finance','iifl-finance-ltd':'iifl-finance',
  shriram:'shriram-finance','shriram-finance-ltd':'shriram-finance',mfl:'muthoot-fincorp','muthoot-fincorp-ltd':'muthoot-fincorp',chola:'cholamandalam','cholamandalam-finance':'cholamandalam',
  'cholamandalam-investment-and-finance':'cholamandalam',abcl:'aditya-birla-capital','lt-finance':'l-and-t-finance','l-t-finance':'l-and-t-finance',piramal:'piramal-finance','piramal-enterprises':'piramal-finance',
  'mahindra-and-mahindra-financial-services':'mahindra-finance','m-and-m-finance':'mahindra-finance','lic-hfl':'lic-housing-finance','pnb-hfl':'pnb-housing-finance','reserve-bank-of-india':'rbi'};
function nk(x){x=String(x||'').toLowerCase().trim();return ALIAS[x]||x;}
function cosOf(d){var o=[];(d.tg.companies||[]).forEach(function(c){c=nk(c);if(c&&o.indexOf(c)<0)o.push(c);});return o;}
function rgsOf(d){var o=[];(d.tg.regulators||[]).concat(d.reg&&d.reg.regulator?[d.reg.regulator]:[]).forEach(function(r){r=nk(r);if(r&&o.indexOf(r)<0)o.push(r);});return o;}
function tps(d){return d.tg.topics||[];}
var REGN={rbi:'Reserve Bank of India',sebi:'Securities and Exchange Board of India',ibbi:'Insolvency and Bankruptcy Board of India',irdai:'Insurance Regulatory and Development Authority of India',
  nhb:'National Housing Bank',mca:'Ministry of Corporate Affairs',govt:'Government of India',pfrda:'Pension Fund Regulatory and Development Authority'};
var GTH=[{k:'gold-price',n:'Gold price & AGLOC',d:'IBJA and spot gold, AGLOC loan-to-value rates and gold price moves.',
    f:function(d){return tps(d).indexOf('gold-price')>=0||/\b(AGLOC|IBJA|gold price|price of gold|gold rates?)\b/i.test(d.t);}},
  {k:'gold-loan-rules',n:'Gold-loan rules',d:'Circulars, drafts and policy that touch gold loans.',
    f:function(d){return isCirc(d)||(rgsOf(d).some(function(r){return r!=='govt';})&&(tps(d).indexOf('circular')>=0||tps(d).indexOf('policy')>=0));}}];
var ENT={peers:{g:'co',core:PEERORD,lab:'Companies'},results:{g:'co',lab:'By company'},ratings:{g:'co',lab:'By company'},deals:{g:'co',lab:'By company'},
  'asset-quality':{g:'co',lab:'By company'},gold:{g:'co',lab:'Lenders',th:GTH},regulation:{g:'rg',core:['rbi','sebi','ibbi'],lab:'Regulators'}};
function thOf(hub,k){var E=ENT[hub];return E&&E.th?E.th.filter(function(t){return t.k===k;})[0]||null:null;}
function hubL(hub){var L=hubDocs(hub);return hub==='gold'?L.filter(function(d){return d.k!=='Gold';}):L;}
/* a regulator tag can come from a passing mention; when the title names regulators itself, only those count */
var RGRX={rbi:/\bRBI\b|Reserve Bank/,sebi:/\bSEBI\b/,ibbi:/\bIBBI\b|Insolvency and Bankruptcy Board/,irdai:/\bIRDAI?\b/,nhb:/\bNHB\b|National Housing Bank/,mca:/\bMCA\b|Ministry of Corporate Affairs/};
function keysOf(hub,d){if(ENT[hub].g!=='rg')return cosOf(d);var r=rgsOf(d),t=String(d.t||''),named=r.filter(function(x){return RGRX[x]&&RGRX[x].test(t);});return named.length?named:r;}
/* how the briefs write each name, besides the tag label; app-side only, the data format is untouched */
var SHORT={'muthoot-finance':'Muthoot Finance|MFIN','muthoot-fincorp':'Muthoot Fincorp|MFL','muthoot-microfin':'Muthoot Microfin','bajaj-finance':'Bajaj Finance|BAF','manappuram':'Manappuram',
  'iifl-finance':'IIFL','shriram-finance':'Shriram','cholamandalam':'Chola','aditya-birla-capital':'Aditya Birla|ABCL','l-and-t-finance':'L&T Finance|LTF','mahindra-finance':'Mahindra Finance|M&M Finance|MMFSL',
  'piramal-finance':'Piramal','lic-housing-finance':'LIC Housing|LIC HF','pnb-housing-finance':'PNB Housing','tata-capital':'Tata Capital','sbi':'SBI|State Bank','equitas-sfb':'Equitas',
  'poonawalla-fincorp':'Poonawalla','hdb-financial':'HDB Financial','five-star':'Five Star','home-first-finance':'Home First|HomeFirst','kotak-mahindra-bank':'Kotak'};
/* "Muthoot" alone is ambiguous (Finance or Fincorp), so a first word only counts when it is distinctive */
var AMBIG={muthoot:1,bajaj:1,lic:1,pnb:1,hdfc:1,tata:1,aditya:1,mahindra:1,'l&t':1,sbi:1,axis:1,kotak:1,icici:1,home:1,five:1,india:1,indian:1,new:1};
function rxq(x){return x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
var NRX={};function nameRx(hub,k){var ck=hub+'|'+k;if(NRX[ck])return NRX[ck];if(ENT[hub].g==='rg')return (NRX[ck]=RGRX[k]||new RegExp('\\b'+rxq(String(k).toUpperCase())+'\\b'));
  var n=eName(hub,k),w=n.split(/\s+/)[0],alt=[rxq(n)];if(w.length>=4&&!AMBIG[w.toLowerCase()]&&w!==n)alt.push(rxq(w));if(SHORT[k])SHORT[k].split('|').forEach(function(a){alt.push(rxq(a));});
  return (NRX[ck]=new RegExp('(?:^|[^A-Za-z0-9])(?:'+alt.join('|')+')(?![A-Za-z0-9])','i'));}
/* precision: an item counts for an entity when it is the item's only tag, or its title or text names the entity
   (week-level sections inherit every company of the week; those stay in the hub's full list) */
function entKeys(hub,d){var ks=keysOf(hub,d);if(ks.length<2)return ks;var txt=String(d.t||'')+' '+String(d.b||'');
  return ks.filter(function(k){if(MFLCO[k]&&d.k==='MFL')return true;if(d.reg&&d.reg.regulator&&nk(d.reg.regulator)===k)return true;return nameRx(hub,k).test(txt);});}
function eName(hub,k){var t=thOf(hub,k);if(t)return t.n;if(ENT[hub]&&ENT[hub].g==='rg')return lab('regulators',k)||String(k).toUpperCase();return peerName(k);}
/* one pass over the hub's items: per entity the count, editions, newest item and a 14-edition activity series */
function entIx(hub){var X=ix();if(!X||!ENT[hub])return null;hubDocs(hub);var ck='ent|'+hub;if(C.by[ck])return C.by[ck];
  var E=ENT[hub],L=hubL(hub),m={},tm={},none=0,days=M().days.slice(0,14).map(function(d){return d.id;}).reverse();
  function add(map,k,d){var e=map[k]||(map[k]={k:k,n:0,eds:{},cnt:{},top:null,any:null,first:d.d,last:d.d});e.n++;e.eds[d.d]=1;e.cnt[d.d]=(e.cnt[d.d]||0)+1;
    if(!e.any)e.any=d;if(!e.top&&d.k!=='Weekly')e.top=d;if(!e.tt&&d.k!=='Weekly'&&map===m&&nameRx(hub,k).test(ttl(d.t)))e.tt=d;if(d.d>e.last)e.last=d.d;if(d.d<e.first)e.first=d.d;}
  L.forEach(function(d){var ks=entKeys(hub,d);if(!keysOf(hub,d).length)none++;ks.forEach(function(k){add(m,k,d);});(E.th||[]).forEach(function(t){if(t.f(d))add(tm,t.k,d);});});
  function fin(e){e.ne=Object.keys(e.eds).length;e.ser=days.map(function(id){return e.cnt[id]||0;});e.top=e.tt||e.top||e.any;return e;}
  Object.keys(m).forEach(function(k){fin(m[k]);});Object.keys(tm).forEach(function(k){fin(tm[k]);});
  var N=Math.max(3,Math.ceil(L.length/50)),core=E.core||[],rank=Object.keys(m).map(function(k){return m[k];}).sort(function(a,b){return b.n-a.n||(a.last<b.last?1:a.last>b.last?-1:0);});
  function blank(k){return {k:k,n:0,ne:0,ser:days.map(function(){return 0;}),top:null,first:'',last:''};}
  var groups=[],used={};core.forEach(function(k){used[k]=1;});
  if(E.th){var th=E.th.map(function(t){return tm[t.k];}).filter(Boolean);if(th.length)groups.push({id:'th',t:'Themes',rows:th});}
  if(core.length)groups.push({id:'core',t:hub==='peers'?'Listed peers':'Main regulators',rows:core.map(function(k){return m[k]||blank(k);}),note:hub==='peers'?'Muthoot Finance is a separate listed company and a peer, not Muthoot Fincorp.':''});
  if(hub==='peers'){var grp=rank.filter(function(e){return MFLCO[e.k];});grp.forEach(function(e){used[e.k]=1;});if(grp.length)groups.push({id:'mfl',t:'Muthoot Fincorp group',rows:grp,note:'Peer stories that also name a group company.'});}
  var main=rank.filter(function(e){return !used[e.k]&&e.n>=N;}).slice(0,core.length?10:14);main.forEach(function(e){used[e.k]=1;});
  if(main.length)groups.push({id:'main',t:core.length?(hub==='peers'?'Other companies':'Other regulators'):E.lab,rows:main});
  var more=rank.filter(function(e){return !used[e.k];});
  return (C.by[ck]={m:m,tm:tm,groups:groups,more:more,N:N,total:L.length,none:none});}
function entDocs(hub,k){var t=thOf(hub,k),L=hubL(hub);if(t)return L.filter(t.f);return L.filter(function(d){return entKeys(hub,d).indexOf(k)>=0;});}
function priceOf(k){if(!k)return null;var day=M().days[0],full=NB.M.byId[day.id],it=full&&!full.stub?NB.item(full,k):null;
  if(it&&it.value!=null&&String(it.value).trim())return {v:String(it.value).replace(/^\u20b9/,''),it:it,ok:true};
  var s=NB.gSeries(k,day.id),p=s.length?s[s.length-1]:null;return p?{v:Number(p.v).toLocaleString('en-IN'),asof:p.d,ok:true}:null;}
function eHref(hub,k){return '#/topic/'+hub+'/'+encodeURIComponent(k);}
function eRow(hub,e){var t=thOf(hub,e.k),pk=hub==='peers'?PEERK[e.k]:null,pr=priceOf(pk),day=M().days[0];
  var meta=pr?[plural(e.n,'item')]:[];if(e.last)meta.push('last '+NB.dm(e.last));if(!pr&&e.ne)meta.push(plural(e.ne,'edition'));if(MFLCO[e.k])meta.unshift('Group');
  var note=hub==='peers'?cu('tileNote',e.k):'';
  var right=pr?'<span class="er-v num">\u20b9'+esc(pr.v)+'</span>':'<span class="er-v num">'+e.n+'</span>';
  var right2=pr?(pr.it?NB.chg(pr.it):'<span class="er-u num">close '+esc(NB.dm(pr.asof))+'</span>'):'<span class="er-u">'+(e.n===1?'item':'items')+'</span>';
  var spk=pr?NB.gChart(pk,day.id,64,22,false):bars(e.ser,64,20);
  return '<li data-st><a class="erow g press" href="'+eHref(hub,e.k)+'" data-hub="'+hub+'"><span class="er-n">'+esc(eName(hub,e.k))+'</span>'+right+
    '<span class="er-m num">'+esc(meta.join(' \u00b7 '))+esc(note)+'</span><span class="er-c">'+right2+'</span>'+
    '<span class="er-h">'+(e.top?esc(clip(ttl(e.top.t),150)):'<i>Nothing filed yet</i>')+'</span><span class="er-s">'+spk+'</span></a></li>';}
function entList(hub){var E=ENT[hub];if(!E)return '';var I=entIx(hub);
  if(!I)return '<section class="ents" aria-label="'+esc(E.lab)+'"><div class="g card hload" data-st role="status"><span class="sk-l"></span><span class="sk-l s"></span><span class="sr">Building the list\u2026</span></div></section>';
  var noun=E.g==='rg'?'regulator':'company',h='';
  I.groups.forEach(function(g,j){var hid='h-en-'+g.id;
    h+='<section aria-labelledby="'+hid+'" class="ents"><div class="sec" data-st><h2 id="'+hid+'">'+esc(g.t)+'</h2>'+(j===0?'<span class="aside">tap for its page</span>':'')+'</div>'+
      '<ul class="elist" role="list">'+g.rows.map(function(e){return eRow(hub,e);}).join('')+'</ul>'+(g.note?'<p class="note en-n" data-st>'+esc(g.note)+'</p>':'')+'</section>';});
  if(I.more.length){var id='en-more-'+hub;
    h+='<div class="en-more" data-st><button type="button" class="pill press" data-cux="'+id+'" aria-expanded="false" aria-controls="'+id+'">'+plural(I.more.length,'more '+noun,'more '+(noun==='company'?'companies':'regulators'))+' <span class="num">\u00b7 under '+I.N+' items each</span></button>'+
      '<ul class="emore" id="'+id+'" role="list" hidden>'+I.more.map(function(e){return '<li><a class="em press" href="'+eHref(hub,e.k)+'"><span class="em-n">'+esc(eName(hub,e.k))+'</span><span class="em-c num">'+plural(e.n,'item')+'</span></a></li>';}).join('')+'</ul></div>';}
  if(!h)return '';
  if(I.none&&E.g==='co'&&hub!=='peers')h+='<p class="note en-n" data-st>'+plural(I.none,'item')+' in this topic name no company; they are in the full list below.</p>';
  return h;}
/* ---------- an entity's page ---------- */
function entHd(hub,k,greet,sub){var h=HUB[hub];
  return '<div class="hd hubhd g" data-st="h" data-hub="'+hub+'"><a class="hback press" href="#/topic/'+hub+'" data-up><span aria-hidden="true">\u2039</span> '+esc(h.n)+'<span class="sr"> list</span></a>'+
    '<div class="hh"><span class="hh-i">'+NB.hubIcon(hub,24)+'</span><div><p class="greet">'+esc(greet)+'</p><h1>'+esc(eName(hub,k))+'</h1></div></div>'+(sub?'<p class="hsub">'+sub+'</p>':'')+'</div>';}
function factsCard(rows,src){rows=rows.filter(function(x){return x[1]!=null&&x[1]!=='';});if(!rows.length)return '';
  return '<section aria-labelledby="h-ef"><div class="sec" data-st><h2 id="h-ef">At a glance</h2></div><div class="g card" data-st><dl class="rf">'+rows.map(function(x){return '<div><dt>'+esc(x[0])+'</dt><dd class="num">'+esc(String(x[1]))+'</dd></div>';}).join('')+'</dl>'+(src||'')+'</div></section>';}
function crossLinks(hub,k){if(ENT[hub].g!=='co'||thOf(hub,k))return '';var out=[];
  Object.keys(ENT).forEach(function(h){if(h===hub||ENT[h].g!=='co')return;var I=entIx(h),e=I&&I.m[k];if(e&&e.n)out.push('<a class="pill press" href="'+eHref(h,k)+'" data-hub="'+h+'">'+NB.hubIcon(h,14)+' '+esc(HUB[h].n)+' <span class="num">'+e.n+'</span></a>');});
  if(!out.length)return '';
  return '<section aria-labelledby="h-ex"><div class="sec" data-st><h2 id="h-ex">In other topics</h2></div><div class="hsc" data-st><nav class="pills fx-sc ex-p" aria-labelledby="h-ex">'+out.join('')+'</nav></div></section>';}
function entHtml(hub,k){var E=ENT[hub],I=entIx(hub),t=thOf(hub,k),isRg=E.g==='rg';
  var greet=HUB[hub].n+(t?' \u00b7 Theme':isRg?' \u00b7 Regulator':hub==='peers'?(MFLCO[k]?' \u00b7 Group company':' \u00b7 Company'):' \u00b7 Company');
  if(!I)return entHd(hub,k,greet,'')+loading()+NB.foot();
  var e=t?I.tm[k]:I.m[k],known=e||(E.core||[]).indexOf(k)>=0||t;
  if(!known)return entHd(hub,k,greet,'')+'<div class="g card empty" data-st><p>Nothing in '+esc(HUB[hub].n)+' names \u201c'+esc(k)+'\u201d in these editions. <a href="#/topic/'+hub+'">See the '+esc(HUB[hub].n)+' list</a>.</p></div>'+NB.foot();
  var L=entDocs(hub,k),eds={};L.forEach(function(d){eds[d.d]=1;});var ne=Object.keys(eds).length,nm=eName(hub,k),last=L[0]&&L[0].d,first=L.length?L[L.length-1].d:'';
  var cnt=plural(L.length,'item')+' in '+plural(ne,'edition');
  var sub=t?esc(t.d):isRg?esc(REGN[k]||'')+(REGN[k]?' \u00b7 ':'')+'<span class="num">'+cnt+'</span>':
    hub==='peers'?(k==='muthoot-finance'?'A separate listed company and a peer, not Muthoot Fincorp. ':MFLCO[k]?'Peer stories that also name '+esc(nm)+'. <a href="#/topic/muthoot-fincorp">All Muthoot Fincorp coverage</a>. ':'')+'<span class="num">'+cnt+'</span>':
    esc(HUB[hub].n)+' items that name '+esc(nm)+' \u00b7 <span class="num">'+cnt+'</span>';
  var h=entHd(hub,k,greet,sub),pk=PEERK[k],rows=[];
  ST.L=L;
  if(hub==='peers'&&pk){var day=M().days[0],full=NB.M.byId[day.id],it=full&&!full.stub?NB.item(full,pk):null,ser=NB.gSeries(pk,day.id),pr=priceOf(pk);
    if(it){rows.push(['Last close','\u20b9'+String(it.value).replace(/^\u20b9/,'')]);if(it.change)rows.push(['Day change',it.change]);if(it.asof||it.as_of)rows.push(['As of',NB.dm(it.asof||it.as_of)]);}
    else if(pr){rows.push(['Last close in the briefs','\u20b9'+pr.v]);rows.push(['As of',NB.dm(pr.asof)]);}
    if(ser.length>1){var v=ser.map(function(p){return p.v;});rows.push(['Range in the briefs','\u20b9'+Math.min.apply(0,v).toLocaleString('en-IN')+' \u2013 \u20b9'+Math.max.apply(0,v).toLocaleString('en-IN')+' ('+ser.length+' closes since '+NB.dm(ser[0].d)+')']);}
    var src=it&&(it.source||it.url);src=typeof src==='object'&&src?src.url:src;
    rows.push(['Items',cnt]);if(last)rows.push(['Latest item',NB.shortDay(last)]);
    h+=factsCard(rows,src&&/^https?:/.test(src)?'<p class="by">Source: <a href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">price source<span class="sr"> (opens in new tab)</span></a></p>':'');
    var psec='<section aria-labelledby="h-pc"><div class="sec" data-st><h2 id="h-pc">Price</h2><span class="aside">NSE close, from the briefs</span></div><div class="g card pchart" data-st><div class="gx-in" data-gk="'+pk+'" data-gd="'+day.id+'">'+NB.gChartBlock(pk,day.id)+'</div></div></section>';}
  else if(t&&k==='gold-price'){var gd=M().days.filter(function(d){var f=NB.M.byId[d.id];return f&&!f.stub&&f.gold;})[0];if(gd)h+=NB.goldCard(NB.M.byId[gd.id],true);}
  else{rows.push(['Items',cnt]);if(last)rows.push(['Latest item',NB.shortDay(last)]);if(first&&first!==last)rows.push(['First in these editions',NB.shortDay(first)]);
    if(isRg){var dl=deadlines().filter(function(x){return nk(x.reg)===k;})[0];if(dl)rows.push(['Next deadline',NB.dm(dl.date)]);}
    h+=factsCard(rows,'');}
  if(isRg)h+=dlStrip(k);
  if(!t)h+=cu('entThreads',isRg?{rg:k,title:'Continuing threads'}:{co:k,title:'Continuing threads'});
  if(!isRg&&!t&&(hub==='peers'||hub==='results'))h+=cu('piHistory',k);
  if(typeof psec==='string')h+=psec;
  h+='<section aria-labelledby="h-hf"><div class="sec" data-st><h2 id="h-hf">Items over time</h2><span class="aside num">'+plural(L.length,'item')+' \u00b7 newest first</span></div><div id="hfeed">'+(hub==='regulation'?regFeed(L,ST.lim):feed(L,hub,ST.lim))+'</div></section>';
  h+=crossLinks(hub,k);
  if(hub!=='peers'&&E.g==='co'&&!t&&entIx('peers')&&entIx('peers').m[k])h+='<p class="note en-n" data-st><a href="'+eHref('peers',k)+'">'+esc(nm)+': all items, threads'+(PEERK[k]?' and price':'')+' \u2192</a></p>';
  return h+NB.foot();}
/* ---------- pages ---------- */
var ST={f:'',lim:24,L:null};
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
  return hubHd(slug,subOf(slug))+(ENT[slug]?'<div id="hents">'+entList(slug)+'</div>':'')+cu('hubThreads',slug)+'<div id="hbody">'+hubBody(slug)+'</div>'+NB.foot();}
/* routes: #/topic/<hub>, #/topic/<hub>/<entity> (app.js passes key "hub/entity"), and the older #/peer/<slug> */
function split(view,key){key=String(key||'');if(view==='peer')return {hub:'peers',ent:nk(key)};var i=key.indexOf('/');if(i<0)return {hub:key,ent:''};
  var hub=key.slice(0,i),ent=nk(key.slice(i+1).split('/')[0]);return ENT[hub]&&ent?{hub:hub,ent:ent}:{hub:hub,ent:''};}
function html(view,key,pq){ST={f:'',lim:24,L:null};var m=String(pq||'').match(/(?:^|&)f=([a-z-]+)/);if(m)ST.f=m[1];
  if(view==='topics')return topicsHtml();var r=split(view,key);if(r.ent)return entHtml(r.hub,r.ent);return hubHtml(r.hub);}
function title(view,key){if(view==='topics')return 'Topics';var r=split(view,key);if(r.ent)return eName(r.hub,r.ent)+' \u00b7 '+(HUB[r.hub]?HUB[r.hub].n:'');return HUB[r.hub]?HUB[r.hub].n:'Topics';}
function springIn(root){if(NB.RM.matches)return;var T=root.querySelectorAll('[data-tile]');
  T.forEach(function(t,i){if(!t.animate)return;t.animate([{opacity:0,transform:'translateY(14px) scale(.96)'},{opacity:1,transform:'none'}],{duration:NB.SPRINGS.Rise?NB.SPRINGS.Rise.ms:420,easing:NB.SPRINGS.Rise?NB.SPRINGS.Rise.easing:'cubic-bezier(.2,.9,.25,1.05)',delay:i*NB.STAGGER,fill:'backwards'});});}
var CUR=null;
function mount(root,view,key,pq){var r=view==='topics'?{hub:'',ent:''}:split(view,key),ent=r.ent;CUR={root:root,view:view,key:r.hub||key,hub:r.hub,ent:ent};
  var PI=ent&&(r.hub==='peers'||r.hub==='results');
  if(PI&&window.NBCU&&NBCU.piFocus)NBCU.piFocus(root,pq);
  /* earlier quarters arrive with data/peer_intel.json (idle prefetch, or now on first use): redraw that section */
  if(PI&&window.NBCU)NBCU.onPeer(function(){if(!CUR||CUR.root!==root||!root.isConnected)return;var y=window.scrollY;root.innerHTML=entHtml(r.hub,ent);window.scrollTo(0,y);if(NBCU.piFocus)NBCU.piFocus(root,pq);});
  if(view==='topics')springIn(root);
  if(!root.dataset.hb){root.dataset.hb=1;root.addEventListener('click',onClick);}
  /* back to a list from one of its pages: focus the row that was opened (the scroll position is restored by app.js) */
  if(!ent&&r.hub&&OLDH.indexOf('#/topic/'+r.hub+'/')===0){var a=root.querySelector('.erow[href="'+OLDH.split('?')[0].replace(/"/g,'')+'"],.em[href="'+OLDH.split('?')[0].replace(/"/g,'')+'"]');
    if(a){var em=a.closest('.emore');if(em&&em.hidden){em.hidden=false;var mb=root.querySelector('[aria-controls="'+em.id+'"]');if(mb)mb.setAttribute('aria-expanded','true');}a.focus({preventScroll:true});}}
  if(ix()&&!ix().stale)return;
  SR.ensure().then(function(){if(!CUR||CUR.root!==root||!root.isConnected)return;var y=window.scrollY;
    if(view==='topics'){var g=root.querySelector('#hubGrid');if(g){g.innerHTML=HUBS.map(tile).join('');}return;}
    if(ent){root.innerHTML=entHtml(r.hub,ent);window.scrollTo(0,y);if(PI&&window.NBCU&&NBCU.piFocus)NBCU.piFocus(root,pq);if(NB.cascade)NB.cascade(root);var h1=root.querySelector('h1');if(h1&&document.activeElement===document.body){h1.setAttribute('tabindex','-1');h1.focus({preventScroll:true});}return;}
    var he=root.querySelector('#hents');if(he&&ENT[key]){he.innerHTML=entList(key);if(NB.cascade)NB.cascade(he);}
    var hb=root.querySelector('#hbody'),hs=root.querySelector('#hsub');if(hb)hb.innerHTML=hubBody(key);if(hs&&HUB[key])hs.innerHTML=subOf(key);window.scrollTo(0,y);}).catch(function(){
    var hb=root.querySelector('#hbody .hload,.hload');if(hb)hb.outerHTML='<div class="g card" data-st><p class="note" style="margin:0">The topic index could not be built (offline?). Try again when you are online.</p></div>';});}
/* the header's back link goes back in history when the list is the page we came from, so Back and the link agree */
var OLDH='';window.addEventListener('hashchange',function(e){try{OLDH=new URL(e.oldURL).hash;}catch(x){OLDH='';}});
function onClick(e){var up=e.target.closest('a[data-up]');
  if(up&&OLDH&&OLDH.split('?')[0]===up.getAttribute('href')&&history.length>1){e.preventDefault();history.back();return;}
  var t=e.target.closest('button');if(!t||!CUR)return;var root=CUR.root;
  if(t.dataset.hf!=null){ST.f=t.dataset.hf;ST.lim=24;root.querySelectorAll('[data-hf]').forEach(function(b){b.setAttribute('aria-pressed',String(b===t));});
    var fd=root.querySelector('#hfeed');if(fd)fd.innerHTML=regFeed(regFilter(hubDocs('regulation'),ST.f),ST.lim);
    try{history.replaceState(null,'','#/topic/regulation'+(ST.f?'?f='+ST.f:''));}catch(x){}return;}
  if(t.dataset.hmore){ST.lim+=24;var f2=root.querySelector('#hfeed');if(!f2)return;
    if(CUR.ent){var LE=entDocs(CUR.hub,CUR.ent);f2.innerHTML=CUR.hub==='regulation'?regFeed(LE,ST.lim):feed(LE,CUR.hub,ST.lim);}
    else{var L=hubDocs(CUR.key);if(CUR.key==='gold')L=L.filter(function(d){return d.k!=='Gold';});
    f2.innerHTML=CUR.key==='regulation'?regFeed(regFilter(L,ST.f),ST.lim):feed(L,CUR.key,ST.lim);}
    var a=f2.querySelectorAll('.fi')[ST.lim-24];if(a){a.setAttribute('tabindex','-1');a.focus({preventScroll:false});}return;}
  }
/* Today's "Latest circulars" fallback: RBI / SEBI / IBBI circulars and calendar items in the last 10 days, from the index */
function circulars(){return SR.ensure().then(function(){var X=ix(),cut=new Date(+NB.dt(X.latest)-10*864e5).toISOString().slice(0,10),seen={};
  return hubDocs('regulation').filter(function(d){if(d.d<cut)return false;if(!isCirc(d))return false;
    var r=(d.tg.regulators||[]).concat(d.reg&&d.reg.regulator?[String(d.reg.regulator).toLowerCase()]:[]);if(!r.some(function(x){return x==='rbi'||x==='sebi'||x==='ibbi';}))return false;
    var f=NB.flatT(d.t).slice(0,40);if(seen[f])return false;seen[f]=1;return true;}).slice(0,10).map(function(d){var r=regOf(d);return {date:d.d,title:ttl(d.t),href:d.h,reg:{regulator:r.regulator,ref_no:r.ref_no,status:r.status,url:r.url}};});});}
window.NBHubs={html:html,mount:mount,title:title,circulars:circulars,dayHas:dayHas,_docs:hubDocs,_ent:entIx,_entDocs:entDocs};
})();
