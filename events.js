/* NBFC Brief / NBFC Guru: events calendar (feat/events-calendar). Identical file in both repos; app.js tells it which
   edition it is (window.__NB.priv). Reads data/events.json (schema "nbfc-events", v1, written by the 7 AM exporter),
   but only when latest.json carries events_index, so a site without the file makes no blind request.
   Draws: Today "Coming up" (next 7 days), #/calendar (list, filters, Past), #/calendar?view=month (event grid),
   #/event/<id> (detail), the "Upcoming" block on company / regulator pages, the Topics entry, and search documents.
   Missing, failed or empty file: every block hides itself and Calendar says "No events published yet". Never throws. */
(function(){'use strict';
function NB(){return window.__NB;}
function esc(s){return NB().esc(String(s==null?'':s));}
var IDRX=/^[a-z0-9][a-z0-9._-]{0,79}$/,ISO=/^(\d{4})-(\d{2})-(\d{2})$/;
var TYPES={'board-meeting':['Board meeting','company'],results:['Results','company'],agm:['AGM','company'],egm:['EGM','company'],'record-date':['Record date','company'],
  dividend:['Dividend','company'],fundraising:['Fund-raising','company'],'ncd-open':['NCD issue opens','debt'],'ncd-close':['NCD issue closes','debt'],'ncd-allotment':['NCD allotment','debt'],
  'ncd-listing':['NCD listing','debt'],coupon:['Coupon date','debt'],redemption:['Redemption','debt'],'rating-review':['Rating review','debt'],mpc:['RBI MPC','regulation'],
  'comments-due':['Comments due','regulation'],'circular-effective':['Takes effect','regulation'],'compliance-deadline':['Compliance deadline','regulation'],
  'results-window':['Results deadline','market'],other:['Other','']};
var GRP=[['','All'],['company','Company'],['debt','Debt'],['regulation','Regulation'],['market','Market']],GRPN={company:1,debt:1,regulation:1,market:1};
/* colour of a group = a hub colour already in the palette */
var GHUB={company:'results',debt:'deals',regulation:'regulation',market:'markets'};
var STAT={upcoming:'Upcoming',done:'Done',cancelled:'Cancelled',rescheduled:'Moved'};
/* the watch list (plan §1) plus the three regulators, in filter order */
var ENTS=['muthoot-fincorp','muthoot-finance','manappuram','iifl-finance','shriram-finance','bajaj-finance','muthoot-microfin','rbi','sebi','ibbi'];
var ENAME={'muthoot-fincorp':'Muthoot Fincorp','muthoot-finance':'Muthoot Finance',manappuram:'Manappuram','iifl-finance':'IIFL Finance','shriram-finance':'Shriram Finance',
  'bajaj-finance':'Bajaj Finance','muthoot-microfin':'Muthoot Microfin',rbi:'RBI',sebi:'SEBI',ibbi:'IBBI'};
/* other spellings of a slug fold onto the hub pages' slugs (hubs.js ALIAS uses the same targets) */
var EALIAS={mfl:'muthoot-fincorp','muthoot-fincorp-ltd':'muthoot-fincorp',muthootfincorp:'muthoot-fincorp',mfin:'muthoot-finance',muthootfin:'muthoot-finance','muthoot-finance-ltd':'muthoot-finance',
  'manappuram-finance':'manappuram','manappuram-finance-ltd':'manappuram',mafil:'manappuram',iifl:'iifl-finance','iifl-finance-ltd':'iifl-finance',shriram:'shriram-finance','shriram-finance-ltd':'shriram-finance',
  bajaj:'bajaj-finance',baf:'bajaj-finance',bajfinance:'bajaj-finance','bajaj-finance-ltd':'bajaj-finance',mmfl:'muthoot-microfin',muthootmicrofin:'muthoot-microfin','muthoot-micro-fin':'muthoot-microfin',
  'muthoot-microfin-ltd':'muthoot-microfin','reserve-bank-of-india':'rbi','securities-and-exchange-board-of-india':'sebi','insolvency-and-bankruptcy-board-of-india':'ibbi'};
var REGS={rbi:1,sebi:1,ibbi:1,irdai:1,nhb:1,mca:1,govt:1,pfrda:1};
/* aggregator calendars are never a date source (plan §1); their links are not shown as the official source */
var BAN=/(^|\.)(chittorgarh|moneycontrol|trendlyne)\.com$/i;
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],MONL=['January','February','March','April','May','June','July','August','September','October','November','December'];
var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],DOWL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var ICAL='M4 5.5h12v11H4zM4 8.6h12M7.4 3.6v3.2M12.6 3.6v3.2M7 11.6h2M11 11.6h2M7 14h2';
function ico(sz){return '<svg class="hic" width="'+sz+'" height="'+sz+'" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="'+ICAL+'"/></svg>';}
/* ---------- dates (all IST calendar days, no clock maths) ---------- */
function iso(s){return typeof s==='string'&&ISO.test(s)&&!isNaN(Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10)))?s:null;}
function ms(s){return Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10));}
function ymd(t){return new Date(t).toISOString().slice(0,10);}
function add(s,n){return ymd(ms(s)+n*864e5);}
function diff(a,b){return Math.round((ms(b)-ms(a))/864e5);}
function dow(s){return new Date(ms(s)).getUTCDay();}
function today(){try{return NB().todayIST();}catch(e){return ymd(Date.now()+19800000);}}
function dDay(s){return DOW[dow(s)]+' '+(+s.slice(8,10))+' '+MON[+s.slice(5,7)-1];}
function dDayY(s){return dDay(s)+' '+s.slice(0,4);}
function dLong(s){return DOWL[dow(s)]+' '+(+s.slice(8,10))+' '+MONL[+s.slice(5,7)-1]+' '+s.slice(0,4);}
function dm(s){return (+s.slice(8,10))+' '+MON[+s.slice(5,7)-1];}
function range(e,y){if(!e.date_end)return y?dDayY(e.date):dm(e.date);var a=e.date,b=e.date_end,sm=a.slice(0,7)===b.slice(0,7);
  return (sm?(+a.slice(8,10)):dm(a)+(a.slice(0,4)!==b.slice(0,4)?' '+a.slice(0,4):''))+'\u2013'+dm(b)+(y?' '+b.slice(0,4):'');}
function rel(n){return n===0?'today':n===1?'tomorrow':n===-1?'yesterday':n>1?'in '+n+' days':(-n)+' days ago';}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function end(e){return e.date_end||e.date;}
/* "11:00" -> "11 AM IST"; time_text wins and always says IST */
function tIST(e,short){var t=e.time_text;if(!t&&e.time){var h=+e.time.slice(0,2),m=e.time.slice(3,5);t=((h%12)||12)+(m!=='00'?':'+m:'')+' '+(h<12?'AM':'PM');}
  if(!t)return '';if(short)return t.replace(/\s*IST\b/i,'');return /\bIST\b/i.test(t)?t:t+' IST';}
/* ---------- the file ---------- */
var E={st:'idle',p:null,list:[],by:{},next:{},gen:null};
function priv(){try{return !!NB().priv;}catch(e){return false;}}
function ext(){try{return NB().M.ext||{};}catch(e){return {};}}
function idx(){var x=ext().events_index;return x&&typeof x==='object'&&!Array.isArray(x)?x:null;}
function file(){var i=idx(),f=i&&typeof i.file==='string'?i.file.replace(/^\/+/,''):'data/events.json';return /^data\/[\w.-]+\.json$/.test(f)?'/'+f:'/data/events.json';}
function str(s){return typeof s==='string'?s.replace(/\s+/g,' ').trim():'';}
function ek(s){s=str(s).toLowerCase();return EALIAS[s]||s;}
function host(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return '';}}
function srcOf(s){if(typeof s==='string')s={url:s};if(!s||typeof s!=='object')return null;var u=str(s.url||s.u);if(!/^https?:\/\//i.test(u))return null;var h=host(u);if(!h||BAN.test(h))return null;
  return {name:str(s.name||s.label||s.l)||h,url:u,tier:s.tier!=null?String(s.tier):''};}
function norm(key,x){if(!x||typeof x!=='object'||Array.isArray(x))return null;var id=str(x.id||key);if(!IDRX.test(id))return null;
  var d=iso(x.date),t=str(x.title);if(!d||!t)return null;var de=iso(x.date_end);if(!de||de<=d)de=null;
  var ty=TYPES[x.type]?x.type:'other',ent=ek(x.entity),g=GRPN[x.group]?x.group:TYPES[ty][1]||(REGS[ent]?'regulation':'company');
  var src=[];[x.source].concat(Array.isArray(x.sources)?x.sources:[]).forEach(function(s){s=srcOf(s);if(s&&!src.some(function(y){return y.url===s.url;}))src.push(s);});
  var oc=x.outcome&&typeof x.outcome==='object'?x.outcome:null;
  if(oc){oc={date:iso(oc.date),summary:str(oc.summary),story_id:str(oc.story_id),card_id:str(oc.card_id),source:srcOf(oc.source)};if(!oc.summary&&!oc.story_id&&!oc.card_id&&!oc.source)oc=null;}
  return {id:id,title:t,type:ty,group:g,date:d,date_end:de,time:/^\d{2}:\d{2}$/.test(x.time||'')?x.time:'',time_text:str(x.time_text),status:STAT[x.status]?x.status:'upcoming',
    status_note:str(x.status_note),supersedes:IDRX.test(str(x.supersedes))?str(x.supersedes):'',entity:ent,entity_name:str(x.entity_name),agenda:str(x.agenda),src:src,
    story_id:str(x.story_id),card_id:str(x.card_id),reg_ref:str(x.reg_ref),outcome:oc,related:Array.isArray(x.related_ids)?x.related_ids.map(str).filter(function(r){return IDRX.test(r)&&r!==id;}):[],
    conditional:x.conditional===true,pub:x.public!==false,first_seen:iso(x.first_seen),updated:iso(x.updated)};}
function ingest(j){E.list=[];E.by={};E.next={};if(!j||typeof j!=='object'||Array.isArray(j))return;if(j.schema&&j.schema!=='nbfc-events')return;E.gen=typeof j.generated==='string'?j.generated:null;
  var ev=j.events,keys=[];if(Array.isArray(ev))ev.forEach(function(x,i){keys.push([x&&x.id,x]);});else if(ev&&typeof ev==='object')Object.keys(ev).forEach(function(k){keys.push([k,ev[k]]);});
  var P=priv();keys.forEach(function(kv){var e=null;try{e=norm(kv[0],kv[1]);}catch(x){e=null;}if(!e||E.by[e.id])return;
    /* public edition: public rows with an official link only, even if the file should already be public-only */
    if(!P&&(!e.pub||!e.src.length))return;E.by[e.id]=e;E.list.push(e);});
  E.list.sort(cmp);E.list.forEach(function(e){if(e.supersedes&&E.by[e.supersedes])E.next[e.supersedes]=e.id;});}
function cmp(a,b){return a.date<b.date?-1:a.date>b.date?1:(a.time||'99')<(b.time||'99')?-1:(a.time||'99')>(b.time||'99')?1:a.title<b.title?-1:1;}
function load(){if(E.p)return E.p;if(!idx()){E.st='none';E.p=Promise.resolve(false);return E.p;}E.st='loading';
  E.p=fetch(file(),{cache:'no-cache'}).then(function(r){return r.ok?r.json():null;}).then(function(j){try{ingest(j);}catch(e){E.list=[];}E.st=E.list.length?'ok':'none';return E.st==='ok';})
    .catch(function(){E.list=[];E.by={};E.st='none';return false;});return E.p;}
function ready(){return E.st==='ok'||E.st==='none';}
function has(){return E.st==='ok';}
/* ---------- names and links ---------- */
function eName(e){var s=typeof e==='string'?e:e.entity;if(typeof e!=='string'&&e.entity_name)return e.entity_name;if(ENAME[s])return ENAME[s];
  try{var L=window.NBSearch&&NBSearch.label;var n=L&&(L(REGS[s]?'regulators':'companies',s));if(n&&n!==s)return n;}catch(x){}return s?s.toUpperCase().length<6?s.toUpperCase():cap(s.replace(/-/g,' ')):'';}
function eHref(s){if(!s)return '';if(s==='muthoot-fincorp')return '#/topic/muthoot-fincorp';if(REGS[s])return '#/topic/regulation/'+encodeURIComponent(s);return '#/topic/peers/'+encodeURIComponent(s);}
function tLab(e){return TYPES[e.type][0];}
/* 'Board meeting' -> 'board meeting'; acronyms (EGM, RBI MPC, NCD …) keep their case */
function kindLow(e){var l=tLab(e);return /^[A-Z][a-z]/.test(l)?l.charAt(0).toLowerCase()+l.slice(1):l;}
function gHub(e){return GHUB[e.group]||'cal';}
function stChip(e){var past=e.status==='upcoming'&&end(e)<today();var k=past?'wait':e.status,l=past?'Awaiting outcome':STAT[e.status];
  return '<span class="st evst-'+k+'">'+esc(l)+'</span>';}
function href(e){return '#/event/'+encodeURIComponent(e.id);}
/* ---------- selections ---------- */
function upcoming(from,days){var b=from||today(),t=days!=null?add(b,days):null;return E.list.filter(function(e){return e.status==='upcoming'&&end(e)>=b&&(t==null||e.date<=t);});}
function pastL(days){var b=today(),f=add(b,-(days||60));return E.list.filter(function(e){var up=e.status==='upcoming'&&end(e)>=b;return !up&&end(e)>=f&&e.date<=add(b,400);}).sort(function(a,b2){return cmp(b2,a);});}
function match(e,F){if(F.e&&e.entity!==F.e)return false;if(F.g&&e.group!==F.g)return false;return true;}
/* ---------- rows ---------- */
function rowWhen(e,mode){if(mode==='date')return '<span class="evr-w num">'+esc(range(e))+'</span>';var t=tIST(e,true);
  return '<span class="evr-w num">'+(e.date_end?esc(range(e)):t?esc(t):'<span class="evr-ad">All day</span>')+'</span>';}
function row(e,mode){var k=tLab(e)+(e.conditional?' \u00b7 if finalised':''),up=e.status==='upcoming'&&end(e)>=today();
  return '<li><a class="evr press" href="'+href(e)+'" data-hub="'+gHub(e)+'">'+rowWhen(e,mode)+
  '<span class="evr-e">'+esc(eName(e))+'<span class="evr-kk"> \u00b7 '+esc(k)+'</span></span><span class="evr-k">'+esc(k)+'</span>'+
  '<span class="evr-n">'+esc(e.title)+'</span><span class="evr-s'+(up?' up':'')+'">'+stChip(e)+'</span><span class="evr-c" aria-hidden="true">\u203a</span></a></li>';}
function dayGroups(L,asc){var by={},ord=[];L.forEach(function(e){if(!by[e.date]){by[e.date]=[];ord.push(e.date);}by[e.date].push(e);});
  var t=today();return ord.map(function(d){var n=diff(t,d);
    return '<div class="evday" data-st><h3 class="evdh"><span class="num">'+esc(dDay(d))+'</span><span class="evrel">'+esc(cap(rel(n)))+'</span></h3><ul class="evrows g" role="list">'+by[d].map(function(e){return row(e,'day');}).join('')+'</ul></div>';}).join('');}
/* ---------- Today: "Coming up" ---------- */
function stripCards(L){var t=today();
  return L.map(function(e){var n=diff(t,e.date),s=e.src[0],when=(e.date_end&&n<0?'until '+dm(e.date_end):cap(rel(Math.max(n,0)))+(e.date_end?' \u00b7 '+range(e):''))+(tIST(e)?' \u00b7 '+tIST(e,true):'');
    return '<li'+(s?' class="has-x"':'')+'><a class="dl evc g press" href="'+href(e)+'" data-hub="'+gHub(e)+'"><span class="dl-d"><b class="num">'+(+e.date.slice(8,10))+'</b><span>'+MON[+e.date.slice(5,7)-1]+'</span></span>'+
      '<span class="dl-b"><span class="dl-n num">'+esc(when)+'</span><span class="dl-t">'+esc(e.title)+'</span><span class="evc-m">'+esc(eName(e))+' \u00b7 '+esc(tLab(e))+'</span></span></a>'+
      (s?'<a class="dl-x press" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">\u2197</span><span class="sr">Source for '+esc(e.title.slice(0,60))+' (opens in a new tab)</span></a>':'')+'</li>';}).join('');}
function stripList(){if(has())return upcoming(null,7);
  /* before the file is in: latest.json upcoming_events[] (same window, written by the exporter) */
  if(E.st==='none'||!idx())return [];var U=ext().upcoming_events;if(!Array.isArray(U))return [];var P=priv(),o=[],t=today();
  U.forEach(function(x){var e=null;try{e=norm(x&&x.id,x);}catch(y){}if(!e||(!P&&(!e.pub||!e.src.length)))return;if(e.status==='upcoming'&&end(e)>=t&&e.date<=add(t,7)&&!o.some(function(y){return y.id===e.id;}))o.push(e);});return o.sort(cmp);}
function todayStrip(day){try{var M=NB().M;if(!day||!M.days.length||day.id!==M.days[0].id||!idx())return '';}catch(e){return '';}
  var L=stripList();return '<section class="evup" id="evup" aria-labelledby="h-evup" data-evslot="today" data-evids="'+esc(L.map(function(e){return e.id;}).join(','))+'"'+(L.length?'':' hidden')+'>'+(L.length?stripInner(L):'')+'</section>';}
function stripInner(L){return '<div class="sec" data-st><h2 id="h-evup">Coming up</h2><a class="aside" href="#/calendar">next 7 days \u00b7 Calendar \u2192</a></div>'+
  '<div class="hsc" data-st><ul class="dls evs fx-sc" role="list" aria-labelledby="h-evup">'+stripCards(L)+'</ul></div>';}
/* ---------- company / regulator pages: "Upcoming" ---------- */
function entBlock(k){k=ek(k);if(!k)return '';if(!ready())return '<div data-evslot="ent:'+esc(k)+'" hidden></div>';if(!has())return '';
  var L=upcoming().filter(function(e){return e.entity===k;});if(!L.length)return '';var n=L.length;L=L.slice(0,5);
  return '<section aria-labelledby="h-event" class="event" data-evslot="ent:'+esc(k)+'"><div class="sec" data-st><h2 id="h-event">Upcoming</h2><a class="aside" href="#/calendar?e='+encodeURIComponent(k)+'">Calendar \u2192</a></div>'+
    '<ul class="evrows g" role="list" data-st>'+L.map(function(e){return row(e,'date');}).join('')+'</ul>'+(n>5?'<p class="note en-n" data-st><a href="#/calendar?e='+encodeURIComponent(k)+'">'+(n-5)+' more in the Calendar \u2192</a></p>':'')+'</section>';}
/* ---------- Topics: the way in ---------- */
function topicsLink(){var n=has()?upcoming().length:null,nx=has()?upcoming()[0]:null;
  return '<a class="evlink g press" href="#/calendar" data-hub="cal" data-st data-evslot="topics"><span class="hh-i">'+ico(20)+'</span><span class="evl-b"><span class="evl-n">Calendar</span>'+
    '<span class="evl-d">'+(nx?esc(eName(nx)+' \u00b7 '+tLab(nx)+' \u00b7 '+range(nx)):'Board meetings, record dates, NCD and regulatory dates')+'</span></span>'+
    '<span class="evl-c num">'+(n?n+' ahead':'')+'</span><span class="tap-ch" aria-hidden="true">\u203a</span></a>';}
/* ---------- Calendar ---------- */
function readF(pq,key){var p=new URLSearchParams(String(pq||'').replace(/^\?/,''));var F={e:ek(p.get('e')||''),g:GRPN[p.get('g')]?p.get('g'):'',v:p.get('view')==='month'||key==='month'?'month':'list',m:'',d:iso(p.get('d')||'')||''};
  var m=String(p.get('m')||'');if(/^\d{4}-\d{2}$/.test(m))F.m=m;if(F.d&&!F.m)F.m=F.d.slice(0,7);return F;}
function qs(F,v){var o=[];if(F.e)o.push('e='+encodeURIComponent(F.e));if(F.g)o.push('g='+F.g);if((v||F.v)==='month'){o.unshift('view=month');if(F.m)o.push('m='+F.m);if(F.d)o.push('d='+F.d);}return o.length?'?'+o.join('&'):'';}
function hdr(sub){return '<div class="hd hubhd g evhd" data-st="h" data-hub="cal"><div class="hh"><span class="hh-i">'+ico(24)+'</span><div><p class="greet">Dates ahead</p><h1>Calendar</h1></div></div><p class="hsub" id="evsub">'+sub+'</p></div>';}
function subTxt(){if(!has())return 'Board meetings, record dates, NCD issues and regulatory deadlines, from official filings.';var u=upcoming().length;
  return 'Board meetings, record dates, NCD issues and regulatory deadlines, from official filings \u00b7 <span class="num">'+u+' ahead</span>. Dates are IST.';}
function seg(F){return '<nav class="seg evseg" aria-label="Calendar view" data-st><a href="#/calendar'+qs(F,'list')+'"'+(F.v==='list'?' aria-current="true"':'')+'>List</a><a href="#/calendar'+qs(F,'month')+'"'+(F.v==='month'?' aria-current="true"':'')+'>Month</a></nav>';}
function filters(F){var cnt={},gc={},all=upcoming();all.forEach(function(e){cnt[e.entity]=(cnt[e.entity]||0)+1;gc[e.group]=(gc[e.group]||0)+1;});
  var ents=ENTS.slice();E.list.forEach(function(e){if(e.entity&&ents.indexOf(e.entity)<0)ents.push(e.entity);});
  function pill(attr,v,l,n,on){return '<button type="button" class="pill press" '+attr+'="'+esc(v)+'" aria-pressed="'+on+'">'+esc(l)+(n?' <span class="num">'+n+'</span>':'')+'</button>';}
  return '<div class="evf" data-st><div class="evf-r" role="group" aria-label="Company or regulator"><span class="evf-l" aria-hidden="true">Who</span><div class="hsc"><div class="pills fx-sc evf-s">'+
    pill('data-ef','','All',all.length,!F.e)+ents.map(function(k){return pill('data-ef',k,eName(k),cnt[k],F.e===k);}).join('')+'</div></div></div>'+
    '<div class="evf-r" role="group" aria-label="Kind of date"><span class="evf-l" aria-hidden="true">Kind</span><div class="hsc"><div class="pills fx-sc evf-s">'+
    GRP.map(function(g){return pill('data-eg',g[0],g[1],g[0]?gc[g[0]]:all.length,F.g===g[0]);}).join('')+'</div></div></div></div>';}
function fDesc(F){return [F.e?eName(F.e):'',F.g?GRP.filter(function(g){return g[0]===F.g;})[0][1].toLowerCase()+' dates':''].filter(Boolean).join(', ');}
function listBody(F){var U=upcoming().filter(function(e){return match(e,F);}),P=pastL(60).filter(function(e){return match(e,F);});
  var h='<section aria-labelledby="h-evu"><div class="sec" data-st><h2 id="h-evu">Upcoming</h2><span class="aside num">'+U.length+' '+(U.length===1?'event':'events')+'</span></div>';
  h+=U.length?dayGroups(U):'<div class="g card evnone" data-st><p class="note" style="margin:0">No upcoming dates'+(F.e||F.g?' for '+esc(fDesc(F))+'. <button type="button" class="evclr" data-evclr>Show all</button>':'.')+'</p></div>';
  h+='</section>';
  if(P.length)h+='<section class="evpast" aria-label="Past 60 days"><div class="en-more" data-st><button type="button" class="pill press" data-cux="evpastl" aria-expanded="false" aria-controls="evpastl">Past 60 days <span class="num">'+P.length+'</span></button>'+
    '<div id="evpastl" hidden>'+dayGroups(P)+'</div></div></section>';
  return h;}
/* month grid: Archive's look (.cal), event marks, keyboard calendar (roving tabindex; arrows, Home/End, PageUp/PageDown) */
function months(){var t=today().slice(0,7),lo=t,hi=t;E.list.forEach(function(e){var a=e.date.slice(0,7),b=end(e).slice(0,7);if(a<lo)lo=a;if(b>hi)hi=b;});
  var f=add(today(),-62).slice(0,7);if(lo<f)lo=f;var o=[],m=lo;while(m<=hi&&o.length<36){o.push(m);var y=+m.slice(0,4),n=+m.slice(5,7);m=n===12?(y+1)+'-01':y+'-'+(n<9?'0':'')+(n+1);}return o;}
function onDay(d,F){return E.list.filter(function(e){return e.date<=d&&end(e)>=d&&match(e,F);});}
function mName(m){return MONL[+m.slice(5,7)-1]+' '+m.slice(0,4);}
function grid(F){var mo=F.m,y=+mo.slice(0,4),m=+mo.slice(5,7)-1,n=new Date(Date.UTC(y,m+1,0)).getUTCDate(),lead=(new Date(Date.UTC(y,m,1)).getUTCDay()+6)%7,t=today(),cells=[];
  for(var i=0;i<lead;i++)cells.push('<td role="gridcell"></td>');
  for(var d=1;d<=n;d++){var id=mo+'-'+(d<10?'0':'')+d,L=onDay(id,F),gs={};L.forEach(function(e){gs[e.group]=1;});var sel=id===F.d;
    var lab=DOWL[dow(id)]+' '+d+' '+MONL[m]+': '+(L.length?L.length+(L.length===1?' event':' events'):'no events')+(id===t?', today':'');
    cells.push('<td role="gridcell" aria-selected="'+sel+'"><button type="button" class="ecd'+(L.length?' has':'')+(id===t?' now':'')+(sel?' sel':'')+'" data-evd="'+id+'" tabindex="'+(sel?0:-1)+'" aria-label="'+esc(lab)+'"'+(id===t?' aria-current="date"':'')+'><span class="n" aria-hidden="true">'+d+'</span>'+
      '<span class="dots" aria-hidden="true">'+Object.keys(gs).slice(0,3).map(function(g){return '<i class="evd-'+g+'"></i>';}).join('')+'</span></button></td>');}
  while(cells.length%7)cells.push('<td role="gridcell"></td>');var rows='';for(var r=0;r<cells.length;r+=7)rows+='<tr>'+cells.slice(r,r+7).join('')+'</tr>';
  return '<thead><tr>'+['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(function(w){return '<th scope="col" abbr="'+w+'"><span aria-hidden="true">'+w[0]+'</span><span class="sr">'+w+'</span></th>';}).join('')+'</tr></thead><tbody>'+rows+'</tbody>';}
function pickDay(F){var ms2=months();if(!F.m||ms2.indexOf(F.m)<0)F.m=F.d&&ms2.indexOf(F.d.slice(0,7))>=0?F.d.slice(0,7):today().slice(0,7);
  if(!F.d||F.d.slice(0,7)!==F.m){var t=today();if(t.slice(0,7)===F.m)F.d=t;else{var f=E.list.filter(function(e){return e.date.slice(0,7)===F.m&&match(e,F);})[0];F.d=f?f.date:F.m+'-01';}}}
function dayList(F){var L=onDay(F.d,F),n=diff(today(),F.d);
  return '<div class="sec" data-st><h2 id="h-evdl">'+esc(dDay(F.d))+'</h2><span class="aside">'+esc(cap(rel(n)))+' \u00b7 <span class="num">'+L.length+'</span> '+(L.length===1?'event':'events')+'</span></div>'+
    (L.length?'<ul class="evrows g" role="list" data-st aria-labelledby="h-evdl">'+L.map(function(e){return row(e,'day');}).join('')+'</ul>':'<div class="g card evnone" data-st><p class="note" style="margin:0">No events on this day'+(F.e||F.g?' for '+esc(fDesc(F)):'')+'.</p></div>');}
function monthBody(F){pickDay(F);var ms2=months(),i=ms2.indexOf(F.m);
  return '<section class="g cal evcal" data-st aria-labelledby="evcalT"><div class="cal-h"><button type="button" class="ic sm gl press" data-evm="-1" aria-label="Previous month"'+(i<=0?' disabled':'')+'><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg></button>'+
    '<h2 id="evcalT" aria-live="polite"><span class="evcal-k">Events \u00b7 </span>'+esc(mName(F.m))+'</h2><button type="button" class="ic sm gl press" data-evm="1" aria-label="Next month"'+(i>=ms2.length-1?' disabled':'')+'><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5"/></svg></button></div>'+
    '<div class="cal-vp"><table class="evg" role="grid" aria-labelledby="evcalT" aria-describedby="evcalN">'+grid(F)+'</table></div>'+
    '<ul class="legend" aria-label="Mark colours"><li><i class="evd-company"></i>Company</li><li><i class="evd-debt"></i>Debt</li><li><i class="evd-regulation"></i>Regulation</li><li><i class="evd-market"></i>Market</li></ul>'+
    '<p class="note evcal-n" id="evcalN">Marks are announced event dates, not editions. Editions are in Archive.</p></section>'+
    '<section id="evdl" aria-live="polite">'+dayList(F)+'</section>';}
function calHtml(key,pq){var F=readF(pq,key);ST.F=F;
  if(!ready())return hdr(subTxt())+'<div class="g card hload" data-st role="status" data-evload><span class="sk-l"></span><span class="sk-l s"></span><span class="sr">Loading the calendar\u2026</span></div>'+NB().foot();
  if(!has())return hdr(subTxt())+'<div class="g card empty evempty" data-st><span class="hh-i" data-hub="cal">'+ico(22)+'</span><h2>No events published yet</h2><p>Board meetings, record dates, NCD and regulatory dates will appear here once the daily brief adds them from official filings.</p><a class="cta ghost press" href="#/topic/regulation">Regulation deadlines <span aria-hidden="true">\u2192</span></a></div>'+NB().foot();
  return hdr(subTxt())+seg(F)+filters(F)+'<div id="evbody">'+(F.v==='month'?monthBody(F):listBody(F))+'</div>'+NB().foot();}
/* ---------- one event ---------- */
function rowsDl(R){R=R.filter(function(x){return x[1];});return '<dl class="rf evdl">'+R.map(function(x){return '<div'+(x[2]?' class="wide"':'')+'><dt>'+esc(x[0])+'</dt><dd>'+x[1]+'</dd></div>';}).join('')+'</dl>';}
function srcLinks(L){return '<ul class="evsrc" role="list">'+L.map(function(s){return '<li><a class="press" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer"><span class="evsrc-n">'+esc(s.name)+'</span><span class="evsrc-h num">'+esc(host(s.url))+(s.tier?' \u00b7 Tier '+esc(s.tier.replace(/^tier\s*/i,'')):'')+'</span><span aria-hidden="true" class="evsrc-x">\u2197</span><span class="sr"> (opens in a new tab)</span></a></li>';}).join('')+'</ul>';}
function thread(id){try{return id&&window.NBCU&&NBCU.thread?NBCU.thread(id):null;}catch(e){return null;}}
var RK={news:'01-daily-watch',rules:'02-regulation',weekly:'03-weekly-analysis'};
function cardHref(id){var m=String(id||'').match(/^(\d{4}-\d{2}-\d{2})-(news|rules|weekly)\b/);try{if(!m||!NB().M.byId[m[1]])return '';}catch(e){return '';}return '#/'+m[1]+'/read/'+RK[m[2]]+'?card='+encodeURIComponent(id);}
function evHd(e,greet,sub){return '<div class="hd hubhd g evhd evx" data-st="h" data-hub="'+(e?gHub(e):'cal')+'"><a class="hback press" href="#/calendar" data-evup><span aria-hidden="true">\u2039</span> Calendar</a>'+
  '<div class="hh"><span class="hh-i">'+ico(24)+'</span><div><p class="greet">'+esc(greet)+'</p><h1>'+esc(e?e.title:'Event not found')+'</h1></div></div>'+(sub?'<p class="hsub">'+sub+'</p>':'')+'</div>';}
function evHtml(id){var foot=NB().foot();
  if(!ready())return evHd(null,'Event','').replace('Event not found','Event')+'<div class="g card hload" data-st role="status" data-evload><span class="sk-l"></span><span class="sk-l s"></span><span class="sr">Loading the event\u2026</span></div>'+foot;
  var e=E.by[id];
  if(!e)return evHd(null,'Calendar','')+'<div class="g card empty" data-st><p>There is no event with the id \u201c'+esc(id)+'\u201d in the published calendar'+(has()?'':' (no events are published yet)')+'. It may have been renamed or removed. <a href="#/calendar">See the Calendar</a>.</p></div>'+foot;
  var t=today(),n=diff(t,e.date),ne=diff(t,end(e)),when=range(e,true),tm=tIST(e),eh=eHref(e.entity);
  var sub=stChip(e)+'<span class="num"> '+esc(e.date_end?when:dDayY(e.date))+(tm?' \u00b7 '+esc(tm):'')+'</span>'+(e.status==='upcoming'&&ne>=0?' \u00b7 '+esc(e.date_end&&n<0?'on now, until '+dm(e.date_end):rel(n)):'');
  var h=evHd(e,'Event \u00b7 '+tLab(e),sub);
  if(e.conditional)h+='<p class="note evcond" data-st><b>If finalised.</b> The source gives this date on a condition, so it is not a firm date yet.</p>';
  var nx=E.next[e.id]?E.by[E.next[e.id]]:null,pv=e.supersedes?E.by[e.supersedes]:null;
  if(e.status==='rescheduled'||nx)h+='<a class="g card evmove press" data-st href="'+(nx?href(nx):'#/calendar')+'"><span class="evmove-k">Moved</span><span class="evmove-t">'+(nx?'New date: <b class="num">'+esc(range(nx,true))+'</b>'+(tIST(nx)?' \u00b7 '+esc(tIST(nx)):''):'A new date has not been published yet.')+'</span>'+(nx?'<span class="tap-ch" aria-hidden="true">\u203a</span>':'')+'</a>';
  if(e.status==='cancelled')h+='<p class="g card evmove" data-st><span class="evmove-k">Cancelled</span><span class="evmove-t">'+esc(e.status_note||'The company or regulator has withdrawn this date.')+'</span></p>';
  var R=[['Date (IST)',esc(e.date_end?dLong(e.date)+' \u2013 '+dLong(e.date_end):dLong(e.date))],['Time (IST)',tm?esc(tm):''],
    [REGS[e.entity]?'Regulator':'Company',e.entity?(eh?'<a href="'+eh+'">'+esc(eName(e))+'</a>':esc(eName(e))):''],['Type',esc(tLab(e))],['Status',esc(e.status==='upcoming'&&ne<0?'Date passed, outcome not published yet':STAT[e.status])+(e.status_note&&e.status!=='cancelled'?' \u00b7 '+esc(e.status_note):'')],
    ['Agenda, as announced',esc(e.agenda),1],['Replaces',pv?'<a href="'+href(pv)+'">'+esc(range(pv,true))+'</a>':'' ],['Reference',esc(e.reg_ref)],
    ['In the calendar since',e.first_seen?esc(dDayY(e.first_seen)):''],['Last updated',e.updated&&e.updated!==e.first_seen?esc(dDayY(e.updated)):'']];
  if(priv()&&!e.pub)R.push(['Edition','Private edition only']);
  h+='<section aria-labelledby="h-evw"><div class="sec" data-st><h2 id="h-evw">When and what</h2></div><div class="g card evcard" data-st>'+rowsDl(R)+'</div></section>';
  if(e.outcome){var o=e.outcome,th=thread(o.story_id),ch=cardHref(o.card_id);
    h+='<section aria-labelledby="h-evo"><div class="sec" data-st><h2 id="h-evo">Outcome</h2>'+(o.date?'<span class="aside num">'+esc(dDayY(o.date))+'</span>':'')+'</div><div class="g card evcard evout" data-st>'+(o.summary?'<p>'+esc(o.summary)+'</p>':'')+
      '<p class="evlinks">'+[th?'<a href="#/story/'+esc(th.id)+'">Story: '+esc(th.title||'timeline')+' \u2192</a>':o.story_id?'<a href="#/story/'+esc(o.story_id)+'">The story \u2192</a>':'',ch?'<a href="'+esc(ch)+'">The item in that edition \u2192</a>':'',
        o.source?'<a href="'+esc(o.source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(o.source.name)+' <span aria-hidden="true">\u2197</span><span class="sr"> (opens in a new tab)</span></a>':''].filter(Boolean).join('')+'</p></div></section>';}
  else if(e.status==='upcoming'&&ne<0)h+='<p class="note evcond" data-st>The date has passed. The outcome appears here once the filing or the story is published.</p>';
  if(e.src.length)h+='<section aria-labelledby="h-evs"><div class="sec" data-st><h2 id="h-evs">Official source</h2>'+(e.src.length>1?'<span class="aside num">'+e.src.length+' links</span>':'')+'</div><div class="g card evcard flush" data-st>'+srcLinks(e.src)+'</div></section>';
  /* earlier dates of the same kind for this entity get their own list; Related keeps the rest (an issue's open / close / listing) */
  var ear=E.list.filter(function(x){return x.id!==e.id&&x.entity===e.entity&&x.type===e.type&&x.date<e.date;}).reverse().slice(0,5);
  var th2=thread(e.story_id),ch2=cardHref(e.card_id),rel2=e.related.map(function(r){return E.by[r];}).filter(function(x){return x&&ear.indexOf(x)<0&&!(x.entity===e.entity&&x.type===e.type);}).sort(cmp);
  if(th2||ch2||rel2.length||e.story_id){h+='<section aria-labelledby="h-evr"><div class="sec" data-st><h2 id="h-evr">Related</h2></div>';
    /* the thread card only links a thread that exists in this edition's stories.json (threadLater swaps it in once loaded) */
    if(th2)h+='<a class="g card evth press" data-st href="#/story/'+esc(th2.id)+'" data-hub="'+(th2.cat||gHub(e))+'"><span class="evth-k">Story thread</span><span class="evth-t">'+esc(th2.title||'Open the story timeline')+'</span>'+(th2.updates?'<span class="evth-m num">'+th2.updates.length+' updates'+(th2.last?' \u00b7 latest '+esc(dm(th2.last)):'')+'</span>':'')+'<span class="tap-ch" aria-hidden="true">\u203a</span></a>';
    else if(e.story_id)h+='<div class="evth-slot" hidden></div>';
    if(ch2)h+='<p class="note en-n" data-st><a href="'+esc(ch2)+'">The item in the '+esc(dDay(ch2.slice(2,12)))+' edition \u2192</a></p>';
    if(rel2.length)h+='<ul class="evrows g" role="list" data-st aria-label="Related dates">'+rel2.map(function(r){return row(r,'date');}).join('')+'</ul>';
    h+='</section>';}
  var nxt=E.list.filter(function(x){return x.entity===e.entity&&x.type===e.type&&x.date>e.date&&x.status==='upcoming';})[0];
  if(nxt&&e.status!=='upcoming'&&!nx)h+='<p class="note en-n" data-st><a href="'+href(nxt)+'">Next '+esc(kindLow(e))+': '+esc(range(nxt,true))+' \u2192</a></p>';
  if(ear.length)h+='<section aria-labelledby="h-eve"><div class="sec" data-st><h2 id="h-eve">Earlier '+esc(kindLow(e))+' dates</h2><span class="aside">'+esc(eName(e))+'</span></div><ul class="evrows g" role="list" data-st>'+ear.map(function(r){return row(r,'date');}).join('')+'</ul></section>';
  h+='<p class="note evfoot" data-st>Dates and times are IST, as published in the official source. Check the filing before relying on a date.</p>';
  return h+foot;}
/* ---------- search documents (search.js adds them at load time; never stored) ---------- */
function searchDocs(){return load().then(function(){if(!has())return [];return E.list.map(function(e){var co=[],rg=[],tp=[];if(e.entity){if(REGS[e.entity])rg.push(e.entity);else co.push(e.entity);}
  if(e.type==='results'||e.type==='results-window')tp.push('results');if(/^ncd-|coupon|redemption/.test(e.type))tp.push('ncd');if(e.type==='rating-review')tp.push('rating');if(e.group==='regulation')tp.push('circular');
  var s=e.src[0];return {d:e.date,k:'Event',s:'Calendar \u00b7 '+tLab(e),t:e.title,b:[eName(e),tLab(e),range(e,true),tIST(e),e.agenda,STAT[e.status],e.date_end?'':dLong(e.date)].filter(Boolean).join(' \u00b7 '),
    src:s?{l:s.name,u:s.url}:null,h:href(e),c:e.group==='regulation'?'regulation':e.entity==='muthoot-fincorp'?'muthoot-fincorp':e.group==='market'?'markets':co.length?'peers':null,tg:{companies:co,regulators:rg,topics:tp}};});}).catch(function(){return [];});}
/* ---------- mount, clicks, keys ---------- */
var ST={F:null},CUR=null,OLDH='';
window.addEventListener('hashchange',function(e){try{OLDH=new URL(e.oldURL).hash;}catch(x){OLDH='';}});
function html(view,key,pq){try{return view==='event'?evHtml(String(key||'')):calHtml(key,pq);}catch(e){return '<div class="hd" data-st="h"><p class="greet">Calendar</p><h1>Calendar</h1></div><div class="g card empty" data-st><p>The calendar could not be drawn. <a href="#/">Back to Today</a>.</p></div>';}}
function title(view,key){if(view==='event'){var e=E.by[key];return e?e.title:'Event';}return 'Calendar';}
function syncFilters(root){var F=ST.F;root.querySelectorAll('[data-ef]').forEach(function(b){b.setAttribute('aria-pressed',String((b.getAttribute('data-ef')||'')===F.e));});
  root.querySelectorAll('[data-eg]').forEach(function(b){b.setAttribute('aria-pressed',String((b.getAttribute('data-eg')||'')===F.g));});
  var sg=root.querySelectorAll('.evseg a');if(sg.length===2){sg[0].setAttribute('href','#/calendar'+qs(F,'list'));sg[1].setAttribute('href','#/calendar'+qs(F,'month'));}
  try{history.replaceState(history.state,'','#/calendar'+qs(F));}catch(x){}}
function body(root,anim){var b=root.querySelector('#evbody');if(!b)return;b.innerHTML=ST.F.v==='month'?monthBody(ST.F):listBody(ST.F);syncFilters(root);
  if(anim!==false)rise(b);}
function rise(el){var N=NB();if(!el||!el.animate||N.RM.matches)return;var sp=N.SPRINGS.Rise;
  [].slice.call(el.querySelectorAll('[data-st]'),0,8).forEach(function(x,i){x.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:sp.ms+80,easing:sp.easing,delay:i*N.STAGGER,fill:'backwards'});});}
function fade(el){var N=NB();if(!el||!el.animate)return;if(N.RM.matches){el.animate([{opacity:0},{opacity:1}],{duration:150});return;}var sp=N.SPRINGS.Rise;
  el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:sp.ms+80,easing:sp.easing});}
function monthGo(root,delta,focusDay){var ms2=months(),i=ms2.indexOf(ST.F.m)+delta;if(i<0||i>=ms2.length)return false;ST.F.m=ms2[i];
  ST.F.d=focusDay&&focusDay.slice(0,7)===ST.F.m?focusDay:'';pickDay(ST.F);var b=root.querySelector('#evbody');if(!b)return false;b.innerHTML=monthBody(ST.F);syncFilters(root);
  var g=b.querySelector('.evg');if(g&&g.animate&&!NB().RM.matches){var sp=NB().SPRINGS.Quick;g.animate([{transform:'translateX('+(delta*24)+'px)',opacity:0},{transform:'none',opacity:1}],{duration:sp.ms,easing:sp.easing});}
  return true;}
function selDay(root,d,focus){ST.F.d=d;root.querySelectorAll('.evg td[aria-selected]').forEach(function(td){var b=td.querySelector('[data-evd]'),on=!!b&&b.getAttribute('data-evd')===d;td.setAttribute('aria-selected',String(on));if(b){b.classList.toggle('sel',on);b.tabIndex=on?0:-1;if(on&&focus)b.focus();}});
  var l=root.querySelector('#evdl');if(l){l.innerHTML=dayList(ST.F);rise(l);}syncFilters(root);}
function onClick(e){var root=CUR&&CUR.root;if(!root)return;var up=e.target.closest('a[data-evup]');
  if(up){if(OLDH&&OLDH.split('?')[0]==='#/calendar'&&history.length>1){e.preventDefault();history.back();}return;}
  var b=e.target.closest('button');if(!b||!root.contains(b)||!ST.F)return;
  if(b.hasAttribute('data-ef')){ST.F.e=b.getAttribute('data-ef')||'';if(ST.F.v==='month'){ST.F.d='';pickDay(ST.F);}body(root);return;}
  if(b.hasAttribute('data-eg')){ST.F.g=b.getAttribute('data-eg')||'';if(ST.F.v==='month'){ST.F.d='';pickDay(ST.F);}body(root);return;}
  if(b.hasAttribute('data-evclr')){ST.F.e='';ST.F.g='';body(root);var a=root.querySelector('[data-ef=""]');if(a)a.focus();return;}
  if(b.hasAttribute('data-evm')){var dl=+b.getAttribute('data-evm');monthGo(root,dl);var nb=root.querySelector('[data-evm="'+dl+'"]');if(nb&&!nb.disabled)nb.focus();else{var c=root.querySelector('.evg [tabindex="0"]');if(c)c.focus();}return;}
  if(b.hasAttribute('data-evd')){selDay(root,b.getAttribute('data-evd'),false);return;}}
function onKey(e){var c=e.target.closest&&e.target.closest('.evg [data-evd]');if(!c||!CUR)return;var root=CUR.root,d=c.getAttribute('data-evd'),j=null,wd=(dow(d)+6)%7;
  switch(e.key){case 'ArrowLeft':j=add(d,-1);break;case 'ArrowRight':j=add(d,1);break;case 'ArrowUp':j=add(d,-7);break;case 'ArrowDown':j=add(d,7);break;
    case 'Home':j=add(d,-wd);break;case 'End':j=add(d,6-wd);break;
    case 'PageUp':case 'PageDown':{e.preventDefault();var dl=e.key==='PageUp'?-1:1,y=+d.slice(0,4),m=+d.slice(5,7)-1+dl;var yy=y+Math.floor(m/12),mm=((m%12)+12)%12,last=new Date(Date.UTC(yy,mm+1,0)).getUTCDate();
      var t=yy+'-'+(mm<9?'0':'')+(mm+1)+'-'+String(Math.min(+d.slice(8,10),last)).padStart(2,'0');if(monthGo(root,dl,t))selDay(root,t,true);return;}
    default:return;}
  e.preventDefault();if(j.slice(0,7)!==ST.F.m){if(monthGo(root,j<d?-1:1,j))selDay(root,j,true);return;}
  /* arrows move the focus and the selection together (the day's list follows) */
  selDay(root,j,true);}
function fill(root){root.querySelectorAll('[data-evslot]').forEach(function(s){var k=s.getAttribute('data-evslot'),n=null;
  if(k==='today'){var L=stripList(),ids=L.map(function(e){return e.id;}).join(',');if(ids===s.getAttribute('data-evids')&&(L.length?!s.hidden:s.hidden))return;
    s.setAttribute('data-evids',ids);s.innerHTML=L.length?stripInner(L):'';var was=s.hidden;s.hidden=!L.length;if(L.length&&was)fade(s);return;}
  if(k==='topics'){var t=document.createElement('div');t.innerHTML=topicsLink();n=t.firstElementChild;if(n){s.querySelector('.evl-d').innerHTML=n.querySelector('.evl-d').innerHTML;s.querySelector('.evl-c').innerHTML=n.querySelector('.evl-c').innerHTML;}return;}
  if(k.indexOf('ent:')===0){if(!s.hidden)return;var h=entBlock(k.slice(4));if(!h){s.remove();return;}var t2=document.createElement('div');t2.innerHTML=h;n=t2.firstElementChild;s.replaceWith(n);fade(n);}});}
function focusH1(root){var h1=root.querySelector('h1');if(h1&&(document.activeElement===document.body||!document.activeElement||!root.contains(document.activeElement))){h1.setAttribute('tabindex','-1');h1.focus({preventScroll:true});}
  var cb=document.getElementById('cbT');if(cb&&h1)cb.textContent=h1.textContent;}
function mount(root,view,key,pq){try{
  if(view==='calendar'||view==='event'){CUR={root:root,view:view,key:key};if(!root.dataset.evb){root.dataset.evb=1;root.addEventListener('click',onClick);root.addEventListener('keydown',onKey);
      var x0=null,y0=0;root.addEventListener('touchstart',function(e){var t=e.target.closest('.evcal .cal-vp');if(!t){x0=null;return;}x0=e.touches[0].clientX;y0=e.touches[0].clientY;},{passive:true});
      root.addEventListener('touchend',function(e){if(x0==null)return;var t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.4)monthGo(root,dx<0?1:-1);},{passive:true});}
    var tpE=document.getElementById('tpE');if(tpE)tpE.textContent='Calendar';
    /* Back from an event to the calendar: focus the row that was opened */
    if(view==='calendar'&&OLDH.indexOf('#/event/')===0){var a=root.querySelector('a.evr[href="'+OLDH.split('?')[0].replace(/"/g,'')+'"]');
      if(a){var px=a.closest('#evpastl');if(px&&px.hidden){px.hidden=false;var pb=root.querySelector('[aria-controls="evpastl"]');if(pb)pb.setAttribute('aria-expanded','true');}a.focus({preventScroll:true});}}}
  if(ready()&&!root.querySelector('[data-evload]')){fill(root);if(view==='event')threadLater(root,key);return;}
  load().then(function(){if(!root.isConnected)return;
    if((view==='calendar'||view==='event')&&root.querySelector('[data-evload]')){var y=window.scrollY;root.innerHTML=html(view,key,pq);window.scrollTo(0,y);if(NB().cascade)NB().cascade(root);focusH1(root);
      try{document.title=title(view,key)+' \u00b7 '+document.title.split(' \u00b7 ').slice(1).join(' \u00b7 ');}catch(x){}return;}
    fill(root);}).then(function(){if(view==='event')threadLater(root,key);}).catch(function(){});}catch(e){}}
/* the story thread's title and count arrive with data/stories.json (cu.js loads it on demand): swap in just that card */
function threadLater(root,key){var e=E.by[key];if(!e||!e.story_id||thread(e.story_id)||!window.NBCU||!NBCU.loadStories)return;
  NBCU.loadStories().then(function(){if(!root.isConnected||!thread(e.story_id))return;var old=root.querySelector('.evth-slot');if(!old)return;var t=document.createElement('div');t.innerHTML=evHtml(key);var n=t.querySelector('.evth');if(n){old.replaceWith(n);fade(n);}}).catch(function(){});}
window.NBEV={load:load,html:html,mount:mount,title:title,todayStrip:todayStrip,entBlock:entBlock,topicsLink:topicsLink,searchDocs:searchDocs,
  _E:function(){return E;},_upcoming:function(){return upcoming();}};
})();
