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
   5. Step 3: Regulation hub stages, the weekly review (Today card and #/week/<date>), Read thread pills and ?card=,
      #/peer/<slug>?pi=<id>, search documents for threads and Peer Intelligence, and edge fades on scrollers.
   4. Step 2: the Continuing stories strip, the story timeline sheet (#/story/<id>), the Threads list (#/threads),
      "Continuing in this topic" on hubs, and a clean-up for summaries that were flattened from markdown tables.
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
/* the label comes from the data (impact_label); without it each edition keeps the label it shows today */
var IMPACT=PRIV?'MFL impact':'Possible impact on Muthoot Fincorp';

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
/* a card lists each publisher once: the same name twice (two BSE pages) keeps the first after the tier sort */
function cardSources(c){var L=A(c&&c.sources).map(src).filter(Boolean);if(!L.length){var s=src(c&&c.source);if(s)L=[s];}
  var seen={};return srcSort(L).filter(function(x){var k=x.name.toLowerCase();if(seen[k])return false;seen[k]=1;return true;});}
function reg(r,top){r=O(r)||{};top=O(top)||{};
  var lc=S(top.lifecycle)||S(r.lifecycle),near=r.deadline_near===true||top.deadline_near===true;
  if(lc==='deadline-near'){lc='';near=true;}
  var dl=O(r.deadline)||O(top.deadline),dd=null;
  if(dl&&D(dl.date))dd={date:dl.date,text:S(dl.date_text),kind:DK[dl.kind]?dl.kind:'other'};
  else if(D(r.comments_due))dd={date:r.comments_due,text:'',kind:'comments'};
  else if(D(r.effective)&&lc&&lc!=='effective')dd={date:r.effective,text:'',kind:'effective'};
  var fc=O(r.first_covered)||O(top.first_covered);
  return {lc:lc&&/^[a-z-]{2,24}$/.test(lc)?lc:'',ref:S(r.ref_no)||S(top.ref_no),dl:dd,near:near,fc:fc&&D(fc.date)?{date:fc.date,card:S(fc.card_id),report:S(fc.report),title:S(fc.title)}:null};}
function card(c){c=O(c)||{};var r=O(c.reg);
  var o={id:S(c.id),sid:Id(c.story_id),seq:N(c.thread_seq)!=null&&c.thread_seq>=1?Math.round(c.thread_seq):null,upd:c.is_update===true,
    dup:S(c.dup_of),sources:cardSources(c),label:S(c.impact_label)||IMPACT,reg:r?reg(r,null):null,stRef:A(c.stories_ref).map(Id).filter(Boolean)};
  return o;}
function nextOf(n){n=O(n);return n&&(S(n.what)||D(n.date))?{date:D(n.date),text:S(n.date_text),what:S(n.what),src:src(n.source)}:null;}
function upd(u){u=O(u);if(!u||!D(u.date)||!S(u.title))return null;var so=O(u.source);
  return {date:u.date,card:S(u.card_id),report:S(u.report),title:S(u.title),milestone:S(u.milestone),kind:u.kind==='status'?'status':'',summary:S(u.summary),
    src:so&&S(so.name)?{name:S(so.name),tier:so.tier===1||so.tier===2||so.tier===3?so.tier:null,url:U(so.url)}:null};}
function contItem(x){x=O(x);if(!x)return null;var sid=Id(x.story_id);if(!sid||!S(x.title))return null;var la=O(x.latest)||{},nx=O(x.next);
  return {sid:sid,title:S(x.title),cat:S(x.category),status:S(x.status),opened:D(x.opened),last:D(x.last_update)||D(la.date),
    count:N(x.update_count)!=null?x.update_count:N(x.updates),
    latest:{date:D(la.date),card:S(la.card_id),report:S(la.report),kind:la.kind==='status'?'status':'update',title:S(la.title),summary:S(la.summary),source:src(la.source)},
    recent:A(x.recent).map(upd).filter(Boolean).slice(0,3),next:nextOf(nx),
    reg:O(x.reg)?reg(x.reg,null):null};}
function refItem(x){x=O(x);if(!x||!S(x.title))return null;return {title:S(x.title),cat:S(x.category),status:S(x.status),opened:D(x.opened),last:D(x.last_update),
  count:N(x.update_count),next:nextOf(x.next),continues:A(x.continues).map(Id).filter(Boolean),continuedBy:A(x.continued_by).map(Id).filter(Boolean)};}
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
  /* the edition's impact label as the data gives it (every card with impact carries the same impact_label), used where
     a view has no card object (hub feeds built from the search index) */
  try{X.lab='';A(j.today&&j.today.cards).concat(A(j.latest_circulars)).some(function(c){return c&&S(c.impact_label)&&(X.lab=S(c.impact_label));});}catch(e){}
  try{X.cont=A(j.continuing_stories).map(contItem).filter(Boolean).slice(0,8);X.cont.forEach(function(c){X.contBy[c.sid]=c;});}catch(e){X.cont=[];}
  try{var si=O(j.story_index);if(si){X.sidx={file:okPath(si.file),generated:S(si.generated),threads:N(si.threads),open:N(si.open),bytes:N(si.bytes)};X.storyFile=X.sidx.file;
    var R=O(si.refs)||{};Object.keys(R).forEach(function(k){var id=Id(k),r=refItem(R[k]);if(id&&r)X.refs[id]=r;});}}catch(e){}
  try{X.pi=A(j.peer_intel).map(pi).filter(Boolean).filter(function(p){return !p.group;});}catch(e){X.pi=[];}
  /* the archive is fetched only when latest.json says it exists (a pointer, peer_intel or story_index), so the
     current data never triggers a 404 */
  try{var pf=O(j.peer_intel_index);X.peerFile=pf?okPath(pf.file):(Array.isArray(j.peer_intel)||X.sidx)?'data/peer_intel.json':'';}catch(e){}
  try{X.week=wkRead(j.week_review);}catch(e){}
  L={stories:null,peer:null,sp:null,pp:null,cbs:L.cbs||[],warmed:false};}

/* ---------------- lazy files ---------------- */
function lite(){var c=navigator.connection;return !!(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||'')));}
function getJ(p){return fetch('/'+p).then(function(r){if(!r.ok)throw 0;return r.json();});}
function loadStories(){if(L.stories)return Promise.resolve(L.stories);if(!X.storyFile)return Promise.resolve(null);
  if(!L.sp)L.sp=getJ(X.storyFile).then(function(j){j=O(j)||{};var st=O(j.stories)||{},out={};
      Object.keys(st).forEach(function(k){var id=Id(k),s=O(st[k]);if(!id||!s||!S(s.title))return;
        /* stories.json counts cards (card_count) and editions; update_count is the older contract name */
        out[id]={title:S(s.title),cat:S(s.category),status:S(s.status),opened:D(s.opened),last:D(s.last_update),
          count:N(s.card_count)!=null?s.card_count:N(s.update_count)!=null?s.update_count:A(s.updates).length,editions:N(s.editions),
          updates:A(s.updates).map(upd).filter(Boolean),next:nextOf(s.next),reg:O(s.reg)?reg(s.reg,null):null,
          rg:S(O(s.reg)&&s.reg.regulator)||S(A(s.regulators)[0]),closed:D(s.closed),
          co:A(s.companies).map(Id).filter(Boolean),tp:A(s.topics).map(Id).filter(Boolean),rgs:A(s.regulators).map(function(x){return S(x).toLowerCase();}).filter(function(x){return /^[a-z]{2,12}$/.test(x);}),
          continues:A(s.continues).map(Id).filter(Boolean),continuedBy:A(s.continued_by).map(Id).filter(Boolean)};});
      var al={},a=O(j.aliases)||{};Object.keys(a).forEach(function(k){var t=Id(a[k]);if(Id(k)&&t)al[k]=t;});
      L.stories={generated:S(j.generated),stale:!!(S(j.generated)&&X.gen&&S(j.generated)<X.gen),stories:out,aliases:al};return L.stories;})
    .catch(function(){L.sp=null;L.sfail=true;return null;});
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
  if(c&&c.latest.kind==='status'&&(!c.latest.card||c.latest.card===k.id))return '<a class="thr st-only press" href="#/story/'+esc(k.sid)+'" title="Only the status changed">'+dots(1)+'Status</a>';
  if(!k.seq||k.seq<2)return '';var r=story(k.sid),since=r&&r.opened?' \u00b7 since '+dm(r.opened):'';
  return '<a class="thr press" href="#/story/'+esc(k.sid)+'" aria-label="Update '+k.seq+(r&&r.opened?', thread since '+esc(dm(r.opened)):'')+'. Open the story timeline">'+dots(k.seq)+'Update '+k.seq+since+'</a>';}
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
  var h='<article class="pi g" data-st data-hub="peers" data-pi="'+esc(p.id)+'"'+(o.id?' id="'+o.id+'"':'')+'><div class="pi-t">'+types.map(function(t){return '<span class="pi-doc">'+esc(EV[t]||tcase(t))+'</span>';}).join('')+
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
  if(o.link)h+='<div class="sc-f"><span class="by">'+esc(p.ev.length+' document'+(p.ev.length===1?'':'s'))+'</span><a class="more press" href="'+esc(piHref(p))+'">'+esc(p.name)+'<span class="sr"> peer page</span> <span aria-hidden="true">\u2192</span></a></div>';
  return h+'</article>';}
/* Peers hub: shown only when entries from the last 21 days exist; no slot and no placeholder otherwise */
function piSlot(){var Ls=latestPI();if(!Ls.length)return '';
  return '<section aria-labelledby="h-pi" class="pis">'+fxBanner()+'<div class="sec" data-st><h2 id="h-pi">Peer Intelligence</h2><span class="aside">new results and IR documents</span></div>'+
    Ls.slice(0,5).map(function(p){return piCard(p,{link:true});}).join('<div class="pi-gap"></div>')+
    '<p class="note pi-n" data-st>Shown when a listed peer files results, an investor deck or a call transcript. Figures as published by each company.</p></section>';}
/* peer page: that company's entries, newest first; the newest open, older ones one tap away */
function piHistory(co){var Ls=allPI(co);if(!Ls.length)return '';
  return '<section aria-labelledby="h-ph" class="pis">'+fxBanner()+'<div class="sec" data-st><h2 id="h-ph">Peer Intelligence</h2><span class="aside num">'+Ls.length+' '+(Ls.length===1?'entry':'entries')+'</span></div>'+
    piCard(Ls[0],{})+(Ls.length>1?'<ul class="pih" role="list" data-st>'+Ls.slice(1).map(function(p){var id=nid('ph'),op=!!(PIF.id&&PIF.id===p.id);
      return '<li><button type="button" class="pih-b g press" data-cux="'+id+'" aria-expanded="'+op+'" aria-controls="'+id+'"><span class="pih-p">'+esc(p.period||sday(p.date))+'</span><span class="pih-t">'+esc(evTypes(p).map(function(t){return EV[t]||tcase(t);}).join(', '))+'</span><span class="pih-d num">'+(p.date?esc(dm(p.date)+' '+p.date.slice(0,4)):'')+'</span><span class="pih-c" aria-hidden="true"></span></button>'+
        '<div id="'+id+'" class="pih-x"'+(op?'':' hidden')+'>'+piCard(p,{}).replace(' data-st','')+'</div></li>';}).join('')+'</ul>':'')+
    (L.peer||!X.peerFile?'':'<p class="note" data-st>Earlier quarters load when online.</p>')+'</section>';}
/* tile mention line: "new deck" when a deck or results came out in the last 3 days */
function tileNote(co){var d0=X.latestId;if(!d0)return '';var p=X.pi.filter(function(x){return x.co===co&&x.ev.some(function(e){return (e.type==='investor-deck'||e.type==='results')&&diff(d0,e.date)<=3&&diff(d0,e.date)>=0;});})[0];
  return p?' \u00b7 new deck':'';}
/* Today: one slim row when a peer filed today */
function nudge(day){if(!day||day.id!==X.latestId)return '';var Ls=X.pi.filter(function(p){return p.ev.some(function(e){return e.date===day.id;});});if(!Ls.length)return '';
  return Ls.slice(0,2).map(function(p){var t=evTypes(p).filter(function(x){return p.ev.some(function(e){return e.type===x&&e.date===day.id;});}),lab=t.indexOf('investor-deck')>=0?'investor deck':EVL[t[0]]||'filing';
    return '<a class="pin g press" data-st href="'+esc(piHref(p))+'">'+(NB().hubIcon?NB().hubIcon('peers',18):'')+'<span class="pin-t"><b>New:</b> '+esc(p.name+' '+(p.period?p.period+' ':'')+lab)+'</span><span class="pin-a" aria-hidden="true">\u2192</span></a>';}).join('');}

/* ================= step 2 ================= */
/* ---------------- summaries flattened from markdown tables ----------------
   Some exporter summaries are a table's cells run together ("Field Value As of Status Closed, ... 2026-11-11 Size ...")
   or one headerless row ("14,242.0; 14,145.2 (2026-11-06 PM); 96.8 (+0.68%); 2026-11-10 AM; IBJA"). Shown as they
   are, they read as noise, so: markdown pipes and |---| rows are dropped; a header row (Field/Item/Metric + Value...)
   keeps only the first data row ("Status: Closed, ..."), or nothing when rows cannot be told apart; a headerless
   numeric row keeps its first cell (the figure) and last cell (the source). Ordinary prose is returned unchanged. */
var THDR=/^\s*(?:Field|Item|Metric|Parameter|Particulars|Measure|Indicator)\s+(?:Values?|Figures?|Details?|Data|Status|Description)(?:\s+(?:As of|As on|Date|Sources?|Period|Notes?|Remarks|Change))*\s+/;
var FLD={status:1,size:1,rating:1,ratings:1,coupon:1,coupons:1,bids:1,amount:1,issue:1,listing:1,allotment:1,tenor:1,'yield':1,date:1,price:1};
var ISOG=/\b20\d\d-\d\d-\d\d\b/;
function cleanSum(t){t=typeof t==='string'?t:'';if(!t)return '';
  if(/\|\s*:?-{3,}/.test(t)||/-{3,}:?\s*\|/.test(t))t=t.replace(/\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?/g,' ');
  if(t.indexOf('|')>=0)t=t.split('|').map(function(x){return x.trim();}).filter(Boolean).join(' \u00b7 ');
  var h=t.match(THDR);
  if(h){var rest=t.slice(h[0].length).trim(),m=ISOG.exec(rest);if(!m)return '';
    var first=rest.slice(0,m.index).replace(/[\s;,\u00b7(]+$/,'').trim(),w=first.match(/^([A-Za-z]+)\s+(?=\S)/);
    if(w&&FLD[w[1].toLowerCase()])first=w[1]+': '+first.slice(w[0].length);
    return first.length>=12?first:'';}
  var cells=t.split(/;\s+/);
  if(cells.length>=3){var isN=function(c){c=c.trim();return (/^[\d\u20b9$+\-\u2212(]/.test(c)||c==='same'||ISOG.test(c.slice(0,10)))&&c.replace(/[^A-Za-z]/g,'').length<=4;};
    var k=cells.filter(isN).length,last=cells[cells.length-1].trim();
    if(k>=2&&k>=cells.length-1&&isN(cells[0]))return cells[0].trim()+(!isN(last)&&last.length<=40?' \u00b7 '+last:'');}
  return t;}

/* ---------------- threads: one model for the strip, the sheet, the list and hubs ---------------- */
function hubOf(c){var H=NB().HUB||{};return H[c]||null;}
function hubName(c){var h=hubOf(c);return h?h.n:'';}
function plainT(t){return String(t||'').replace(/^\s*update\s*[:\u2013\u2014-]\s*/i,'');}
function thread(id){id=Id(id);if(!id)return null;var s=L.stories;if(s&&s.aliases[id])id=s.aliases[id];
  var f=s&&s.stories[id],c=X.contBy[id],r=X.refs[id];if(!f&&!c&&!r)return null;
  var t={id:id,title:'',cat:'',status:'',opened:'',last:'',count:null,ups:[],next:null,reg:null,rg:'',cont:[],contBy:[],full:!!f,stale:false};
  if(f){t.title=f.title;t.cat=f.cat;t.status=f.status;t.opened=f.opened;t.last=f.last;t.ups=f.updates.slice();t.next=f.next;t.reg=f.reg;t.rg=f.rg;
    t.cont=f.continues;t.contBy=f.continuedBy;t.count=t.ups.length;}
  else if(c){t.title=c.title;t.cat=c.cat;t.status=c.status;t.opened=c.opened;t.last=c.last;t.count=c.count;t.next=c.next;t.reg=c.reg;
    var la=c.latest;t.ups=c.recent.slice().reverse();if(la.date&&S(la.title||la.summary))t.ups.push({date:la.date,card:la.card,report:la.report,title:la.title||la.summary,milestone:'',kind:la.kind==='status'?'status':'',summary:la.title?la.summary:'',src:la.source});}
  else{t.title=r.title;t.cat=r.cat;t.status=r.status;t.opened=r.opened;t.last=r.last;t.count=r.count;t.next=r.next;t.cont=r.continues;t.contBy=r.continuedBy;}
  if(f&&!t.next&&c&&c.next)t.next=c.next;
  if(!t.cont.length&&r)t.cont=r.continues;if(!t.contBy.length&&r)t.contBy=r.continuedBy;
  /* stories.json older than latest.json: today's update comes from continuing_stories */
  if(f&&c&&c.latest.date&&!t.ups.some(function(u){return (c.latest.card&&u.card===c.latest.card)||(u.date===c.latest.date&&u.title===c.latest.title);})&&c.latest.date>=(t.last||'')){
    t.ups.push({date:c.latest.date,card:c.latest.card,report:c.latest.report,title:c.latest.title||c.latest.summary,milestone:'',kind:c.latest.kind,summary:c.latest.title?c.latest.summary:'',src:c.latest.source});t.stale=true;t.count=t.ups.length;}
  if(f&&c&&c.latest.date===X.latestId){var lu=t.ups.filter(function(u){return u.card===c.latest.card;})[0];if(lu&&!lu.summary&&c.latest.summary&&c.latest.summary!==lu.title)lu.summary=c.latest.summary;}
  if(L.stories&&L.stories.stale)t.stale=true;
  t.ups.sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});return t;}
function allThreads(){var out={},s=L.stories;
  if(s)Object.keys(s.stories).forEach(function(k){var f=s.stories[k];out[k]={id:k,title:f.title,cat:f.cat,status:f.status,opened:f.opened,last:f.last,count:f.updates.length||f.count};});
  Object.keys(X.refs).forEach(function(k){if(out[k])return;var r=X.refs[k];out[k]={id:k,title:r.title,cat:r.cat,status:r.status,opened:r.opened,last:r.last,count:r.count};});
  X.cont.forEach(function(c){var o=out[c.sid];if(!o)out[c.sid]={id:c.sid,title:c.title,cat:c.cat,status:c.status,opened:c.opened,last:c.last,count:c.count};
    else if(c.last>(o.last||'')){o.last=c.last;o.status=c.status||o.status;}});
  return Object.keys(out).map(function(k){return out[k];}).filter(function(t){return t.title;})
    .sort(function(a,b){return (a.last||'')<(b.last||'')?1:(a.last||'')>(b.last||'')?-1:0;});}
var TST={open:'Open',dormant:'Dormant',closed:'Closed'};
function rail(n,max){n=Math.max(1,Math.min(max||6,n||1));var s='';for(var i=0;i<n;i++)s+=(i?'<s></s>':'')+'<b'+(i===n-1?' class="on"':'')+'></b>';return s;}
function cnt(n,w){return n+' '+w+(n===1?'':'s');}

/* ---------------- Today (and an archived edition): Continuing stories strip ---------------- */
function contCard(c,dayId){var h=hubOf(c.cat),la=c.latest,same=la.date&&la.date===dayId,live=dayId===X.latestId;
  var when=same?(live?'Today':'This edition'):la.date?'Last update '+dm(la.date):'';
  var line=plainT(la.title||la.summary);
  return '<li data-st><a class="cc g press" href="#/story/'+esc(c.sid)+'"'+(h?' data-hub="'+esc(c.cat)+'"':'')+'>'+
    '<span class="cc-k">'+(h?(NB().hubIcon?NB().hubIcon(c.cat,13):'')+'<span>'+esc(h.n)+'</span>':'<span>Story</span>')+(c.opened?'<span class="cc-s num">since '+esc(dm(c.opened))+'</span>':'')+'</span>'+
    '<span class="cc-t">'+esc(c.title)+'</span>'+
    (line?'<span class="cc-l">'+(when?'<b>'+esc(when)+(la.kind==='status'?' \u00b7 Status':'')+':</b> ':'')+esc(line)+'</span>':'')+
    (c.next&&(!c.next.date||c.next.date>=NB().todayIST())?'<span class="cc-nx"><b>Next:</b> '+esc([c.next.text||(c.next.date?dm(c.next.date):''),c.next.what].filter(Boolean).join(' \u00b7 '))+'</span>':'')+
    '<span class="cc-rail" aria-hidden="true">'+rail(c.count)+'</span><span class="cc-n num">'+(c.count?esc(cnt(c.count,'update')):'')+'</span></a></li>';}
function contStrip(day){if(!day)return '';var live=day.id===X.latestId,list=live?X.cont:A(day.continuing_stories).map(contItem).filter(Boolean).slice(0,8);
  if(!list.length)return '';
  return '<section aria-labelledby="h-cont" class="cont"><div class="sec" data-st><h2 id="h-cont">'+(live?'Continuing stories':'Continuing on '+esc(sday(day.id)))+'</h2><a class="aside" href="#/threads">All threads \u2192</a></div>'+
    '<ul class="cstrip" role="list" aria-label="Story threads, swipe for more">'+list.map(function(c){return contCard(c,day.id);}).join('')+'</ul></section>';}

/* ---------------- story timeline sheet ---------------- */
var SH={el:null,scrim:null,id:'',under:'#/',pushed:false,opener:null,inert:[],skip:'',last:location.hash};
function storyHash(h){var m=/^#\/story\/([^?\/#]+)/.exec(h||'');try{return m?decodeURIComponent(m[1]):'';}catch(e){return '';}}
function readLink(u){var nb=NB();if(u.date&&u.card)return cardHref(u.date,{id:u.card,report:u.report,title:u.title});return u.date&&nb.readHref?nb.readHref(u.date,u.report||'01-daily-watch',u.title,''):'';}
function tierB(s){if(!s)return '';var lab=s.tier?String(s.tier):'',cls=s.tier===1?'p':s.tier===2?'s':'c';
  return '<span class="tl-src">'+(lab?'<span class="tier '+cls+'" aria-hidden="true">'+lab+'</span><span class="sr">Tier '+lab+' source: </span>':'')+esc(s.name)+'</span>';}
function relRow(ids,lab){var rows=A(ids).map(function(i){var r=thread(i);return r?'<a class="tl-rel press" href="#/story/'+esc(r.id)+'" data-cus><span>'+esc(lab)+'</span> '+esc(r.title)+'</a>':'';}).filter(Boolean);
  return rows.join('');}
function sheetHtml(t){var h=hubOf(t.cat),today=X.latestId,ups=t.ups.slice().reverse(),n=t.full?t.ups.length:(t.count||t.ups.length),oldest=t.ups[0];
  var chips=(t.rg?'<span class="rgb">'+esc(t.rg.toUpperCase())+'</span>':'')+(t.reg?regChips(t.reg,null):'')+(TST[t.status]?'<span class="st cu-ts cu-ts-'+t.status+'">'+TST[t.status]+'</span>':'');
  var meta=[n?cnt(n,'update'):'',t.opened?'first covered '+sday(t.opened):'',h?h.n:''].filter(Boolean).join(' \u00b7 ');
  var x='<div class="sh-h" data-drag><span class="sh-grab" aria-hidden="true"></span><button type="button" class="sh-x press" data-cuclose aria-label="Close the story timeline"><span aria-hidden="true">\u00d7</span></button></div>'+
    (chips?'<div class="tagrow sh-c">'+chips+'</div>':'')+'<h2 id="cu-sh-t">'+esc(t.title)+'</h2>'+(meta?'<p class="sh-m num">'+esc(meta)+'</p>':'');
  x+=relRow(t.cont,'Grew out of:')+relRow(t.contBy,'Continues in:');
  var lis='';
  if(t.next&&(!t.next.date||t.next.date>=NB().todayIST()))lis+='<li class="tl-n tl-nx"><p class="tl-d num">'+esc([t.next.date?sday(t.next.date):t.next.text,'Next'].filter(Boolean).join(' \u00b7 '))+'</p><p class="tl-t">'+esc(t.next.what||'Next step')+'</p>'+(t.next.text&&t.next.date?'<p class="tl-s">'+esc(t.next.text)+'</p>':'')+(t.next.src?'<p class="tl-sr">'+(t.next.src.url?'<a class="tl-sa" href="'+esc(t.next.src.url)+'" target="_blank" rel="noopener noreferrer">'+tierB(t.next.src)+'<span class="sr"> (opens in a new tab)</span></a>':tierB(t.next.src))+'</p>':'')+'</li>';
  lis+=ups.map(function(u){var now=u.date===today,first=t.full&&u===oldest,href=readLink(u);
    var d=[sday(u.date),now?'Today':'',first?'First covered':''].filter(Boolean).join(' \u00b7 ');
    return '<li class="tl-n'+(now?' now':'')+(u.kind==='status'?' tl-st':'')+'"><p class="tl-d num">'+esc(d)+(u.kind==='status'?' <span class="tl-m">Status</span>':'')+(u.milestone?' <span class="tl-m">'+esc(tcase(u.milestone))+'</span>':'')+'</p>'+
      (href?'<a class="tl-t press" href="'+esc(href)+'">'+esc(plainT(u.title))+'</a>':'<p class="tl-t">'+esc(plainT(u.title))+'</p>')+
      (u.summary&&u.summary!==u.title?'<p class="tl-s">'+esc(NB().clip?NB().clip(cleanSum(u.summary),200):cleanSum(u.summary))+'</p>':'')+(u.src?'<p class="tl-sr">'+tierB(u.src)+'</p>':'')+'</li>';}).join('');
  x+=lis?'<ol class="tl" role="list">'+lis+'</ol>':'';
  var note=!t.full&&X.storyFile?(L.sfail?'Earlier updates load when online.':L.stories?'':'Loading earlier updates\u2026'):'';
  if(t.stale&&t.full)note='Index updating: today\u2019s update is from this morning\u2019s edition.';
  if(note)x+='<p class="note sh-n" role="status">'+esc(note)+'</p>';
  var lat=ups[0],lh=lat?readLink(lat):'';
  x+='<div class="sh-a">'+(h?'<a class="press" href="#/topic/'+esc(t.cat)+'">Open in '+esc(h.n)+'</a>':'')+(lh?'<a class="press pri" href="'+esc(lh)+'">'+(lat.date===today?'Read today\u2019s report':'Read the latest report')+'</a>':'')+'</div>';
  return x;}
function rm(){var R=NB()&&NB().RM;return !!(R&&R.matches);}
function sp(k){var s=NB()&&NB().SPRINGS;return s&&s[k]?s[k]:{ms:420,easing:'cubic-bezier(.2,.9,.25,1)'};}
function stagger(root){if(rm()||!root.animate)return;var r=sp('Rise'),st=NB().STAGGER||32;
  [].slice.call(root.querySelectorAll('.tl-n')).slice(0,8).forEach(function(li,i){li.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:r.ms,easing:r.easing,delay:i*st,fill:'backwards'});});}
function fillSheet(t,anim){var b=SH.el.querySelector('.sh-b');SH.id=t.id;if(hubOf(t.cat))SH.el.setAttribute('data-hub',t.cat);else SH.el.removeAttribute('data-hub');b.innerHTML=sheetHtml(t);if(anim)stagger(b);
  if(!t.full&&X.storyFile&&!L.stories&&!L.sfail)loadStories().then(function(){if(SH.el&&SH.id===t.id){var t2=thread(t.id);if(t2){fillSheet(t2,false);}}});}
function lockOthers(on){if(on){SH.inert=[];[].forEach.call(document.body.children,function(el){if(el===SH.el||el===SH.scrim||el.id==='toast'||el.tagName==='SCRIPT'||el.inert)return;el.inert=true;SH.inert.push(el);});
    document.documentElement.classList.add('cu-lock');}
  else{SH.inert.forEach(function(el){el.inert=false;});SH.inert=[];document.documentElement.classList.remove('cu-lock');}}
function openSheet(id,o){var t=thread(id);
  if(!t){if(!L.stories&&X.storyFile&&!L.sfail&&!o.retried){loadStories().then(function(){if(storyHash(location.hash)===id)openSheet(id,Object.assign({},o,{retried:true}));});return;}
    unknown(o);return;}
  if(SH.el){fillSheet(t,true);SH.el.querySelector('.sh-b').scrollTop=0;return;}
  SH.opener=document.activeElement;SH.under=o.under||'#/';SH.pushed=!!o.pushed;
  var sc=document.createElement('div');sc.className='sh-scrim';sc.setAttribute('data-cuclose','');
  var el=document.createElement('section');el.className='sheet cu-sheet';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','cu-sh-t');
  el.innerHTML='<div class="sh-b"></div>';document.body.appendChild(sc);document.body.appendChild(el);SH.el=el;SH.scrim=sc;
  fillSheet(t,true);lockOthers(true);
  if(rm()){el.animate&&el.animate([{opacity:0},{opacity:1}],{duration:150});sc.animate&&sc.animate([{opacity:0},{opacity:1}],{duration:150});}
  else if(el.animate){var g=sp('Glide');el.animate([{transform:'translateY(100%)'},{transform:'none'}],{duration:g.ms+120,easing:g.easing});sc.animate([{opacity:0},{opacity:1}],{duration:220,easing:'cubic-bezier(.4,0,.2,1)'});}
  var x=el.querySelector('.sh-x');if(x)x.focus({preventScroll:true});}
function closeSheet(){var el=SH.el,sc=SH.scrim,op=SH.opener;if(!el)return;SH.el=null;SH.scrim=null;SH.id='';lockOthers(false);
  function done(){el.remove();sc.remove();}
  if(rm()||!el.animate)done();
  else{var cur=getComputedStyle(el).transform;el.animate([{transform:cur==='none'?'none':cur},{transform:'translateY(100%)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).finished.then(done,done);
    sc.animate([{opacity:1},{opacity:0}],{duration:200,fill:'forwards'});}
  if(op&&op.isConnected&&op.focus)op.focus({preventScroll:true});else{var h=document.querySelector('#app h1');if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true});}}}
/* close from inside the app: undo the #/story entry when we pushed it, else put the page's own hash back */
function requestClose(){if(!SH.el)return;if(SH.pushed){SH.skip=SH.under;history.back();}else{try{history.replaceState(null,'',SH.under);}catch(e){}SH.last=SH.under;closeSheet();}}
function unknown(o){var nb=NB();if(nb&&nb.toast)nb.toast('This story isn\u2019t in this edition\u2019s index');
  if(o.pushed){SH.skip=o.under||'#/';history.back();}else{try{history.replaceState(null,'',o.under||'#/');}catch(e){}}}
/* called by app.js on every hashchange before it routes; true = handled here, do not route */
function onHash(){var id=storyHash(location.hash);
  if(id){if(SH.el&&SH.id===id)return true;openSheet(id,{under:SH.el?SH.under:(SH.last&&!storyHash(SH.last)?SH.last:'#/'),pushed:true});return true;}
  var h=location.hash,skip=SH.skip&&(h===SH.skip||(!h&&SH.skip==='#/'));SH.skip='';SH.last=h;
  if(SH.el){closeSheet();return skip||h===SH.under;}
  return skip;}
/* called once after the first route: a reload on #/story/<id> opens the sheet over Today */
function deepLink(){var id=storyHash(location.hash);if(id)openSheet(id,{under:'#/',pushed:false});else SH.last=location.hash;}
document.addEventListener('keydown',function(e){if(!SH.el)return;
  if(e.key==='Escape'){e.preventDefault();requestClose();return;}
  if(e.key==='Tab'){var f=[].slice.call(SH.el.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(x){return x.offsetParent!==null;});if(!f.length)return;
    var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}});
/* drag the handle (or the header row) down to dismiss */
(function(){var y0=0,t0=0,dy=0,on=false;
  document.addEventListener('pointerdown',function(e){if(!SH.el||!e.target.closest||!e.target.closest('.cu-sheet [data-drag]')||e.target.closest('button'))return;on=true;y0=e.clientY;t0=Date.now();dy=0;
    try{e.target.setPointerCapture(e.pointerId);}catch(x){}SH.el.getAnimations&&SH.el.getAnimations().forEach(function(a){a.cancel();});});
  document.addEventListener('pointermove',function(e){if(!on||!SH.el)return;dy=Math.max(0,e.clientY-y0);SH.el.style.transform=dy?'translateY('+dy+'px)':'';});
  function up(){if(!on)return;on=false;if(!SH.el)return;var v=dy/Math.max(1,Date.now()-t0);
    if(dy>90||v>.6){requestClose();return;}
    var el=SH.el,from=el.style.transform;el.style.transform='';if(from&&!rm()&&el.animate){var g=sp('Glide');el.animate([{transform:from},{transform:'none'}],{duration:g.ms,easing:g.easing});}}
  document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);})();
document.addEventListener('click',function(e){if(!SH.el||!e.target.closest)return;
  var c=e.target.closest('[data-cuclose]');if(c){e.preventDefault();requestClose();return;}
  var r=e.target.closest('a[data-cus]');if(r&&SH.el.contains(r)){e.preventDefault();var id=storyHash(r.getAttribute('href'));try{history.replaceState(null,'','#/story/'+id);}catch(x){}SH.last=SH.under;openSheet(id,{under:SH.under,pushed:SH.pushed});}});

/* ---------------- Threads list (#/threads) and hub blocks ---------------- */
var TF={f:''};
function tRow(t,showHub){var h=hubOf(t.cat);
  return '<li><a class="trow g press" href="#/story/'+esc(t.id)+'"'+(h?' data-hub="'+esc(t.cat)+'"':'')+'>'+
    '<span class="tr-k">'+(showHub&&h?(NB().hubIcon?NB().hubIcon(t.cat,13):'')+'<span>'+esc(h.n)+'</span>':'')+(TST[t.status]?'<span class="cu-ts cu-ts-'+t.status+'">'+TST[t.status]+'</span>':'')+'</span>'+
    '<span class="tr-t">'+esc(t.title)+'</span><span class="tr-m num">'+esc([t.count?cnt(t.count,'update'):'',t.last?'last '+dm(t.last):'',t.opened&&t.opened!==t.last?'since '+dm(t.opened):''].filter(Boolean).join(' \u00b7 '))+'</span>'+
    '<span class="tr-a" aria-hidden="true">\u203a</span></a></li>';}
function tList(list,showHub){return '<ul class="tlist" role="list">'+list.map(function(t){return tRow(t,showHub);}).join('')+'</ul>';}
function threadsBody(){var all=allThreads(),f=TF.f,list=f?all.filter(function(t){return t.cat===f;}):all;
  var g={open:[],dormant:[],closed:[]};list.forEach(function(t){(g[t.status]||g.dormant).push(t);});
  var x='';
  if(g.open.length)x+='<section aria-labelledby="h-to"><div class="sec" data-st><h2 id="h-to">Open</h2><span class="aside num">'+g.open.length+'</span></div><div data-st>'+tList(g.open,!f)+'</div></section>';
  if(g.dormant.length)x+='<section aria-labelledby="h-td"><div class="sec" data-st><h2 id="h-td">Dormant</h2><span class="aside">no update in 7 days</span></div><div data-st>'+tList(g.dormant,!f)+'</div></section>';
  if(g.closed.length)x+='<section aria-labelledby="h-tc"><div class="sec" data-st><h2 id="h-tc">Closed recently</h2></div><div data-st><button type="button" class="pill press tc-b" data-cux="cu-tc" aria-expanded="false" aria-controls="cu-tc">Show '+cnt(g.closed.length,'closed thread')+'</button><div id="cu-tc" hidden>'+tList(g.closed,!f)+'</div></div></section>';
  if(!x)x='<div class="g card empty" data-st><p class="note" style="margin:0">'+(f?'No threads in '+esc(hubName(f))+' yet.':'No story threads yet.')+'</p></div>';
  var note=!L.stories&&X.storyFile?(L.sfail?'Showing the threads in this edition. The full list loads when online.':'Loading all threads\u2026'):'';
  return (note?'<p class="note" role="status" data-st>'+esc(note)+'</p>':'')+x;}
function threadsChips(){var all=allThreads(),seen={};all.forEach(function(t){if(hubOf(t.cat))seen[t.cat]=(seen[t.cat]||0)+1;});
  var H=(NB().HUBS||[]).filter(function(h){return seen[h.s];});
  return '<div class="tp-s th-f" role="group" aria-label="Filter threads by topic" data-st><button type="button" class="pill press" data-cuf="" aria-pressed="'+(!TF.f)+'">All</button>'+
    H.map(function(h){return '<button type="button" class="pill press" data-cuf="'+h.s+'" data-hub="'+h.s+'" aria-pressed="'+(TF.f===h.s)+'"><i aria-hidden="true"></i>'+esc(h.n)+' <span class="num">'+seen[h.s]+'</span></button>';}).join('')+'</div>';}
function threadsView(){var m=location.hash.match(/[?&]f=([a-z-]+)/);TF.f=m&&hubOf(m[1])?m[1]:'';
  return '<div class="hd hubhd g" data-st="h" data-hub="'+esc(TF.f||'')+'"><a class="hback press" href="#/topics"><span aria-hidden="true">\u2039</span> Topics</a>'+
    '<div class="hh"><div><p class="greet">Topics</p><h1>Threads</h1></div></div><p class="hsub">Every story followed across editions since 1 Oct 2026. Tap one for its timeline.</p></div>'+
    '<div id="thf">'+threadsChips()+'</div><div id="thbody">'+threadsBody()+'</div>'+(NB().foot?NB().foot():'');}
function mountThreads(root){if(L.stories||!X.storyFile)return;
  loadStories().then(function(){if(!root.isConnected)return;var f=root.querySelector('#thf'),b=root.querySelector('#thbody');if(f)f.innerHTML=threadsChips();if(b)b.innerHTML=threadsBody();});}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-cuf]');if(!b)return;TF.f=b.getAttribute('data-cuf');
  document.querySelectorAll('[data-cuf]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});
  var hd=document.querySelector('.hubhd');if(hd)hd.setAttribute('data-hub',TF.f);
  var tb=document.getElementById('thbody');if(tb)tb.innerHTML=threadsBody();
  try{history.replaceState(null,'','#/threads'+(TF.f?'?f='+TF.f:''));}catch(x){}SH.last=location.hash;});
/* a hub's "Continuing in this topic": up to 4 open or dormant threads of that hub, newest first */
function hubThreads(slug){var CO=slug==='muthoot-fincorp',s=L.stories;
  var list=allThreads().filter(function(t){var f=CO&&s&&s.stories[t.id];return (t.cat===slug||(f&&f.cat!=='regulation'&&f.co.indexOf(slug)>=0))&&(t.status==='open'||t.status==='dormant');})
    .sort(function(a,b){return (b.cat===slug?1:0)-(a.cat===slug?1:0);}).slice(0,4);
  if(!L.stories&&X.storyFile&&!L.sfail)loadStories().then(function(){var el=document.getElementById('cu-ht');if(el&&el.getAttribute('data-slug')===slug)el.outerHTML=hubThreads(slug);});
  if(!list.length)return '<section id="cu-ht" data-slug="'+esc(slug)+'" hidden></section>';
  return '<section id="cu-ht" data-slug="'+esc(slug)+'" aria-labelledby="h-ht" class="cu-ht"><div class="sec" data-st><h2 id="h-ht">Continuing in this topic</h2><a class="aside" href="#/threads?f='+esc(slug)+'">All threads \u2192</a></div>'+(CO?mflPreview(list[0])+(list.length>1?'<div data-st>'+tList(list.slice(1),false)+'</div>':''):'<div data-st>'+tList(list,false)+'</div>')+'</section>';}

/* ================= step 3 ================= */
/* ---------------- card links: #/<date>/read/<desk>?card=<id>&hl=<title letters> ----------------
   card= finds the unit by the card's own title (any "Update:" prefix ignored on both sides); hl= stays as the
   fallback for older handlers and for a card whose heading cannot be matched. */
var RK3={news:'01-daily-watch',rules:'02-regulation',weekly:'03-weekly-analysis'};
function rk(r){r=S(r);return RK3[r]||(/^0\d-[a-z-]+$/.test(r)?r:'01-daily-watch');}
function flatT(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');}
function headKey(t){return flatT(plainT(String(t||'').replace(/^[^A-Za-z0-9\u20b9]+/,'')));}
function cardHref(dayId,c){c=O(c)||{};if(!D(dayId))return '';var id=S(c.id),t=S(c.title),q=[];
  if(id&&/^[\w.-]{1,80}$/.test(id))q.push('card='+encodeURIComponent(id));
  if(t){var k=headKey(t).slice(0,40);if(k.length>=4)q.push('hl='+k);}
  return '#/'+dayId+'/read/'+rk(c.report)+(q.length?'?'+q.join('&'):'');}
function dayOf(id){var nb=NB();return nb&&nb.M&&nb.M.byId?nb.M.byId[id]||null:null;}
function repCards(day,key){return A(day&&day.cards).filter(function(c){return O(c)&&S(c.title)&&rk(c.report)===key;});}
/* a report heading for a card: same title, or one a prefix of the other (12+ letters) */
function findHead(md,c,lvl){var k=headKey(c.title);if(k.length<6)return null;var hs=md.querySelectorAll(lvl||'h2,h3,h4'),pre=null;
  for(var i=0;i<hs.length;i++){var h=hs[i],t=h.getAttribute('data-hk');if(t==null){t=headKey(h.textContent);h.setAttribute('data-hk',t);}
    if(h.hasAttribute('data-card')&&h.getAttribute('data-card')!==S(c.id))continue;
    if(t===k)return h;if(!pre&&t.length>=12&&k.length>=12&&(t.indexOf(k)===0||k.indexOf(t)===0))pre=h;}
  return pre;}
function wkThreads(w){var m={};A(w&&w.threads).forEach(function(x){var id=Id(x.story_id);if(id)m[id]={n:N(x.cards_in_week),inRev:x.mentioned_in_review===true};});return m;}
function shortT(t,n){t=plainT(t).replace(/^\[[A-Z ]+\]\s*/,'').replace(/\s*\(link\)\s*$/,'');n=n||72;return t.length>n?t.slice(0,n-1).replace(/\s+\S*$/,'')+'\u2026':t;}
/* "Stories in this section": thread rows, 48 px tall, each with "N this week" */
function wkChips(ids,wt,max){var seen={},rows=A(ids).map(Id).filter(function(id){if(!id||seen[id])return false;seen[id]=1;return true;})
    .map(function(id){var t=thread(id);return t?{t:t,n:wt&&wt[t.id]?wt[t.id].n:null}:null;}).filter(Boolean);
  if(max)rows=rows.sort(function(a,b){return (b.n||0)-(a.n||0);}).slice(0,max);
  if(!rows.length)return '';
  return '<ul class="wk-row" role="list">'+rows.map(function(r){var h=hubOf(r.t.cat);
    return '<li><a class="wkc press" href="#/story/'+esc(r.t.id)+'"'+(h?' data-hub="'+esc(r.t.cat)+'"':'')+'><i aria-hidden="true"></i><span class="wkc-t">'+esc(shortT(r.t.title))+'</span>'+
      (r.n?'<span class="wkc-n num">'+esc(r.n+' this week')+'</span>':'')+'<span class="sr">. Open the story timeline</span></a></li>';}).join('')+'</ul>';}

/* ---------------- Read: thread pills, weekly section links, ?card= ---------------- */
function readMarks(root,dayId,key){var day=dayOf(dayId);if(!root||!day||day.stub)return;var md=root.querySelector('.md');if(!md||md.hasAttribute('data-cu3'))return;
  md.setAttribute('data-cu3','');
  var cur=root.querySelector('.seg a[aria-current=true]'),m=cur&&/\/read\/([0-9a-z-]+)/.exec(cur.getAttribute('href')||'');key=m?m[1]:key||'01-daily-watch';
  var wr=key==='03-weekly-analysis'?wkRead(day.week_review):null,sec={},wt=wkThreads(wr);
  if(wr)wr.sections.forEach(function(s){if(S(s.card_id))sec[s.card_id]=A(s.story_ids);});
  repCards(day,key).forEach(function(c){var h=findHead(md,c,key==='03-weekly-analysis'?'h2':'h3,h4,h2');if(!h)return;h.setAttribute('data-card',S(c.id));var k=card(c);
    if(k.sid&&key!=='03-weekly-analysis'){var t=thread(k.sid),lab=k.seq&&k.seq>1?'Update '+k.seq:'';
      if(t||k.seq)h.insertAdjacentHTML('beforeend',' <a class="thr rpill press" href="#/story/'+esc(k.sid)+'" aria-label="'+esc('Thread'+(lab?', '+lab:'')+(t?': '+shortT(t.title,80):'')+'. Open the story timeline')+'"><span aria-hidden="true">'+dots(k.seq||1)+'Thread'+(lab?' \u00b7 '+esc(lab):'')+'</span></a>');}
    if(key==='03-weekly-analysis'){var ids=sec[S(c.id)]||k.stRef,box=h.closest('section.mds')||h.parentNode,ch=wkChips(ids,wt);
      if(ch&&box&&!box.querySelector('.wk-st'))box.insertAdjacentHTML('beforeend','<div class="wk-st"><p class="wk-h">Stories in this section</p>'+ch+'</div>');}});
  if(wr){var un=wr.threads.filter(function(x){return x.mentioned_in_review!==true;}).map(function(x){return Id(x.story_id);}).filter(function(id){return id&&thread(id);});
    if(un.length){var id=nid('wku');md.insertAdjacentHTML('beforeend','<div class="wk-un"><button type="button" class="pill press" data-cux="'+id+'" aria-expanded="false" aria-controls="'+id+'">Threads this week that the review didn\u2019t cover \u00b7 '+un.length+'</button><div id="'+id+'" hidden>'+wkChips(un,wt)+'</div></div>');}
    md.insertAdjacentHTML('beforeend','<p class="wk-open"><a class="cta ghost press" href="#/week/'+esc(wr.start)+'">Weekly review: sections and threads <span aria-hidden="true">\u2192</span></a></p>');}}
/* ?card=<id>: scroll to the unit (its heading and the text under it) and highlight it for a few seconds.
   true = done; null = not found here (the caller falls back to hl=) */
var HIT=null,HIT0='';
function cardHit(root,cid,dayId){var md=root.querySelector('.md');if(!md)return null;cid=S(cid);if(!cid)return null;
  var h=null;[].some.call(md.querySelectorAll('[data-card]'),function(x){if(x.getAttribute('data-card')===cid){h=x;return true;}return false;});
  if(!h){var day=dayOf(dayId),c=A(day&&day.cards).filter(function(x){return O(x)&&x.id===cid;})[0];if(c)h=findHead(md,c);
    /* a card id the edition no longer has (cards are dropped or renumbered when the data is revised): say so once, then hl= may still find the text */
    if(!c&&day&&!day.stub&&A(day.cards).length&&HIT0!==cid){HIT0=cid;var nb=NB();if(nb&&nb.toast)nb.toast('That card isn\u2019t in this edition any more');}}
  if(!h)return null;h.setAttribute('data-cu-focus','');
  var lv=+h.tagName.slice(1),unit=[];
  if(lv===2&&h.parentNode&&h.parentNode.matches&&h.parentNode.matches('section.mds'))unit=[h.parentNode];
  else{unit=[h];var n=h.nextElementSibling;while(n&&!(/^H[1-6]$/.test(n.tagName)&&+n.tagName.slice(1)<=lv)){unit.push(n);n=n.nextElementSibling;}}
  if(HIT){clearTimeout(HIT.t);HIT.u.forEach(function(e){e.classList.remove('cu-hit','cu-hit-in');});}
  unit.forEach(function(e){e.classList.add('cu-hit');});void h.offsetWidth;unit.forEach(function(e){e.classList.add('cu-hit-in');});
  HIT={u:unit,t:setTimeout(function(){unit.forEach(function(e){e.classList.remove('cu-hit-in');});setTimeout(function(){unit.forEach(function(e){e.classList.remove('cu-hit');});},700);},3200)};
  var y=h.getBoundingClientRect().top+scrollY-Math.min(140,innerHeight*.18);window.scrollTo({top:Math.max(0,y),behavior:rm()?'auto':'smooth'});
  return true;}

/* ---------------- weekly review: the Today card and #/week/<week_start> ---------------- */
function wkRead(w){w=O(w);if(!w||!D(w.week_start))return null;
  return {id:D(w.id)||w.week_start,start:w.week_start,end:D(w.week_end),published:D(w.published),prefix:S(w.report_card_prefix),
    storyIds:A(w.story_ids).map(Id).filter(Boolean),sections:A(w.sections).map(O).filter(function(s){return s&&S(s.title);}),threads:A(w.week_threads).map(O).filter(Boolean)};}
function pubOf(w){return w.published||(w.end?shift(w.end,1):shift(w.start,7));}
function wkRange(w){var a=dObj(w.start),e=w.end||shift(w.start,6),b=dObj(e);
  return a.getMonth()===b.getMonth()?a.getDate()+'\u2013'+b.getDate()+' '+MON[b.getMonth()]:dm(w.start)+' \u2013 '+dm(e);}
function wkOf(day){if(day&&day.id===X.latestId&&X.week)return X.week;return wkRead(day&&day.week_review);}
function wkMatch(w,key){return w&&(w.start===key||w.id===key||pubOf(w)===key);}
/* Today: shown from the Monday it is published for 7 days (week_review stays in latest.json that long) */
function weekCard(day){var w=wkOf(day);if(!w||!day)return '';var p=pubOf(w),n=diff(day.id,p);if(n<0||n>6)return '';
  var wt=wkThreads(w),ids=w.storyIds.length?w.storyIds:w.threads.filter(function(x){return x.mentioned_in_review===true;}).map(function(x){return x.story_id;});
  var pd=dayOf(p),ch=wkChips(ids,wt,3),ns=pd&&!pd.stub?wkList(w,pd).length:0;ids=wkIds(ids);
  return '<section aria-labelledby="h-wk" class="wkcard"><div class="wk g" data-st><p class="kick">Weekly review \u00b7 '+esc(sday(p))+'</p>'+
    '<h2 id="h-wk">'+(n===0?'This week\u2019s review':'This week\u2019s review')+'</h2><p class="wk-m num">'+esc(['Week of '+wkRange(w),ns?cnt(ns,'section'):'',ids.length?cnt(ids.length,'thread'):''].filter(Boolean).join(' \u00b7 '))+'</p>'+
    (ch?'<p class="wk-h">Threads in the review</p>'+ch:'')+
    '<a class="cta ghost press wk-a" href="#/week/'+esc(w.start)+'">Open the weekly review <span aria-hidden="true">\u2192</span></a></div></section>';}
var WK={key:'',day:null};
function wkIds(ids){var seen={};return A(ids).map(Id).filter(function(id){if(!id||seen[id]||!thread(id))return false;seen[id]=1;return true;});}
function wkSub(w,ns){return 'Published '+sday(pubOf(w))+' \u00b7 '+cnt(ns,'section')+' \u00b7 '+cnt(wkIds(w.storyIds).length,'thread')+' in the review';}
function wkList(w,pday){var cards=pday&&!pday.stub?repCards(pday,'03-weekly-analysis'):[],sec={};
  w.sections.forEach(function(s){if(S(s.card_id))sec[s.card_id]=A(s.story_ids);});
  return cards.length?cards.map(function(c){return {id:S(c.id),title:S(c.section)||S(c.title),sum:S(c.summary),ids:sec[S(c.id)]||card(c).stRef,c:c};})
    :w.sections.map(function(s){return {id:S(s.card_id),title:S(s.title),sum:'',ids:A(s.story_ids),c:{id:S(s.card_id),report:'weekly',title:S(s.title)}};});}
function weekBody(w,pday){var wt=wkThreads(w),p=pubOf(w),cards=pday&&!pday.stub?repCards(pday,'03-weekly-analysis'):[];
  var list=wkList(w,pday);
  var x='<section aria-labelledby="h-wks"><div class="sec" data-st><h2 id="h-wks">Sections</h2><span class="aside num">'+list.length+'</span></div>';
  x+=list.map(function(s){var sm=s.sum?NB().clip?NB().clip(cleanSum(s.sum),240):cleanSum(s.sum):'',ch=wkChips(s.ids,wt),href=cardHref(p,s.c);
    return '<article class="wks g" data-st><h3>'+esc(plainT(s.title))+'</h3>'+(sm?'<p class="sum">'+esc(sm)+'</p>':'')+
      (ch?'<p class="wk-h">Stories in this section</p>'+ch:'')+'<div class="sc-f"><span class="by num">'+(ch?esc(cnt((ch.match(/<li\b/g)||[]).length,'thread')):'No linked thread')+'</span><a class="more press" href="'+esc(href)+'">Read this section<span class="sr">: '+esc(s.title)+'</span> <span aria-hidden="true">\u2192</span></a></div></article>';}).join('')+'</section>';
  var un=w.threads.filter(function(t){return t.mentioned_in_review!==true;}).map(function(t){return Id(t.story_id);}).filter(function(id){return id&&thread(id);});
  if(un.length){var id=nid('wku');x+='<section aria-labelledby="h-wku" class="wk-un"><div class="sec" data-st><h2 id="h-wku">Not in the review</h2><span class="aside num">'+un.length+'</span></div><div data-st>'+
    '<button type="button" class="pill press" data-cux="'+id+'" aria-expanded="false" aria-controls="'+id+'">Threads this week that the review didn\u2019t cover</button><div id="'+id+'" hidden>'+wkChips(un,wt)+'</div></div></section>';}
  if(!cards.length&&pday!==undefined)x+='<p class="note" role="status" data-st>Section summaries load with the '+esc(sday(p))+' edition when online.</p>';
  return x;}
function weekView(day,key){key=S(key);var w=wkMatch(X.week,key)?X.week:wkMatch(wkOf(day),key)?wkOf(day):null;WK={key:key,day:null};
  var p=w?pubOf(w):'';
  var hd='<div class="hd hubhd g" data-st="h"><a class="hback press" href="'+(p?'#/'+esc(p)+'/read/03-weekly-analysis':'#/read')+'"><span aria-hidden="true">\u2039</span> Weekly desk</a>'+
    '<div class="hh"><div><p class="greet">Weekly review</p><h1>'+(w?'Week of '+esc(wkRange(w)):'Weekly review')+'</h1></div></div>'+
    '<p class="hsub">'+(w?esc(wkSub(w,wkList(w,dayOf(p)&&!dayOf(p).stub?dayOf(p):null).length)):'')+'</p></div>';
  var body=w?weekBody(w,dayOf(p)&&!dayOf(p).stub?dayOf(p):undefined):'<div class="g card empty" data-st role="status" id="wk-miss"><h2>Looking for this weekly review\u2026</h2><p>It loads from the edition it was published in.</p></div>';
  return hd+(w?'<p class="wk-full" data-st><a class="cta press" href="#/'+esc(p)+'/read/03-weekly-analysis">Read the full weekly <span aria-hidden="true">\u2192</span></a></p>':'')+'<div id="wkbody">'+body+'</div>'+(NB().foot?NB().foot():'');}
/* after the route: load the edition the review was published in (summaries), or find an older week in its day file */
function mountWeek(root,key){key=S(key);var w=wkMatch(X.week,key)?X.week:null,nb=NB();if(!nb||!nb.getDay)return;
  var p=w?pubOf(w):D(key)?shift(key,7):'';
  if(!p){miss();return;}
  var d0=dayOf(p);if(w&&d0&&!d0.stub&&L.stories){wkSync(root,w);return;}
  function miss(){var m=root.querySelector('#wk-miss');if(m)m.innerHTML='<h2>This weekly review isn\u2019t in the saved editions</h2><p><a href="#/archive">Open the archive</a> or the <a href="#/read">latest Read desk</a>.</p>';}
  (nb.M.byId[p]?nb.getDay(p):Promise.resolve(null)).then(function(day){if(!root.isConnected)return;var ww=w||wkRead(day&&day.week_review);
    if(!ww||!wkMatch(ww,key)&&!wkMatch(ww,p)){miss();return;}
    if(!w){var v=document.createElement('div');v.innerHTML=weekView(day,ww.start);var hd=root.querySelector('.hubhd'),nh=v.querySelector('.hubhd');if(hd&&nh)hd.replaceWith(nh);
      var fl=v.querySelector('.wk-full'),b0=root.querySelector('#wkbody');if(fl&&b0)b0.parentNode.insertBefore(fl,b0);}
    var b=root.querySelector('#wkbody');if(b){b.innerHTML=weekBody(ww,day&&!day.stub?day:null);wkSync(root,ww);}}).catch(miss);
  if(!L.stories&&X.storyFile&&!L.sfail)loadStories().then(function(){var b=root.querySelector('#wkbody');if(!b||!root.isConnected)return;var ww=w||wkRead((dayOf(p)||{}).week_review);if(ww){b.innerHTML=weekBody(ww,dayOf(p)&&!dayOf(p).stub?dayOf(p):null);wkSync(root,ww);}});}
function wkSync(root,w){var h=root.querySelector('.hubhd .hsub'),n=root.querySelectorAll('#wkbody .wks').length,a=root.querySelector('#h-wks + .aside');if(h&&w)h.textContent=wkSub(w,n);if(a)a.textContent=String(n);}

/* ---------------- Regulation hub: tracked instruments by stage ---------------- */
var STG=[['draft','Draft','Open for comment or not yet final'],['final','Final','Issued, not yet in force'],['effective','Effective','In force']];
function regRow(t){var r=t.reg,dl=r?dlChip(r.dl,NB().todayIST()):'';
  return '<li><a class="trow rrow g press" href="#/story/'+esc(t.id)+'" data-hub="regulation"><span class="tr-k">'+(t.rg?'<span class="rgb">'+esc(t.rg.toUpperCase())+'</span>':'')+lcChip(r&&r.lc)+dl+'</span>'+
    '<span class="tr-t">'+esc(shortT(t.title,140))+'</span><span class="tr-m num">'+esc([r&&r.ref?r.ref:'',t.opened?'first covered '+dm(t.opened):'',t.last&&t.last!==t.opened?'last '+dm(t.last):''].filter(Boolean).join(' \u00b7 '))+'</span>'+
    '<span class="tr-a" aria-hidden="true">\u203a</span></a></li>';}
function regTracked(){var s=L.stories;
  if(!s){if(X.storyFile&&!L.sfail)loadStories().then(function(){var el=document.getElementById('cu-rt');if(el&&L.stories)el.outerHTML=regTracked();});return '<section id="cu-rt" hidden></section>';}
  var g={},other=[],n=0,today=NB().todayIST();
  Object.keys(s.stories).forEach(function(id){var f=s.stories[id];if(!f.reg||!f.reg.lc)return;n++;var t={id:id,title:f.title,cat:f.cat,status:f.status,opened:f.opened,last:f.last,reg:f.reg,rg:f.rg||(f.rgs[0]||'')};
    if(LC[f.reg.lc]&&f.reg.lc!=='superseded'&&f.reg.lc!=='withdrawn')(g[f.reg.lc]=g[f.reg.lc]||[]).push(t);else other.push(t);});
  if(!n)return '<section id="cu-rt" hidden></section>';
  function soon(t){var d=t.reg&&t.reg.dl;return d&&d.date>=today?d.date:'9';}
  function ord(a,b){var x=soon(a),y=soon(b);if(x!==y)return x<y?-1:1;return (a.last||'')<(b.last||'')?1:(a.last||'')>(b.last||'')?-1:0;}
  var x='<section id="cu-rt" aria-labelledby="h-rt" class="cu-rt"><div class="sec" data-st><h2 id="h-rt">Tracked instruments</h2><span class="aside num">'+esc(cnt(n,'circular'))+' \u00b7 by stage</span></div>';
  STG.forEach(function(st){var L2=(g[st[0]]||[]).sort(ord);if(!L2.length)return;var id=nid('rt');
    x+='<div class="rt-g" data-st><h3 class="rt-h"><span class="st st-'+st[0]+'">'+st[1]+'</span><span class="rt-n num">'+L2.length+'</span><span class="rt-d">'+st[2]+'</span></h3>'+
      tList0(L2.slice(0,4))+(L2.length>4?'<button type="button" class="pill press rt-more" data-cux="'+id+'" aria-expanded="false" aria-controls="'+id+'">Show all '+L2.length+'</button><div id="'+id+'" hidden>'+tList0(L2.slice(4))+'</div>':'')+'</div>';});
  if(other.length){var id2=nid('rt');other.sort(ord);
    x+='<div class="rt-g" data-st><button type="button" class="pill press rt-more" data-cux="'+id2+'" aria-expanded="false" aria-controls="'+id2+'">Superseded, withdrawn or other \u00b7 '+other.length+'</button><div id="'+id2+'" hidden>'+tList0(other)+'</div></div>';}
  return x+'<p class="note" data-st>Deadline chips count days from today on this device. Tap a circular for its timeline.</p></section>';}
function tList0(L2){return '<ul class="tlist" role="list">'+L2.map(regRow).join('')+'</ul>';}

/* ---------------- Muthoot Fincorp hub: the thread timeline preview ---------------- */
function mflPreview(t){var f=thread(t.id);if(!f||!f.ups.length)return '';var ups=f.ups.slice().reverse().slice(0,3);
  return '<div class="mflp g" data-st data-hub="muthoot-fincorp"><p class="kick">Latest thread</p><a class="mflp-t press" href="#/story/'+esc(t.id)+'">'+esc(shortT(t.title,110))+'<span class="sr">. Open the story timeline</span></a>'+
    '<ol class="tl mini" role="list">'+ups.map(function(u){var href=readLink(u),now=u.date===X.latestId;
      return '<li class="tl-n'+(now?' now':'')+'"><p class="tl-d num">'+esc(sday(u.date)+(now?' \u00b7 Today':''))+(u.kind==='status'?' <span class="tl-m">Status</span>':'')+'</p>'+
        (href?'<a class="tl-t press" href="'+esc(href)+'">'+esc(plainT(u.title))+'</a>':'<p class="tl-t">'+esc(plainT(u.title))+'</p>')+'</li>';}).join('')+'</ol>'+
    '<div class="sc-f"><span class="by num">'+esc(cnt(f.full?f.ups.length:(f.count||f.ups.length),'update')+(f.opened?' \u00b7 since '+dm(f.opened):''))+'</span><a class="more press" href="#/story/'+esc(t.id)+'">Full timeline <span aria-hidden="true">\u2192</span></a></div></div>';}

/* ---------------- search documents: threads and Peer Intelligence ---------------- */
function threadTitles(){var o={};allThreads().forEach(function(t){o[t.id]=plainT(t.title);});return o;}
function searchDocs(){var p0=loadStories().then(function(){return loadPeer();},function(){return null;});
  return p0.then(function(){return null;},function(){return null;}).then(function(){var out=[],s=L.stories,lat=X.latestId;
    if(s)Object.keys(s.stories).forEach(function(id){var f=s.stories[id],sn={};f.updates.forEach(function(u){if(u.src)sn[u.src.name]=1;});
      out.push({d:f.last||f.opened||lat,k:'Thread',s:'Threads \u00b7 '+(hubName(f.cat)||'Story'),t:plainT(f.title),b:f.updates.slice(-8).reverse().map(function(u){return plainT(u.title);}).join(' \u00b7 '),
        sn:Object.keys(sn).join(' '),src:null,h:'#/story/'+id,c:f.cat,sid:id,lc:f.reg&&LC[f.reg.lc]?f.reg.lc:'',tg:{companies:f.co,regulators:f.rgs,topics:f.tp}});});
    else allThreads().forEach(function(t){out.push({d:t.last||t.opened||lat,k:'Thread',s:'Threads \u00b7 '+(hubName(t.cat)||'Story'),t:plainT(t.title),b:'',h:'#/story/'+t.id,c:t.cat,sid:t.id,lc:'',tg:{companies:[],regulators:[],topics:[]}});});
    var seen={};(L.peer||[]).concat(X.pi).forEach(function(p){if(seen[p.id])return;seen[p.id]=1;var b=[];
      p.met.forEach(function(m){b.push(m.label+(m.disc?'':' not disclosed'));});p.guid.forEach(function(g){b.push(g.text);});p.quotes.forEach(function(q){b.push(q.text+(q.who?' ('+q.who+')':''));});
      p.nd.forEach(function(t){b.push(t);});p.cmp.forEach(function(r){b.push(r.label+' with Muthoot Fincorp');});if(p.impact)b.push(p.impact);
      out.push({d:D(p.date)||lat,k:'Peer intel',s:'Peers \u00b7 '+p.name,t:piTitle(p),b:b.join(' \u00b7 '),sn:piSources(p).map(function(x){return x.name;}).join(' '),src:null,
        h:piHref(p),c:'peers',tg:{companies:[p.co],regulators:[],topics:['results']}});});
    return out.filter(function(o){return D(o.d);});});}

/* ---------------- #/peer/<slug>?pi=<id>: open, scroll to and highlight one entry ---------------- */
var PIF={id:''};
function piHref(p){return '#/peer/'+p.co+(p.id?'?pi='+encodeURIComponent(p.id):'');}
function piFocus(root,pq){var m=/(?:^|&)pi=([^&]+)/.exec(pq||'');if(!m){PIF.id='';return;}var id;try{id=decodeURIComponent(m[1]);}catch(e){return;}PIF.id=id;var tries=0;
  (function go(){if(!root.isConnected)return;var el=null;[].some.call(root.querySelectorAll('[data-pi]'),function(x){if(x.getAttribute('data-pi')===id){el=x;return true;}return false;});
    if(!el){if(++tries<24)setTimeout(go,150);else if(L.peer||!X.peerFile){var nb=NB();if(nb&&nb.toast)nb.toast('This Peer Intelligence entry isn\u2019t in this edition\u2019s data');}return;}
    var box=el.closest('.pih-x');if(box&&box.hidden){box.hidden=false;var b=root.querySelector('[aria-controls="'+box.id+'"]');if(b)b.setAttribute('aria-expanded','true');}
    el.setAttribute('data-cu-focus','');el.classList.add('cu-hit');void el.offsetWidth;el.classList.add('cu-hit-in');setTimeout(function(){el.classList.remove('cu-hit-in');setTimeout(function(){el.classList.remove('cu-hit');},700);},3200);
    var y=el.getBoundingClientRect().top+scrollY-Math.min(120,innerHeight*.15);window.scrollTo({top:Math.max(0,y),behavior:rm()?'auto':'smooth'});})();}

/* ---------------- horizontal scrollers: fade the edge that has more to show ---------------- */
function scEdge(el){var w=el.scrollWidth-el.clientWidth,x=Math.abs(el.scrollLeft);el.classList.toggle('sc-l',w>2&&x>2);el.classList.toggle('sc-r',w>2&&x<w-2);}
function scAll(){[].forEach.call(document.querySelectorAll('.fx-sc'),scEdge);}
document.addEventListener('scroll',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('fx-sc'))scEdge(t);},true);
(function(){var raf=0;function q(){if(!raf)raf=requestAnimationFrame(function(){raf=0;scAll();});}
  window.addEventListener('resize',q);
  if(window.MutationObserver){var mo=new MutationObserver(q);var go=function(){var a=document.getElementById('app');if(a)mo.observe(a,{childList:true,subtree:true});else setTimeout(go,50);};go();}})();

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
  cleanSum:cleanSum,contStrip:contStrip,onHash:onHash,deep:deepLink,openStory:function(id){location.hash='#/story/'+id;},closeStory:requestClose,threadsView:threadsView,mountThreads:mountThreads,hubThreads:hubThreads,thread:thread,
  cardHref:cardHref,readMarks:readMarks,cardHit:cardHit,weekCard:weekCard,weekView:weekView,mountWeek:mountWeek,regTracked:regTracked,
  searchDocs:searchDocs,threadTitles:threadTitles,piFocus:piFocus,scAll:scAll,
  get impactLabel(){return X.lab||'';},get continuing(){return X.cont;},get week(){return X.week;},get peerIntel(){return X.pi;},get fixture(){return X.fixture;},
  _x:function(){return {X:X,L:L};}};
})();
