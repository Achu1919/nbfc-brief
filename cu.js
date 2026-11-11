/* NBFC Brief / NBFC Guru: content upgrade, step 1. Loaded before app.js (both deferred, so it runs first) and
   used by app.js and hubs.js through window.NBCU. Three jobs:
   1. Tolerant readers for the optional fields NBFC Guru adds to the data (story threads, multi-source, regulation
      lifecycle and deadlines, continuing_stories, story_index, peer_intel, week_review). Every field is optional:
      a missing, null or malformed field renders nothing, so the app looks exactly as it did before.
   2. Lazy loading of the story index (story_index.file, normally data/stories.json) and the Peer Intelligence
      archive (data/peer_intel.json) once the page is idle, through the service worker's network-first data cache
      (so they work offline after one online open). Skipped on Save-Data / 2G; then they load on first use.
   3. Renderers: Peer Intelligence cards (Peers hub, peer pages, Today nudge) and the card basics (sources line,
      lifecycle and deadline chips, thread badges, impact label).
   Built from one source for both editions; the public file is generated without any private-only code. */
(function(){'use strict';
var PRIV=false;
function NB(){return window.__NB;}
var ISO=/^\d{4}-\d{2}-\d{2}$/,SID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function S(x){return typeof x==='string'&&x.trim()?x.trim():'';}
function A(x){return Array.isArray(x)?x.filter(function(v){return v!=null;}):[];}
function O(x){return x&&typeof x==='object'&&!Array.isArray(x)?x:null;}
function N(x){return typeof x==='number'&&isFinite(x)?x:null;}
function D(x){return typeof x==='string'&&ISO.test(x)?x:'';}
function U(x){return typeof x==='string'&&/^https?:\/\/[^\s]+$/.test(x)?x:'';}
function Id(x){x=S(x);return x&&x.length<=80&&SID.test(x)?x:'';}
function esc(s){return NB().esc(s);}
function host(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return '';}}
function tcase(s){s=String(s).replace(/[-_]+/g,' ');return s.charAt(0).toUpperCase()+s.slice(1);}
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function dObj(id){return new Date(id+'T00:00:00');}
function dm(id){var d=dObj(id);return d.getDate()+' '+MON[d.getMonth()];}
function sday(id){var d=dObj(id);return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()];}
function diff(a,b){return Math.round((dObj(a)-dObj(b))/864e5);}
var uid=0;function nid(p){return p+'-'+(++uid);}
var LC={draft:'Draft',final:'Final',effective:'Effective',superseded:'Superseded',withdrawn:'Withdrawn'};
var ROLE={primary:'Primary',data:'Data',context:'Context',analysis:'Analysis'};
var EV={results:'Results','investor-deck':'IR deck','call-transcript':'Transcript','call-recording':'Call recording','rating-rationale':'Rating rationale','annual-report':'Annual report'};
var EVL={results:'results','investor-deck':'investor deck','call-transcript':'call transcript','call-recording':'call recording','rating-rationale':'rating rationale','annual-report':'annual report'};
var METL={aum:'AUM',gold_aum:'Gold loan AUM',disbursements:'Disbursements',yield:'Yield',cof:'Cost of funds',nim:'NIM',spread:'Spread',opex_ratio:'Opex ratio',
  credit_cost:'Credit cost',gnpa:'GNPA',nnpa:'NNPA',pcr:'PCR',crar:'CRAR',roa:'RoA',roe:'RoE',pat:'PAT',branches:'Branches',gold_tonnes:'Gold held',avg_ticket:'Average ticket'};
var PEERN={'muthoot-finance':['Muthoot Finance','Muthoot Finance'],manappuram:['Manappuram Finance','Manappuram'],'iifl-finance':['IIFL Finance','IIFL Finance'],
  'shriram-finance':['Shriram Finance','Shriram Finance'],'bajaj-finance':['Bajaj Finance','Bajaj Finance']};
var DK={comments:'Comments close',effective:'Effective',compliance:'Compliance due',other:'Deadline'};
var IMPACT='Possible impact on Muthoot Fincorp';

/* ---------------- state ---------------- */
var X={gen:'',latestId:'',fixture:false,cont:[],contBy:{},refs:{},sidx:null,pi:[],week:null,storyFile:'',peerFile:''};
var L={stories:null,peer:null,sp:null,pp:null,cbs:[],warmed:false};

/* ---------------- dev-only fixture switch ----------------
   ?fixture=content-upgrade loads tests/fixtures/content-upgrade/overlay.json on top of the real latest.json, so a
   preview can show the new UI before NBFC Guru's data exists. It works only on localhost and on this project's
   branch-preview hosts (never on the production domains, never on the master alias), and the overlay is marked
   EXAMPLE DATA everywhere it shows. */
var FXDIR='tests/fixtures/content-upgrade/';
function fxHost(){var h=location.hostname;
  return h==='localhost'||h==='127.0.0.1'||h==='[::1]'||(/^nbfc-(brief|guru)-git-[a-z0-9-]+-achu1919s-projects\.vercel\.app$/.test(h)&&!/-git-master-/.test(h));}
function fxOn(){return /[?&]fixture=content-upgrade(?:&|$)/.test(location.search)&&fxHost();}
function shift(id,n){var d=dObj(id);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function fxTok(v,ctx){if(typeof v==='string'){var m=v.match(/^@D([+-]\d+)?$/);if(m)return shift(ctx.d,+(m[1]||0));
    m=v.match(/^@R([+-]\d+):([+-]\d+)$/);if(m){var a=shift(ctx.d,+m[1]),b=shift(ctx.d,+m[2]),x=dObj(a),y=dObj(b);
      return x.getMonth()===y.getMonth()?x.getDate()+'\u2013'+y.getDate()+' '+MON[y.getMonth()]:dm(a)+' \u2013 '+dm(b);}
    m=v.match(/^@card:(\d+)$/);if(m){var c=ctx.news[+m[1]];return c?c.id:null;}return v;}
  if(Array.isArray(v))return v.map(function(x){return fxTok(x,ctx);});
  if(O(v)){var o={};Object.keys(v).forEach(function(k){o[k]=fxTok(v[k],ctx);});return o;}return v;}
function fxApply(j,ov){var t=j.today||{},news=A(t.cards).filter(function(c){return c&&(c.report==='news'||c.report==='01-daily-watch');});
  var ctx={d:t.id||new Date().toISOString().slice(0,10),news:news};ov=fxTok(ov,ctx);
  var top=O(ov.latest)||{};Object.keys(top).forEach(function(k){j[k]=top[k];});
  function patch(list,ps){A(ps).forEach(function(p){var x=list[p.pos];if(!O(x))return;var set=O(p.set)||{};
    Object.keys(set).forEach(function(k){if(k==='reg'&&O(x.reg))x.reg=Object.assign({},x.reg,set.reg);else x[k]=set[k];});});}
  patch(news,ov.today_cards);
  /* example rows are added (marked "Example"), never written over real circulars or deadlines */
  if(A(ov.latest_circulars_add).length)j.latest_circulars=A(ov.latest_circulars_add).concat(A(j.latest_circulars));
  if(A(ov.deadlines_add).length)j.deadlines=A(j.deadlines).concat(A(ov.deadlines_add)).sort(function(a,b){return String(a.date)<String(b.date)?-1:1;});
  j._fixture=true;return j;}
function prep(j){if(!fxOn()||!j||!j.today)return Promise.resolve(j);
  return fetch('/'+FXDIR+'overlay.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw 0;return r.json();})
    .then(function(ov){try{return fxApply(j,ov);}catch(e){return j;}}).catch(function(){return j;});}
function fxBanner(){return X.fixture?'<p class="cu-fx" data-st role="note"><b>Example data</b> \u00b7 preview fixture, not real figures</p>':'';}

/* ---------------- tolerant readers ---------------- */
function src(s){s=O(s);if(!s)return null;var u=U(s.url),n=S(s.name)||(u?host(u):'');if(!n)return null;
  var t=s.tier,fb=s.fallback===true;if(t==='fallback'){t=3;fb=true;}t=t===1||t===2||t===3?t:null;
  var pg=N(s.page)!=null?String(s.page):S(s.page);
  return {name:n,url:u,tier:t,fallback:fb,role:ROLE[s.role]?s.role:'',page:pg};}
function srcSort(L){var seen={};return L.filter(function(x){if(!x)return false;var k=x.url||x.name;if(seen[k])return false;seen[k]=1;return true;})
  .map(function(x,i){return [x,i];}).sort(function(a,b){return (a[0].tier||4)-(b[0].tier||4)||a[1]-b[1];}).map(function(x){return x[0];});}
function cardSources(c){var L=A(c&&c.sources).map(src).filter(Boolean);if(!L.length){var s=src(c&&c.source);if(s)L=[s];}return srcSort(L);}
function reg(r,top){r=O(r)||{};top=O(top)||{};
  var lc=S(top.lifecycle)||S(r.lifecycle),near=r.deadline_near===true||top.deadline_near===true;
  if(lc==='deadline-near'){lc='';near=true;}
  var dl=O(r.deadline)||O(top.deadline),dd=null;
  if(dl&&D(dl.date))dd={date:dl.date,text:S(dl.date_text),kind:DK[dl.kind]?dl.kind:'other'};
  else if(D(r.comments_due))dd={date:r.comments_due,text:'',kind:'comments'};
  else if(D(r.effective)&&lc&&lc!=='effective')dd={date:r.effective,text:'',kind:'effective'};
  var fc=O(r.first_covered)||O(top.first_covered);
  return {lc:lc&&/^[a-z-]{2,24}$/.test(lc)?lc:'',dl:dd,near:near,fc:fc&&D(fc.date)?{date:fc.date,card:S(fc.card_id),report:S(fc.report),title:S(fc.title)}:null};}
function card(c){c=O(c)||{};var r=O(c.reg);
  var o={id:S(c.id),sid:Id(c.story_id),seq:N(c.thread_seq)!=null&&c.thread_seq>=1?Math.round(c.thread_seq):null,upd:c.is_update===true,
    dup:S(c.dup_of),sources:cardSources(c),label:S(c.impact_label)||IMPACT,reg:r?reg(r,null):null,stRef:A(c.stories_ref).map(Id).filter(Boolean)};
  return o;}
function contItem(x){x=O(x);if(!x)return null;var sid=Id(x.story_id);if(!sid||!S(x.title))return null;var la=O(x.latest)||{},nx=O(x.next);
  return {sid:sid,title:S(x.title),cat:S(x.category),status:S(x.status),opened:D(x.opened),last:D(x.last_update)||D(la.date),
    count:N(x.update_count)!=null?x.update_count:N(x.updates),
    latest:{date:D(la.date),card:S(la.card_id),report:S(la.report),kind:la.kind==='status'?'status':'update',title:S(la.title),summary:S(la.summary),source:src(la.source)},
    recent:A(x.recent).map(O).filter(Boolean).slice(0,3),next:nx&&(S(nx.what)||D(nx.date))?{date:D(nx.date),text:S(nx.date_text),what:S(nx.what)}:null,
    reg:O(x.reg)?reg(x.reg,null):null};}
function refItem(x){x=O(x);if(!x||!S(x.title))return null;return {title:S(x.title),cat:S(x.category),status:S(x.status),opened:D(x.opened),last:D(x.last_update),
  count:N(x.update_count),continues:A(x.continues).map(Id).filter(Boolean),continuedBy:A(x.continued_by).map(Id).filter(Boolean)};}
var DATAP=/^data\/[A-Za-z0-9_\/-]+\.json$/;
function okPath(p){p=S(p).replace(/^\//,'');if(!p||p.indexOf('..')>=0)return '';if(DATAP.test(p))return p;
  return X.fixture&&p.indexOf(FXDIR)===0&&/\.json$/.test(p)?p:'';}
function num(v,u){v=N(v);if(v==null)return '';u=S(u);var s=v.toLocaleString('en-IN',{maximumFractionDigits:2}); /* as published: never rounded away */
  if(u==='%')return s+'%';if(/^\u20b9/.test(u))return '\u20b9'+s+(u.replace(/^\u20b9\s*/,'')?' '+u.replace(/^\u20b9\s*/,''):'');if(u==='x')return s+'x';return u?s+' '+u:s;}
function pct(v){v=N(v);if(v==null)return '';return (v>0?'+':v<0?'\u2212':'')+Math.abs(v).toLocaleString('en-IN',{maximumFractionDigits:1})+'%';}
function mlab(o){return S(o.label)||METL[S(o.key)]||(S(o.key)?tcase(o.key):'');}
/* qoq_pct / yoy_pct are the company's own figures, or computed by the exporter (computed:true) on the same basis */
function metric(m){m=O(m);if(!m)return null;var lab=mlab(m);if(!lab)return null;
  return {key:S(m.key),label:lab,unit:S(m.unit),v:N(m.value),prev:N(m.prev_value),prevP:S(m.prev_period),qoq:N(m.qoq_pct),yoy:N(m.yoy_pct),
    disc:m.disclosed!==false,note:S(m.note),lastP:S(m.last_disclosed_period),src:src(m.source)};}
function cmpRow(r){r=O(r);if(!r)return null;var lab=mlab(r);if(!lab)return null;var s=src(r.source);
  return {key:S(r.key),label:lab,unit:S(r.unit),pv:N(r.peer_value),pp:S(r.peer_period),mv:N(r.mfl_value),mp:S(r.mfl_period),same:r.same_basis!==false,src:s,note:S(r.note)};}
function txtSrc(x){x=O(x);if(!x||!S(x.text))return null;return {text:S(x.text),src:src(x.source)};}
function pi(e){e=O(e);if(!e)return null;var co=Id(e.company);if(!co||co==='muthoot-fincorp')return null;
  var ev=A(e.events).map(function(x){x=O(x);if(!x||!D(x.date))return null;return {type:S(x.type),date:x.date,src:src(x.source)};}).filter(Boolean)
    .sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:0;});
  var o={id:S(e.id)||co+'-'+S(e.period),sid:Id(e.story_id),co:co,name:S(e.company_name)||(PEERN[co]&&PEERN[co][0])||tcase(co),group:e.group_company===true,period:S(e.period),basis:S(e.basis),
    ev:ev,date:ev[0]?ev[0].date:'',met:A(e.metrics).map(metric).filter(Boolean),guid:A(e.guidance).map(txtSrc).filter(Boolean),
    quotes:A(e.quotes).map(function(q){q=O(q);if(!q||!S(q.text))return null;return {text:S(q.text),who:S(q.speaker),role:S(q.role),src:src(q.source)};}).filter(Boolean).slice(0,3),
    nd:A(e.non_disclosures).map(function(x){return O(x)&&S(x.text)?S(x.text):S(x);}).filter(Boolean),
    cmp:A(e.mfl_compare).map(cmpRow).filter(Boolean),impact:S(e.impact),label:S(e.impact_label)||IMPACT};
  return o.date||o.period?o:null;}
function ingest(j){X={gen:S(j.generated),latestId:D(j.today&&j.today.id),fixture:j._fixture===true,cont:[],contBy:{},refs:{},sidx:null,pi:[],week:null,storyFile:'',peerFile:''};
  try{X.cont=A(j.continuing_stories).map(contItem).filter(Boolean).slice(0,8);X.cont.forEach(function(c){X.contBy[c.sid]=c;});}catch(e){X.cont=[];}
  try{var si=O(j.story_index);if(si){X.sidx={file:okPath(si.file),generated:S(si.generated),threads:N(si.threads),open:N(si.open),bytes:N(si.bytes)};X.storyFile=X.sidx.file;
    var R=O(si.refs)||{};Object.keys(R).forEach(function(k){var id=Id(k),r=refItem(R[k]);if(id&&r)X.refs[id]=r;});}}catch(e){}
  try{X.pi=A(j.peer_intel).map(pi).filter(Boolean).filter(function(p){return !p.group;});}catch(e){X.pi=[];}
  /* the archive is fetched only when latest.json says it exists (a pointer, peer_intel or story_index), so the
     current data never triggers a 404 */
  try{var pf=O(j.peer_intel_index);X.peerFile=pf?okPath(pf.file):(Array.isArray(j.peer_intel)||X.sidx)?'data/peer_intel.json':'';}catch(e){}
  try{var w=O(j.week_review);if(w&&D(w.week_start))X.week={id:D(w.id)||w.week_start,start:w.week_start,end:D(w.week_end),published:D(w.published),
    storyIds:A(w.story_ids).map(Id).filter(Boolean),sections:A(w.sections).map(O).filter(Boolean),threads:A(w.week_threads).map(O).filter(Boolean)};}catch(e){}
  L={stories:null,peer:null,sp:null,pp:null,cbs:L.cbs||[],warmed:false};}

/* ---------------- lazy files ---------------- */
function lite(){var c=navigator.connection;return !!(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||'')));}
function getJ(p){return fetch('/'+p).then(function(r){if(!r.ok)throw 0;return r.json();});}
function loadStories(){if(L.stories)return Promise.resolve(L.stories);if(!X.storyFile)return Promise.resolve(null);
  if(!L.sp)L.sp=getJ(X.storyFile).then(function(j){j=O(j)||{};var st=O(j.stories)||{},out={};
      Object.keys(st).forEach(function(k){var id=Id(k),s=O(st[k]);if(!id||!s||!S(s.title))return;
        out[id]={title:S(s.title),cat:S(s.category),status:S(s.status),opened:D(s.opened),last:D(s.last_update),
          updates:A(s.updates).map(O).filter(function(u){return u&&D(u.date)&&S(u.title);}),next:O(s.next),reg:O(s.reg)?reg(s.reg,null):null,
          continues:A(s.continues).map(Id).filter(Boolean),continuedBy:A(s.continued_by).map(Id).filter(Boolean)};});
      var al={},a=O(j.aliases)||{};Object.keys(a).forEach(function(k){var t=Id(a[k]);if(Id(k)&&t)al[k]=t;});
      L.stories={generated:S(j.generated),stale:!!(S(j.generated)&&X.gen&&S(j.generated)<X.gen),stories:out,aliases:al};return L.stories;})
    .catch(function(){L.sp=null;return null;});
  return L.sp;}
function loadPeer(){if(L.peer)return Promise.resolve(L.peer);if(!X.peerFile)return Promise.resolve(null);
  if(!L.pp)L.pp=getJ(X.peerFile).then(function(j){j=O(j)||{};var E=O(j.entries)||{},list=Array.isArray(j.entries)?j.entries:Object.keys(E).map(function(k){return E[k];});
      L.peer=list.map(pi).filter(Boolean).filter(function(p){return !p.group;});var cb=L.cbs;L.cbs=[];cb.forEach(function(f){try{f();}catch(e){}});return L.peer;})
    .catch(function(){L.pp=null;return null;});
  return L.pp;}
function onPeer(f){if(L.peer)return;L.cbs.push(f);if(!L.pp)loadPeer();}
function warm(){if(L.warmed)return;L.warmed=true;if(lite()||(!X.storyFile&&!X.peerFile))return;
  var ric=window.requestIdleCallback||function(f){return setTimeout(f,1500);};
  ric(function(){loadStories().then(function(){return loadPeer();});},{timeout:5000});}
function story(id){id=Id(id);if(!id)return null;var s=L.stories;if(s&&s.aliases[id])id=s.aliases[id];return (s&&s.stories[id])||X.refs[id]||null;}

/* ---------------- shared bits ---------------- */
function srcRow(s){var cls=s.fallback?'c':s.tier===1?'p':s.tier===2?'s':'c',lab=s.fallback?'F':s.tier?String(s.tier):'';
  var sr=s.fallback?'Fallback source':s.tier?'Tier '+s.tier+' source':'Source';
  var role=[s.fallback?'Fallback':'',ROLE[s.role]?ROLE[s.role].toLowerCase():''].filter(Boolean).join(' \u00b7 ');role=role?role.charAt(0).toUpperCase()+role.slice(1):'';
  var inner=(lab?'<span class="tier '+cls+'" aria-hidden="true">'+lab+'</span>':'<span class="tier n" aria-hidden="true"></span>')+
    '<span class="sn"><span class="sr">'+sr+': </span>'+esc(s.name+(s.page?', p.'+s.page:''))+'</span>'+(role?'<span class="k">'+esc(role)+'</span>':'');
  return '<li>'+(s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+inner+'<span class="sr"> (opens in a new tab)</span></a>':'<span class="nolink">'+inner+'</span>')+'</li>';}
function srcList(Ls,id,hidden){if(!Ls.length)return '';
  return '<div class="srcs"'+(id?' id="'+id+'"':'')+(hidden?' hidden':'')+'><p class="srcs-h"><span>Sources \u00b7 '+Ls.length+'</span>'+(Ls.some(function(x){return x.tier===1;})&&Ls.length>1?'<span class="srcs-a">Tier 1 first</span>':'')+'</p><ol>'+Ls.map(srcRow).join('')+'</ol></div>';}
function aSrc(s,label){if(!s)return '';var t=esc(label||s.name);return s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+t+'</a>':t;}
/* "Source: BSE +2": the +2 opens the full list in place */
function srcLine(Ls,id){if(!Ls.length)return '';var f=Ls[0];
  return 'Source: '+aSrc(f)+(Ls.length>1?' <button type="button" class="more-src press" data-cux="'+id+'" aria-expanded="false" aria-controls="'+id+'"><span aria-hidden="true">+'+(Ls.length-1)+'</span><span class="sr">Show all '+Ls.length+' sources</span></button>':'');}
function lcChip(lc){if(!lc)return '';var t=LC[lc]||tcase(lc);return '<span class="st st-'+(LC[lc]?lc:'other')+'">'+esc(t)+'</span>';}
/* days left come from the device clock (todayIST), so the chip stays right offline on later days; an older
   edition shows the chip as it stood on its own date */
function dlChip(dd,refDay){if(!dd)return '';var n=diff(dd.date,refDay);if(n<0||n>14)return '';
  var w=n===0?'today':n===1?'tomorrow':'in '+n+' days',t=dd.text?(dd.kind==='comments'?'Comments window ends ':'Window ends ')+w:DK[dd.kind]+' '+w;
  return '<span class="st st-soon" title="'+esc((dd.text||sday(dd.date))+(dd.kind!=='other'?' \u00b7 '+DK[dd.kind].toLowerCase():''))+'">'+esc(t)+'</span>';}
function refDay(dayId){var latest=NB().M.days[0];return dayId&&latest&&dayId!==latest.id?dayId:NB().todayIST();}
function regChips(r,dayId){if(!r)return '';return lcChip(r.lc)+dlChip(r.dl,refDay(dayId));}
function dots(n){n=Math.max(1,Math.min(5,n||1));var s='';for(var i=0;i<n;i++)s+='<b></b>';return '<i aria-hidden="true">'+s+'</i>';}
/* "Update 4 · since 2 Nov" from the card alone (thread_seq) plus the opened date from story_index.refs when present;
   "Status" when today's only news on the thread is a lifecycle or deadline change */
function badge(k){if(!k||!k.sid)return '';var c=X.contBy[k.sid];
  if(c&&c.latest.kind==='status'&&(!c.latest.card||c.latest.card===k.id))return '<span class="thr st-only" title="Only the status changed">'+dots(1)+'Status</span>';
  if(!k.seq||k.seq<2)return '';var r=story(k.sid),since=r&&r.opened?' \u00b7 since '+dm(r.opened):'';
  return '<span class="thr">'+dots(k.seq)+'Update '+k.seq+since+'</span>';}
function statusBadge(sid){var c=X.contBy[Id(sid)];return c&&c.latest.kind==='status'?'<span class="thr st-only" title="Only the status changed">'+dots(1)+'Status</span>':'';}
function impactP(text,label,cls){return text?'<p class="'+(cls||'why sm')+'"><b>'+esc(label||IMPACT)+':</b> '+esc(text)+'</p>':'';}
/* everything a Today story card adds; empty strings when the fields are absent */
function cardBits(raw,dayId){var k=card(raw),id=nid('sx'),o={k:k,chips:'',badge:'',srcLine:'',srcList:'',label:k.label,deep:'',hasSources:Array.isArray(raw&&raw.sources)&&raw.sources.length>0};
  try{o.chips=k.reg?regChips(k.reg,dayId):'';}catch(e){}
  try{o.badge=badge(k);}catch(e){}
  if(o.hasSources){o.srcLine=srcLine(k.sources,id);o.srcList=k.sources.length>1?srcList(k.sources,id,true):'';}
  return o;}
/* Latest circulars strip: lifecycle chip (replaces the old status chip) + deadline chip, and the Status badge */
function circBits(x,dayId){var r=reg(O(x)&&x.reg,x);return {lc:r.lc,chips:lcChip(r.lc)+dlChip(r.dl,refDay(dayId)),badge:statusBadge(x&&(x.story_id||(x.reg&&x.reg.story_id)))};}

/* ---------------- Peer Intelligence ---------------- */
function latestPI(){var cut=X.latestId?shift(X.latestId,-21):'';return X.pi.filter(function(p){return !cut||!p.date||p.date>=cut;})
  .sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:0;});}
function allPI(co){var by={};(L.peer||[]).concat(X.pi).forEach(function(p){if(p.co===co)by[p.id]=p;});
  return Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:0;});}
function evTypes(p){var seen={},out=[];p.ev.forEach(function(e){if(!seen[e.type]){seen[e.type]=1;out.push(e.type);}});return out;}
function piTitle(p){var t=evTypes(p).map(function(x){return EVL[x]||tcase(x).toLowerCase();});
  return p.name+(p.period?': '+p.period:'')+(t.length?' '+(t.length>1?t.slice(0,-1).join(', ')+' and '+t[t.length-1]:t[0]):'');}
function metCell(m){var v=!m.disc?'Not disclosed':m.v!=null?num(m.v,m.unit):'',sub='';
  if(!m.disc)sub=m.lastP?'last given '+m.lastP:'';
  else if(m.qoq!=null)sub=pct(m.qoq)+' QoQ'+(m.yoy!=null?' \u00b7 '+pct(m.yoy)+' YoY':'');
  else if(m.prev!=null&&m.prevP)sub=m.prevP+': '+num(m.prev,m.unit);
  else if(m.yoy!=null)sub=pct(m.yoy)+' YoY';
  if(!v){v='\u2014';sub=sub||'not stated';}
  return '<div class="pim"><span class="pim-l">'+esc(m.label)+'</span><b class="num'+(m.disc&&m.v!=null?'':' na')+'">'+esc(v)+'</b>'+(sub?'<i class="num">'+esc(sub)+'</i>':'')+'</div>';}
function cmpTable(p){if(!p.cmp.length)return '';var short=(PEERN[p.co]&&PEERN[p.co][1])||p.name;
  /* a row without peer_value repeats the entry's own metric of the same key (same quarter) */
  var mk={};p.met.forEach(function(m){if(m.key&&m.disc&&m.v!=null)mk[m.key]=m;});
  return '<div class="cmp"><p class="cmp-h"><span>With Muthoot Fincorp</span><span class="cmp-a">as published</span></p><table><caption class="sr">'+esc(p.name)+' and Muthoot Fincorp, figures as published</caption><colgroup><col class="c1"><col><col></colgroup>'+
    '<thead><tr><th scope="col">Metric</th><th scope="col">'+esc(short)+'</th><th scope="col">Muthoot Fincorp</th></tr></thead><tbody>'+
    p.cmp.map(function(r){var m=r.pv==null&&r.key?mk[r.key]:null;if(m){r=Object.assign({},r,{pv:m.v,unit:r.unit||m.unit,pp:r.pp||p.period});}var pv=r.pv!=null?num(r.pv,r.unit):'';var mv=r.mv!=null&&r.src?num(r.mv,r.unit):'';
      var note=r.note&&!(r.mv==null&&/^not yet published/i.test(r.note))?r.note:'';
      return '<tr><th scope="row">'+esc(r.label)+(!r.same?'<small>different basis</small>':'')+(note?'<small>'+esc(note)+'</small>':'')+'</th>'+
        '<td class="num'+(pv?'':' na')+'">'+(pv?esc(pv):'Not stated')+(r.pp?'<small>'+esc(r.pp)+'</small>':'')+'</td>'+
        (mv?'<td class="num">'+esc(mv)+'<small>'+esc(r.mp?r.mp+' \u00b7 ':'')+aSrc(r.src)+'</small></td>':
          '<td class="na">Not yet published'+(r.mp?'<small>for '+esc(r.mp)+'</small>':'')+'</td>')+'</tr>';}).join('')+'</tbody></table></div>';}
function piSources(p){var Ls=[];p.ev.forEach(function(e){if(e.src)Ls.push(Object.assign({},e.src,{role:e.src.role||'primary'}));});
  p.met.forEach(function(m){if(m.src)Ls.push(m.src);});p.guid.forEach(function(g){if(g.src)Ls.push(g.src);});p.quotes.forEach(function(q){if(q.src)Ls.push(q.src);});
  p.cmp.forEach(function(r){if(r.src)Ls.push(Object.assign({},r.src,{role:r.src.role||'data'}));});
  /* the same document cited for several figures is one source: drop the page for the dedupe key */
  var seen={};Ls=Ls.filter(function(s){var k=(s.url||s.name).replace(/#.*$/,'');if(seen[k])return false;seen[k]=1;return true;});return srcSort(Ls);}
function piCard(p,o){o=o||{};var types=evTypes(p);
  var h='<article class="pi g" data-st data-hub="peers"'+(o.id?' id="'+o.id+'"':'')+'><div class="pi-t">'+types.map(function(t){return '<span class="pi-doc">'+esc(EV[t]||tcase(t))+'</span>';}).join('')+
    (p.period?'<span class="pi-doc">'+esc(p.period)+'</span>':'')+(p.date?'<span class="kick pi-d">'+esc(sday(p.date))+'</span>':'')+'</div>'+
    '<h3>'+esc(piTitle(p))+'</h3>'+(p.basis?'<p class="pi-b">'+esc(tcase(p.basis))+' figures, as published by the company</p>':'');
  if(p.met.length){var gid=nid('pg'),nid2=nid('pn'),more=p.met.slice(6),notes=p.met.filter(function(m){return m.note&&m.disc;});
    h+='<div class="pi-g">'+p.met.slice(0,6).map(metCell).join('')+'</div>'+
      (more.length?'<div class="pi-g" id="'+gid+'" hidden>'+more.map(metCell).join('')+'</div>':'')+
      (more.length||notes.length?'<div class="pi-more">'+(more.length?'<button type="button" class="pill press" data-cux="'+gid+'" aria-expanded="false" aria-controls="'+gid+'">All '+p.met.length+' figures</button>':'')+
        (notes.length?'<button type="button" class="pill press" data-cux="'+nid2+'" aria-expanded="false" aria-controls="'+nid2+'">How these are defined</button>':'')+'</div>':'')+
      (notes.length?'<ul class="th nd pi-notes" id="'+nid2+'" hidden>'+notes.map(function(m){return '<li><b>'+esc(m.label)+':</b> '+esc(m.note)+'</li>';}).join('')+'</ul>':'');}
  h+=cmpTable(p);
  if(p.guid.length)h+='<p class="pi-s">Guidance</p><ul class="th">'+p.guid.map(function(g){return '<li>'+esc(g.text)+(g.src?' <span class="pi-src">('+aSrc(g.src,g.src.name+(g.src.page?', p.'+g.src.page:''))+')</span>':'')+'</li>';}).join('')+'</ul>';
  if(p.quotes.length)h+='<p class="pi-s">On the record</p>'+p.quotes.map(function(q){return '<blockquote class="piq"><p>\u201c'+esc(q.text)+'\u201d</p><footer>'+esc([q.who,q.role].filter(Boolean).join(', '))+(q.src?' \u00b7 '+aSrc(q.src,q.src.name+(q.src.page?', p.'+q.src.page:'')):'')+'</footer></blockquote>';}).join('');
  if(p.nd.length)h+='<p class="pi-s">Not disclosed this quarter</p><ul class="th nd">'+p.nd.map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul>';
  h+=impactP(p.impact,p.label);
  h+=srcList(piSources(p),'',false);
  if(o.link)h+='<div class="sc-f"><span class="by">'+esc(p.ev.length+' document'+(p.ev.length===1?'':'s'))+'</span><a class="more press" href="#/peer/'+esc(p.co)+'">'+esc(p.name)+'<span class="sr"> peer page</span> <span aria-hidden="true">\u2192</span></a></div>';
  return h+'</article>';}
/* Peers hub: shown only when entries from the last 21 days exist; no slot and no placeholder otherwise */
function piSlot(){var Ls=latestPI();if(!Ls.length)return '';
  return '<section aria-labelledby="h-pi" class="pis">'+fxBanner()+'<div class="sec" data-st><h2 id="h-pi">Peer Intelligence</h2><span class="aside">new results and IR documents</span></div>'+
    Ls.slice(0,5).map(function(p){return piCard(p,{link:true});}).join('<div class="pi-gap"></div>')+
    '<p class="note pi-n" data-st>Shown when a listed peer files results, an investor deck or a call transcript. Figures as published by each company.</p></section>';}
/* peer page: that company's entries, newest first; the newest open, older ones one tap away */
function piHistory(co){var Ls=allPI(co);if(!Ls.length)return '';
  return '<section aria-labelledby="h-ph" class="pis">'+fxBanner()+'<div class="sec" data-st><h2 id="h-ph">Peer Intelligence</h2><span class="aside num">'+Ls.length+' '+(Ls.length===1?'entry':'entries')+'</span></div>'+
    piCard(Ls[0],{})+(Ls.length>1?'<ul class="pih" role="list" data-st>'+Ls.slice(1).map(function(p){var id=nid('ph');
      return '<li><button type="button" class="pih-b g press" data-cux="'+id+'" aria-expanded="false" aria-controls="'+id+'"><span class="pih-p">'+esc(p.period||sday(p.date))+'</span><span class="pih-t">'+esc(evTypes(p).map(function(t){return EV[t]||tcase(t);}).join(', '))+'</span><span class="pih-d num">'+(p.date?esc(dm(p.date)+' '+p.date.slice(0,4)):'')+'</span><span class="pih-c" aria-hidden="true"></span></button>'+
        '<div id="'+id+'" class="pih-x" hidden>'+piCard(p,{}).replace(' data-st','')+'</div></li>';}).join('')+'</ul>':'')+
    (L.peer||!X.peerFile?'':'<p class="note" data-st>Earlier quarters load when online.</p>')+'</section>';}
/* tile mention line: "new deck" when a deck or results came out in the last 3 days */
function tileNote(co){var d0=X.latestId;if(!d0)return '';var p=X.pi.filter(function(x){return x.co===co&&x.ev.some(function(e){return (e.type==='investor-deck'||e.type==='results')&&diff(d0,e.date)<=3&&diff(d0,e.date)>=0;});})[0];
  return p?' \u00b7 new deck':'';}
/* Today: one slim row when a peer filed today */
function nudge(day){if(!day||day.id!==X.latestId)return '';var Ls=X.pi.filter(function(p){return p.ev.some(function(e){return e.date===day.id;});});if(!Ls.length)return '';
  return Ls.slice(0,2).map(function(p){var t=evTypes(p).filter(function(x){return p.ev.some(function(e){return e.type===x&&e.date===day.id;});}),lab=t.indexOf('investor-deck')>=0?'investor deck':EVL[t[0]]||'filing';
    return '<a class="pin g press" data-st href="#/peer/'+esc(p.co)+'">'+(NB().hubIcon?NB().hubIcon('peers',18):'')+'<span class="pin-t"><b>New:</b> '+esc(p.name+' '+(p.period?p.period+' ':'')+lab)+'</span><span class="pin-a" aria-hidden="true">\u2192</span></a>';}).join('');}

/* ---------------- interactions (delegated) ---------------- */
function reveal(el){var R=NB()&&NB().RM;if(!el.animate||(R&&R.matches))return;var sp=NB().SPRINGS&&NB().SPRINGS.Rise;
  el.animate([{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'none'}],{duration:sp?sp.ms:320,easing:sp?sp.easing:'cubic-bezier(.2,.9,.25,1)'});
  [].slice.call(el.querySelectorAll('li')).slice(0,8).forEach(function(li,i){li.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:sp?sp.ms:320,easing:sp?sp.easing:'ease-out',delay:i*(NB().STAGGER||32),fill:'backwards'});});}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-cux],[data-cuv]');if(!b)return;
  var open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));
  var t=document.getElementById(b.dataset.cux);if(!t)return;t.hidden=!open;if(open)reveal(t);});

window.NBCU={prep:prep,ingest:ingest,warm:warm,loadStories:loadStories,loadPeer:loadPeer,onPeer:onPeer,story:story,
  card:card,cardBits:cardBits,circBits:circBits,regChips:regChips,srcList:srcList,impactP:impactP,
  piSlot:piSlot,piHistory:piHistory,tileNote:tileNote,nudge:nudge,fxBanner:fxBanner,
  get continuing(){return X.cont;},get week(){return X.week;},get peerIntel(){return X.pi;},get fixture(){return X.fixture;},
  _x:function(){return {X:X,L:L};}};
})();
