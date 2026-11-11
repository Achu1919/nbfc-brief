/* NBFC Brief · public edition app shell (no framework).
   Data: data/latest.json + data/YYYY-MM-DD.json (public schema, docs/DATA_FORMAT.md) when they are fresh;
   otherwise data.js (window.BRIEFING) written by publish.py. latest.json is used only when it was built in the
   same run as data.js (same or newer "generated"), so a stale data/ folder can never show an old edition.
   Hard rules kept here: every figure shows its source; missing figures are shown as missing and never carried
   over from another day; Muthoot Finance (listed peer) is never shown as Muthoot Fincorp (MFL). */
(function(){'use strict';
var APP=document.getElementById('app');
var RM=window.matchMedia('(prefers-reduced-motion: reduce)');
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function domain(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return u;}}
function shortUrl(u){try{var x=new URL(u),p=x.pathname.replace(/\/$/,'');var seg=p.split('/').filter(Boolean).pop()||'';
  seg=seg.replace(/\.(cms|html?|ece|aspx|pdf)$/,'').replace(/[-_]+/g,' ');if(seg.length>40)seg=seg.slice(0,38).replace(/\s+\S*$/,'')+'…';
  return domain(u)+(seg?' · '+seg:'');}catch(e){return u;}}
var URL_RE=/https?:\/\/[^\s<>()\[\]]+/g;
function trimUrl(u){return u.replace(/[.,;:*_]+$/,'');}
/* inline markdown: md links, then bare URLs become short clickable links */
function inlineMd(s){
  var keep=[];
  s=String(s).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,function(_,t,u){keep.push('<a href="'+esc(u)+'" target="_blank" rel="noreferrer">'+esc(t)+'</a>');return '\u0000'+(keep.length-1)+'\u0000';});
  s=s.replace(URL_RE,function(u){var t=trimUrl(u),rest=u.slice(t.length);
    keep.push('<a class="raw" href="'+esc(t)+'" target="_blank" rel="noreferrer">'+esc(shortUrl(t))+'</a>'+esc(rest));return '\u0000'+(keep.length-1)+'\u0000';});
  s=esc(s).replace(/`([^`]+)`/g,'$1')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*/g,'$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g,function(_,i){return keep[+i];});
}
function stripMd(s){return String(s).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`#>]/g,'').replace(/\s+/g,' ').trim();}
function noCites(s){return String(s).replace(/\s*\((?:\s*\[[^\]]+\]\([^)]+\)\s*,?)+\)/g,'');}
function clip(s,n){s=String(s).trim();if(s.length<=n)return s;var c=s.slice(0,n),st=Math.max(c.lastIndexOf('. '),c.lastIndexOf('? '),c.lastIndexOf('! '));
  if(st>=n*.55)return c.slice(0,st+1);var sp=c.lastIndexOf(' ');return (sp>0?c.slice(0,sp):c).replace(/[\s,;:—-]+$/,'')+'…';}
function firstSentence(s){var m=String(s).match(/^(.+?[.?!])(\s|$)/);return m?m[1]:s;}
function cleanHead(s){return stripMd(s).replace(/^[^A-Za-z0-9₹]+/,'').trim();}
function deEmoji(s){return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F\u200D]/gu,'').replace(/^[^\p{L}\p{N}₹*\[]+/u,'').trim();}
function slug(s){return cleanHead(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);}
/* source list: every URL with its label, split on " · " */
function sourceList(lines){
  var items=[],seen={};
  lines.join('\n').split(/\n|\s·\s/).forEach(function(piece){
    piece=piece.trim().replace(/^[-*]\s+|^\d+\.\s+/,'');if(!piece)return;
    var md,re=/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,any=false;
    while((md=re.exec(piece))){any=true;add(md[1],md[2]);}
    if(any)return;
    var urls=piece.match(URL_RE)||[];
    urls.forEach(function(u){var lab=piece.split(u)[0].replace(/[:\s—–-]+$/,'').trim();add(lab,trimUrl(u));});
  });
  function add(l,u){if(seen[u])return;seen[u]=1;items.push({l:stripMd(l)||shortUrl(u),u:u});}
  return items;
}
/* markdown -> html. The Key numbers block and the Source Links list are not repeated in the
   body: both live in the side rail (cards #kn-card and #src-card), and "On this page" points there. */
/* long reports: each h2 section skips layout/paint while off-screen (content-visibility), so opening Read stays a short task */
function chunk(html){var parts=html.split(/(?=<h2 )/);return parts.map(function(x,i){return i?'<section class="mds">'+x+'</section>':x;}).join('');}
/* public renames: section and label names the public edition uses */
function pubHead(t){return String(t).replace(/Deadlines for MFL finance/i,'Regulatory calendar').replace(/\bMFL watchlist\b/i,'Muthoot Fincorp in the market');}
function pubText(t){return String(t).replace(/Why it matters for (?:Muthoot Fincorp \(MFL\)|Muthoot Fincorp|MFL)/gi,'Possible impact on Muthoot Fincorp').replace(/\bMFL action\b/g,'Possible impact on MFL');}
function markdown(src,toc,srcOut){
  var lines=pubText(src).split(/\r?\n/),out=[],i=0,pre=true;
  while(i<lines.length){
    var line=lines[i].trim();
    if(!line){i++;continue;}
    var h=line.match(/^(#{1,3})\s+(.+)/);
    if(h){var lvl=h[1].length;
      if(lvl===1&&pre){i++;continue;}
      pre=false;
      if(lvl===2&&/key numbers/i.test(h[2])){i++;
        while(i<lines.length&&!/^##\s/.test(lines[i].trim()))i++;
        if(toc)toc.push({id:'kn-card',t:'Key numbers'});continue;}
      if(lvl===2&&/source/i.test(h[2])){i++;var blk=[];
        while(i<lines.length&&!/^(#{1,2}\s|---+$)/.test(lines[i].trim())){if(lines[i].trim())blk.push(lines[i]);i++;}
        if(srcOut)srcOut.push.apply(srcOut,blk);
        if(toc)toc.push({id:'src-card',t:'Sources'});continue;}
      h[2]=pubHead(h[2]);var id=slug(h[2]);if(toc&&lvl===2)toc.push({id:id,t:cleanHead(h[2])});
      out.push('<h'+lvl+' id="'+id+'">'+inlineMd(deEmoji(h[2]))+'</h'+lvl+'>');i++;
      continue;}
    if(pre&&/^\*[^*].*\*$/.test(line)&&/edition/i.test(line)){i++;continue;}
    if(pre&&/^\*\*[A-Z][A-Za-z &]{1,24}:\*\*/.test(line)){i++;continue;}
    if(/^---+$/.test(line)){if(!pre)out.push('<hr>');i++;continue;}
    if(line.indexOf('|')===0){
      var rows=[];
      while(i<lines.length&&lines[i].trim().indexOf('|')===0){
        var cells=lines[i].trim().replace(/^\||\|$/g,'').split('|').map(function(x){return x.trim();});
        if(!cells.every(function(x){return /^:?-{2,}:?$/.test(x);}))rows.push(cells);i++;}
      if(rows.length){var hd0=rows[0],nc=hd0.length,body=rows.slice(1),cells=[].concat.apply([],body),
          avg=cells.length?cells.reduce(function(a,x){return a+stripMd(x).length;},0)/cells.length:0,
          mode=nc>3||avg>36?'tstack':'tscroll',lab=hd0.map(function(x){return esc(stripMd(x));});
        out.push('<div class="twrap '+mode+'"><table><thead><tr>'+hd0.map(function(x){return '<th scope="col">'+inlineMd(x)+'</th>';}).join('')+'</tr></thead><tbody>'+
          body.map(function(r){return '<tr>'+r.map(function(x,ci){return '<td data-l="'+(lab[ci]||'')+'">'+inlineMd(x)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>');}
      continue;}
    if(/^[-*]\s+/.test(line)){var items=[];
      while(i<lines.length&&/^[-*]\s+/.test(lines[i].trim())){items.push('<li>'+inlineMd(lines[i].trim().replace(/^[-*]\s+/,''))+'</li>');i++;}
      out.push('<ul>'+items.join('')+'</ul>');continue;}
    if(/^\d+\.\s+/.test(line)){var ol=[];
      while(i<lines.length&&/^\d+\.\s+/.test(lines[i].trim())){ol.push('<li>'+inlineMd(lines[i].trim().replace(/^\d+\.\s+/,''))+'</li>');i++;}
      out.push('<ol>'+ol.join('')+'</ol>');continue;}
    var para=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!/^(#{1,3}\s|---+$|\||[-*]\s+|\d+\.\s+)/.test(lines[i].trim())){para.push(lines[i].trim());i++;}
    out.push('<p>'+inlineMd(para.join(' '))+'</p>');
  }
  return out.join('');
}

/* ---------------- motion (from todo-app ui/motion: Motion.kt + LaunchEntrance.kt) ---------------- */
/* SwiftUI-style spring(response, dampingFraction), unit mass; sampled into a CSS linear() easing. */
function spring(response,damping){
  var w=2*Math.PI/response,z=damping;
  function x(t){if(z<1){var wd=w*Math.sqrt(1-z*z);return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t));}
    return 1-Math.exp(-w*t)*(1+w*t);}
  var T=0;for(var t=0;t<3;t+=0.004){if(Math.abs(1-x(t))>0.01)T=t;}T+=0.004;
  var n=48,pts=[];for(var i=0;i<=n;i++)pts.push(+x(T*i/n).toFixed(4));pts[n]=1;
  var ok=window.CSS&&CSS.supports&&CSS.supports('transition-timing-function','linear(0, 1)');
  return {ms:Math.round(T*1000),easing:ok?'linear('+pts.join(',')+')':'cubic-bezier(.2,.9,.3,1.04)'};
}
var SPRINGS={Smooth:spring(.50,1.00),Glide:spring(.40,.86),Snappy:spring(.50,.80),Quick:spring(.30,.86),
  Soft:spring(.80,.90),Pop:spring(.35,.58),Rise:spring(.24,.90)};
var ENTRANCE={TotalMs:450,StaggerMs:32,MaxRows:8,HeaderDropPx:8,RowRisePx:24,BottomRisePx:24,BottomDelayMs:60,ReducedMs:150};
var STANDARD='cubic-bezier(.4,0,.2,1)',FADE_IN=220;
document.documentElement.style.setProperty('--ease-quick',SPRINGS.Quick.easing);
document.documentElement.style.setProperty('--ease-smooth',SPRINGS.Smooth.easing);
document.documentElement.style.setProperty('--ease-glide',SPRINGS.Glide.easing);
/* cascade: header drops 8px, rows rise (24px on launch, 12px on navigation) with a 32 ms stagger
   (max 8 rows), opacity on a tween (never a spring). Reduced motion: one 150 ms fade, no movement. */
function cascade(root,launch){
  if(!root.animate)return;
  if(RM.matches){root.animate([{opacity:0},{opacity:1}],{duration:ENTRANCE.ReducedMs,easing:'ease-in-out'});return;}
  var rows=0,vh=window.innerHeight*1.15;
  var sw=inSwap;
  root.querySelectorAll('[data-st]').forEach(function(el){
    if(sw&&stat(el,sw.keepSeg))return;
    var r=el.getBoundingClientRect();if(r.top>vh)return;
    if(sw){var i2=Math.min(rows++,ENTRANCE.MaxRows-1),d2=i2*ENTRANCE.StaggerMs,dx=sw.dir&&!sw.keepSeg?sw.dir*12:0;
      el.animate([{transform:'translate('+dx+'px,8px)'},{transform:'none'}],{duration:SPRINGS.Rise.ms,delay:d2,easing:SPRINGS.Rise.easing,fill:'backwards'});
      el.animate([{opacity:.3},{opacity:1}],{duration:180,delay:d2,easing:'cubic-bezier(0,0,.2,1)',fill:'backwards'});return;}
    var head=el.dataset.st==='h',idx=head?0:Math.min(rows++,ENTRANCE.MaxRows-1);
    var delay=head?0:idx*ENTRANCE.StaggerMs,dist=head?(launch?-ENTRANCE.HeaderDropPx:0):(launch?ENTRANCE.RowRisePx:10);if(!dist)return;
    el.animate([{transform:'translateY('+dist+'px)'},{transform:'none'}],{duration:SPRINGS.Rise.ms+(launch?0:80),delay:delay,easing:SPRINGS.Rise.easing,fill:'backwards'});
    el.animate([{opacity:launch?0:.35},{opacity:1}],{duration:FADE_IN,delay:delay,easing:STANDARD,fill:'backwards'});
  });
}
function riseTabbar(){var t=document.getElementById('tabbar');if(!t.animate||RM.matches)return;
  /* transform only: opacity<1 on the nav would make it a backdrop root and cut its glass off from the page */
  var base=getComputedStyle(t).transform;base=base==='none'?'':base+' ';
  t.animate([{transform:base+'translateY(120px)'},{transform:base+'translateY(0)'}],
    {duration:SPRINGS.Snappy.ms,delay:ENTRANCE.BottomDelayMs,easing:SPRINGS.Snappy.easing,fill:'backwards'});}

/* ---------------- data layer ---------------- */
var CORE=['sensex','nifty','niftyfin','manappuram','muthoot','iifl','shriram','bajaj','usdinr','gold10g','brent'];
var FULL={sensex:'Sensex',nifty:'Nifty 50',niftyfin:'Nifty Financial Services',manappuram:'Manappuram Finance',muthoot:'Muthoot Finance',
  iifl:'IIFL Finance',shriram:'Shriram Finance',bajaj:'Bajaj Finance',usdinr:'USD/INR',gold10g:'Gold (₹/10g)',brent:'Brent ($/bbl)',
  goldspot:'Gold spot ($/oz)',fii:'FII net (₹ cr)',dii:'DII net (₹ cr)'};
var SHORT={sensex:'Sensex',nifty:'Nifty 50',niftyfin:'Nifty Fin Services',manappuram:'Manappuram',muthoot:'Muthoot Finance',
  iifl:'IIFL Finance',shriram:'Shriram Finance',bajaj:'Bajaj Finance',usdinr:'USD/INR',gold10g:'MCX Gold /10g',brent:'Brent',
  goldspot:'Spot gold',fii:'FII net',dii:'DII net'};
var GROUP={sensex:'index',nifty:'index',niftyfin:'index',manappuram:'peer',muthoot:'peer',iifl:'peer',shriram:'peer',bajaj:'peer',
  usdinr:'macro',gold10g:'macro',brent:'macro',goldspot:'macro',fii:'flows',dii:'flows'};
var MARKET_ORDER=['nifty','sensex','niftyfin','gold10g','goldspot','brent','usdinr'];
var PEER_ORDER=['muthoot','manappuram','iifl','shriram','bajaj'];
var JOBS={'01-daily-watch':{tab:'News',name:'News desk',when:'7:00 AM'},'02-regulation':{tab:'Rules',name:'Rules desk',when:'7:00 AM'},
  '03-weekly-analysis':{tab:'Weekly',name:'Weekly analysis',when:'7:15 AM Mondays'}};

var M={source:null,generated:null,days:[],byId:{},series:{}};
function num(v){if(v==null)return null;var s=String(v).replace(/[−–]/g,'-').replace(/,/g,'');var m=s.match(/[-+]?\d+(?:\.\d+)?/);return m?parseFloat(m[0]):null;}
/* value_num (number|null) from the publisher wins, even when null (= ambiguous, never guessed); else parse value */
function numOf(it){if(it&&Object.prototype.hasOwnProperty.call(it,'value_num'))return typeof it.value_num==='number'&&isFinite(it.value_num)?it.value_num:null;return num(it&&it.value);}
function buildSeries(days){ /* oldest -> newest; a day without the figure is a gap (null), never carried forward */
  var s={},asc=days.slice().sort(function(a,b){return a.id<b.id?-1:1;});
  Object.keys(FULL).forEach(function(k){s[k]=[];});
  asc.forEach(function(d){var have={};((d.key_numbers||{}).items||[]).forEach(function(it){have[it.key]=it;});
    Object.keys(s).forEach(function(k){s[k].push({d:d.id,v:have[k]?numOf(have[k]):null});});});
  return s;}
function index(days){M.days=days.slice().sort(function(a,b){return a.id<b.id?1:-1;});M.byId={};M.days.forEach(function(d){M.byId[d.id]=d;});}
/* data.js (publish.py) days use the v1 field names; map them onto the public ones */
function pubDay(d){if(!d)return d;var k=d.key_numbers;
  if(!d.mfl_market&&k&&k.watchlist)d.mfl_market=k.watchlist;
  if(d.stories)d.stories.forEach(function(s){if(s.mfl_impact==null&&s.why)s.mfl_impact=s.why;});
  return d;}
function fromLegacy(B){
  if(!B||!B.days)throw new Error('data.js has no days');
  M.source='data.js';M.generated=B.generated;B.days.forEach(pubDay);index(B.days);M.series=buildSeries(B.days);}
function fromJson(j){
  M.source='data/latest.json';M.generated=j.generated;try{if(window.NBCU)NBCU.ingest(j);}catch(e){}
  M.ext={latest_circulars:Array.isArray(j.latest_circulars)?j.latest_circulars:null,deadlines:Array.isArray(j.deadlines)?j.deadlines:null,mfl_ncd:j.mfl_ncd&&typeof j.mfl_ncd==='object'?j.mfl_ncd:null};
  pubDay(j.today);
  var days=(j.days||[]).map(function(d){return d.id===j.today.id?j.today:pubDay(Object.assign({stub:true},d));});
  if(!days.some(function(d){return d.id===j.today.id;}))days.push(j.today);
  index(days);
  M.series={};var ser=j.series||{};Object.keys(ser).forEach(function(k){
    M.series[k]=Object.keys(ser[k]).sort().map(function(d){return {d:d,v:ser[k][d]};});});}
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
/* data/latest.json (small) is preferred, but only when it was built in the same publish run as data.js or later
   (its "generated" >= data.js's, read from data.js's first bytes). When there is no data.js at all, latest.json
   alone is used. So a missing or stale data/ folder can never show an old edition. ?src=json / ?src=legacy force one. */
function headGenerated(){
  return fetch('/data.js?probe='+Date.now(),{headers:{Range:'bytes=0-255'},cache:'no-store'}).then(function(r){
    if(!r.ok||!r.body)throw 0;var rd=r.body.getReader();
    return rd.read().then(function(c){rd.cancel().catch(function(){});return new TextDecoder().decode(c.value||new Uint8Array()).slice(0,400);});})
  .then(function(t){var g=t.match(/"generated":\s*"([^"]+)"/);return g?g[1]:null;});}
function legacy(){return loadScript('/data.js').then(function(){fromLegacy(window.BRIEFING);});}
function loadData(){
  var q=location.search;if(/[?&]src=legacy/.test(q))return legacy();
  var force=/[?&]src=json/.test(q);
  var js=fetch('/data/latest.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw 0;return r.json();})
    .then(function(j){M.seedHint=!!(j&&j.series_seed);return window.NBCU?NBCU.prep(j):j;});
  var gen=force?Promise.resolve(null):headGenerated().then(function(g){return {g:g};},function(){return {none:true};});
  return Promise.all([js,gen]).then(function(v){var j=v[0],g=v[1];
    if(!j||j.schema!=='nbfc-brief'||j.schema_version!==1||!j.today)throw 0;
    /* no data.js on the site: the JSON contract is the only source */
    if(!force&&!(g&&g.none)&&(!g||!g.g||j.generated<g.g))throw 0; /* stale or unverifiable: use data.js */
    M.hasLegacy=!(g&&g.none);fromJson(j);}).catch(function(){return legacy();});}
/* optional seed: /data/history.json = {key:{"YYYY-MM-DD":number|null}} adds earlier figures to the sparklines.
   It fills only dates that are not live editions (a live edition always wins, even its gap), is ignored if
   missing, slow (>2.5 s) or malformed, and never carries a value forward. See docs/DATA_FORMAT.md. */
var ISO_RE=/^\d{4}-\d{2}-\d{2}$/,SERIES_MAX=30;
/* fetched only when needed: latest.json carries "series_seed" when the exporter used a seed. On the JSON path the
   series is already merged, so only the data.js path fetches it (no blind request, so no 404 in the console). */
function loadSeed(){var q=location.search;
  if(/[?&]seed=0/.test(q)||!(/[?&]seed=1/.test(q)||(M.seedHint&&M.source==='data.js')))return Promise.resolve(null);
  var t=new Promise(function(r){setTimeout(function(){r(null);},2500);});
  var f=fetch('/data/history.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
  return Promise.race([f,t]);}
var OWN_DATES=/^(ibja999|ibja916|agloc_ltv85|agloc_ltv80|agloc_ltv75|agloc_ref)$/;
function mergeSeed(seed){
  if(!seed||typeof seed!=='object'||Array.isArray(seed)||!M.days.length)return;
  var live={},newest=M.days[0].id,dates={};M.days.forEach(function(d){live[d.id]=1;});
  Object.keys(M.series).forEach(function(k){M.series[k].forEach(function(p){dates[p.d]=1;});});
  var clean={};Object.keys(seed).forEach(function(k){var ser=seed[k];if(k.charAt(0)==='_'||!ser||typeof ser!=='object')return;clean[k]={};
    Object.keys(ser).forEach(function(d){if(!ISO_RE.test(d)||live[d]||d>=newest)return;var v=ser[d];
      clean[k][d]=typeof v==='number'&&isFinite(v)?v:null;if(!OWN_DATES.test(k))dates[d]=1;});});
  var axis=Object.keys(dates).sort().slice(-SERIES_MAX);
  var keys={};Object.keys(M.series).concat(Object.keys(clean)).forEach(function(k){keys[k]=1;});
  var out={};Object.keys(keys).forEach(function(k){var have={};
    /* gold keys sit on the figure's own date (an AGLOC period may start on a Saturday): merge by date, keep their own axis */
    if(OWN_DATES.test(k)){(M.series[k]||[]).forEach(function(p){have[p.d]=p.v;});Object.keys(clean[k]||{}).forEach(function(d){if(!Object.prototype.hasOwnProperty.call(have,d))have[d]=clean[k][d];});
      out[k]=Object.keys(have).sort().slice(-SERIES_MAX).map(function(d){return {d:d,v:have[d]};});return;}(M.series[k]||[]).forEach(function(p){have[p.d]=p.v;});
    out[k]=axis.map(function(d){var v=live[d]?(Object.prototype.hasOwnProperty.call(have,d)?have[d]:null)
      :(clean[k]&&Object.prototype.hasOwnProperty.call(clean[k],d)?clean[k][d]:(Object.prototype.hasOwnProperty.call(have,d)?have[d]:null));
      return {d:d,v:v==null?null:v};});});
  M.series=out;M.seeded=true;}
function getDay(id){var d=M.byId[id];if(!d)return Promise.resolve(null);if(!d.stub)return Promise.resolve(d);
  return fetch('/data/'+id+'.json').then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(full){
    pubDay(full);M.byId[id]=full;M.days[M.days.indexOf(d)]=full;return full;}).catch(function(){return d;});}

/* ---------------- helpers ---------------- */
function $(s,r){return (r||document).querySelector(s);}
function news(day){return rep(day,'01-daily-watch');}
function rules(day){return rep(day,'02-regulation');}
function rep(day,key){return (day.reports||[]).filter(function(r){return r.key===key;})[0];}
function ok(r){return r&&!r.missing&&r.content!==undefined;}
/* the IST calendar day; desks still missing on it are "not filed yet", on older days they "did not arrive" (?today= for tests) */
function todayIST(){var q=location.search.match(/[?&]today=(\d{4}-\d{2}-\d{2})/);return q?q[1]:new Date(Date.now()+19800000).toISOString().slice(0,10);}
function live(day){return day&&day.id===todayIST();}
function missState(day,r){var j=JOBS[r.key]||{when:r.when||''};
  if(!r.expected)return {t:'Not due today',s:'Not due today \u00b7 '+j.when,x:'This job only files on Mondays.',c:'nd'};
  if(live(day))return {t:'Not filed yet',s:'Not filed yet \u00b7 due '+j.when,x:'The '+j.when+' job has not filed yet today. This page updates when it does.',c:'wait'};
  return {t:'Did not arrive',s:'Did not arrive \u00b7 due '+j.when,x:'The '+j.when+' job did not leave a file.',c:'miss'};}
function filedN(day){return (day.reports||[]).filter(function(r){return !r.missing;}).length;}
function dueN(day){return (day.reports||[]).filter(function(r){return r.expected;}).length;}
function kn(day){return day.key_numbers||{items:[],core_total:11,core_found:0};}
function item(day,k){return kn(day).items.filter(function(i){return i.key===k;})[0];}
var MONS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DOWS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function dt(id){return new Date(id+'T00:00:00');}
function shortDay(id){var d=dt(id);return DOWS[d.getDay()]+' '+d.getDate()+' '+MONS[d.getMonth()];}
function dm(id){var d=dt(id);return d.getDate()+' '+MONS[d.getMonth()];}
function srcA(s){if(!s||!s.url)return '<span>source not linked in report</span>';
  return '<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.label||domain(s.url))+'<span class="sr"> (opens in new tab)</span></a>';}
function itemSrc(it){return it.sources&&it.sources.length?it.sources.map(srcA).join(', '):srcA(it.source);}
/* a source like "MarketScreener/Reuters" may break after its slash, so a narrow table is not pushed wider than its card (link text only, never the href) */
function srcBreak(h){return h.replace(/>([^<]*)</g,function(m,t){return '>'+t.replace(/\//g,'/<wbr>')+'<';});}
function itemWhen(it,dayId){var p=[it.asof?(it.asof===dayId?'today':dm(it.asof)):'as-of not stated'];if(it.basis)p.push(esc(it.basis));return p.join(' · ');}
function itemMeta(it,dayId){var p=[];p.push(it.asof?(it.asof===dayId?'today':dm(it.asof)):'as-of not stated');if(it.basis)p.push(esc(it.basis));p.push(it.sources&&it.sources.length?it.sources.map(srcA).join(', '):srcA(it.source));return p.join(' · ');}
function dirOf(it){if(it.dir==='up'||it.dir==='down')return it.dir==='up'?'up':'dn';
  if(GROUP[it.key]==='flows'){var n=num(it.value);return n==null?'':n<0?'dn':'up';}return '';}
function chg(it){var c=it.change;if(!c||/^[—–-]$/.test(String(c).trim()))return '<span class="chip flat">no change given</span>';
  /* a long change line ("−2,530 (−1.81%) vs 30 Oct PM") may wrap in its cell; short ones stay on one line */
  var d=dirOf(it);return '<span class="chip '+(d||'flat')+(String(c).length>20?' w':'')+'">'+esc(c)+'</span>';}
function mins(w){return Math.max(1,Math.round((w||0)/220));}
function wordsOf(r){return r.words||stripMd(r.content||'').split(/\s+/).filter(Boolean).length;}

/* sparkline: inline SVG, gaps where a day had no figure.
   2+ figures: line + end dot; fewer than 4 slots are right-aligned so a short history reads as short, not stretched.
   1 figure: a faint dashed baseline, a quiet dot and "new", so the column never looks broken. */
function sparkPts(k,uptoId){return (M.series[k]||[]).filter(function(p){return p.d<=uptoId;}).slice(-14);}
function spark(k,uptoId,w,h,dir){
  var pts=sparkPts(k,uptoId),pad=3;
  while(pts.length&&pts[0].v==null)pts.shift(); /* leading gaps: the trend starts at its first figure */
  var vals=pts.map(function(p){return p.v;}).filter(function(v){return v!=null;});
  var box='width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"';
  if(vals.length<2){var my=(h/2).toFixed(1),lbl=vals.length?'Trend builds as editions accumulate':'No figure yet; trend builds as editions accumulate';
    return '<span class="spk spk-new" role="img" aria-label="'+lbl+'"><svg '+box+' aria-hidden="true" focusable="false">'+
      '<line x1="'+pad+'" y1="'+my+'" x2="'+(w-pad-(vals.length?4:0))+'" y2="'+my+'" class="spk-base"/>'+
      (vals.length?'<circle cx="'+(w-pad-1.5)+'" cy="'+my+'" r="2.4" class="spk-dot"/>':'')+
      '</svg><span class="spk-l" aria-hidden="true">'+(vals.length?'new':'—')+'</span></span>';}
  var lo=Math.min.apply(0,vals),hi=Math.max.apply(0,vals),rg=hi-lo,n=pts.length,slots=Math.max(n,4);
  var X=function(i){return pad+(w-2*pad)*(slots-n+i)/(slots-1);},Y=function(v){return rg?pad+(h-2*pad)*(1-(v-lo)/rg):h/2;};
  var segs=[],cur=[];pts.forEach(function(p,i){if(p.v==null){if(cur.length)segs.push(cur);cur=[];}else cur.push([X(i),Y(p.v)]);});if(cur.length)segs.push(cur);
  if(dir!=='up'&&dir!=='dn'){var a=vals[0],b=vals[vals.length-1];dir=b>a?'up':b<a?'dn':'';}
  var col=dir==='dn'?'var(--down)':dir==='up'?'var(--up)':'var(--text-3)';
  var path=segs.map(function(s){return 'M'+s.map(function(q){return q[0].toFixed(1)+' '+q[1].toFixed(1);}).join('L');}).join('');
  var dots=segs.filter(function(s){return s.length===1;}).map(function(s){return '<circle cx="'+s[0][0].toFixed(1)+'" cy="'+s[0][1].toFixed(1)+'" r="1.3" fill="'+col+'" opacity=".7"/>';}).join('');
  var last=segs[segs.length-1],lp=last[last.length-1];
  var first=pts.filter(function(p){return p.v!=null;})[0];
  var label='Trend over '+vals.length+' editions from '+dm(first.d)+': low '+lo.toLocaleString('en-IN')+', high '+hi.toLocaleString('en-IN');
  return '<svg class="spk" '+box+' role="img" aria-label="'+esc(label)+'"><path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>'+dots+'<circle cx="'+lp[0].toFixed(1)+'" cy="'+lp[1].toFixed(1)+'" r="2.4" fill="'+col+'"/></svg>';}
/* column header: "14d" only when a full 14-edition window exists for some row, else "Trend" */
function trendHead(keys,uptoId){var n=0;keys.forEach(function(k){var p=sparkPts(k,uptoId);while(p.length&&p[0].v==null)p.shift();n=Math.max(n,p.length);});
  return n>=14?'<span class="sr">Trend, last </span>14d':'Trend';}

/* top stories: structured day.stories[] if the publisher sends them, else parsed from the URGENT block */
function stories(day){
  if(day.stories&&day.stories.length)return day.stories.map(function(s){return {h:s.title,rest:s.dek||'',why:s.mfl_impact||'',tag:s.tag||'',sentiment:s.sentiment||'',src:(s.sources||[]).map(function(x){return {l:x.label,u:x.url};})};});
  var r=news(day);if(!ok(r))return [];
  var m=r.content.match(/##\s+🔴[^\n]*\n([\s\S]*?)(?=\n##\s|$)/),scope=m?m[1]:'',out=[],re=/\*\*(\d+)\.\s*([^*]+?)\*\*\s*([\s\S]*?)(?=\n\*\*\d+\.|\n##\s|$)/g,x;
  while((x=re.exec(scope))&&out.length<5){
    var title=stripMd(x[2]),head=firstSentence(title),rest=title.slice(head.length).trim(),body=x[3];
    var bl=body.split('\n').map(function(l){return l.trim();}).filter(function(l){return l&&!/^(\||---)/.test(l);}).map(function(l){return l.replace(/^([-*]|>)\s*/,'');});
    var IMP=/why it matters|possible impact on/i,why=bl.filter(function(l){return IMP.test(l);})[0]||'';
    var fact=bl.filter(function(l){return !IMP.test(l);})[0]||'';
    var src=[],mr=/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,y;while((y=mr.exec(body))){if(!src.some(function(s){return s.u===y[2];}))src.push({l:y[1],u:y[2]});}
    out.push({h:head,rest:rest||clip(stripMd(noCites(fact)),220),why:clip(stripMd(noCites(why)).replace(/^>?\s*(why it matters|possible impact on)[^:]*:\s*/i,''),260),src:src.slice(0,2)});}
  return out;}
var SENT={positive:'up',negative:'dn',watch:'acc',neutral:'flat'};
var SENT_T='Sentiment is from Muthoot Fincorp\u2019s (MFL\u2019s) point of view';
function tags(s){var t='';if(s.sentiment)t+='<span class="chip '+(SENT[s.sentiment]||'flat')+'" title="'+SENT_T+'"><span class="sr">'+SENT_T+': </span>'+esc(s.sentiment)+' · MFL view</span>';if(s.tag)t+='<span class="chip flat">'+esc(s.tag)+'</span>';return t;}
function srcLine(src){if(!src||!src.length)return '';return '<p class="by">Source: '+src.map(function(s){return '<a href="'+esc(s.u)+'" target="_blank" rel="noopener noreferrer">'+esc(s.l)+'</a>';}).join(', ')+'</p>';}

function rulesSummary(day){
  var r=rules(day);if(!ok(r))return null;
  if(Array.isArray(day.rules))return {lead:'',rules:day.rules,items:[],note:day.rules_note||''};
  var c=r.content,sec=c.match(/##\s+[^\n]*New Regulatory Updates[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i),lead='',items=[];
  if(sec){var paras=sec[1].split(/\n\s*\n/).map(function(p){return p.trim();}).filter(function(p){return p&&!/^#|^\||^---/.test(p);});
    lead=paras[0]?clip(stripMd(noCites(paras[0])),280):'';
    (sec[1].match(/^###\s+.+$/gm)||[]).forEach(function(h){items.push(cleanHead(h.replace(/^###\s+/,'')));});}
  return {lead:lead,items:items.slice(0,4)};}

var RTAG={NEW_REG:'New',AMENDMENT:'Amendment',CONSULTATION:'Consultation',CLARIFICATION:'Clarification'};
function mflChip(v){if(v===true)return '<span class="chip up">Applies to MFL</span>';if(v==='unclear')return '<span class="chip flat" title="The report could not yet tell whether this applies to Muthoot Fincorp">MFL impact unclear</span>';if(v===false)return '<span class="chip flat">Not applicable to MFL</span>';return '';}
function ruleRow(x){
  var m=[];if(x.issuer)m.push(esc(x.issuer));if(x.ref)m.push('<span class="num">'+esc(x.ref)+'</span>');if(x.date)m.push('dated '+esc(dm(x.date)+' '+x.date.slice(0,4)));
  if(x.effective)m.push('effective '+esc(dm(x.effective)));
  return '<div class="rule"><div class="tagrow">'+(x.tag?'<span class="chip acc">'+esc(RTAG[x.tag]||x.tag)+'</span>':'')+mflChip(x.applies_to_mfl)+'</div>'+
    '<b>'+esc(x.title||'')+'</b><div class="m">'+m.join(' · ')+' · '+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">circular<span class="sr"> (opens in new tab)</span></a>':'source not linked')+'</div></div>';}

/* ---------------- theme + install ---------------- */
var ICON={sun:'<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>',
  moon:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7z"/></svg>',
  auto:'<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/></svg>',
  dl:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M6 9l4 4 4-4M4 16h12"/></svg>'};
function theme(){return document.documentElement.dataset.theme==='dark'?'dark':'light';}
function other(){return theme()==='dark'?'light':'dark';}
/* two states only: the toggle is a pressed/unpressed "Dark theme" switch */
function syncThemeBtn(){var b=document.getElementById('themeBtn');if(!b)return;var d=theme()==='dark';
  b.innerHTML=d?ICON.moon:ICON.sun;b.setAttribute('aria-pressed',d?'true':'false');b.setAttribute('aria-label','Dark theme');}
function setTheme(t,quiet){t=t==='dark'?'dark':'light';document.documentElement.dataset.theme=t;try{localStorage.setItem('nbfc-brief-theme',t);}catch(e){}
  document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.content=t==='dark'?'#0E0F12':'#F3F1EC';});
  syncThemeBtn();if(!quiet)toast(t==='dark'?'Dark theme':'Light theme');}
/* theme change: circular reveal from the toggle (todo-app ThemeReveal easing cubic-bezier(.2,0,0,1));
   without View Transitions a 250 ms colour crossfade; reduced motion: instant */
function themeReveal(btn,t){var de=document.documentElement;
  if(RM.matches){setTheme(t);return;}
  if(!document.startViewTransition){de.classList.add('tfade');setTheme(t);setTimeout(function(){de.classList.remove('tfade');},300);return;}
  var r=btn.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,R=Math.hypot(Math.max(cx,innerWidth-cx),Math.max(cy,innerHeight-cy));
  de.dataset.vt='theme';
  var vt=document.startViewTransition(function(){setTheme(t,true);});
  vt.ready.then(function(){de.animate({clipPath:['circle(0px at '+cx+'px '+cy+'px)','circle('+Math.ceil(R)+'px at '+cx+'px '+cy+'px)']},
    {duration:340,easing:'cubic-bezier(.2,0,0,1)',pseudoElement:'::view-transition-new(root)'});}).catch(function(){});
  vt.finished.finally(function(){delete de.dataset.vt;toast(t==='dark'?'Dark theme':'Light theme');var b=$('#themeBtn');if(b)b.focus({preventScroll:true});});}
var installEvt=null;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();installEvt=e;var b=$('#installBtn');if(b)b.hidden=false;});
window.addEventListener('appinstalled',function(){installEvt=null;var b=$('#installBtn');if(b)b.hidden=true;toast('Installed');});
var toastT;function toast(m){var t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on');},2000);}

/* ---------------- views ---------------- */
var S={day:null,view:'today',key:null};
/* hero header: optional eyebrow, big title, status line. On scroll the title
   fades under the floating top pill, which then shows the compact title (see "top pill" below). */
function builtIST(){var g=String(M.generated||'').match(/T(\d{2}:\d{2})/);return g?g[1]:'';}
function status(day){var p=[];if(live(day)&&builtIST())p.push('Updated '+builtIST()+' IST');p.push(filedN(day)+'/'+dueN(day)+' desks');return p.join(' \u00b7 ');}
function header(day,title,o){o=o||{};
  return '<div class="hd'+(o.tools?' tools':'')+'" data-st="h">'+(o.eyebrow?'<p class="greet">'+esc(o.eyebrow)+'</p>':'')+(o.tools||'')+'<h1>'+esc(title)+'</h1>'+(o.sub?'<p class="hsub">'+o.sub+'</p>':'')+'</div>';}
function pct(c){var m=String(c||'').match(/\(\s*([+\-\u2212\u2013]?\d[\d.,]*\s*%)\s*\)/);return m?m[1].replace(/\s+/g,''):String(c||'');}
function hasChg(it){return it.change&&!/^[\u2014\u2013-]$/.test(String(it.change).trim());}
var ARW={up:'\u25b2',dn:'\u25bc'};
/* key-numbers ticker: only figures printed in this day's report; a missing item is left out */
var TICK=['nifty','sensex','niftyfin','gold10g','goldspot','usdinr','brent','muthoot','manappuram','iifl','shriram','bajaj'];
function ticker(day){
  var its=TICK.map(function(k){var it=item(day,k);return it&&it.value?{k:k,it:it}:null;}).filter(Boolean);if(its.length<3)return '';
  function li(x,dup){var d=dirOf(x.it),c=hasChg(x.it)?pct(x.it.change):'\u2014';
    return '<li><a href="#/'+day.id+'/markets"'+(dup?' tabindex="-1"':'')+'><span class="tn">'+esc(SHORT[x.k])+'</span> <span class="tv num">'+esc(x.it.value)+'</span> <span class="tch num '+(d||'flat')+'">'+(ARW[d]?'<span aria-hidden="true">'+ARW[d]+'</span>':'')+esc(c)+'</span></a></li>';}
  var a=its.map(function(x){return li(x,false);}).join(''),b=its.map(function(x){return li(x,true);}).join('');
  return '<section class="tick" data-st aria-label="Key numbers from this edition\u2019s news report. Each opens Markets with its source."><div class="tk-vp"><div class="tk-track"><ul class="tk-list">'+a+'</ul><ul class="tk-list" aria-hidden="true">'+b+'</ul></div></div></section>';}
function glance(day,st){if(!st.length)return '';
  return '<section class="g card glance" data-st aria-labelledby="h-gl"><h2 id="h-gl" class="kick">'+(live(day)?'Today at a glance':'At a glance \u00b7 '+esc(shortDay(day.id)))+'</h2><ol>'+
    st.slice(0,3).map(function(s){return '<li><a href="#/'+day.id+'/read/01-daily-watch">'+esc(s.h)+'</a>'+(s.src&&s.src[0]?' <span class="gsrc">'+srcA({label:s.src[0].l,url:s.src[0].u})+'</span>':'')+'</li>';}).join('')+'</ol></section>';}
function pills(day,suffix){
  return '<nav class="pills" aria-label="Edition" data-st>'+M.days.slice(0,7).map(function(d){
    return '<a class="pill press" href="#/'+d.id+(suffix||'')+'"'+(d.id===day.id?' aria-current="true"':'')+'>'+(d.id===M.days[0].id?'Today · ':'')+shortDay(d.id)+'</a>';}).join('')+
    '<a class="pill press" href="#/archive">All editions</a></nav>';}

/* Today: two small pills beside the eyebrow. "Yesterday" opens the edition before the one shown (hidden when there is none);
   "Past editions" opens the archive. An older edition also gets "Latest" so the reader can get back. */
function dayBefore(id){var d=dt(id);d.setDate(d.getDate()-1);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function edNav(day){
  var ids=M.days.map(function(d){return d.id;}),i=ids.indexOf(day.id),prev=i>=0?M.days[i+1]:null,latest=i===0,o='';
  if(!latest&&M.days[0])o+='<a class="epill press" href="#/'+M.days[0].id+'" aria-label="Latest edition, '+esc(shortDay(M.days[0].id))+'">Latest</a>';
  if(prev){var yd=latest&&prev.id===dayBefore(day.id);
    o+='<a class="epill press" href="#/'+prev.id+'" aria-label="'+(yd?'Yesterday\u2019s edition, ':'Previous edition, ')+esc(shortDay(prev.id))+'">'+(yd?'Yesterday':'Previous')+'</a>';}
  o+='<a class="epill press" href="#/archive" aria-label="Past editions: calendar and archive">Past editions</a>';
  return '<nav class="ednav" aria-label="Editions">'+o+'</nav>';}
function marketsTable(day,keys,cap){
  var rows=keys.map(function(k){var it=item(day,k);if(!it)return '';var d=dirOf(it);
    return '<tr><td><span class="nm">'+esc(SHORT[k]||it.name)+'</span><span class="meta">'+itemWhen(it,day.id)+'</span><span class="meta s">'+srcBreak(itemSrc(it))+'</span></td>'+
      '<td><span class="vc"><span class="v num">'+esc(it.value)+'</span>'+chg(it)+'</span></td><td class="sp">'+spark(k,day.id,72,28,d)+'</td></tr>';}).join('');
  if(!rows)return '';
  return '<table class="tc num"><caption>'+cap+'</caption><thead><tr><th scope="col">Item</th><th scope="col">Value · chg</th><th scope="col" class="sp">'+trendHead(keys,day.id)+'</th></tr></thead><tbody>'+rows+'</tbody></table>';}
function missingLine(day,keys){var miss=keys.filter(function(k){return CORE.indexOf(k)>=0&&!item(day,k);});
  return miss.length?'<div class="missing"><b>Not in today\u2019s report:</b> '+miss.map(function(k){return esc(FULL[k]);}).join(', ')+'. Shown as missing, never an older number.</div>':'';}
function flowsBlock(day){
  var f=['fii','dii'].map(function(k){var it=item(day,k);
    if(!it)return '<div><small>'+esc(SHORT[k])+' (₹ cr)</small><b class="num" style="color:var(--text-3)">—</b><div class="meta">Not in today\u2019s report</div></div>';
    var d=dirOf(it);return '<div><small>'+esc(SHORT[k])+' (₹ cr)</small><b class="num '+d+'">'+esc(it.value)+'</b><div class="meta">'+itemWhen(it,day.id)+'</div><div class="meta">'+itemSrc(it)+'</div>'+spark(k,day.id,140,32,d)+'</div>';}).join('');
  return '<section aria-labelledby="h-flows"><div class="sec" data-st><h2 id="h-flows">Fund flows</h2><span class="aside">provisional, cash market</span></div><div class="g flush flows" data-st>'+f+'</div></section>';}
/* Muthoot Fincorp in the market: MFL's own public items (NCD issues, ratings, news, watch items).
   Never Muthoot Finance, which is a separate listed company and appears only among the peers. */
var MKIND={ncd:'NCD issue',rating:'Rating',news:'News',watch:'Watch'};
function mflMarket(day){var w=day.mfl_market||[];
  var head='<div class="sec" data-st><h2 id="h-wl">Muthoot Fincorp in the market</h2><span class="aside">MFL\u2019s own public items</span></div>';
  if(!w.length)return '<section aria-labelledby="h-wl">'+head+'<div class="g card" data-st><p class="note" style="margin:0">No Muthoot Fincorp items in this edition.</p></div></section>';
  return '<section aria-labelledby="h-wl">'+head+'<div class="g flush list wl" data-st>'+
    w.map(function(x){var asof=x.asof?(x.asof===day.id?'today':dm(x.asof)+' '+x.asof.slice(0,4)):x.asof_label?esc(x.asof_label):'';
      return '<div><div class="k">'+(x.kind&&MKIND[x.kind]?'<span class="chip flat">'+MKIND[x.kind]+'</span> ':'')+esc(x.name)+'</div><div class="val">'+inlineMd(x.value)+'</div><div class="meta">'+(asof?'as of '+asof:'as-of not stated')+'<br>'+(x.sources&&x.sources.length?x.sources.map(srcA).join(', '):srcA(x.source))+'</div></div>';}).join('')+'</div></section>';}
/* Regulatory calendar: dated public deadlines (reg_calendar[]); past dates drop off on the latest edition */
function daysTo(id){return Math.round((dt(id)-dt(todayIST()))/864e5);}
function regCalendar(day){var c=(day.reg_calendar||[]).filter(function(x){return x&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||'');});
  if(live(day))c=c.filter(function(x){return daysTo(x.date)>=0;});
  c=c.slice().sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});
  var head='<div class="sec" data-st><h2 id="h-cal">Regulatory calendar</h2><span class="aside">dated deadlines</span></div>';
  if(!c.length)return '<section aria-labelledby="h-cal">'+head+'<div class="g card" data-st><p class="note" style="margin:0">'+(day.reg_calendar?'No dated deadlines ahead in this edition.':'No regulatory calendar in this edition.')+'</p></div></section>';
  return '<section aria-labelledby="h-cal">'+head+'<div class="g flush list rcal" data-st>'+c.map(function(x){var n=live(day)?daysTo(x.date):null;
    var when=dm(x.date)+' '+x.date.slice(0,4)+(n===0?' \u00b7 today':n===1?' \u00b7 tomorrow':n>1?' \u00b7 in '+n+' days':'');
    return '<div><div class="k num">'+esc(when)+'</div><div class="val">'+esc(x.item||'')+'</div><div class="meta">'+(x.issuer?esc(x.issuer):'issuer not stated')+(x.applies_to?' \u00b7 applies to '+esc(x.applies_to):'')+'<br>'+(typeof x.source==='string'?srcA({url:x.source}):srcA(x.source))+'</div></div>';}).join('')+'</div></section>';}
function impact(t,cls,lab){return t?'<p class="'+(cls||'why')+'"><b>'+esc(lab||'Possible impact on Muthoot Fincorp')+':</b> '+esc(t)+'</p>':'';}

function viewToday(day){
  var st=stories(day),top=st[0],nr=news(day),rr=rules(day),k=kn(day);
  var srcCount=(day.reports||[]).reduce(function(a,r){return a+(r.sources||0);},0);
  var words=(day.reports||[]).filter(ok).reduce(function(a,r){return a+wordsOf(r);},0);
  var latest=day.id===M.days[0].id;
  var h=header(day,latest?'Today\u2019s Brief':shortDay(day.id),{hero:true,eyebrow:latest?'Latest edition':'Edition of '+day.weekday,
    sub:esc((live(day)?'':day.label+' \u00b7 ')+status(day)),tools:edNav(day)});
  var main='',side='';
  h+=ticker(day)+glance(day,st);
  var sc=storyCards(day);
  if(window.NBCU&&day.id===M.days[0].id){try{main+=NBCU.fxBanner()+NBCU.nudge(day);}catch(e){}}
  if(sc)main+=sc;
  else main+=live(day)&&nr&&nr.missing?'<div class="g card empty" data-st><h2>The news desk has not filed yet</h2><p>The 7:00 AM job has not filed for '+esc(day.label)+' yet. This page offers a refresh when it does.</p></div>':'<div class="g card empty" data-st><h2>The news desk did not arrive</h2><p>The 7:00 AM job left no file for '+esc(day.label)+'.</p></div>';
  main+=goldCard(day,false)+circBlock(day);
  /* markets carousel */
  var tiles=MARKET_ORDER.map(function(k2){var it=item(day,k2);if(!it)return '';var d=dirOf(it);
    return '<a class="tile g press" href="#/'+day.id+'/markets"><div class="n">'+esc(SHORT[k2])+'</div><div class="v num">'+esc(it.value)+'</div>'+chg(it)+spark(k2,day.id,124,34,d)+'<span class="src">'+(it.asof?dm(it.asof):'as-of n/s')+' · '+esc((it.source&&it.source.label)||'no source')+'</span></a>';}).join('');
  main+='<section aria-labelledby="h-mk"><div class="sec" data-st><h2 id="h-mk">Markets</h2><a class="aside" href="#/'+day.id+'/markets">All numbers &amp; sources →</a></div>'+
    (tiles?'<div class="tiles" data-st>'+tiles+'</div>':'<div class="g card" data-st><p>No market figures in today\u2019s report.</p></div>')+'</section>';
  /* peers */
  var pt=marketsTable(day,PEER_ORDER,'NSE close. Muthoot Finance is a separate listed company and a peer, not Muthoot Fincorp (MFL).');
  main+='<section aria-labelledby="h-peers"><div class="sec" data-st><h2 id="h-peers">Gold-loan &amp; NBFC peers</h2><span class="aside">listed peers</span></div><div class="g flush" data-st>'+(pt||'<p class="missing">No peer prices in today\u2019s report.</p>')+missingLine(day,PEER_ORDER)+'</div></section>';
  main+=flowsBlock(day);
  /* side column */
  side+=mflMarket(day);
  var rs=rulesSummary(day);
  side+='<section aria-labelledby="h-rules"><div class="sec" data-st><h2 id="h-rules">Rules desk</h2><span class="aside">RBI · SEBI · IBBI</span></div><div class="g card" data-st>'+
    (rs?((rs.lead?'<p style="color:var(--text-2);font-size:15px">'+esc(rs.lead)+'</p>':'')+(rs.rules?(rs.rules.length?'<div>'+rs.rules.map(ruleRow).join('')+'</div>':'<div class="rule none"><b>No new NBFC circulars today</b>'+(rs.note?'<div class="m">'+esc(rs.note)+'</div>':'')+'</div>')+(rs.rules.length&&rs.note?'<p class="note" style="margin-top:8px">'+esc(rs.note)+'</p>':''):'')+(rs.items.length?'<div style="display:grid;gap:8px;margin-top:12px">'+rs.items.map(function(x){return '<div class="rl">'+esc(x)+'</div>';}).join('')+'</div>':'')+
      '<a class="cta ghost press" href="#/'+day.id+'/read/02-regulation">Read the rules desk <span aria-hidden="true">→</span></a>')
      :'<p>'+(rr&&rr.expected?(live(day)?'The rules desk has not filed yet today (due '+JOBS['02-regulation'].when+' IST).':'The rules desk did not arrive for this day.'):'No rules report for this day.')+'</p>')+'</div></section>'+regCalendar(day);
  side+='<section aria-labelledby="h-desks"><div class="sec" data-st><h2 id="h-desks">Desks</h2><span class="aside">7:00 AM IST</span></div><div class="g flush list" data-st>'+
    (day.reports||[]).map(function(r){var j=JOBS[r.key]||{name:r.kind||r.key,when:r.when||''};var ms=r.missing?missState(day,r):null,cls=ms?ms.c:'';
      var sub=ms?ms.s:mins(wordsOf(r))+' min read · '+(r.sources||0)+' sources · '+j.when;
      return '<a class="desk press '+cls+'" href="#/'+day.id+'/read/'+r.key+'"><span class="dot" aria-hidden="true"></span><span class="bd"><b>'+esc(j.name)+'</b><span>'+esc(sub)+'</span></span><span class="chev" aria-hidden="true">›</span></a>';}).join('')+'</div></section>';
  return h+'<div class="cols"><div>'+main+'</div><div class="side">'+side+'</div></div>'+foot();}

function viewMarkets(day){
  var all=Object.keys(FULL),idx=['nifty','sensex','niftyfin'],mac=['usdinr','gold10g','goldspot','brent'];
  return header(day,'Markets')+pills(day,'/markets')+'<div class="cols"><div>'+
    '<section aria-labelledby="h-ix"><div class="sec" data-st><h2 id="h-ix">Indices</h2><span class="aside">from today\u2019s news report</span></div><div class="g flush" data-st>'+(marketsTable(day,idx,'Each figure links to the source the report used.')||'')+missingLine(day,idx)+'</div></section>'+
    '<section aria-labelledby="h-mc"><div class="sec" data-st><h2 id="h-mc">Currency &amp; commodities</h2></div><div class="g flush" data-st>'+(marketsTable(day,mac,'MCX gold is the morning print; spot gold and Brent as stated in the report.')||'')+missingLine(day,mac)+'</div></section>'+goldCard(day,true)+
    '<section aria-labelledby="h-pr"><div class="sec" data-st><h2 id="h-pr">Peers</h2></div><div class="g flush" data-st>'+(marketsTable(day,PEER_ORDER,'Muthoot Finance is a listed peer, not Muthoot Fincorp (MFL).')||'')+missingLine(day,PEER_ORDER)+'</div></section>'+
    '</div><div class="side">'+flowsBlock(day)+mflMarket(day)+
    '<p class="note" data-st style="margin-top:14px">Key numbers: '+(kn(day).core_found||0)+' of '+(kn(day).core_total||11)+' core items in this edition. Trends use only figures printed in each day\u2019s own report; a day without a figure is a gap.</p></div></div>'+foot();}

function viewRead(day,key){
  var r=rep(day,key)||(day.reports||[]).filter(ok)[0]||(day.reports||[])[0];if(!r)return header(day,'Read')+'<div class="g card empty"><h2>Nothing filed</h2></div>';
  key=r.key;
  var seg='<nav class="seg" aria-label="Desk" data-st>'+(day.reports||[]).map(function(x){var j=JOBS[x.key]||{tab:x.section};
    return '<a class="press'+(x.missing?' off':'')+'" href="#/'+day.id+'/read/'+x.key+'"'+(x.key===key?' aria-current="true"':'')+'>'+esc(j.tab)+(x.missing?'<span class="sr"> ('+missState(day,x).t.toLowerCase()+')</span>':'')+'</a>';}).join('')+'</nav>';
  var j=JOBS[key]||{name:r.kind,when:r.when};
  if(r.missing)return header(day,j.tab||'Read')+pills(day,'/read/'+key)+seg+'<div class="g card empty" data-st><h2>'+esc(missState(day,r).t)+'</h2><p>'+esc(missState(day,r).x)+'</p></div>'+foot();
  var toc=[],src=[],body=chunk(markdown(r.content,toc,src)),list=sourceList(src);
  var side='';
  if(key==='01-daily-watch'){
    var items=kn(day).items;
    side+='<section id="kn-card" aria-labelledby="h-kn"><div class="sec"><h2 id="h-kn">Key numbers</h2><span class="aside">'+(kn(day).core_found||0)+'/'+(kn(day).core_total||11)+' core</span></div><div class="g flush">'+
      (items.length?marketsTable(day,items.map(function(i){return i.key;}),'Only figures in this day\u2019s report.'):'<p class="missing">No Key numbers table in this report.</p>')+missingLine(day,CORE)+'</div></section>';}
  if(list.length)side+='<section id="src-card" aria-labelledby="h-src"><div class="sec"><h2 id="h-src">Sources</h2><span class="aside">'+list.length+'</span></div><div class="g srcs">'+
    list.map(function(s){return '<a href="'+esc(s.u)+'" target="_blank" rel="noopener noreferrer">'+esc(s.l)+'<small>'+esc(domain(s.u))+'</small></a>';}).join('')+'</div></section>';
  return header(day,j.tab||'Read')+pills(day,'/read/'+key)+seg+'<div class="cols"><article class="g art" data-st aria-labelledby="h-art"><div class="kick">'+esc(j.name)+' · '+esc(shortDay(day.id))+'</div><h1 id="h-art" style="margin-top:6px">'+esc(r.title)+'</h1>'+
    '<p class="by">NBFC Brief · '+esc(j.when)+' IST · '+mins(wordsOf(r))+' min read · '+(r.sources||0)+' sources</p>'+
    (toc.length?'<nav class="toc" aria-label="On this page">'+toc.map(function(t){return '<a href="#'+t.id+'" data-jump="'+t.id+'">'+esc(t.t)+'</a>';}).join('')+'</nav>':'')+
    '<div class="md">'+body+'</div></article><div class="side">'+side+'</div></div>'+foot();}

/* ---------------- archive: month calendar + magazine cover-flow ---------------- */
var ARCH={mo:null,i:null,y:0},MONL=['January','February','March','April','May','June','July','August','September','October','November','December'];
var AV={n:'News',r:'Rules',w:'Weekly'};
function avail(d){var a=[];(d.reports||[]).forEach(function(r){if(r.missing)return;var c={'01-daily-watch':'n','02-regulation':'r','03-weekly-analysis':'w'}[r.key];if(c)a.push(c);});return a;}
function availTxt(d){var a=avail(d);return a.length?a.map(function(x){return AV[x];}).join(', '):'no desk filed';}
function months(){var s={};M.days.forEach(function(d){s[d.id.slice(0,7)]=1;});return Object.keys(s).sort();} /* oldest first */
function moName(mo){return MONL[+mo.slice(5,7)-1]+' '+mo.slice(0,4);}
function p2(n){return (n<10?'0':'')+n;}
function calGrid(mo){
  var y=+mo.slice(0,4),m=+mo.slice(5,7)-1,n=new Date(y,m+1,0).getDate(),lead=(new Date(y,m,1).getDay()+6)%7,t=todayIST(),cells=[],focus=null;
  for(var i=0;i<lead;i++)cells.push('<td role="gridcell"></td>');
  for(var d=1;d<=n;d++){var id=mo+'-'+p2(d),ed=M.byId[id],lab=DOWS[new Date(y,m,d).getDay()]+' '+d+' '+MONL[m];
    if(ed){focus=id;var a=avail(ed),tp=ARCH.topic&&dayHasHub(ed,ARCH.topic);if(tp)a=a.concat(['t']);
      cells.push('<td role="gridcell"><a class="cd ed'+(id===t?' now':'')+'" href="#/'+id+'" data-cal-id="'+id+'" tabindex="-1"><span class="n">'+d+'</span><span class="dots" aria-hidden="true">'+a.map(function(x){return '<i class="d-'+x+'"></i>';}).join('')+'</span><span class="sr"> '+esc(lab)+': '+esc(availTxt(ed))+(tp?'; has '+HUB[ARCH.topic].n+' items':'')+'</span></a></td>');}
    else cells.push('<td role="gridcell"><span class="cd" tabindex="-1"><span class="n">'+d+'</span><span class="sr"> '+esc(lab)+': no edition</span></span></td>');}
  while(cells.length%7)cells.push('<td role="gridcell"></td>');
  var rows='';for(var r=0;r<cells.length;r+=7)rows+='<tr>'+cells.slice(r,r+7).join('')+'</tr>';
  var html='<thead><tr>'+['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(function(w){return '<th scope="col" abbr="'+w+'"><span aria-hidden="true">'+w[0]+'</span><span class="sr">'+w+'</span></th>';}).join('')+'</tr></thead><tbody>'+rows+'</tbody>';
  /* roving tabindex: the newest edition in the month takes the Tab stop */
  return focus?html.replace('data-cal-id="'+focus+'" tabindex="-1"','data-cal-id="'+focus+'" tabindex="0"'):html.replace('class="cd" tabindex="-1"','class="cd" tabindex="0"');}
function calHtml(mo){var ms=months(),i=ms.indexOf(mo);
  return '<section class="g cal" data-st aria-labelledby="calT"><div class="cal-h"><button type="button" class="ic sm gl press" data-cal="-1" aria-label="Previous month"'+(i<=0?' disabled':'')+'><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg></button>'+
    '<h2 id="calT" aria-live="polite">'+esc(moName(mo))+'</h2><button type="button" class="ic sm gl press" data-cal="1" aria-label="Next month"'+(i>=ms.length-1?' disabled':'')+'><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5"/></svg></button></div>'+
    topicPicker()+'<div class="cal-vp"><table class="cal-g" role="grid" aria-labelledby="calT" data-hub="'+(ARCH.topic||'')+'">'+calGrid(mo)+'</table></div>'+
    '<ul class="legend" aria-label="Dot colours"><li><i class="d-n"></i>News</li><li><i class="d-r"></i>Rules</li><li><i class="d-w"></i>Weekly</li><li class="lg-t" data-hub="'+(ARCH.topic||'')+'"'+(ARCH.topic?'':' hidden')+'><i class="d-t"></i><span>'+(ARCH.topic?esc(HUB[ARCH.topic].n):'')+'</span></li></ul></section>';}
/* ---------- magazine cover-flow: one continuous strip, oldest left, newest right ----------
   Native horizontal scroll (momentum + snap) drives everything; each frame the covers' transforms are
   computed from scrollLeft (transform only, GPU). Arrows, taps and month jumps run a spring on scrollLeft
   that keeps its velocity when retargeted, so rapid taps chain. */
var WDL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function cvLabel(d){var x=dt(d.id);return DOWS[x.getDay()]+' '+x.getDate()+' '+MONS[x.getMonth()]+' '+x.getFullYear()+': '+availTxt(d);}
function cvHead(d){if(!d||d.stub)return '';try{var st=stories(d);return st[0]?st[0].h:'';}catch(e){return '';}}
function coverHtml(d,i,n){var a=avail(d),wk=a.indexOf('w')>=0,x=dt(d.id);
  return '<li class="cv'+(wk?' wk':'')+(a.length?'':' none')+'"><a class="cvi" href="#/'+d.id+'" data-cv="'+i+'" tabindex="-1"><span class="sr">'+esc(cvLabel(d))+'</span></a></li>';}
/* virtualised: every edition keeps its li + link + label (a11y, keyboard, scroll extent); the visual
   face is only written for covers near the centre (cfPaint), far ones are display:none (no layers). */
function coverInner(d,i){var a=avail(d),x=dt(d.id);return '<div class="cv-m" aria-hidden="true"><b>NBFC Brief</b><span>No. '+(i+1)+'</span></div>'+
    '<div class="cv-ed" aria-hidden="true">Weekly edition</div>'+
    '<div class="cv-d" aria-hidden="true">'+x.getDate()+'</div><div class="cv-mo" aria-hidden="true">'+MONL[x.getMonth()]+' '+x.getFullYear()+'</div><div class="cv-wd" aria-hidden="true">'+WDL[x.getDay()]+'</div>'+
    '<div class="cv-h" aria-hidden="true">'+esc(cvHead(d))+'</div>'+
    '<div class="cv-b" aria-hidden="true">'+a.map(function(k){return '<i'+(k==='w'?' class="w"':'')+'>'+AV[k]+'</i>';}).join('')+'</div>';}
function asc(){return M.days.slice().reverse();}
function cfDims(vw){var cw=innerWidth>=900?220:innerWidth<=380?160:184,st=Math.round(cw*.56);return {cw:cw,h:Math.round(cw*1.5),step:st,pad:Math.round((vw-st)/2)};}
function coverflowHtml(){var L=asc(),n=L.length,k=cfDims(APP.clientWidth||innerWidth);
  return '<section class="lib" data-st aria-labelledby="h-lib"><div class="sec"><h2 id="h-lib">Library</h2><span class="aside">'+n+' editions</span></div>'+
    '<div class="cf" id="cfBox" style="--cf-w:'+k.cw+'px;--cf-h:'+k.h+'px;--cf-step:'+k.step+'px;--cf-pad:'+k.pad+'px"><div class="cf-vp" id="cf" role="group" aria-roledescription="carousel" aria-label="Editions, oldest to newest. Use the arrow keys to move.">'+
    '<ul class="cf-row">'+L.map(function(d,i){return coverHtml(d,i,n);}).join('')+'</ul></div>'+
    '<div class="cf-nav"><button type="button" class="ic press" data-cf="-1" aria-label="Older edition"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg></button>'+
    '<span class="cf-cap" id="cfCap" aria-live="polite"></span>'+
    '<button type="button" class="ic press" data-cf="1" aria-label="Newer edition"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5"/></svg></button></div></div></section>';}
var CF=null;
function cfLayout(){var c=CF;if(!c)return;var vw=c.vp.clientWidth||innerWidth;
  var k=cfDims(vw);c.cw=k.cw;c.h=k.h;c.step=k.step;c.pad=k.pad;
  var b=c.box.style;if(b.getPropertyValue('--cf-pad')===c.pad+'px'&&b.getPropertyValue('--cf-w')===c.cw+'px')return;b.setProperty('--cf-w',c.cw+'px');b.setProperty('--cf-h',c.h+'px');b.setProperty('--cf-step',c.step+'px');b.setProperty('--cf-pad',c.pad+'px');}
function cfPaint(){var c=CF;c.raf=0;if(!c||!c.vp.isConnected)return;
  var f=c.vp.scrollLeft/c.step,X1=.62*c.cw,XS=.17*c.cw;
  for(var i=0;i<c.n;i++){var el=c.els[i],d=i-f,a=Math.abs(d);
    if(a>5.6){if(!el._h){el.style.display='none';el._h=1;}continue;}
    if(el._h){el.style.display='';el._h=0;}
    if(!el._f){var dd=c.list[i];el.insertAdjacentHTML('beforeend',coverInner(M.byId[dd.id]||dd,i));el._f=1;}
    var sg=d<0?-1:1,m=Math.min(a,1),X=sg*(a<=1?a*X1:X1+(a-1)*XS);
    el.style.transform='translate3d('+(X-d*c.step).toFixed(1)+'px,0,0) perspective(800px) rotateY('+(-sg*m*65).toFixed(2)+'deg) scale('+(1-m*.1-Math.max(0,a-1)*.04).toFixed(4)+')';
    el.style.zIndex=String(200-Math.round(a*20));
    el.style.opacity=a>4.6?Math.max(0,1-(a-4.6)/.6).toFixed(3):'';}}
function cfSched(){if(CF&&!CF.raf)CF.raf=requestAnimationFrame(cfPaint);}
function cfIdx(){return CF?Math.max(0,Math.min(CF.n-1,Math.round(CF.vp.scrollLeft/CF.step))):0;}
function cfSettle(){var c=CF;if(!c||c.sp)return;var i=cfIdx(),d=c.list[i];c.i=i;
  c.els.forEach(function(el,j){el.tabIndex=j===i?0:-1;});
  var cap=document.getElementById('cfCap');if(cap)cap.textContent=shortDay(d.id)+' \u00b7 No. '+(i+1)+' of '+c.n;
  var bs=c.box.querySelectorAll('[data-cf]');bs[0].disabled=i<=0;bs[1].disabled=i>=c.n-1;
  var mo=d.id.slice(0,7);if(mo!==ARCH.mo)calShow(mo,mo>ARCH.mo?1:-1);
  /* headlines for covers near the centre: only from the day's own report; none -> left blank */
  for(var j=Math.max(0,i-4);j<=Math.min(c.n-1,i+4);j++)(function(j){var id=c.list[j].id,dd=M.byId[id];if(!dd||!dd.stub)return;
    getDay(id).then(function(full){var h=cvHead(full),el=c.els[j]&&c.els[j].querySelector('.cv-h');if(h&&el&&!el.textContent)el.textContent=h;});})(j);}
/* spring on scrollLeft: response ~0.35 s, damping ratio 0.9 (soft settle, no visible overshoot) */
function cfGo(i,focus){var c=CF;if(!c)return;i=Math.max(0,Math.min(c.n-1,i));c.ti=i;var tgt=i*c.step;
  if(focus)c.els.forEach(function(el,j){el.tabIndex=j===i?0:-1;if(j===i)el.focus({preventScroll:true});});
  if(RM.matches){c.vp.scrollLeft=tgt;cfPaint();cfSettle();return;}
  c.tgt=tgt;if(c.sp)return;
  c.sp=true;c.pos=c.vp.scrollLeft;c.vel=0;c.vp.style.scrollSnapType='none';var last=performance.now(),w=2*Math.PI/.35,K=w*w,D=2*.9*w;
  function tick(now){if(!c.sp)return;var dt=Math.min(.05,(now-last)/1000);last=now;
    for(var k=0;k<4;k++){var h=dt/4,acc=-K*(c.pos-c.tgt)-D*c.vel;c.vel+=acc*h;c.pos+=c.vel*h;}
    if(Math.abs(c.pos-c.tgt)<.5&&Math.abs(c.vel)<8){c.vp.scrollLeft=c.tgt;cfStop();return;}
    c.vp.scrollLeft=c.pos;cfPaint();requestAnimationFrame(tick);}
  requestAnimationFrame(tick);}
function cfStop(){var c=CF;if(!c||!c.sp)return;c.sp=false;c.ti=null;c.vp.style.scrollSnapType='';cfPaint();cfSettle();}
function cfStep(dl,focus){var c=CF;if(!c)return;cfGo((c.sp&&c.ti!=null?c.ti:cfIdx())+dl,focus);}
function initCoverflow(root){var vp=root.querySelector('#cf');if(!vp){CF=null;return;}
  var c=CF={vp:vp,box:root.querySelector('#cfBox'),list:asc(),els:[].slice.call(vp.querySelectorAll('.cvi')),raf:0,sp:false,i:0,ti:null};c.n=c.els.length;
  c.els.forEach(function(el){el.style.display='none';el._h=1;});
  cfLayout();
  var start=ARCH.i!=null?ARCH.i:c.n-1;vp.scrollLeft=start*c.step;cfPaint();cfSettle();
  var st=0;
  vp.addEventListener('scroll',function(){cfSched();if(c.sp)return;clearTimeout(st);st=setTimeout(cfSettle,140);},{passive:true});
  ['touchstart','wheel','pointerdown'].forEach(function(ev){vp.addEventListener(ev,function(e){if(ev==='pointerdown'&&e.pointerType!=='mouse')return;if(c.sp){c.sp=false;c.ti=null;c.vp.style.scrollSnapType='';}},{passive:true});});
  vp.addEventListener('keydown',function(e){var k=e.key;
    if(k==='ArrowLeft'||k==='ArrowRight'){e.preventDefault();cfStep(k==='ArrowLeft'?-1:1,true);}
    else if(k==='Home'||k==='End'){e.preventDefault();cfGo(k==='Home'?0:c.n-1,true);}});
  vp.addEventListener('click',function(e){var a=e.target.closest('.cvi');if(!a||e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();
    var i=+a.dataset.cv,ctr=c.sp&&c.ti!=null?c.ti:cfIdx();if(i!==ctr){cfGo(i);return;}openCover(a,i);});}
/* open: the cover's own rectangle grows into the page (clip-path on a page-coloured panel, transform/opacity on a
   copy of the cover), the day renders underneath, and the panel fades away. ~360 ms. */
var flying=null;
function openCover(a,i){ARCH.i=i;ARCH.y=scrollY;var id=CF.list[i].id;
  if(RM.matches||!a.animate||flying){location.hash='#/'+id;return;}
  var r=a.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
  var fly=document.createElement('div');fly.className='cvfly';fly.setAttribute('aria-hidden','true');fly.style.cssText='width:'+vw+'px;height:'+vh+'px';
  var cl=a.cloneNode(true);cl.removeAttribute('href');cl.removeAttribute('aria-label');cl.tabIndex=-1;
  cl.style.cssText='width:'+r.width+'px;height:'+r.height+'px;transform:translate('+r.left+'px,'+r.top+'px);z-index:1';
  var wrap=document.createElement('div');wrap.className=a.parentNode.className;wrap.appendChild(cl);fly.appendChild(wrap);document.body.appendChild(fly);
  var ins='inset('+r.top.toFixed(1)+'px '+(vw-r.right).toFixed(1)+'px '+(vh-r.bottom).toFixed(1)+'px '+r.left.toFixed(1)+'px round 6px)';
  var E='cubic-bezier(.2,0,0,1)',D=360;
  var an=fly.animate([{clipPath:ins},{clipPath:'inset(0px 0px 0px 0px round 0px)'}],{duration:D,easing:E,fill:'forwards'});
  var sc=Math.min(vw/r.width,vh/r.height)*.9,cx=(vw-r.width)/2,cy=(vh-r.height)/2;
  cl.animate([{transform:'translate('+r.left+'px,'+r.top+'px) scale(1)',opacity:1},{transform:'translate('+cx+'px,'+cy+'px) scale('+sc.toFixed(3)+')',opacity:0,offset:1}],{duration:D,easing:E,fill:'forwards'});
  flying={el:fly,id:id};
  an.finished.then(function(){location.hash='#/'+id;},function(){location.hash='#/'+id;});}
function landBook(){var f=flying;if(!f)return;flying=null;var el=f.el;
  var a=el.animate([{opacity:1},{opacity:0}],{duration:200,easing:'cubic-bezier(0,0,.2,1)',fill:'forwards'});a.finished.then(function(){el.remove();},function(){el.remove();});}
function viewArchive(){
  var ms=months();if(!ARCH.mo||ms.indexOf(ARCH.mo)<0)ARCH.mo=ms[ms.length-1];
  if(ARCH.i!=null){var L=asc();if(L[ARCH.i])ARCH.mo=L[ARCH.i].id.slice(0,7);}
  return header(M.days[0],'Archive',{sub:M.days.length+' editions since '+esc(dm(M.days[M.days.length-1].id))+' '+M.days[M.days.length-1].id.slice(0,4)})+calHtml(ARCH.mo)+coverflowHtml()+foot();}
/* month switch: the grid slides (transform/opacity); calGo also moves the cover-flow to that month's newest edition,
   while a swipe that settles in another month only updates the grid (calShow) */
function calShow(mo,delta){var ms=months(),i=ms.indexOf(mo);if(i<0)return;ARCH.mo=mo;
  var g=$('.cal-g'),t=$('#calT'),bs=document.querySelectorAll('[data-cal]');if(!g)return;
  t.textContent=moName(ARCH.mo);bs[0].disabled=i<=0;bs[1].disabled=i>=ms.length-1;
  function swap(){g.innerHTML=calGrid(ARCH.mo);if(!RM.matches&&g.animate)g.animate([{transform:'translateX('+(delta*24)+'px)',opacity:0},{transform:'none',opacity:1}],{duration:SPRINGS.Quick.ms,easing:SPRINGS.Quick.easing});}
  if(RM.matches||!g.animate)swap();else g.animate([{transform:'none',opacity:1},{transform:'translateX('+(-delta*24)+'px)',opacity:0}],{duration:110,easing:'cubic-bezier(.4,0,1,1)'}).finished.then(swap,swap);}
function calGo(delta){var ms=months(),i=ms.indexOf(ARCH.mo)+delta;if(i<0||i>=ms.length)return;var mo=ms[i];calShow(mo,delta);
  if(CF){var L=CF.list,j=-1;for(var k=L.length-1;k>=0;k--)if(L[k].id.slice(0,7)===mo){j=k;break;}if(j>=0)cfGo(j);}}
function calKey(e){var c=e.target.closest('.cd');if(!c||!c.closest('.cal-g'))return;
  var all=[].slice.call(document.querySelectorAll('.cal-g .cd')),i=all.indexOf(c),j=i;
  switch(e.key){case 'ArrowLeft':j=i-1;break;case 'ArrowRight':j=i+1;break;case 'ArrowUp':j=i-7;break;case 'ArrowDown':j=i+7;break;
    case 'Home':j=i-(i+((new Date(ARCH.mo+'-01T00:00:00').getDay()+6)%7))%7;break;case 'End':j=Math.min(all.length-1,i+6-(i+((new Date(ARCH.mo+'-01T00:00:00').getDay()+6)%7))%7);break;
    case 'PageUp':e.preventDefault();calGo(-1);return;case 'PageDown':e.preventDefault();calGo(1);return;default:return;}
  e.preventDefault();j=Math.max(0,Math.min(all.length-1,j));all.forEach(function(x){x.tabIndex=-1;});all[j].tabIndex=0;all[j].focus();}
function initArchive(root){
  if(root._cf){var c=CF=root._cf;cfLayout();c.vp.scrollLeft=(ARCH.i!=null?ARCH.i:c.n-1)*c.step;cfPaint();cfSettle();return;}
  initCoverflow(root);root._cf=CF;
  var cal=root.querySelector('.cal-vp'),x0=null,y0=0;
  cal.addEventListener('touchstart',function(e){var t=e.touches[0];x0=t.clientX;y0=t.clientY;},{passive:true});
  cal.addEventListener('touchend',function(e){if(x0==null)return;var t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;
    if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.4)calGo(dx<0?1:-1);},{passive:true});}
function foot(){var g=M.generated?new Date(M.generated):null;
  return '<footer class="foot"><p class="disc">Independent summary of public information; not an official view of Muthoot Fincorp Ltd.</p>'+
    'Every figure links to the source its report used; anything a report did not state is shown as missing. Muthoot Finance appears only as a listed peer, never as Muthoot Fincorp. \u201cPossible impact\u201d notes are neutral context, not investment or financial advice.'+
    (g&&!isNaN(g)?'<br>Data built '+g.toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+' IST':'')+' · source: '+esc(M.source||'')+(navigator.onLine===false?' · offline copy':'')+'</footer>';}

/* ---------------- gold card (optional day.gold; hidden when absent) ----------------
   IBJA benchmark (₹/g, AM or PM session), spot ($/oz and ₹/10 g) and AGLOC's maximum loan per gram at 85/80/75% LTV
   plus its reference price, for the period it applies. Day change = today vs the prev values the publisher sends,
   never a value carried over from another edition; "—" when either side is missing. History: series ibja999,
   ibja916, goldspot, agloc_ltv85/80/75, agloc_ref (AGLOC: one point per period, keyed by its start date, drawn as steps). */
var GSER={ibja999:['ibja','rate_999','prev_999'],ibja916:['ibja','rate_916','prev_916'],goldspot:['spot','usd_oz','prev_usd_oz'],
  agloc_ltv85:['agloc','ltv_85'],agloc_ltv80:['agloc','ltv_80'],agloc_ltv75:['agloc','ltv_75'],agloc_ref:['agloc','ref_price']};
function gN(v){return typeof v==='number'&&isFinite(v)?v:null;}
function gISO(s){return typeof s==='string'&&ISO_RE.test(s)?s:null;}
function gFmt(v,dp,u){v=gN(v);if(v==null)return '\u2014';return (u||'')+v.toLocaleString(u==='$'?'en-US':'en-IN',{minimumFractionDigits:dp,maximumFractionDigits:dp});}
function gChg(c,p,dp,u){c=gN(c);p=gN(p);if(c==null||p==null||!p)return '<span class="gch flat" title="No previous figure to compare">\u2014<span class="sr"> change not available</span></span>';
  var d=c-p,pc=Math.abs(d/p*100).toFixed(2),cls=d>0?'up':d<0?'dn':'flat',sg=d>0?'+':d<0?'\u2212':'',ab=gFmt(Math.abs(d),dp,u);
  return '<span class="gch '+cls+' num"><span aria-hidden="true">'+(d>0?'\u25b2 ':d<0?'\u25bc ':'')+sg+ab+' \u00b7 '+sg+pc+'%</span><span class="sr">'+(d>0?'up ':d<0?'down ':'unchanged ')+ab+', '+pc+' percent</span></span>';}
function gDay(id){var d=dt(id);return DOWS[d.getDay()]+' '+d.getDate()+' '+MONS[d.getMonth()];}
/* axis labels: whole numbers, unless the whole range is under 10 (then one decimal) */
function axN(v,rg){return v.toLocaleString('en-IN',{maximumFractionDigits:rg<10&&Math.abs(v)<1000?1:0});}
var AGP=null;
function gPeriod(f,t){f=gISO(f);t=gISO(t);if(!f)return '';if(!t&&AGP&&gISO(AGP[f]))t=AGP[f];return gDay(f)+(t&&t!==f?' \u2013 '+gDay(t):'');}
/* history: the published series when it has 2+ figures, else what the loaded editions' own gold blocks (and their prev values) give */
function gSeries(k,upto){var spec=GSER[k],s=(M.series[k]||[]).filter(function(p){return p.d<=upto&&gN(p.v)!=null;});
  if(s.length>=2||!spec)return s;var m={};
  M.days.forEach(function(d){var g=!d.stub&&d.gold,x=g&&g[spec[0]];if(!x||typeof x!=='object')return;var v=gN(x[spec[1]]),at;
    if(spec[0]==='agloc'){at=gISO(x.from);var pv=x.prev;if(pv&&gISO(pv.from)&&gN(pv[spec[1]])!=null&&pv.from<=upto&&!(pv.from in m))m[pv.from]=pv[spec[1]];}
    else if(spec[0]==='ibja'){at=gISO(x.date)||d.id;if(gISO(x.prev_date)&&gN(x[spec[2]])!=null&&x.prev_date<=upto&&!(x.prev_date in m))m[x.prev_date]=x[spec[2]];}
    else at=d.id;
    if(v!=null&&at&&at<=upto)m[at]=v;});
  var d2=Object.keys(m).sort().map(function(d){return {d:d,v:m[d]};});return d2.length>s.length?d2:s;}
/* one chart routine for the row sparkline and the expanded chart; x is calendar time, AGLOC draws as steps to the right edge */
function gChart(k,upto,w,h,big,range){var step=/^agloc/.test(k),pts=gSeries(k,upto);
  if(range&&pts.length){var cut=new Date(dt(upto)-range*864e5).toISOString().slice(0,10);pts=pts.filter(function(p){return p.d>=cut;});}
  if(pts.length<2)return big?'<p class="gx-none">Not enough history yet; the chart fills in as editions accumulate.</p>':'<span class="spk spk-new" role="img" aria-label="Trend builds as editions accumulate"><svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true" focusable="false"><line x1="3" y1="'+h/2+'" x2="'+(w-7)+'" y2="'+h/2+'" class="spk-base"/>'+(pts.length?'<circle cx="'+(w-4.5)+'" cy="'+h/2+'" r="2.4" class="spk-dot"/>':'')+'</svg><span class="spk-l" aria-hidden="true">'+(pts.length?'new':'\u2014')+'</span></span>';
  var padL=big?4:3,padR=big?50:3,padT=big?10:3,padB=big?20:3,t0=+dt(pts[0].d),last=pts[pts.length-1].d,t1=+dt(step&&upto>last?upto:last);if(t1===t0)t1=t0+864e5;
  var vals=pts.map(function(p){return p.v;}),lo=Math.min.apply(0,vals),hi=Math.max.apply(0,vals),rg=hi-lo||Math.abs(hi)*.01||1;
  var X=function(d){return padL+(w-padL-padR)*(+dt(d)-t0)/(t1-t0);},Y=function(v){return padT+(h-padT-padB)*(1-(v-lo)/rg);};
  var path='M'+X(pts[0].d).toFixed(1)+' '+Y(pts[0].v).toFixed(1);
  pts.slice(1).forEach(function(p){path+=step?'H'+X(p.d).toFixed(1)+'V'+Y(p.v).toFixed(1):'L'+X(p.d).toFixed(1)+' '+Y(p.v).toFixed(1);});
  if(step)path+='H'+(w-padR).toFixed(1);
  var a=vals[0],b=vals[vals.length-1],dir=b>a?'up':b<a?'dn':'',col=dir==='dn'?'var(--down)':dir==='up'?'var(--up)':'var(--text-3)',lx=step?w-padR:X(last),ly=Y(b);
  var lbl=(step?'Step chart, one value per AGLOC period, ':'Trend, ')+pts.length+' points from '+dm(pts[0].d)+' to '+dm(last)+': low '+lo.toLocaleString('en-IN')+', high '+hi.toLocaleString('en-IN')+', latest '+b.toLocaleString('en-IN');
  var svg='<svg class="spk'+(big?' gx-svg':'')+'" width="'+(big?'100%':w)+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="'+esc(lbl)+'">';
  if(big){svg+='<line x1="'+padL+'" x2="'+(w-padR)+'" y1="'+Y(hi).toFixed(1)+'" y2="'+Y(hi).toFixed(1)+'" class="gx-grid"/><line x1="'+padL+'" x2="'+(w-padR)+'" y1="'+Y(lo).toFixed(1)+'" y2="'+Y(lo).toFixed(1)+'" class="gx-grid"/>';}
  svg+='<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="'+(big?2:1.7)+'" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="'+(big?3:2.4)+'" fill="'+col+'"/></svg>';
  if(!big)return svg;
  return '<div class="gx-plot">'+svg+'<span class="gx-y gx-hi num" style="top:'+(Y(hi)/h*100).toFixed(1)+'%">'+axN(hi,rg)+'</span><span class="gx-y gx-lo num" style="top:'+(Y(lo)/h*100).toFixed(1)+'%">'+axN(lo,rg)+'</span>'+
    '<span class="gx-x num" style="left:0">'+dm(pts[0].d)+'</span><span class="gx-x num" style="right:'+padR+'px">'+dm(last)+'</span></div>';}
var GRANGE={};
function gChartBlock(k,upto){var all=gSeries(k,upto),span=all.length>1?(dt(all[all.length-1].d)-dt(all[0].d))/864e5:0,r=GRANGE[k]||0;
  var tog=all.length>=8&&span>30?'<div class="gx-r" role="group" aria-label="Chart range">'+[[30,'1M'],[90,'3M'],[0,'All']].filter(function(x){return !x[0]||span>x[0];}).map(function(x){
    return '<button type="button" class="press" data-gk="'+k+'" data-grange="'+x[0]+'" aria-pressed="'+(r===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>':'';
  return tog+'<div class="gx-c">'+gChart(k,upto,320,128,true,r||0)+'</div>';}
function goldRows(day,full){var g=day.gold,I=g.ibja||{},S=g.spot||{},A=g.agloc||{},P=A.prev&&typeof A.prev==='object'?A.prev:{};
  function srcL(u,l){return u&&/^https?:/.test(u)?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(l)+'</a>':'<span>source not linked</span>';}
  var ses=I.session==='AM'||I.session==='PM'?I.session+' session':'session not stated';
  var groups=[
    {h:'IBJA benchmark \u00b7 \u20b9 per g',m:[ses,gISO(I.date)?gDay(I.date):'',srcL(I.source,'IBJA')],rows:[['ibja999','24K (999)',I.rate_999,I.prev_999,0,'\u20b9'],['ibja916','22K (916)',I.rate_916,I.prev_916,0,'\u20b9']]},
    {h:'Spot gold',m:[S.as_of_display?esc(S.as_of_display):S.as_of?esc(S.as_of):'as-of not stated',srcL(S.source,'spot'),S.inr_source?srcL(S.inr_source,'\u20b9 rate'):''],rows:[['goldspot','$ per oz',S.usd_oz,S.prev_usd_oz,2,'$'],[null,'\u20b9 per 10 g',S.inr_10g,null,0,'\u20b9']]},
    {h:'AGLOC max loan \u00b7 \u20b9 per g',m:[gPeriod(A.from,A.to)||'period not stated',srcL(A.source||'https://www.agloc.org/','AGLOC')],rows:[['agloc_ltv85','At 85% LTV',A.ltv_85,P.ltv_85,0,'\u20b9'],['agloc_ltv80','At 80% LTV',A.ltv_80,P.ltv_80,0,'\u20b9'],['agloc_ltv75','At 75% LTV',A.ltv_75,P.ltv_75,0,'\u20b9'],['agloc_ref','Reference price',A.ref_price,P.ref_price,0,'\u20b9']]}];
  return groups.map(function(G,gi){
    var rows=G.rows.map(function(r){var k=r[0],cur=r[2],sp=k?gChart(k,day.id,72,26,false):'',id='gx-'+k+'-'+day.id;
      var cell=!k?'':full&&gSeries(k,day.id).length>=2?'<button type="button" class="gsp press" data-gx="'+id+'" aria-expanded="false" aria-controls="'+id+'" aria-label="Show '+esc(r[1])+' chart">'+sp+'</button>':sp;
      return '<tr><td><span class="nm">'+esc(r[1])+'</span></td><td><span class="vc"><span class="v num">'+gFmt(cur,r[4],r[5])+'</span>'+(k?gChg(cur,r[3],r[4],r[5]):'<span class="gch flat">\u2014<span class="sr"> no change given</span></span>')+'</span></td><td class="sp">'+cell+'</td></tr>'+
        (full&&k?'<tr class="gx" id="'+id+'" hidden><td colspan="3"><div class="gx-in" data-gk="'+k+'" data-gd="'+day.id+'"></div></td></tr>':'');}).join('');
    return '<tbody><tr class="gh"><th scope="rowgroup" colspan="3"><span class="gh-t">'+G.h+'</span><span class="meta">'+G.m.filter(Boolean).join(' \u00b7 ')+'</span></th></tr>'+rows+'</tbody>';}).join('');}
function goldCard(day,full){var g=day&&day.gold;if(!g||typeof g!=='object'||!(g.ibja||g.spot||g.agloc))return '';
  var id=full?'h-gold':'h-gold-t';
  return '<section aria-labelledby="'+id+'" class="gold"><div class="sec" data-st><h2 id="'+id+'">Gold</h2>'+(full?'<span class="aside">IBJA \u00b7 spot \u00b7 AGLOC</span>':'<a class="aside" href="#/'+day.id+'/markets?sec=h-gold">Charts &amp; history \u2192</a>')+'</div>'+
    '<div class="g flush" data-st><table class="tc num gt"><caption>'+(full?'Day change compares each figure with the previous one its source gave. Tap a trend to open its chart. AGLOC rates hold for the whole period shown.':'IBJA benchmark, spot and AGLOC maximum loan per gram. Change is against the previous figure each source gave.')+'</caption>'+
    '<thead class="sr"><tr><th scope="col">Item</th><th scope="col">Value and change</th><th scope="col">Trend</th></tr></thead>'+goldRows(day,full)+'</table></div></section>';}
function goldToggle(b){var row=document.getElementById(b.dataset.gx);if(!row)return;var open=b.getAttribute('aria-expanded')!=='true';
  b.setAttribute('aria-expanded',String(open));row.hidden=!open;
  if(open){var box=row.querySelector('.gx-in');box.innerHTML=gChartBlock(box.dataset.gk,box.dataset.gd);
    if(!RM.matches&&box.animate)box.animate([{opacity:0,transform:'translateY(-6px)'},{opacity:1,transform:'none'}],{duration:SPRINGS.Snappy.ms,easing:SPRINGS.Snappy.easing});}}
function goldRange(b){var k=b.dataset.gk,box=b.closest('.gx-in');GRANGE[k]=+b.dataset.grange;box.innerHTML=gChartBlock(k,box.dataset.gd);var nb=box.querySelector('[data-grange="'+b.dataset.grange+'"]');if(nb)nb.focus();}

/* ---------------- search (optional; search.js loads only when Search is opened) ---------------- */
var SXP=null;
function loadSearch(){if(window.NBSearch)return Promise.resolve();if(!SXP)SXP=loadScript('/search.js').catch(function(e){SXP=null;throw e;});return SXP;}
function searchView(){if(window.NBSearch)return NBSearch.html(PQ);
  return '<div class="hd" data-st="h"><p class="greet">Search</p><h1>Search editions</h1></div><div class="g card empty" data-st><h2>Search is not available offline yet</h2><p>Open Search once while online and it will work offline after that.</p></div>';}
window.__NB={ns:'nbfc-brief',get M(){return M;},esc:esc,stripMd:stripMd,noCites:noCites,clip:clip,firstSentence:firstSentence,cleanHead:cleanHead,deEmoji:deEmoji,slug:slug,
  pub:pubText,pubHead:pubHead,dt:dt,shortDay:shortDay,SPRINGS:SPRINGS,STAGGER:ENTRANCE.StaggerMs,RM:RM,
  mflItems:function(day){return day.mfl_market||[];},mflLabel:'Muthoot Fincorp in the market',ownDays:function(){return M.days.map(function(d){return d.id;});},legacyOK:false,searchQs:'',lastBuild:null};
var SITE_PRIV=false,SITE_NS='nbfc-brief';
function impLine(t,lab){return impact(t,'why sm',lab);}
/* ---------------- topics: hubs, Today story cards, latest circulars ----------------
   Shared by both editions; hubs.js builds the Topics pages on top of these. A card's hub comes from the
   publisher's card.category when present, else from its tags (story_tags), else from its section heading. */
var HUBS=[
  {s:'regulation',n:'Regulation',d:'RBI, SEBI and IBBI circulars, drafts and deadlines',ic:'M3 8.2 10 4l7 4.2M4.5 8.5v6.5M8.2 8.5v6.5M11.8 8.5v6.5M15.5 8.5v6.5M3 16.5h14'},
  {s:'muthoot-fincorp',n:'Muthoot Fincorp',d:'NCD issues, ratings and news on Muthoot Fincorp',ic:'M10 2.8 4 5.2v4.4c0 3.6 2.5 6.4 6 7.6 3.5-1.2 6-4 6-7.6V5.2z'},
  {s:'peers',n:'Peers',d:'Listed gold-loan and NBFC peers',ic:'M7.2 9.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM2.6 16.2c.6-2.7 2.3-4.1 4.6-4.1s4 1.4 4.6 4.1M13.4 9.1a2.3 2.3 0 1 0 0-4.6M14.2 12.2c1.7.3 2.8 1.6 3.3 4'},
  {s:'gold',n:'Gold',d:'IBJA, spot and AGLOC rates, and gold-loan news',ic:'M2.8 15.5h14.4l-2.6-5.6H5.4zM6.6 9.9l1.6-4.4h3.6l1.6 4.4'},
  {s:'markets',n:'Markets',d:'Indices, rates, flows and macro',ic:'M3 16.5h14M4 13l3.6-3.8 3 2.8L16 6.2M12.6 6.2H16v3.4'},
  {s:'results',n:'Results',d:'Quarterly results and performance',ic:'M4.5 16.5V11M8.5 16.5V7M12.5 16.5v-6M16.5 16.5V4.5'},
  {s:'ratings',n:'Ratings',d:'Credit rating actions',ic:'M10 3.2l2 4.2 4.6.6-3.3 3.2.8 4.6L10 13.6l-4.1 2.2.8-4.6L3.4 8l4.6-.6z'},
  {s:'deals',n:'Deals',d:'Funding, NCDs, IPOs and M&A',ic:'M4 7.2h11.5l-3-3M16 12.8H4.5l3 3'},
  {s:'asset-quality',n:'Asset quality',d:'NPAs, stress and collections',ic:'M10 3.4 2.6 16.4h14.8zM10 8.4v3.8M10 14.3v.1'}];
var HUB={};HUBS.forEach(function(h){HUB[h.s]=h;});
var MFLCO={'muthoot-fincorp':1,'muthoot-microfin':1};
var HQ={regulation:{rg:1,tp:['circular','policy','enforcement']},gold:{tp:['gold-loan','gold-price']},markets:{tp:['markets','rates','macro']},
  results:{tp:['results']},ratings:{tp:['rating']},deals:{tp:['funding','m-and-a','ipo','ncd']},'asset-quality':{tp:['asset-quality']}};
var SECCAT=[[/results?\b|earnings|financial performance/i,'results'],[/rating/i,'ratings'],[/deals|m&a|merger|fund.?raising|capital raising/i,'deals'],
  [/npa|asset quality|stress/i,'asset-quality'],[/gold/i,'gold'],[/rbi|regulat|circular|sebi|ibbi|deadline|policy|compliance/i,'regulation'],[/market|stock|macro|flows|week in numbers/i,'markets']];
function tg0(t){t=t||{};return {companies:t.companies||[],regulators:t.regulators||[],topics:t.topics||[]};}
/* does an item (or a whole day, by its tags) belong to a hub? */
function hubHas(slug,t,k,s,cat){if(cat&&cat===slug)return true;t=tg0(t);
  if(slug==='muthoot-fincorp')return k==='MFL'||t.companies.some(function(c){return MFLCO[c];});
  if(slug==='peers')return t.companies.some(function(c){return !MFLCO[c];});
  if(slug==='regulation'&&(k==='Circular'||k==='Calendar'||/^Rules\b/.test(s||'')))return true;
  if(slug==='gold'&&k==='Gold')return true;
  var q=HQ[slug];if(!q)return false;
  /* a regulator tag alone marks a whole day (Archive dots), not an item: most stories name RBI somewhere */
  if(q.rg&&!k&&t.regulators.some(function(r){return r!=='govt';}))return true;
  return q.tp.some(function(x){return t.topics.indexOf(x)>=0;});}
/* one hub per item, for its chip */
function catOf(t,k,s,c){if(c&&HUB[c])return c;var sec=String(s||'').split(' \u00b7 ').pop();
  if(k==='Circular'||k==='Calendar'||/^Rules\b/.test(String(s||'')))return 'regulation';if(k==='Gold')return 'gold';if(k==='MFL')return 'muthoot-fincorp';
  t=tg0(t);if(t.companies.some(function(c){return MFLCO[c];}))return 'muthoot-fincorp';
  for(var i=0;i<SECCAT.length;i++)if(SECCAT[i][0].test(sec)&&HUB[SECCAT[i][1]])return SECCAT[i][1];
  var o=['results','ratings','deals','asset-quality','gold','regulation','peers','markets'];
  for(var j=0;j<o.length;j++)if(hubHas(o[j],t,k,s))return o[j];return null;}
function hubIcon(slug,sz){var h=HUB[slug];return h?'<svg class="hic" width="'+(sz||18)+'" height="'+(sz||18)+'" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="'+h.ic+'"/></svg>':'';}
function hubChip(slug){var h=HUB[slug];if(!h)return '';return '<a class="hchip press" href="#/topic/'+slug+'" data-hub="'+slug+'">'+hubIcon(slug,13)+'<span>'+esc(h.n)+'</span></a>';}
var RKEY={news:'01-daily-watch',rules:'02-regulation',weekly:'03-weekly-analysis'};
function readHref(id,report,title,sec){var rk=RKEY[report]||report||'01-daily-watch';
  return '#/'+id+'/read/'+rk+'?hl='+encodeURIComponent(flatT(title).slice(0,40))+(sec?'&sec='+encodeURIComponent(slug(sec)):'');}
/* the edition's story cards: day.cards[] from the publisher, else the URGENT stories parsed from the news desk */
function dayCards(day){var C=Array.isArray(day.cards)?day.cards.filter(function(c){return c&&c.title&&(c.report==='news'||c.report==='01-daily-watch');}):[];
  if(C.length){var ids={},also={};C.forEach(function(c){if(typeof c.id==='string')ids[c.id]=1;});
    /* dup_of: a second card on the same thread in this edition folds under its primary ("Also in: <section>") */
    C=C.filter(function(c){var p=typeof c.dup_of==='string'&&c.dup_of!==c.id&&ids[c.dup_of]?c.dup_of:null;if(!p)return true;
      var sec=String(c.section||'').split(' \u00b7 ').pop()||c.title;(also[p]=also[p]||[]).push(noCites(stripMd(sec)));return false;});
    var st=C.filter(function(c){return c.kind==='story';}),rest=C.filter(function(c){return c.kind!=='story';});
    return st.concat(rest).slice(0,Math.max(4,Math.min(6,st.length||6))).map(function(c){var src=c.source&&c.source.url?{l:c.source.name||'source',u:c.source.url}:null;
      return {t:noCites(stripMd(c.title)),sum:c.summary||'',imp:c.impact||'',src:src?[src]:[],cat:catOf(c.tags,c.kind==='story'?'Story':'News',c.section,c.category),tags:tg0(c.tags),href:readHref(day.id,'news',c.title,c.section),raw:c,day:day.id,also:also[c.id]||[]};});}
  var T=(Array.isArray(day.story_tags)?day.story_tags:[]).filter(function(e){return e&&e.kind==='story';});
  return stories(day).slice(0,6).map(function(s,i){var f=flatT(s.h).slice(0,30),e=null;
    T.forEach(function(x){var g=flatT(x.title).slice(0,30);if(!e&&g.length>=5&&(f.indexOf(g)===0||g.indexOf(f)===0))e=x;});if(!e)e=T[i]||null;
    return {t:s.h,sum:s.rest,imp:s.why,src:s.src||[],cat:catOf(e&&e.tags,'Story',e?e.section:'',null),tags:tg0(e&&e.tags),href:readHref(day.id,'news',s.h)};});}
/* content upgrade (cu.js): sources line "Source: BSE +2", lifecycle/deadline chips, "Update N · since" / "Status" badge,
   impact_label. Each bit is empty when its field is absent, so the card is unchanged. */
function cuBits(c){if(!c.raw||!window.NBCU)return null;try{return NBCU.cardBits(c.raw,c.day);}catch(e){return null;}}
function storyCard(c,i){var h=HUB[c.cat],src=(c.src||[]).filter(function(x){return x&&x.u;}),X=cuBits(c);
  var srcHtml=X&&X.srcLine?X.srcLine:(src.length?'Source: '+src.slice(0,2).map(function(x){return '<a href="'+esc(x.u)+'" target="_blank" rel="noopener noreferrer">'+esc(x.l)+'</a>';}).join(', '):'Source in the full report');
  var more='<a class="more press" href="'+esc(c.href)+'">Read full report<span class="sr">: '+esc(clip(c.t,60))+'</span> <span aria-hidden="true">\u2192</span></a>';
  return '<article class="scard g" data-st'+(c.cat?' data-hub="'+c.cat+'"':'')+'>'+
    '<div class="tagrow">'+(c.cat?hubChip(c.cat):'<span class="hchip none"><span>News</span></span>')+(i===0?'<span class="kick">Top story</span>':X&&X.k.upd?'<span class="kick">Update</span>':'')+(X?X.chips:'')+'</div>'+
    '<h3>'+esc(c.t)+'</h3>'+(c.sum?'<p class="sum">'+esc(noCites(stripMd(c.sum)))+'</p>':'')+(c.imp?impLine(clip(noCites(stripMd(c.imp)),220),X&&X.label):'')+(X?X.deep:'')+
    (c.also&&c.also.length?'<p class="also">Also in: '+esc(c.also.join(', '))+'</p>':'')+
    (X&&X.badge?'<p class="by srcl">'+srcHtml+'</p>'+X.srcList+'<div class="sc-f">'+X.badge+more+'</div>':
      (X?X.srcList:'')+'<div class="sc-f"><span class="by'+(X&&X.srcLine?' srcl':'')+'">'+srcHtml+'</span>'+more+'</div>')+'</article>';}
function storyCards(day){var cs=dayCards(day);if(!cs.length)return '';
  return '<section aria-labelledby="h-stories" class="stories"><div class="sec" data-st><h2 id="h-stories">'+(day.id===M.days[0].id&&live(day)?'Today\u2019s stories':'The day\u2019s stories')+'</h2><a class="aside" href="#/'+day.id+'/read/01-daily-watch">News desk \u2192</a></div>'+
    '<div class="scards">'+cs.map(storyCard).join('')+'</div></section>';}
/* latest circulars: latest.json latest_circulars[] when published, else built from the search index by hubs.js */
var RSTAT={'new':'New',draft:'Draft','in-force':'In force',deadline:'Deadline'};
/* drop a leading copy of the ref number ("IBBI/CIRP/109/2026 (30 Oct): ...") since the ref is shown below */
function ciTitle(t,ref){if(!ref)return t;var i=t.indexOf(ref);if(i<0||i>14)return t;var u=t.slice(i+ref.length).replace(/^\s*(\([^)]{0,20}\))?\s*[:,\u2013\u2014-]\s*/,'');return u.length>12?u.charAt(0).toUpperCase()+u.slice(1):t;}
function circItem(x){var r=x.reg||{},st=r.status&&RSTAT[r.status],cb=null;try{cb=window.NBCU?NBCU.circBits(x,null):null;}catch(e){}var u=r.url||(x.source&&x.source.url)||'',href=x.href||(x.date?readHref(x.date,x.report||'rules',x.title,x.section):u);
  return '<li><a class="circ g press" href="'+esc(href)+'"'+(/^https?:/.test(href)?' target="_blank" rel="noopener noreferrer"':'')+'>'+
    '<span class="ci-t"><span class="rgb">'+esc(String(r.regulator||'Reg').toUpperCase())+'</span>'+(cb&&cb.lc?'':st?'<span class="st st-'+esc(r.status)+'">'+st+'</span>':'')+(cb?cb.chips:'')+(x.date?'<span class="ci-d num">'+esc(dm(x.date))+'</span>':'')+'</span>'+
    '<span class="ci-h">'+esc(ciTitle(noCites(stripMd(x.title)),r.ref_no))+'</span>'+(r.ref_no?'<span class="ci-r num">'+esc(r.ref_no)+'</span>':'')+(cb&&cb.badge?'<span class="ci-b">'+cb.badge+'</span>':'')+'</a></li>';}
function circStrip(list,note){
  return '<div class="sec" data-st><h2 id="h-circ">Latest circulars</h2><a class="aside" href="#/topic/regulation">Regulation \u2192</a></div>'+
    (list&&list.length?'<ul class="circs" data-st role="list">'+list.slice(0,10).map(circItem).join('')+'</ul>':'<div class="g card" data-st><p class="note" style="margin:0">'+esc(note||'No RBI, SEBI or IBBI circulars logged in the last 10 days.')+'</p></div>');}
function circBlock(day){if(day.id!==M.days[0].id)return '';var L=M.ext&&M.ext.latest_circulars;
  return '<section aria-labelledby="h-circ" id="lcirc"'+(Array.isArray(L)?'':' data-lazy="1" hidden')+'>'+(Array.isArray(L)?circStrip(L):'')+'</section>';}
function fillCircLater(){loadAgp();var el=document.getElementById('lcirc');if(!el||!el.dataset.lazy)return;
  var ric=window.requestIdleCallback||function(f){return setTimeout(f,1200);};
  ric(function(){loadHubs().then(function(){return NBHubs.circulars();}).then(function(list){var e2=document.getElementById('lcirc');if(!e2||!e2.dataset.lazy)return;
    delete e2.dataset.lazy;e2.innerHTML=circStrip(list);e2.hidden=false;if(!RM.matches&&e2.animate)e2.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:SPRINGS.Rise.ms,easing:SPRINGS.Rise.easing});}).catch(function(){});},{timeout:2500});}
/* hubs.js (Topics, hub and peer pages) loads on demand, after search.js (it reads the search index) */
var HBP=null;
function loadHubs(){if(window.NBHubs)return Promise.resolve();if(!HBP)HBP=loadSearch().then(function(){return loadScript('/hubs.js');}).catch(function(e){HBP=null;throw e;});return HBP;}
var HUBV={topics:1,topic:1,peer:1};
function tabOf(v){return HUBV[v]?'topics':v==='search'?'':v;}
function hubsView(day){if(window.NBHubs)return NBHubs.html(S.view,S.key,PQ,day);
  return '<div class="hd" data-st="h"><p class="greet">Topics</p><h1>Topics</h1></div><div class="g card empty" data-st><h2>Topics are not available offline yet</h2><p>Open Topics once while online and they will work offline after that.</p></div>';}
/* Archive: topic dots on the calendar, from the day-level tags in latest.json days[] */
function dayHasHub(d,slug){if(!d||!slug)return false;if(window.NBHubs&&NBHubs.dayHas){var r=NBHubs.dayHas(d.id,slug);if(r!=null)return r;}
  return !!d.tags&&hubHas(slug,d.tags,'','',null);}
function topicPicker(){var cur=ARCH.topic||'';
  return '<div class="tpick" data-st role="group" aria-label="Show topic dots on the calendar"><span class="tp-l" aria-hidden="true">Topic dots</span><div class="tp-s">'+
    ['<button type="button" class="pill press" data-atopic="" aria-pressed="'+(!cur)+'">None</button>'].concat(HUBS.map(function(h){
      return '<button type="button" class="pill press" data-atopic="'+h.s+'" data-hub="'+h.s+'" aria-pressed="'+(cur===h.s)+'"><i aria-hidden="true"></i>'+esc(h.n)+'</button>';})).join('')+'</div></div>';}
function setTopic(slug){ARCH.topic=slug||'';try{sessionStorage.setItem(SITE_NS+'-atopic',ARCH.topic);}catch(e){}
  document.querySelectorAll('[data-atopic]').forEach(function(b){b.setAttribute('aria-pressed',String((b.dataset.atopic||'')===ARCH.topic));});
  var g=$('.cal-g'),lg=$('.legend .lg-t');if(g){g.innerHTML=calGrid(ARCH.mo);g.dataset.hub=ARCH.topic;}
  if(lg){lg.hidden=!ARCH.topic;lg.dataset.hub=ARCH.topic;var s=lg.querySelector('span');if(s)s.textContent=ARCH.topic?HUB[ARCH.topic].n:'';}
  /* sharpen the dots with the item-level index once it is ready (day tags are the instant answer) */
  if(ARCH.topic&&!(window.NBSearch&&NBSearch.ix()))loadHubs().then(function(){return NBSearch.ensure();}).then(function(){var g2=$('.cal-g');if(g2&&ARCH.topic)g2.innerHTML=calGrid(ARCH.mo);}).catch(function(){});}
/* AGLOC period end from history.json when an edition gives only the start */
function loadAgp(){if(AGP)return;var hit=null;
  M.days.slice(0,3).forEach(function(d){var A=d&&!d.stub&&d.gold&&d.gold.agloc;if(!hit&&A&&A.from&&!A.to)hit=d;});if(!hit)return;AGP={};
  fetch('/data/history.json').then(function(r){return r.ok?r.json():null;}).then(function(h){var P=h&&h._agloc_periods;if(!P||typeof P!=='object'||Array.isArray(P))return;AGP=P;
    /* swap just the gold card(s) in place, so nothing else re-renders or jumps */
    document.querySelectorAll('section.gold').forEach(function(sec){var hd=sec.querySelector('h2'),full=hd&&hd.id==='h-gold',day=M.byId[S.day]||M.days[0];if(!day||day.stub)return;
      var t=document.createElement('div');t.innerHTML=goldCard(day,full);var n=t.firstElementChild;if(n)sec.replaceWith(n);});}).catch(function(){});}
try{ARCH.topic=sessionStorage.getItem(SITE_NS+'-atopic')||'';if(ARCH.topic&&!HUB[ARCH.topic])ARCH.topic='';}catch(e){}
Object.assign(window.__NB,{priv:SITE_PRIV,HUBS:HUBS,HUB:HUB,hubHas:hubHas,catOf:catOf,hubIcon:hubIcon,hubChip:hubChip,readHref:readHref,circStrip:circStrip,circItem:circItem,RSTAT:RSTAT,impLine:impLine,impLabel:'Possible impact on Muthoot Fincorp',goldCard:goldCard,gChart:gChart,gChartBlock:gChartBlock,gSeries:gSeries,item:item,dirOf:dirOf,chg:chg,hasChg:hasChg,pct:pct,FULL:FULL,SHORT:SHORT,PEER_ORDER:PEER_ORDER,MARKET_ORDER:MARKET_ORDER,dm:dm,live:live,getDay:getDay,stories:stories,srcA:srcA,inlineMd:inlineMd,foot:foot,avail:avail,todayIST:todayIST,flatT:flatT,mflBlock:mflMarket,regCalendar:regCalendar,loadScript:loadScript,tg0:tg0,cascade:function(r){cascade(r,false);}});
/* deep link from a search result: #/<id>/read/<key>?hl=<letters and digits of the item>&sec=<heading id>.
   Finds the smallest block whose text contains hl, scrolls it to about a third of the screen and flashes it. */
function flatT(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');}
function hitLater(root,qs){var tries=0;(function go(){if(!root.isConnected)return;if(hit(root,qs)||++tries>12)return;setTimeout(go,120);})();}
function hit(root,qs){var q={};qs.split('&').forEach(function(x){var i=x.indexOf('=');if(i>0)q[x.slice(0,i)]=decodeURIComponent(x.slice(i+1).replace(/\+/g,' '));});
  var hl=flatT(q.hl).slice(0,40),el=null,BLK='p,li,tr,h2,h3,h4,blockquote,dd,dt,a.story,article,.rule,.rl,.tile';
  if(hl.length>=4){var c=root.querySelectorAll(BLK);for(var i=0;i<c.length;i++){var e=c[i];if(flatT(e.textContent).indexOf(hl)<0)continue;
      var inner=e.querySelector(BLK),best=e;while(inner){var f=null;[].some.call(best.querySelectorAll(BLK),function(n){if(flatT(n.textContent).indexOf(hl)>=0){f=n;return true;}});if(!f||f===best)break;best=f;inner=f.querySelector(BLK);}
      el=best;break;}}
  if(!el&&q.sec){el=document.getElementById(q.sec);if(el&&!root.contains(el))el=null;}
  if(!el)return !!(hl.length<4&&!q.sec);
  var y=el.getBoundingClientRect().top+scrollY-innerHeight*.3;window.scrollTo({top:Math.max(0,y),behavior:RM.matches?'auto':'smooth'});
  el.classList.remove('hit');void el.offsetWidth;el.classList.add('hit');setTimeout(function(){el.classList.remove('hit');},2600);return true;}

/* ---------------- router ---------------- */
var PQ='';/* the ?query part of the hash: search terms, or hl/sec for a deep link into an edition */
function parse(){
  var hq=location.hash.replace(/^#\/?/,'').split('?'),h=decodeURIComponent(hq[0]),p=h.split('/').filter(Boolean),id=M.days[0]&&M.days[0].id;PQ=hq.slice(1).join('?');
  if(p[0]==='search')return {view:'search',day:S.day||id};
  if(p[0]==='archive')return {view:'archive',day:id};
  if(p[0]==='topics')return {view:'topics',day:id};
  if((p[0]==='topic'||p[0]==='peer')&&p[1])return {view:p[0],day:id,key:p[1]};
  if(p[0]==='latest')p[0]=id;
  if(p[0]&&/^\d{4}-\d{2}-\d{2}$/.test(p[0])){var d=M.byId[p[0]]?p[0]:id;
    if(p[1]==='markets')return {view:'markets',day:d};
    if(p[1]==='read')return {view:'read',day:d,key:p[2]};
    if(p[1]&&JOBS[p[1]])return {view:'read',day:d,key:p[1]}; /* old site links: #YYYY-MM-DD/01-daily-watch */
    return {view:'today',day:d};}
  if(p[0]==='read')return {view:'read',day:S.day||id};
  if(p[0]==='markets')return {view:'markets',day:S.day||id};
  return {view:'today',day:S.day||id};}
var first=true,TABS=['today','read','topics','markets','archive'],KEYS=['01-daily-watch','02-regulation','03-weekly-analysis'];
/* direction: +1 = forward (new view enters from the right). Tabs by bar order, editions newer->older, Read desks by order. */
function dirFor(pv,pd,pk,v,d,k){
  if(pv!==v){var a=TABS.indexOf(tabOf(v)),b=TABS.indexOf(tabOf(pv));if(a===b)return HUBV[v]&&v!=='topics'?1:-1;return a>b?1:-1;}
  if(pd!==d)return d<pd?1:-1;
  if(v==='read'&&pk!==k)return KEYS.indexOf(k)>KEYS.indexOf(pk)?1:-1;
  return 0;}
/* sliding indicator pill: FLIP with transform only, springs (Snappy) between items */
function placeInd(box,act,from){if(!box)return null;var ind=box.querySelector(':scope>.ind');
  if(!ind){ind=document.createElement('span');ind.className='ind';ind.setAttribute('aria-hidden','true');box.insertBefore(ind,box.firstChild);}
  if(!act){ind.style.opacity='0';return null;}
  var x=act.offsetLeft,y=act.offsetTop,w=act.offsetWidth,h=act.offsetHeight;
  ind.style.opacity='1';ind.style.width=w+'px';ind.style.height=h+'px';ind.style.transform='translate('+x+'px,'+y+'px)';
  if(from&&(from.x!==x||from.w!==w)&&!RM.matches&&ind.animate)
    ind.animate([{transform:'translate('+from.x+'px,'+from.y+'px) scaleX('+(from.w/w)+')'},{transform:'translate('+x+'px,'+y+'px)'}],{duration:SPRINGS.Snappy.ms,easing:SPRINGS.Snappy.easing});
  return {x:x,y:y,w:w};}
var tabInd=null,segInd=null;
/* bottom-nav blob: underdamped spring (k 300, c 18, m 1) on translateX, rAF + transform only.
   It stretches along its travel (scaleX up to 1.25, scaleY down to .85) from the live velocity, overshoots,
   wobbles and settles in ~0.5 s; a press squashes it slightly. Reduced motion: it jumps. */
var TS={x:0,v:0,t:0,y:0,p:1,pv:0,pt:1,raf:0,last:0,on:false,ind:null};
function syncTabInd(anim){var tb=document.getElementById('tabbar'),act=tb.querySelector('a[aria-current=page]'),ind=tb.querySelector(':scope>.ind');
  if(!ind){ind=document.createElement('span');ind.className='ind';ind.setAttribute('aria-hidden','true');tb.appendChild(ind);}
  TS.ind=ind;if(!act){ind.style.opacity='0';return;}
  var w=act.offsetWidth,h=act.offsetHeight;
  if(ind._w!==w||ind._h!==h){ind._w=w;ind._h=h;ind.style.width=w+'px';ind.style.height=h+'px';lgSet(ind,'lg-ind',LGO.ind);}
  ind.style.opacity='1';TS.t=act.offsetLeft;TS.y=act.offsetTop;
  if(!anim||!TS.on||RM.matches){TS.x=TS.t;TS.v=0;TS.on=true;tsPaint();return;}
  tsKick();}
function tsKick(){if(!TS.raf){TS.last=performance.now();TS.raf=requestAnimationFrame(tsStep);}}
function tsStep(now){var dt=Math.min(.034,Math.max(0,(now-TS.last)/1000)),n=4,h=dt/n;TS.last=now;
  for(var i=0;i<n;i++){TS.v+=(-300*(TS.x-TS.t)-18*TS.v)*h;TS.x+=TS.v*h;TS.pv+=(-700*(TS.p-TS.pt)-26*TS.pv)*h;TS.p+=TS.pv*h;}
  var done=Math.abs(TS.x-TS.t)<.25&&Math.abs(TS.v)<4&&Math.abs(TS.p-TS.pt)<.002&&Math.abs(TS.pv)<.05;
  if(done){TS.x=TS.t;TS.v=0;TS.p=TS.pt;TS.pv=0;}
  tsPaint();TS.raf=done?0:requestAnimationFrame(tsStep);}
function tsPaint(){var ind=TS.ind;if(!ind)return;var s=Math.min(.25,Math.abs(TS.v)/1800),q=1-TS.p,sx=(1+s)*(1+q*.6),sy=(1-s*.6)*(1-q),
    w=ind._w||ind.offsetWidth,tb=ind.parentNode,lo=Math.min(TS.y,TS.t),hi=Math.max(tb.clientWidth-TS.y,TS.t+w),c=TS.x+w/2,half=w*sx/2,over=Math.max(0,lo-(c-half),(c+half)-hi);
  /* the overshoot never leaves the capsule: past the wall it squashes against it instead */
  if(over>0){sx=Math.max(.88,sx-2*over/w);sy=Math.min(1.05,sy+over/w*.6);half=w*sx/2;c=Math.min(Math.max(c,lo+half),hi-half);}
  ind.style.transform='translate3d('+(c-w/2).toFixed(2)+'px,'+TS.y+'px,0) scale('+sx.toFixed(4)+','+sy.toFixed(4)+')';}
(function(){var tb=document.getElementById('tabbar');if(!tb)return;
  function press(on){if(RM.matches)return;TS.pt=on?.9:1;tsKick();}
  tb.addEventListener('pointerdown',function(e){if(e.target.closest('a'))press(true);});
  ['pointerup','pointercancel','pointerleave'].forEach(function(t){tb.addEventListener(t,function(){if(TS.pt!==1)press(false);});});})();
function syncSegInd(from){var seg=$('.seg');segInd=seg?placeInd(seg,seg.querySelector('a[aria-current=true]'),from):null;}
function reInd(){syncTabInd(false);syncSegInd(null);fit();}
/* scrollable tables get a fade edge only when they actually overflow */
/* near=true: only tables on screen now (cheap during a swap); the rest are checked once the entrance has settled */
var fitT;function fit(near){var vh=innerHeight*1.5;document.querySelectorAll('.twrap.tscroll').forEach(function(w){
  if(near===true&&w.getBoundingClientRect().top>vh)return;var o=w.scrollWidth>w.clientWidth+2;w.classList.toggle('ov',o);
  if(o){w.tabIndex=0;w.setAttribute('role','region');w.setAttribute('aria-label','Table, scrolls sideways');}
  else if(w.hasAttribute('tabindex')){w.removeAttribute('tabindex');w.removeAttribute('role');w.removeAttribute('aria-label');}});
  if(near===true){clearTimeout(fitT);fitT=setTimeout(fit,450);}}
window.addEventListener('resize',reInd);
/* warm the neighbouring editions so a date switch never waits on the network */
function prefetch(id){var i=M.days.findIndex(function(d){return d.id===id;});
  [i-1,i+1].forEach(function(j){var d=M.days[j];if(d&&d.stub)getDay(d.id);});}
/* first Read render pays a one-off style/glyph warm-up (~50 ms on desktop). Pay it while idle after launch,
   off-screen, so the first tap on Read is a short task. */
function warm(day){var ric=window.requestIdleCallback||function(f){return setTimeout(f,1200);};
  ric(function(){if(!day||S.view==='read')return;var k=document.createElement('div');
    k.className='wrap';k.setAttribute('aria-hidden','true');k.inert=true;
    k.style.cssText='position:absolute;left:-9999px;top:0;width:'+APP.clientWidth+'px;visibility:hidden;contain:layout paint';
    k.innerHTML=viewRead(day,'01-daily-watch');document.body.appendChild(k);void k.offsetHeight;k.remove();},{timeout:3000});}
var seq=0;
/* views live in a .vw wrapper (display:contents, so layout/CSS are unchanged). A switch never blanks the page:
   the new view is built and laid out first, hidden below the old one (.vw.stg, visibility:hidden, so all parse,
   style, layout and cover-flow measuring happens before anything moves); only then does the old view fade
   (~100 ms, compositor-only) and the new one take its place and rise in. The tab blob and the pill title
   update on tap, before any of that. Archive is the heaviest view: its node is kept after the first build
   (and prebuilt while idle), so returning to it re-attaches a laid-out tree instead of rebuilding it. */
var CUR=null,STG=null,ARCHC=null;
function mkView(html){var t=document.createElement('template');t.innerHTML=html;var v=document.createElement('div');v.className='vw';v.appendChild(t.content);return v;}
function archWant(){var ms=months(),mo=ARCH.mo;if(!mo||ms.indexOf(mo)<0)mo=ms[ms.length-1];if(ARCH.i!=null){var L=asc();if(L[ARCH.i])mo=L[ARCH.i].id.slice(0,7);}return mo;}
function archKey(){return M.days.length+'|'+M.days[0].id+'|'+(ARCH.topic||'');}
function archView(){var c=ARCHC;ARCHC=null;
  if(c&&c.key===archKey()&&c.mo===archWant()){ARCH.mo=c.mo;return c.el;}
  var v=mkView(viewArchive());v._arch=1;return v;}
function unanim(v){v.querySelectorAll('[data-st]').forEach(function(x){x.getAnimations().forEach(function(y){y.cancel();});});}
/* getAnimations() is empty once detached, so cancel the fade-out first, then detach */
function park(v){if(!v)return;if(v._arch&&v.isConnected)unanim(v);if(v.parentNode)v.remove();
  if(v._arch)ARCHC={el:v,mo:ARCH.mo,key:archKey()};}
function dropStage(){var g=STG;STG=null;if(g)park(g);}
function prebuildArchive(){var ric=window.requestIdleCallback||function(f){return setTimeout(f,1500);};
  ric(function(){if(ARCHC||S.view==='archive'||!M||!M.days||!M.days.length)return;var v=mkView(viewArchive());v._arch=1;ARCHC={el:v,mo:ARCH.mo,key:archKey()};},{timeout:4000});}
/* optimistic chrome: tab highlight + pill title follow the tap immediately */
function navNow(view){if(!view)return;var tv=tabOf(view);document.querySelectorAll('#tabbar a').forEach(function(a){if(a.dataset.tab===tv)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  syncTabInd(true);var cbT=document.getElementById('cbT'),tpE=document.getElementById('tpE');
  if(view!=='today'&&cbT)cbT.textContent=TTL[view]||'NBFC Brief';if(view==='archive'){if(tpE)tpE.textContent='Archive';var cbS=document.getElementById('cbS');if(cbS)cbS.textContent=M.days.length+' editions \u00b7 latest '+shortDay(M.days[0].id);}}
function route(){
  var r=parse(),pv=S.view,pd=S.day,pk=S.key,my=++seq;
  if(pv==='archive'&&r.view!=='archive'&&!flying){if(CF)ARCH.i=CF.i;ARCH.y=scrollY;}
  if(!first&&r.view!==pv)navNow(r.view);
  /* old content stays on screen until the new view is built */
  return (HUBV[r.view]?loadHubs().then(function(){return getDay(r.day);},function(){return getDay(r.day);}):r.view==='search'?loadSearch().then(function(){return getDay(r.day);},function(){return getDay(r.day);}):getDay(r.day)).then(function(day){
    if(my!==seq)return;
    if(!day&&!(M.days&&M.days.length))return; /* offline with no saved edition: keep the 'Could not load' panel */
    S.view=r.view;S.day=r.day;S.key=r.key;
    var changed=!first&&(pv!==S.view||pd!==S.day||pk!==S.key),dir=changed?dirFor(pv,pd,pk,S.view,S.day,S.key):0;
    var segFrom=pv==='read'&&S.view==='read'?segInd:null;
    dropStage();
    var oh=APP.offsetHeight;
    var nv=S.view==='archive'?archView():mkView(HUBV[S.view]?hubsView(day):S.view==='search'?searchView():S.view==='markets'?viewMarkets(day):S.view==='read'?viewRead(day,S.key):viewToday(day));
    if(nv===CUR)nv=mkView(viewArchive()),nv._arch=1;
    function post(){
      APP.setAttribute('aria-busy','false');
      document.title=(S.view==='today'?'Today\u2019s Brief':HUBV[S.view]&&window.NBHubs?NBHubs.title(S.view,S.key):S.view[0].toUpperCase()+S.view.slice(1))+' · '+shortDay(day.id)+' · NBFC Brief';
      document.querySelectorAll('#tabbar a').forEach(function(a){var t=a.dataset.tab;
        a.href=t==='archive'?'#/archive':t==='topics'?'#/topics':t==='today'?'#/'+day.id:'#/'+day.id+'/'+t;
        if(t===tabOf(S.view))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
      if(changed&&(pv!==S.view||pd!==S.day)){window.scrollTo(0,S.view==='archive'?ARCH.y||0:0);var hd=$('h1');if(hd){hd.setAttribute('tabindex','-1');hd.focus({preventScroll:true});}}
      chromeBar(day);
      syncTabInd(!first);syncSegInd(segFrom);fit(true);
      var pc=$('.pill[aria-current=true]'),pl=pc&&pc.parentNode;
      if(pl&&pl.scrollTo)pl.scrollTo({left:Math.max(0,pc.offsetLeft-(pl.clientWidth-pc.offsetWidth)/2),behavior:first||RM.matches?'auto':'smooth'});
      if(S.view==='search'&&window.NBSearch)NBSearch.mount(nv,PQ,true);
      if(HUBV[S.view]&&window.NBHubs)NBHubs.mount(nv,S.view,S.key,PQ);
      if(S.view==='today')fillCircLater();
      cascade(nv,first);
      if(S.view!=='search'&&/(?:^|&)(?:hl|sec)=/.test(PQ))hitLater(nv,PQ);}
    function commit(){var old=CUR;CUR=nv;STG=null;
      if(old&&old!==nv){if(old.parentNode)park(old);}
      [].slice.call(APP.childNodes).forEach(function(n){if(n!==nv)n.remove();});
      nv.classList.remove('stg');if(nv.parentNode!==APP)APP.appendChild(nv);}
    if(first||!changed||RM.matches||!APP.animate||flying){
      var wasFirst=first;APP.appendChild(nv);commit();if(S.view==='archive')initArchive(nv);post();
      landBook();if(first)riseTabbar();first=false;if(window.NBCU)NBCU.warm();prefetch(day.id);if(wasFirst){warm(day);prebuildArchive();}return;}
    /* stage: build + lay out hidden, old view untouched and fully visible meanwhile */
    var keepSeg=pv==='read'&&S.view==='read';
    nv.classList.add('stg');APP.appendChild(nv);STG=nv;
    if(S.view==='archive')initArchive(nv);
    void APP.offsetHeight;
    if(!outP)outP=swapOut(CUR,keepSeg).then(function(){outP=null;});
    outP.then(function(){if(my!==seq||STG!==nv)return;
      APP.style.minHeight=oh+'px';
      commit();inSwap={dir:dir,keepSeg:keepSeg};post();inSwap=null;
      clearTimeout(mhT);mhT=setTimeout(function(){if(my===seq)APP.style.minHeight='';},520);});
    prefetch(day.id);
  });}
var outP=null,inSwap=null,mhT;
function stat(el,keepSeg){return el.classList.contains('hd')||el.classList.contains('pills')||(keepSeg&&el.classList.contains('seg'));}
function swapOut(root,keepSeg){
  var vh=innerHeight,list=[];if(!root)return Promise.resolve();
  root.querySelectorAll('[data-st]').forEach(function(el){if(stat(el,keepSeg))return;
    var r=el.getBoundingClientRect();if(r.bottom<0||r.top>vh)return;list.push(el);});
  if(!list.length)return Promise.resolve();
  var anims=list.map(function(el){var o=getComputedStyle(el).opacity;el.getAnimations().forEach(function(x){x.cancel();});
    return el.animate([{opacity:o,transform:'none'},{opacity:.12,transform:'translateY(-4px)'}],{duration:100,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});});
  return Promise.all(anims.map(function(x){return x.finished.catch(function(){});}));}
APP.addEventListener('click',function(e){
  var t=e.target.closest('button,a[data-jump]');if(!t)return;
  if(t.dataset.cal){calGo(+t.dataset.cal);return;}
  if(t.dataset.atopic!=null){setTopic(t.dataset.atopic);return;}
  if(t.dataset.cf){cfStep(+t.dataset.cf);return;}
  if(t.id==='installBtn'&&installEvt){installEvt.prompt();installEvt.userChoice.finally(function(){installEvt=null;t.hidden=true;});}
  else if(t.dataset.gx)goldToggle(t);
  else if(t.dataset.grange!=null)goldRange(t);
  else if(t.dataset.jump){e.preventDefault();var el=document.getElementById(t.dataset.jump);if(el)el.scrollIntoView({behavior:RM.matches?'auto':'smooth',block:'start'});}
});
APP.addEventListener('keydown',calKey);
/* ticker: hold still while a finger is on it */
var holdT;APP.addEventListener('touchstart',function(e){var t=e.target.closest('.tick');if(t){clearTimeout(holdT);t.classList.add('hold');}},{passive:true});
APP.addEventListener('touchend',function(e){var t=e.target.closest('.tick');if(t){clearTimeout(holdT);holdT=setTimeout(function(){t.classList.remove('hold');},1600);}},{passive:true});
/* top pill: theme toggle + install live outside #app */
var TPEL=document.getElementById('tp');
if(TPEL)TPEL.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
  if(b.id==='searchBtn'){if(S.view==='search'){var si=document.getElementById('sxq');if(si){si.focus();si.select();}}else location.hash='#/search';}
  else if(b.id==='themeBtn')themeReveal(b,other());
  else if(b.id==='installBtn'&&installEvt){installEvt.prompt();installEvt.userChoice.finally(function(){installEvt=null;b.hidden=true;});}});
(function(){var ib=document.getElementById('installBtn');if(ib)ib.innerHTML=ICON.dl;syncThemeBtn();})();
window.addEventListener('hashchange',route);
/* Search: the magnifier in the top pill, or '/' anywhere you are not typing. search.js is fetched on first hover/touch. */
(function(){var sb=document.getElementById('searchBtn');if(sb){sb.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  ['pointerenter','touchstart','focus'].forEach(function(ev){sb.addEventListener(ev,function(){loadSearch().catch(function(){});},{once:true,passive:true});});}
  document.addEventListener('keydown',function(e){if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey)return;var a=document.activeElement,tg=a&&a.tagName;
    if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT'||(a&&a.isContentEditable))return;e.preventDefault();
    if(S.view==='search'){var si=document.getElementById('sxq');if(si)si.focus();}else location.hash='#/search';});})();
window.addEventListener('online',function(){toast('Back online');});
window.addEventListener('offline',function(){toast('Offline · showing the last saved edition');});

loadData().then(loadSeed).then(function(seed){try{mergeSeed(seed);}catch(e){}}).then(route).catch(function(err){
  APP.setAttribute('aria-busy','false');
  dropStage();if(CUR)park(CUR);CUR=null;
  APP.innerHTML='<div class="g card empty" style="margin-top:60px"><h2>Could not load the brief</h2><p>'+(navigator.onLine===false?'You are offline and no edition is saved on this device yet.':'The data file did not load. Try again in a minute.')+'</p><a class="cta press" href="">Retry</a></div>';
  console.error(err);});
/* ---------------- liquid glass ----------------
   Chromium can run an SVG filter as a backdrop filter. For each glass element we draw a displacement map the
   exact size of the element: a rounded-rect "edge lens" whose vectors point inward, ~0 in the middle and
   strongest at the rim (plus an optional overall magnification for the nav blob). The filter displaces the
   lightly blurred backdrop three times with slightly different strengths, keeps R, G and B from one each
   (chromatic fringe), recombines and saturates. Other engines keep the CSS blur+saturate glass. */
var LGX=(function(){try{var b=navigator.userAgentData&&navigator.userAgentData.brands;
  return !!(b&&b.some(function(x){return /Chromium/.test(x.brand);}))&&!matchMedia('(prefers-reduced-transparency: reduce)').matches&&!matchMedia('(forced-colors: active)').matches;}catch(e){return false;}})();
/* band = lens width at the rim (px); scale stays < ~1.3x band so the edge compresses the backdrop without folding it into a mirror image */
/* band = rim width (px) that bends; scale < 1.33x band (smoothstep max slope 1.5) so it compresses without folding.
   v8: wider, stronger rim (18-22px, up to ~13px offset) for a visible lens; ca keeps the R/B split at ~0.5-0.8px.
   soft = frost radius of the flat centre; lift = luminance [slope, intercept] per theme (labels stay >= 4.5:1). */
var LGO={tp:{band:18,scale:23,ca:.06,blur:.4,soft:8,sat:1.6,mag:.02,lift:{light:[.28,.72],dark:[.24,.06]}},
  nav:{band:22,scale:28,ca:.05,blur:.4,soft:8,sat:1.6,mag:.02,lift:{light:[.26,.70],dark:[.24,.06]}},
  ind:{band:14,scale:17,ca:.04,blur:0,soft:0,sat:1.3,mag:.03,lift:{light:[.30,.72],dark:[.45,.14]}}};
var LGS=null;
function lgMap(w,h,o){var c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d'),im=g.createImageData(w,h),d=im.data,
  r=Math.min(w,h)/2,cx=w/2,cy=h/2,hx=cx-r,hy=cy-r,band=Math.min(o.band,r);
  for(var j=0;j<h;j++)for(var i=0;i<w;i++){var px=i+.5-cx,py=j+.5-cy,qx=Math.abs(px)-hx,qy=Math.abs(py)-hy,nx,ny,sd,L;
    if(qx>0&&qy>0){L=Math.sqrt(qx*qx+qy*qy);sd=L-r;nx=qx/L;ny=qy/L;}else if(qx>qy){sd=qx-r;nx=1;ny=0;}else{sd=qy-r;nx=0;ny=1;}
    if(px<0)nx=-nx;if(py<0)ny=-ny;
    var t=1+sd/band;t=t<0?0:t>1?1:t;var f=t*t*(3-2*t);   /* bevel confined to the outer rim band, smooth falloff, centre untouched */
    var dx=-nx*f-o.mag*px/cx,dy=-ny*f-o.mag*py/cy,k=(j*w+i)*4;
    d[k]=128+dx*127;d[k+1]=128+dy*127;d[k+2]=t*255;d[k+3]=255;}   /* B = rim weight */
  g.putImageData(im,0,0);return c.toDataURL();}
function lgSet(el,id,o){if(!LGX||!el||!o)return;var w=Math.round(el.offsetWidth),h=Math.round(el.offsetHeight);if(w<8||h<8)return;
  var key=w+'x'+h+theme();if(el._lg===key)return;el._lg=key;
  if(!LGS){LGS=document.createElementNS('http://www.w3.org/2000/svg','svg');LGS.setAttribute('aria-hidden','true');LGS.setAttribute('width','0');LGS.setAttribute('height','0');
    LGS.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';document.body.appendChild(LGS);}
  var S=o.scale,ch=function(n,sc,m){return '<feDisplacementMap in="bl" in2="map" scale="'+sc.toFixed(1)+'" xChannelSelector="R" yChannelSelector="G" result="d'+n+'"/>'+
    '<feColorMatrix in="d'+n+'" type="matrix" values="'+m+'" result="c'+n+'"/>';};
  /* rim: a near-sharp, refracted, R/G/B-split copy; centre: the same lens over a frosted copy so the pill's own text stays legible.
     The map's blue channel (rim weight) masks the sharp copy over the frosted one. */
  var f='<filter id="'+id+'" x="0" y="0" width="'+w+'" height="'+h+'" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">'+
    '<feGaussianBlur in="SourceGraphic" stdDeviation="'+o.blur+'" result="bl"/>'+
    '<feImage href="'+lgMap(w,h,o)+'" x="0" y="0" width="'+w+'" height="'+h+'" preserveAspectRatio="none" result="map"/>'+
    ch('r',S*(1+o.ca),'1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0')+ch('g',S,'0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0')+ch('b',S*(1-o.ca),'0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0')+
    '<feBlend in="cr" in2="cg" mode="screen" result="rg"/><feBlend in="rg" in2="cb" mode="screen" result="rgb"/>'+
    (o.soft?'<feColorMatrix in="map" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0" result="wa"/>'+
      '<feComposite in="rgb" in2="wa" operator="in" result="rim"/>'+
      '<feGaussianBlur in="SourceGraphic" stdDeviation="'+o.soft+'" result="sb"/>'+
      '<feDisplacementMap in="sb" in2="map" scale="'+S.toFixed(1)+'" xChannelSelector="R" yChannelSelector="G" result="sd"/>'+
      '<feComposite in="rim" in2="sd" operator="over" result="rgb2"/>':'<feOffset in="rgb" result="rgb2"/>')+
    '<feColorMatrix in="rgb2" type="saturate" values="'+o.sat+'" result="sat"/>'+
    /* luminance lift: compress the backdrop into a bright band (light) or a dim band (dark) so the glass never turns to murk
       and the labels on top keep >= 4.5:1 whatever passes underneath */
    (function(){var L=o.lift[theme()],a=L[0].toFixed(3),b=L[1].toFixed(3);return '<feComponentTransfer in="sat"><feFuncR type="linear" slope="'+a+'" intercept="'+b+'"/><feFuncG type="linear" slope="'+a+'" intercept="'+b+'"/><feFuncB type="linear" slope="'+a+'" intercept="'+b+'"/></feComponentTransfer>';})()+'</filter>';
  var old=LGS.querySelector('#'+id);if(old)old.remove();LGS.insertAdjacentHTML('beforeend',f);
  var v='url(#'+id+')';el.style.webkitBackdropFilter='none';el.style.backdropFilter='none';void el.offsetWidth;el.style.webkitBackdropFilter=v;el.style.backdropFilter=v;}
function lgAll(){var tl=$('#tp>.lg'),nl=$('#tabbar>.lg');lgSet(tl,'lg-tp',LGO.tp);if(nl&&nl.offsetWidth)lgSet(nl,'lg-nav',LGO.nav);if(TS.ind)lgSet(TS.ind,'lg-ind',LGO.ind);}
if(LGX){document.documentElement.classList.add('lgx');lgAll();
  new MutationObserver(function(){lgAll();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(window.ResizeObserver){var lgRO=new ResizeObserver(function(){lgAll();});lgRO.observe(document.getElementById('tp'));lgRO.observe(document.getElementById('tabbar'));}}

/* ---------------- top pill: one header that morphs ----------------
   The page title (.hd) scrolls up under the floating pill and fades out; only after it is gone does the pill
   swap its brand line (.tp-a) for the compact title + key stat (.tp-b). Never two titles on screen at once. */
var TPA=document.getElementById('tpA'),TPB=document.getElementById('tpB'),hdEl=null,hdRange=120,tpRaf=0,tpLast=-1;
var TTL={today:'Today\u2019s Brief',read:'Read',topics:'Topics',topic:'Topics',peer:'Peers',markets:'Markets',archive:'Archive',search:'Search'};
function chromeBar(day){
  var it=item(day,'nifty'),mk='';
  if(it&&it.value){var d=dirOf(it);mk=' \u00b7 Nifty <span class="num">'+esc(it.value)+'</span>'+(hasChg(it)?' <span class="num '+(d||'')+'">'+esc(pct(it.change))+'</span>':'');}
  var h1=$('.hd h1'),cbT=document.getElementById('cbT'),cbS=document.getElementById('cbS'),tpE=document.getElementById('tpE');
  if(cbT)cbT.textContent=h1?h1.textContent:TTL[S.view]||'NBFC Brief';
  if(cbS)cbS.innerHTML=S.view==='archive'?esc(M.days.length+' editions \u00b7 latest '+shortDay(M.days[0].id)):esc(shortDay(day.id))+mk;
  if(tpE)tpE.textContent=S.view==='archive'?'Archive':S.view==='search'?'Search':HUBV[S.view]?'Topics':shortDay(day.id)+' edition';
  if(TPA)TPA.href='#/'+M.days[0].id;
  measureHd();
  var tk=$('.tick .tk-list');if(tk){var w=tk.offsetWidth;tk.parentNode.style.setProperty('--tkd',Math.max(20,Math.round(w/38))+'s');obs(tk.closest('.tick'));}}
/* Today pills sit beside the eyebrow when both fit on one line; otherwise they drop under the date line */
function fitEd(){var hd=$('.hd.tools');if(!hd)return;var n=hd.querySelector('.ednav'),g=hd.querySelector('.greet'),gw=0;
  if(g){var rg=document.createRange();rg.selectNodeContents(g);gw=rg.getBoundingClientRect().width;}
  var cs=getComputedStyle(hd),w=hd.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  hd.classList.toggle('stack',gw+8+n.scrollWidth>w+.5);}
function measureHd(){fitEd();hdEl=$('.hd');var tp=document.getElementById('tp');
  if(hdEl){hdEl.style.transform='';hdEl.style.opacity='';}
  var h1=hdEl&&hdEl.querySelector('h1');
  if(h1&&tp){var hb=h1.getBoundingClientRect().bottom+scrollY,pb=tp.getBoundingClientRect().bottom;hdRange=Math.max(40,hb-pb);}
  tpLast=-1;tpUpd();}
function cl01(x){return x<0?0:x>1?1:x;}
function tpUpd(){tpRaf=0;var y=window.scrollY,p=cl01(y/hdRange),o=cl01(1-p/.75),q=cl01((p-.75)/.25);
  if(RM.matches){o=p<.75?1:0;q=p>=.75?1:0;}
  if(hdEl){hdEl.style.opacity=o<1?o.toFixed(3):'';hdEl.style.transform=p&&!RM.matches?'scale('+(1-.03*p).toFixed(4)+')':'';}
  if(q===tpLast)return;tpLast=q;
  /* sequential inside the pill too: the brand line leaves (first half), then the compact title arrives (second half) */
  var qa=cl01(1-2*q),qb=cl01(2*q-1);
  if(TPA){TPA.style.opacity=qa<1?qa.toFixed(3):'';TPA.style.transform=qa<1&&!RM.matches?'translateY('+(-(1-qa)*6).toFixed(1)+'px)':'';TPA.style.visibility=qa<=0?'hidden':'';}
  if(TPB){TPB.style.opacity=qb.toFixed(3);TPB.style.transform=qb<1&&!RM.matches?'translateY('+((1-qb)*6).toFixed(1)+'px)':'';TPB.style.visibility=qb>0?'visible':'hidden';}}
addEventListener('scroll',function(){if(!tpRaf)tpRaf=requestAnimationFrame(tpUpd);},{passive:true});
addEventListener('resize',function(){measureHd();if(CF&&CF.vp.isConnected){var i=CF.i;cfLayout();CF.vp.scrollLeft=i*CF.step;cfPaint();}});
/* off-screen: pause the ticker (saves GPU on long reads) */
var IO=window.IntersectionObserver?new IntersectionObserver(function(es){es.forEach(function(e){e.target.classList.toggle('off',!e.isIntersecting);});}):null;
function obs(el){if(IO&&el)IO.observe(el);}
if(document.fonts)document.fonts.ready.then(function(){reInd();measureHd();});

/* "New edition available": a new service worker took over, or the data on the server is newer than what is on screen */
function showUpdate(){
  if($('#upd'))return;var d=document.createElement('div');d.id='upd';d.className='upd g';d.setAttribute('role','status');
  d.innerHTML='<span>New edition available</span><button type="button" class="go">Refresh</button><button type="button" class="x" aria-label="Dismiss">×</button>';
  d.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(b.classList.contains('go'))location.reload();else d.remove();});
  document.body.appendChild(d);
  if(d.animate&&!RM.matches)d.animate([{opacity:0,transform:'translate(-50%,16px)'},{opacity:1,transform:'translate(-50%,0)'}],{duration:SPRINGS.Snappy.ms,easing:SPRINGS.Snappy.easing});}
function probe(){
  if(!M.generated||document.visibilityState==='hidden'||navigator.onLine===false)return;
  var p=M.source==='data.js'||M.hasLegacy?headGenerated():Promise.reject();
  p.catch(function(){return fetch('/data/latest.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(j){return j.generated;});})
   .then(function(g){if(g&&g>M.generated)showUpdate();}).catch(function(){});}
window.__nbfcProbe=probe;window.__nbfcShowUpdate=showUpdate;
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')probe();});
window.addEventListener('online',probe);setInterval(probe,10*60*1000);

if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',function(){
  var had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',function(){if(had)showUpdate();had=true;});
  navigator.serviceWorker.register('/sw.js').then(function(reg){
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')reg.update().catch(function(){});});
  }).catch(function(){});
  setTimeout(probe,4000);});
})();
