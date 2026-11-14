/* Search across every edition. Loaded only when #/search opens (app.js loadSearch), so Today never pays for it.
   Index: built in the browser from data/latest.json (edition list + "generated") and data/YYYY-MM-DD.json,
   fetched 4 at a time, cut into small docs (one per story / bullet / circular / calendar line / section) and
   kept in IndexedDB keyed by "generated", so a new edition rebuilds it once. The service worker caches data/*.json,
   so search works offline after one visit. If latest.json ever advertises "search_index" (a prebuilt file),
   that is used instead. Tags: story/circular/calendar "tags" {companies,regulators,topics} win; otherwise
   simple keyword heuristics fill them in. Labels: latest.json "tag_labels", else Title Case with acronyms. */
(function(){'use strict';
var NB=window.__NB,esc=NB.esc,IDXV=8,DBN=NB.ns+'-search',RKEY=NB.ns+'-recent';
/* ---------- text ---------- */
var STOP={};'the a an and or of to in on for by with at is are was were be as it its from that this into than has have had not no'.split(' ').forEach(function(w){STOP[w]=1;});
function norm(s){return String(s==null?'':s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
function toks(s){return (norm(s).match(/[a-z0-9]+/g)||[]).filter(function(t){return !STOP[t];});}
function flat(s){return norm(s).replace(/[^a-z0-9]+/g,'');}
var ALIAS={ncd:['ncd','ncds','debenture','debentures'],ncds:['ncd','ncds','debenture','debentures'],mfl:['mfl','fincorp'],
  rbi:['rbi','reserve'],npa:['npa','npas','stage'],ipo:['ipo','ipos','listing']};
/* ---------- tags ---------- */
var ACR={rbi:'RBI',sebi:'SEBI',ibbi:'IBBI',mca:'MCA',nhb:'NHB',irdai:'IRDAI',ncd:'NCD',ipo:'IPO','m-and-a':'M&A',iifl:'IIFL',govt:'Govt',lic:'LIC',hdb:'HDB',sbfc:'SBFC',mfi:'MFI',npa:'NPA',l:'L',t:'T'};
var NAMES={rating:'Ratings',circular:'Circulars','gold-loan':'Gold loan','gold-price':'Gold price','asset-quality':'Asset quality','digital-lending':'Digital lending',
  'housing-finance':'Housing finance','vehicle-finance':'Vehicle finance','m-and-a':'M&A','iifl-finance':'IIFL Finance','l-and-t-finance':'L&T Finance','m-and-m-finance':'M&M Finance'};
var LABELS={};
function label(g,s){if(g==='thread')return 'In a story thread';if(g==='stage'&&LCN[s])return LCN[s];var L=LABELS[g]||{};if(L[s])return L[s];if(NAMES[s])return NAMES[s];
  return s.split('-').map(function(w){return ACR[w]||(w.charAt(0).toUpperCase()+w.slice(1));}).join(' ').replace(/ And /g,' & ');}
var PRIMARY={topics:['gold-loan','ncd','rating','results','circular'],regulators:['rbi','sebi','ibbi'],companies:['muthoot-fincorp','muthoot-finance','manappuram','bajaj-finance','shriram-finance','iifl-finance'],stage:['draft','final','effective'],thread:['thread']};
/* stage (circular lifecycle) and thread filters come from the cards' reg.lifecycle and story_id (index v7) */
var GROUPS=[['topics','Topic','tp'],['regulators','Regulator','rg'],['companies','Company','co'],['stage','Stage','st'],['thread','Thread','th']];
var LCN={draft:'Draft',final:'Final',effective:'Effective',superseded:'Superseded',withdrawn:'Withdrawn'};
var H_REG=[['rbi',/\brbi\b|reserve bank/i],['sebi',/\bsebi\b/i],['ibbi',/\bibbi\b|insolvency and bankruptcy board/i],['mca',/\bmca\b|ministry of corporate affairs/i],
  ['nhb',/\bnhb\b|national housing bank/i],['irdai',/\birdai\b/i]];
var H_TOP=[['gold-loan',/gold[- ]loans?\b|gold[- ]lend|loans? against gold|gold[- ]backed|\bglc\b/i],['ncd',/\bncds?\b|debenture/i],
  ['rating',/\bcredit ratings?\b|\bratings? (?:action|upgrade|downgrade|agency|outlook)|\brated\b|\bcrisil\b|\bicra\b|care ?edge|care ratings|india ratings|\bind-ra\b|brickwork|\bacuit|\b(?:up|down)grade[sd]?\b|\b(?:aa|aaa|a1)\+?\s*\/\s*(?:stable|positive|negative)/i],
  ['results',/\bq[1-4]\b|\bh[12]\s?fy|\bresults?\b|net profit|\bpat\b|\bnii\b|earnings|quarterly (?:numbers|profit)/i],
  ['circular',/\bcirculars?\b|\bnotifications?\b|master directions?|\bdirections?,? 20\d\d|gazette|\bamendment directions?/i],
  ['funding',/\bfunding\b|\braises?\b|\braised\b|borrowing|bank (?:credit|lending) to nbfcs?|\becbs?\b|commercial paper|term loans?|co-lending|securiti[sz]ation/i],
  ['rates',/\brepo\b|interest rates?|lending rates?|\bmclr\b|\byields?\b|\bg-sec\b|\bbps?\b|basis points|rate (?:hike|cut)/i],
  ['gold-price',/gold price|\bibja\b|spot gold|mcx gold|gold (?:rose|fell|rallied|slipped|steadied|lost|gained)|gold spot/i],
  ['markets',/\bsensex\b|\bnifty\b|stock market|\bshares? (?:rose|fell|gained|lost)|\bfii\b|\bdii\b/i],
  ['asset-quality',/\bnpas?\b|\bgnpa\b|stage ?[23]\b|asset quality|provisions?\b|write-?offs?|delinquen|slippage/i],
  ['microfinance',/microfinance|\bmfis?\b|\bshgs?\b|\bmfin\b|sa-dhan|cgfmu/i],['digital-lending',/digital lending|\bfintech|\bdla\b|lending apps?|\bdlg\b/i],
  ['ipo',/\bipo\b|\bdrhp\b|\bpublic issue of (?:equity )?shares/i],['m-and-a',/\bmerger|\bacqui(?:re|sition)|stake (?:sale|purchase)|amalgamat|\bm&a\b/i],
  ['enforcement',/\bpenalt|\bfined?\b|show[- ]cause|enforcement|cancell?(?:ed|ation of) (?:the )?(?:registration|certificate|cor)|debarr|\bbarred\b/i],
  ['macro',/inflation|\bgdp\b|\bcpi\b|\bwpi\b|monsoon|\brupee\b|fiscal deficit|\biip\b|\bpmi\b/i],['housing-finance',/housing finance|home loans?|\bhfcs?\b/i],
  ['vehicle-finance',/vehicle finance|vehicle loans?|auto loans?|tractor|two-wheeler|commercial vehicle/i],['policy',/\bpolicy\b|\bmpc\b|\bbudget\b|\bdraft (?:directions?|circular)|consultation paper/i]];
var H_CO=[['muthoot-fincorp',/muthoot fincorp|\bmfl\b/i],['muthoot-finance',/muthoot finance\b/i],['manappuram',/manappuram/i],['bajaj-finance',/bajaj finance/i],
  ['shriram-finance',/shriram finance/i],['iifl-finance',/\biifl\b/i],['muthoot-microfin',/muthoot microfin/i],['cholamandalam',/cholamandalam|\bchola\b/i],
  ['poonawalla-fincorp',/poonawalla/i],['lic-housing-finance',/lic housing/i],['tata-capital',/tata capital/i],['l-and-t-finance',/l&t finance|l&amp;t finance/i],
  ['piramal-finance',/piramal/i],['m-and-m-finance',/mahindra (?:&|and) mahindra financial|mahindra finance|m&m financial/i],['aditya-birla-capital',/aditya birla capital/i],
  ['hdb-financial',/hdb financial/i],['five-star',/five[- ]star business/i],['sbfc-finance',/\bsbfc\b/i],['credila',/credila/i],['indel-money',/indel money/i]];
var IMP=/(possible impact on (?:muthoot fincorp|mfl)|why it matters for (?:muthoot fincorp(?: \(mfl\))?|mfl)|mfl action)[^\n]*/gi;
function heur(text,kind){var t={companies:[],regulators:[],topics:[]},co=String(text).replace(IMP,' ');
  H_REG.forEach(function(x){if(x[1].test(text))t.regulators.push(x[0]);});
  H_TOP.forEach(function(x){if(x[1].test(text))t.topics.push(x[0]);});
  H_CO.forEach(function(x){if(x[1].test(co))t.companies.push(x[0]);});
  if(kind==='Circular'&&t.topics.indexOf('circular')<0)t.topics.push('circular');
  return t;}
function cleanTags(t){if(!t||typeof t!=='object')return null;var o={};
  ['companies','regulators','topics'].forEach(function(g){o[g]=(Array.isArray(t[g])?t[g]:[]).filter(function(x){return typeof x==='string'&&x;}).map(function(x){return x.toLowerCase();});});return o;}
/* ---------- docs ---------- */
var SKIP=/key numbers|source links|^sources?$|quick reference|disclaimer/i;
function kindOf(key,sec){var s=sec.toLowerCase();
  if(key==='01-daily-watch'){if(/urgent|high impact/.test(s))return 'Story';if(/in the market|watchlist/.test(s))return 'MFL';return 'News';}
  if(key==='02-regulation'){if(/calendar|deadline/.test(s))return 'Calendar';if(/new regulatory|updates today|circular/.test(s))return 'Circular';return 'Rules';}
  if(key==='03-weekly-analysis')return 'Weekly';return 'Report';}
var DESK={'01-daily-watch':'News','02-regulation':'Rules','03-weekly-analysis':'Weekly'};
function firstLink(s){var m=String(s).match(/\[([^\]]+)\]\((https?:[^)\s]+)\)/);return m?{l:NB.stripMd(m[1]),u:m[2]}:null;}
function hlOf(s){return flat(NB.stripMd(s)).slice(0,40);}
function matcher(day){var L=Array.isArray(day.story_tags)?day.story_tags:[],ex={},byT={},st=[];
  L.forEach(function(e){if(!e||!e.tags)return;var t=flat(e.title).slice(0,40),k=e.report+'|'+flat(e.section)+'|'+t;if(!ex[k])ex[k]=e;if(!byT[e.report+'|'+t])byT[e.report+'|'+t]=e;if(e.kind==='story')st.push(e);});
  return function(rk,sec,title,kind,ord){if(!L.length)return null;var t=flat(title).slice(0,40),s=flat(sec),e=ex[rk+'|'+s+'|'+t]||byT[rk+'|'+t];
    /* same report and section, one title a prefix of the other ("14 Nov 2026" vs "14 Nov 2026: last date for…") */
    if(!e&&t.length>=5)for(var i=0;i<L.length&&!e;i++){var x=L[i];if(x.report!==rk||!x.tags||flat(x.section)!==s)continue;var f=flat(x.title).slice(0,40);
      if(f.length>=5&&(t.indexOf(f)===0||f.indexOf(t)===0))e=x;}
    if(!e&&kind==='Story'&&ord!=null)e=st[ord]; /* fallback: report + n among the URGENT stories */
    return e?cleanTags(e.tags):null;};}
function docsOf(day){var out=[],id=day.id,match=matcher(day);
  if(day.tag_labels&&typeof day.tag_labels==='object')Object.keys(day.tag_labels).forEach(function(k){if(!LABELS[k])LABELS[k]=day.tag_labels[k];});
  (day.reports||[]).forEach(function(r){if(r.missing||!r.content)return;segment(day,r,out,match);});
  var byT={};out.forEach(function(d){byT[flat(d.t).slice(0,36)]=d;});
  function attach(x,kind,href,secName){var t=x.title||x.name||x.item||x.event||'';if(!t)return;var f=flat(NB.stripMd(t)).slice(0,36),tg=cleanTags(x.tags),hit=byT[f];
    if(hit){if(tg)hit.tg=tg,hit.ht=0;return;}
    var body=[x.dek,x.mfl_impact||x.why,x.summary,x.value,x.ref,x.issuer,x.effective,x.note,x.date].filter(Boolean).join(' · ');
    var src=(x.sources&&x.sources[0])||x.source||(x.url?{label:x.issuer||'source',url:x.url}:null);
    push(out,{d:id,k:kind,s:secName,t:NB.stripMd(t),b:NB.stripMd(body),src:src?{l:src.label||src.l||'source',u:src.url||src.u}:null,h:href+'?hl='+hlOf(t)},tg);}
  (day.stories||[]).forEach(function(x){attach(x,'Story','#/'+id+'/read/01-daily-watch','Top stories');});
  (Array.isArray(day.rules)?day.rules:[]).forEach(function(x){attach(x,'Circular','#/'+id+'/read/02-regulation','New regulatory updates');});
  (day.reg_calendar||[]).forEach(function(x){attach(x,'Calendar','#/'+id+'/read/02-regulation','Regulatory calendar');});
  (NB.mflItems(day)||[]).forEach(function(x){attach(x,'MFL','#/'+id,NB.mflLabel);});
  var g=day.gold;if(g&&typeof g==='object'){var p=[],I=g.ibja||{},S=g.spot||{},A=g.agloc||{};
    if(I.rate_999!=null)p.push('IBJA 24K 999 ₹'+I.rate_999+'/g');if(I.rate_916!=null)p.push('22K 916 ₹'+I.rate_916+'/g');
    if(S.usd_oz!=null)p.push('spot $'+S.usd_oz+'/oz');if(S.inr_10g!=null)p.push('₹'+S.inr_10g+'/10g');
    if(A.ltv_85!=null||A.ref_price!=null)p.push('AGLOC max LTV 85% ₹'+A.ltv_85+'/g, 80% ₹'+A.ltv_80+', 75% ₹'+A.ltv_75+', reference ₹'+A.ref_price);
    if(p.length)push(out,{d:id,k:'Gold',s:'Markets · Gold rates',t:'Gold rates: IBJA, spot and AGLOC loan-to-value',b:p.join('; ')+'. gold price ibja agloc ltv',src:I.source?{l:'IBJA',u:I.source}:null,h:'#/'+id+'/markets?sec=h-gold'},{companies:[],regulators:[],topics:['gold-price','gold-loan']});}
  /* publisher cards (day.cards[]): category, summary, impact and circular fields win over what the markdown parse found */
  var CK={story:'Story',circular:'Circular',calendar:'Calendar',analysis:'Weekly'},RK={news:'01-daily-watch',rules:'02-regulation',weekly:'03-weekly-analysis'};
  (Array.isArray(day.cards)?day.cards:[]).forEach(function(c){if(!c||!c.title)return;var f=flat(NB.stripMd(c.title)).slice(0,36),hit=null,tg=cleanTags(c.tags);
    for(var i=0;i<out.length&&!hit;i++){var g=out[i]._f||(out[i]._f=flat(out[i].t).slice(0,36));if(g.length>=5&&(g===f||f.indexOf(g)===0||g.indexOf(f)===0))hit=out[i];}
    var src=c.source&&c.source.url?{l:c.source.name||'source',u:c.source.url}:null;
    if(!hit){var rk=RK[c.report]||c.report||'01-daily-watch',k=CK[c.kind]||(rk==='02-regulation'?'Rules':rk==='03-weekly-analysis'?'Weekly':'News');
      hit=push(out,{d:id,k:k,s:(DESK[rk]||'News')+' · '+(c.section||''),t:NB.stripMd(c.title),b:NB.stripMd([c.summary,c.impact].filter(Boolean).join(' ')),src:src,h:NB.readHref?NB.readHref(id,c.report,c.title,c.section):'#/'+id+'/read/'+rk+'?hl='+hlOf(c.title)},tg);}
    else if(tg){hit.tg=tg;hit.ht=0;}
    if(c.category)hit.c=c.category;else if(NB.catOf)hit.c=NB.catOf(hit.tg,hit.k,hit.s,null);
    if(c.summary)hit.sm=String(c.summary).slice(0,300);if(c.impact)hit.imp=String(c.impact).slice(0,300);if(src&&!hit.src)hit.src=src;
    if(c.reg&&typeof c.reg==='object')hit.reg=c.reg;
    /* v7: thread id, lifecycle stage, source names ("BSE" finds cards citing BSE), the weekly section's threads, and the card link */
    if(typeof c.story_id==='string'&&c.story_id)hit.sid=c.story_id;
    var lc=c.reg&&typeof c.reg==='object'&&c.reg.lifecycle;if(typeof lc==='string'&&LCN[lc])hit.lc=lc;
    var sn=(Array.isArray(c.sources)?c.sources:[]).concat(c.source?[c.source]:[]).map(function(x){return x&&typeof x.name==='string'?x.name:'';}).filter(Boolean);if(sn.length)hit.sn=sn.join(' ');
    if(Array.isArray(c.stories_ref)&&c.stories_ref.length)hit.sr=c.stories_ref.filter(function(x){return typeof x==='string';}).slice(0,8);
    if(c.id&&window.NBCU&&NBCU.cardHref){try{var ch=NBCU.cardHref(id,c);if(ch)hit.h=ch;}catch(e){}}});
  out.forEach(function(d){delete d._f;});
  return out;}
/* "Label: value" fields merged into a body: pull out the impact line and the circular fields for the topic pages */
var FLAB=/(?:^|\s)(What(?: is it\??)?|Issuer|Date(?: released)?|Dated|Reference|Ref(?:erence)? no\.?|Direction reference|Source|Sources|Link|Status|Deadline|Comment deadline|Feedback deadline|Key dates?|Effective(?: date| from)?|Applies to|Scope|Why it matters(?: for (?:MFL|NBFCs|you|Muthoot Fincorp))?|MFL (?:impact|note|angle|read)|Muthoot Fincorp (?:note|impact|angle)|Possible impact on Muthoot Fincorp|Impact on NBFCs|FP&A (?:impact|action|note|read)|Action|Classification|In plain English|The numbers|Previous position):\s/gi;
var IMPL=/^(why it matters|mfl |muthoot fincorp |possible impact|fp&a |impact on nbfcs)/i;
function fields(full){var m,pos=[],f={},lead;FLAB.lastIndex=0;while((m=FLAB.exec(full))){pos.push({l:m[1],i:m.index,e:FLAB.lastIndex});}
  lead=(pos.length?full.slice(0,pos[0].i):full).trim();
  pos.forEach(function(p,j){var v=full.slice(p.e,j+1<pos.length?pos[j+1].i:full.length).trim().replace(/[\s·;]+$/,''),l=p.l.toLowerCase();if(!v)return;
    if(IMPL.test(l)){if(!f.imp||/mfl|muthoot/.test(l))f.imp=v;}else if(/^applies|^scope/.test(l))f.ap=f.ap||v;else if(/^effective/.test(l))f.ef=f.ef||v;
    else if(/^ref|^direction ref|^reference/.test(l))f.rf=f.rf||v;else if(/deadline|key date/.test(l))f.dl=f.dl||v;else if(l==='status')f.st=f.st||v;
    else if(/^what|plain english/.test(l)&&!lead)lead=v;});
  f.lead=lead;return f;}
function cut(v,n){return v.length>n?v.slice(0,n).replace(/\s+\S*$/,'')+'…':v;}
function refl(o,full){var F=fields(full);if(F.imp)o.imp=cut(F.imp,260);if(F.lead&&F.lead!==full)o.sm=cut(F.lead,260);
  if(F.ap||F.ef||F.rf||F.dl||F.st){o.rg={};['ap','ef','rf','dl','st'].forEach(function(x){if(F[x])o.rg[x]=cut(F[x],140);});}}
function push(out,o,tg){var full=String(o.b||'').replace(/\s+/g,' ').trim();o.b=full.length>420?full.slice(0,420).replace(/\s+\S*$/,'')+'…':full;
  refl(o,full);
  var w={};toks(o.t+' '+full+' '+o.s+' '+o.k).forEach(function(t){w[t]=1;});o.w=Object.keys(w).join(' ');
  if(tg){o.tg=tg;}else{o.ht=1;o.tg=heur(o.t+' \n'+full,o.k);if(o.k==='MFL'&&o.tg.companies.indexOf('muthoot-fincorp')<0)o.tg.companies.unshift('muthoot-fincorp');if(o.inh)o.tg=inherit(o.tg,o.inh);}
  if(NB.catOf)o.c=NB.catOf(o.tg,o.k,o.s,o.c);
  delete o.inh;out.push(o);return o;}
/* weekly items: keyword tags, narrowed to what the publisher tagged their section with */
function inherit(h,sec){var o={};['companies','regulators','topics'].forEach(function(g){var a=h[g].filter(function(x){return sec[g].indexOf(x)>=0;});o[g]=a.length?a:h[g];});return o;}
var CHECK=/sources? checked|checked (?:today|overnight|this morning|live)|sources (?:scanned|reviewed)/i,NOTHING=/^[^A-Za-z]*(no new|no significant|no fresh|nothing (?:new|has been|moved))/i,FIELD=/^(what|what is it\??|issuer|date|date released|dated|reference|ref|source|sources|link|status|deadline|key dates?|comment deadline|feedback deadline|effective(?: date| from)?|applies to|scope(?: \(important\))?|direction reference|classification|in plain english|plain english|the technical details|technical details|the numbers|numbers|why it matters(?: for (?:mfl|nbfcs|you|muthoot fincorp))?|mfl (?:impact|note|angle|read)|muthoot fincorp (?:note|impact|angle)|possible impact on muthoot fincorp|impact on nbfcs|fp&a (?:impact|action|note|read)|previous position|constraints|downgrade trigger|test|but|read|action)$/i;
function segment(day,r,out,match){
  var key=r.key,lines=NB.pub(r.content).split(/\r?\n/),sec=null,secId='',kind='',skip=false,cur=null,secDoc=null,id=day.id,base='#/'+id+'/read/'+key,
      weekly=key==='03-weekly-analysis',desk=DESK[key]||r.section||'Report',ord=0,chk=false,last=null;
  function flush(){if(cur){emit(cur);cur=null;}}
  function emit(c){var body=c.b.join(' ');if(!c.t&&!body)return;var t=c.t||NB.clip(NB.firstSentence(body),140),k=c.k||kind;
    var tg=match(key,sec,t,k,k==='Story'?ord++:null);
    last=push(out,{d:id,k:k,s:desk+' · '+sec,t:t,b:body,src:c.src,h:base+(c.hl?'?hl='+c.hl+'&sec='+secId:'?sec='+secId),inh:!tg&&weekly&&secDoc&&secDoc.tg?secDoc.tg:null},tg);}
  function txt(l){return NB.stripMd(NB.noCites(l));}
  /* "**What:** …", "**Source:** …" and 2-column field tables describe the item above, they are not items themselves */
  function isField(lab,after){lab=txt(lab).replace(/[:.]\s*$/,'').trim();return FIELD.test(lab)&&(cur||last||secDoc)&&(/[:]\s*$/.test(txt(arguments[2]||''))||/^:/.test(after||'')||arguments[3]);}
  function addField(x){x=txt(x);if(!x)return;if(cur){cur.b.push(x);return;}if(last){var f=(last.b+' '+x);last.b=f.length>420?f.slice(0,420).replace(/\s+\S*$/,'')+'…':f;refl(last,f);var w={};last.w.split(' ').concat(toks(x)).forEach(function(t){w[t]=1;});last.w=Object.keys(w).join(' ');return;}if(secDoc)secDoc.b.push(x);}
  function addTo(c,l){var x=txt(l);if(x)c.b.push(x);if(!c.src)c.src=firstLink(l);if(secDoc&&c!==secDoc&&weekly)secDoc.b.push(x);}
  function open(t,raw,para,k){flush();cur={t:t,b:[],hl:hlOf(raw),src:null,para:para,k:k};return cur;}
  function endSec(){flush();last=null;if(secDoc&&(weekly||secDoc.b.length)){var t=secDoc.t;push(out,{d:id,k:weekly?'Weekly':(key==='02-regulation'?'Rules':'News'),s:desk+' · '+sec,t:t,b:secDoc.b.join(' '),src:secDoc.src,h:base+'?sec='+secId},secDoc.tg);}secDoc=null;}
  for(var i=0;i<lines.length;i++){var line=lines[i].trim();if(!line||/^<!--.*-->$/.test(line))continue;
    var h=line.match(/^(#{1,3})\s+(.*)$/);
    if(h){if(h[1]==='#')continue;
      if(h[1]==='##'){endSec();var hh=NB.pubHead(h[2]);sec=NB.deEmoji(NB.cleanHead(hh));secId=NB.slug(hh);skip=SKIP.test(sec);kind=kindOf(key,sec);
        if(!skip){secDoc={t:sec,b:[],src:null,tg:null};if(weekly)secDoc.tg=match(key,sec,sec,'analysis');}continue;}
      if(skip||!sec)continue;open(NB.deEmoji(NB.cleanHead(h[2])),h[2],true).bold=true;continue;}
    if(skip||!sec||/^---+$/.test(line))continue;
    if(line.charAt(0)==='|'){var cells=line.replace(/^\||\|$/g,'').split('|').map(function(x){return x.trim();});
      if(cells.every(function(x){return /^:?-{2,}:?$/.test(x);}))continue;
      var nx=(lines[i+1]||'').trim(),hdr=/^\|?\s*:?-{2,}/.test(nx),c0=txt(cells[0]),kv=cells.length===2&&FIELD.test(c0.replace(/[:.]\s*$/,'').trim());
      if(hdr)continue; /* header row: the separator follows it */
      if(kv&&(cur||last||secDoc)){addField(c0+': '+cells[1]);continue;} /* field / value tables belong to the item above */
      if(!weekly&&cells.length>1&&!/^(item|metric|date|stock|company|name)$/i.test(NB.stripMd(cells[0]))){
        var bb=cells[0].match(/^\*\*(.+?)\*\*\s*(.*)$/),c=open(txt(bb?bb[1]:cells[0]).replace(/[:]$/,''),cells[0],false,kind==='Story'||kind==='MFL'?kind:kind);
        if(bb&&bb[2])addTo(c,bb[2]);cells.slice(1).forEach(function(x){addTo(c,x);});if(!c.src)c.src=firstLink(cells[0]);flush();}
      else addTo(cur||secDoc,cells.join(' · '));continue;}
    var bl=line.match(/^(?:[-*]|\d+\.)\s+(.*)$/),bold=line.match(/^\*\*(.+?)\*\*\s*(.*)$/),q=/^>/.test(line);
    if(q){var l2=line.replace(/^>\s*/,'');if(cur)addTo(cur,l2);else if(secDoc)addTo(secDoc,l2);continue;}
    if(!bl)chk=false;
    if(bl&&chk)continue;
    if(bl){if(cur&&cur.para&&cur.bold){addTo(cur,bl[1]);continue;}
      if(NOTHING.test(txt(bl[1])))continue;
      var bf=bl[1].match(/^\*\*(.+?)\*\*\s*(.*)$/);if(bf&&isField(bf[1],bf[2],bf[1]+(/^:/.test(bf[2])?':':'')+'')){addField(bl[1]);continue;}
      var b2=bl[1].match(/^\*\*(.+?)\*\*[:.]?\s*(.*)$/),c2=open(b2?txt(b2[1]).replace(/[.:]$/,''):NB.clip(NB.firstSentence(txt(bl[1])),140),bl[1],false);
      addTo(c2,b2?b2[2]:bl[1]);flush();continue;}
    if(bold&&CHECK.test(txt(bold[1]))){flush();chk=true;continue;}
    if(bold&&isField(bold[1],bold[2],bold[1]+(/^:/.test(bold[2])?':':''))){addField(line);continue;}
    if(bold&&!/^\*\*[^*]*:\*\*$/.test(line)){var c3=open(txt(bold[1]).replace(/[.:]$/,''),line,true);c3.bold=true;if(bold[2])addTo(c3,bold[2]);continue;}
    if(weekly&&!cur){addTo(secDoc,line);continue;}
    if(cur&&cur.bold){addTo(cur,line);continue;}
    if(CHECK.test(txt(line))&&txt(line).length<90){flush();chk=true;continue;}
    if(NOTHING.test(txt(line))||/^more detail on/i.test(txt(line)))continue;
    var c4=open('',line,true);addTo(c4,line);}
  endSec();}
/* ---------- index ---------- */
var IX=null; /* {gen, docs, vocab:[sorted], post:{tok:[docIdx]}, latest} */
/* threads and Peer Intelligence (cu.js, from data/stories.json and data/peer_intel.json) are added at load time,
   never stored, so they follow those files; IX.docs stays the day documents that the topic pages read */
var EXT=[],TT={};
/* events (events.js, data/events.json) join the same way; an event opens #/event/<id> */
function extLoad(){var a=window.NBCU&&NBCU.searchDocs?NBCU.searchDocs():null,b=window.NBEV&&NBEV.searchDocs?NBEV.searchDocs().catch(function(){return [];}):null;if(!a&&!b)return Promise.resolve(false);
  return Promise.all([a||[],b||[]]).then(function(v){return (v[0]||[]).concat(v[1]||[]);}).then(function(L){var out=[];(L||[]).forEach(function(o){var tg=o.tg;delete o.tg;push(out,o,{companies:(tg&&tg.companies)||[],regulators:(tg&&tg.regulators)||[],topics:(tg&&tg.topics)||[]});});
    EXT=out;try{TT=NBCU.threadTitles()||{};}catch(e){TT={};}if(IX&&IX.pack)compile(IX.pack);return !!out.length;}).catch(function(){return false;});}
function compile(pack){var day=pack.docs,docs=day.concat(EXT),post={};
  docs.forEach(function(d,i){var tt={},all={};toks(d.t).forEach(function(t){tt[t]=1;all[t]=1;});
    d.tg.stage=d.lc&&LCN[d.lc]?[d.lc]:[];d.tg.thread=d.sid?['thread']:[];
    if(d.sn)toks(d.sn).forEach(function(t){all[t]=1;});
    if(d.sr)d.sr.forEach(function(id){if(TT[id])toks(TT[id]).forEach(function(t){all[t]=1;});});
    (d.w||'').split(' ').forEach(function(t){if(t)all[t]=1;});
    ['companies','regulators','topics'].forEach(function(g){(d.tg[g]||[]).forEach(function(s){toks(label(g,s)+' '+s).forEach(function(t){all[t]=1;});});});
    d._tt=tt;d._t=flat(d.t);d._b=flat(d.b);
    for(var t in all){(post[t]||(post[t]=[])).push(i);}});
  var latest=docs.reduce(function(a,d){return d.k!=='Event'&&d.d>a?d.d:a;},''); /* events can be dated ahead; the newest edition stays the anchor */
  IX={pack:pack,all:docs,gen:pack.gen,docs:day,post:post,vocab:Object.keys(post).sort(),latest:latest,n:pack.n,ms:pack.ms,bytes:pack.bytes};return IX;}
function prefix(tok){var V=IX.vocab,lo=0,hi=V.length;while(lo<hi){var m=(lo+hi)>>1;if(V[m]<tok)lo=m+1;else hi=m;}
  var r=[];for(var i=lo;i<V.length&&V[i].lastIndexOf(tok,0)===0&&r.length<400;i++)r.push(V[i]);return r;}
/* IndexedDB, with a quiet no-op when it is unavailable (private mode) */
function idb(){return new Promise(function(res,rej){if(!window.indexedDB)return rej(0);var q=indexedDB.open(DBN,1);
  q.onupgradeneeded=function(){q.result.createObjectStore('ix');};q.onsuccess=function(){res(q.result);};q.onerror=function(){rej(0);};});}
function idbGet(){return idb().then(function(db){return new Promise(function(res){var g=db.transaction('ix').objectStore('ix').get('v');g.onsuccess=function(){res(g.result||null);};g.onerror=function(){res(null);};});}).catch(function(){return null;});}
function idbPut(v){return idb().then(function(db){db.transaction('ix','readwrite').objectStore('ix').put(v,'v');}).catch(function(){});}
function getJSON(u){return fetch(u).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();});}
function pool(items,n,fn,prog){var i=0,done=0,res=new Array(items.length);
  return new Promise(function(ok){if(!items.length)return ok(res);function next(){if(i>=items.length)return;var k=i++;
    fn(items[k]).then(function(v){res[k]=v;},function(){res[k]=null;}).then(function(){done++;if(prog)prog(done,items.length);if(done===items.length)ok(res);else next();});}
    for(var j=0;j<Math.min(n,items.length);j++)next();});}
var building=null;
function ensure(prog){if(building)return building;
  building=Promise.all([getJSON('/data/latest.json').catch(function(){return null;}),idbGet()]).then(function(a){var j=a[0],c=a[1];
    var gen=j?j.generated:(c?c.gen:NB.M.generated);if(j&&j.tag_labels)LABELS=j.tag_labels;else if(c&&c.labels)LABELS=c.labels;
    var fresh=c&&c.v===IDXV&&c.gen===gen;
    if(c&&c.v===IDXV){compile(c);IX.stale=!fresh;if(fresh||!j)return IX;}
    var t0=performance.now();
    var pre=j&&typeof j.search_index==='string'?getJSON('/data/'+j.search_index.replace(/^.*\//,'')).then(function(p){if(!p||p.v!==IDXV||!Array.isArray(p.docs))throw 0;return p.docs;}):Promise.reject(0);
    return pre.catch(function(){
      var ids=j?(j.days||[]).map(function(d){return d.id;}):NB.ownDays();
      return pool(ids,4,function(id){if(j&&j.today&&j.today.id===id)return Promise.resolve(j.today);var m=NB.M.byId[id];
        if(m&&!m.stub&&(NB.M.source!=='data.js'||NB.legacyOK))return Promise.resolve(m);return getJSON('/data/'+id+'.json');},function(d,n){if(prog)prog(d,n);})
        .then(function(days){var docs=[];days.forEach(function(d){if(d&&d.id)docs.push.apply(docs,docsOf(d));});return docs;});
    }).then(function(docs){var ms=Math.round(performance.now()-t0),pack={v:IDXV,gen:gen,docs:docs,labels:LABELS,n:(j?j.days.length:0),ms:ms};
      pack.bytes=JSON.stringify(docs).length;idbPut(pack);var was=IX;compile(pack);IX.stale=false;IX.rebuilt=!!was;return IX;});
  }).then(function(x){building=null;return x;},function(e){building=null;throw e;});
  return building;}
/* ---------- query ---------- */
function run(q,f){if(!IX)return [];var qt=toks(q),docs=IX.all,cand=null;
  qt.forEach(function(tk){var alts=ALIAS[tk]||[tk],set={};
    alts.forEach(function(a){(a.length<2&&!/\d/.test(a)?(IX.post[a]?[a]:[]):prefix(a)).forEach(function(v){IX.post[v].forEach(function(i){set[i]=1;});});});
    if(cand===null)cand=set;else{var n={};for(var i in cand)if(set[i])n[i]=1;cand=n;}});
  var list=cand===null?docs.map(function(_,i){return i;}):Object.keys(cand).map(Number);
  list=list.filter(function(i){var d=docs[i];return GROUPS.every(function(G){var sel=f[G[2]];if(!sel||!sel.length)return true;var have=d.tg[G[0]]||[];
    return sel.some(function(s){return have.indexOf(s)>=0;});});});
  var lat=IX.latest?NB.dt(IX.latest):null,qf=flat(q);
  var res=list.map(function(i){var d=docs[i],s=0;
    qt.forEach(function(tk){var alts=ALIAS[tk]||[tk],best=0;alts.forEach(function(a){
      if(d._tt[a])best=Math.max(best,6);else if(Object.keys(d._tt).some(function(t){return t.lastIndexOf(a,0)===0;}))best=Math.max(best,4);
      else if(d._b.indexOf(a)>=0)best=Math.max(best,2);else best=Math.max(best,1);});s+=best;});
    if(qt.length>1&&qf){if(d._t.indexOf(qf)>=0)s+=8;else if(d._b.indexOf(qf)>=0)s+=4;}
    if(d.k==='Story'||d.k==='Circular'||d.k==='MFL'||d.k==='Peer intel')s+=1.5;if(d.k==='Thread'&&qt.length&&qt.some(function(t){return d._tt[t];}))s+=8;if(d.k==='News'||d.k==='Rules'||d.k==='Weekly'&&/summary|numbers/i.test(d.s))s-=.5;
    var age=lat?Math.max(0,(lat-NB.dt(d.d))/864e5):0;s=qt.length?s*(1+.8*Math.exp(-age/14)):-age;
    return {d:d,s:s};});
  res.sort(function(a,b){return b.s-a.s||(a.d.d<b.d.d?1:a.d.d>b.d.d?-1:0);});return res;}
function rx(q){var qt=toks(q),alts=[];qt.forEach(function(t){(ALIAS[t]||[t]).forEach(function(a){alts.push(a.replace(/[^a-z0-9]/g,''));});});
  alts=alts.filter(Boolean).sort(function(a,b){return b.length-a.length;});return alts.length?new RegExp('\\b('+alts.join('|')+')[a-z0-9]*','gi'):null;}
function hi(s,re){s=String(s);if(!re)return esc(s);var out='',last=0,m;re.lastIndex=0;
  while((m=re.exec(s))){out+=esc(s.slice(last,m.index))+'<mark>'+esc(m[0])+'</mark>';last=m.index+m[0].length;if(!m[0].length)re.lastIndex++;}
  return out+esc(s.slice(last));}
/* summaries flattened from tables are tidied by cu.js before they are shown (the index keeps the raw text for matching) */
function cs(b){try{return window.NBCU&&NBCU.cleanSum?NBCU.cleanSum(b):b;}catch(e){return b;}}
function snip(b,re,n){n=n||170;if(!b)return '';var p=0;if(re){re.lastIndex=0;var m=re.exec(b);if(m)p=m.index;}
  var st=Math.max(0,p-50);if(st>0){var sp=b.indexOf(' ',st);if(sp>0&&sp<p)st=sp+1;}
  var s=b.slice(st,st+n);if(st+n<b.length)s=s.replace(/\s+\S*$/,'')+'…';return (st>0?'…':'')+s;}
/* ---------- view ---------- */
var ST={q:'',f:{tp:[],rg:[],co:[],st:[],th:[]},more:false,shown:40,y:0,lastKey:''};
function readQs(qs){var p=new URLSearchParams(qs||'');ST.q=p.get('q')||'';GROUPS.forEach(function(G){ST.f[G[2]]=(p.get(G[2])||'').split(',').filter(Boolean);});}
function qsNow(){var p=[];if(ST.q)p.push('q='+encodeURIComponent(ST.q));GROUPS.forEach(function(G){if(ST.f[G[2]].length)p.push(G[2]+'='+ST.f[G[2]].map(encodeURIComponent).join(','));});return p.join('&');}
var ICO='<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.6" cy="8.6" r="5.4"/><path d="M12.6 12.6l4.4 4.4"/></svg>';
function html(qs){readQs(qs);var n=NB.M.days.length;
  return '<header class="hd sx-hd" data-st="h"><p class="greet">Search</p><h1>Search editions</h1><p class="hsub" id="sxMeta">'+n+' editions · stories, circulars, threads, peer results, weekly</p></header>'+
  '<div class="sx-bar" data-st><form class="sx-f g" role="search" id="sxF" action="#"><label class="sr" for="sxq">Search all editions</label>'+ICO+
  '<input id="sxq" type="search" enterkeyhint="search" inputmode="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Gold loan, NCD, Muthoot…" value="'+esc(ST.q)+'" aria-describedby="sxCnt" aria-controls="sxRes">'+
  '<button type="button" class="sx-x press" id="sxX" aria-label="Clear search"'+(ST.q?'':' hidden')+'>×</button></form></div>'+
  '<div class="sx-fl" id="sxFl" data-st></div>'+
  '<p class="sx-cnt" id="sxCnt" role="status" aria-live="polite" aria-atomic="true"></p>'+
  '<ol class="sx-res" id="sxRes" aria-label="Search results"></ol><div id="sxMore"></div>';}
function counts(){var c={tp:{},rg:{},co:{},st:{},th:{}};if(!IX)return c;IX.all.forEach(function(d){GROUPS.forEach(function(G){(d.tg[G[0]]||[]).forEach(function(s){c[G[2]][s]=(c[G[2]][s]||0)+1;});});});return c;}
function filtersHtml(){var cn=counts();
  return GROUPS.map(function(G){var g=G[0],k=G[2],prim=PRIMARY[g].slice(),sel=ST.f[k];
    if(g==='companies'||g==='stage'||g==='thread'){prim=prim.filter(function(s){return cn[k][s]||sel.indexOf(s)>=0;});}
    var extra=Object.keys(cn[k]).filter(function(s){return prim.indexOf(s)<0;}).sort(function(a,b){return cn[k][b]-cn[k][a]||(a<b?-1:1);});
    sel.forEach(function(s){if(prim.indexOf(s)<0&&extra.indexOf(s)<0)extra.unshift(s);});
    if(g==='stage'||g==='thread')extra=[];
    var showX=ST.more?extra:extra.filter(function(s){return sel.indexOf(s)>=0;});
    if(!prim.length&&!showX.length&&!extra.length)return '';
    function pill(s){var on=sel.indexOf(s)>=0;return '<button type="button" class="sx-p press" data-g="'+k+'" data-s="'+esc(s)+'" aria-pressed="'+on+'">'+esc(label(g,s))+(cn[k][s]?'<span class="sx-n num" aria-hidden="true">'+cn[k][s]+'</span>':'')+'</button>';}
    return '<div class="sx-g" role="group" aria-label="'+G[1]+'"><span class="sx-gl" aria-hidden="true">'+G[1]+'</span><div class="sx-row fx-sc">'+prim.concat(showX).map(pill).join('')+
      (extra.length&&!ST.more?'<button type="button" class="sx-p sx-more press" data-more="1" aria-expanded="false">More <span aria-hidden="true">+'+extra.length+'</span></button>':'')+'</div></div>';}).join('')+
    (ST.more?'<button type="button" class="sx-less press" data-more="0" aria-expanded="true">Fewer filters</button>':'')+
    (anyF()?'<button type="button" class="sx-less press" data-clear="1">Clear filters</button>':'');}
function anyF(){return GROUPS.some(function(G){return ST.f[G[2]].length;});}
function row(r,re,i){var d=r.d,tg=[];GROUPS.forEach(function(G){(d.tg[G[0]]||[]).slice(0,3).forEach(function(s){if(G[0]!=='topics'||tg.length<4)tg.push(label(G[0],s));});});
  return '<li class="sx-r" style="--i:'+i+'"><a class="sx-a press" href="'+esc(d.h+(d.h.indexOf('?')>=0?'&':'?')+'from=search')+'"><span class="sx-m"><span class="num">'+esc(NB.shortDay(d.d))+'</span><span class="sx-k">'+esc(d.k)+'</span><span class="sx-s">'+esc(d.s.replace(/^.*? · /,''))+'</span></span>'+
    '<span class="sx-t">'+hi(d.t,re)+'</span>'+(d.b&&cs(d.b)?'<span class="sx-b">'+hi(snip(cs(d.b),re),re)+'</span>':'')+
    '<span class="sx-f2">'+(d.src&&d.src.l?'<span class="sx-src">'+esc(d.src.l)+'</span>':'')+(tg.length?'<span class="sx-tg">'+tg.map(esc).join(' · ')+'</span>':'')+'</span></a></li>';}
var root=null,inp=null,deb=0,lastRes=[];
function render(more){if(!root||!root.isConnected)return;var res=document.getElementById('sxRes'),cnt=document.getElementById('sxCnt'),mb=document.getElementById('sxMore');
  if(!IX){cnt.textContent='Building the search index…';res.innerHTML='';mb.innerHTML='';return;}
  var hasQ=toks(ST.q).length>0;
  if(!hasQ&&!anyF()){lastRes=[];var rc=recent();cnt.textContent='Search '+IX.all.length.toLocaleString('en-IN')+' items across '+NB.M.days.length+' editions.';
    res.innerHTML='';mb.innerHTML='<div class="sx-empty">'+(rc.length?'<p class="sx-gl">Recent</p><div class="sx-row">'+rc.map(function(x){return '<a class="sx-p press" href="#/search?'+esc(x)+'">'+esc(recLabel(x))+'</a>';}).join('')+'</div>':'')+
      '<p class="sx-gl">Try</p><div class="sx-row">'+['gold loan','NCD','Muthoot','repo','rating'].map(function(x){return '<a class="sx-p press" href="#/search?q='+encodeURIComponent(x)+'">'+esc(x)+'</a>';}).join('')+'</div></div>';return;}
  var key=ST.q+'|'+qsNow();if(!more){lastRes=run(ST.q,ST.f);ST.shown=40;}
  var re=rx(ST.q),n=lastRes.length,sl=lastRes.slice(0,ST.shown);
  cnt.textContent=n?(n.toLocaleString('en-IN')+' result'+(n===1?'':'s')+(ST.q?' for \u201c'+ST.q.trim()+'\u201d':'')+(anyF()?' · filtered':'')):'No results'+(ST.q?' for \u201c'+ST.q.trim()+'\u201d':'');
  res.innerHTML=sl.map(function(r,i){return row(r,re,i);}).join('');
  mb.innerHTML=n>ST.shown?'<button type="button" class="cta ghost press sx-mb" data-showmore="1">Show more ('+(n-ST.shown)+')</button>':
    (!n?'<div class="g card sx-none"><h2>Nothing matched</h2><p>Try fewer words, a shorter word (prefixes match: \u201cmuth\u201d finds Muthoot), or clear the filters.</p></div>':'');
  if(!more&&key!==ST.lastKey){ST.lastKey=key;stagger(res);}}
function stagger(res){if(NB.RM.matches||!res.animate)return;var sp=NB.SPRINGS.Snappy||NB.SPRINGS.Quick;
  [].slice.call(res.children,0,10).forEach(function(li,i){li.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:sp.ms,easing:sp.easing,delay:i*NB.STAGGER,fill:'backwards'});});}
function recent(){try{return JSON.parse(localStorage.getItem(RKEY)||'[]');}catch(e){return [];}}
function recLabel(x){var p=new URLSearchParams(x),l=[p.get('q')||''];GROUPS.forEach(function(G){(p.get(G[2])||'').split(',').filter(Boolean).forEach(function(s){l.push(label(G[0],s));});});return l.filter(Boolean).join(' · ');}
function remember(){var x=qsNow();if(!x)return;var r=recent().filter(function(y){return y!==x;});r.unshift(x);try{localStorage.setItem(RKEY,JSON.stringify(r.slice(0,6)));}catch(e){}}
function sync(){var x=qsNow();history.replaceState(history.state,'','#/search'+(x?'?'+x:''));NB.searchQs=x;}
function mount(nv,qs,focus){root=nv;inp=nv.querySelector('#sxq');readQs(qs);var fl=nv.querySelector('#sxFl'),meta=nv.querySelector('#sxMeta');
  function paintF(){fl.innerHTML=filtersHtml();}
  paintF();render();
  if(!IX||IX.stale){var t0=performance.now();ensure(function(d,n){var c=document.getElementById('sxCnt');if(c&&!IX)c.textContent='Building the search index… '+d+' of '+n+' editions';})
    .then(function(){if(!root.isConnected)return;meta.textContent=NB.M.days.length+' editions · '+IX.docs.length.toLocaleString('en-IN')+' items'+(IX.ms!=null&&IX.rebuilt!==undefined?'':'');
      NB.lastBuild={ms:Math.round(performance.now()-t0),docs:IX.docs.length,bytes:IX.bytes,gen:IX.gen};paintF();render();})
    .catch(function(){var c=document.getElementById('sxCnt');if(c)c.textContent='Search needs the editions once online. Connect and try again.';});}
  else meta.textContent=NB.M.days.length+' editions · '+IX.docs.length.toLocaleString('en-IN')+' items';
  inp.addEventListener('input',function(){ST.q=inp.value;document.getElementById('sxX').hidden=!inp.value;clearTimeout(deb);deb=setTimeout(function(){sync();render();},90);});
  inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();clearTimeout(deb);sync();render();remember();if(matchMedia('(pointer:coarse)').matches)inp.blur();}
    else if(e.key==='ArrowDown'){var a=root.querySelector('.sx-a');if(a){e.preventDefault();a.focus();}}
    else if(e.key==='Escape'&&inp.value){e.preventDefault();inp.value='';ST.q='';sync();render();document.getElementById('sxX').hidden=true;}});
  nv.querySelector('#sxF').addEventListener('submit',function(e){e.preventDefault();});
  nv.addEventListener('click',function(e){var b=e.target.closest('button,a.sx-a');if(!b||!root.contains(b))return;
    if(b.id==='sxX'){inp.value='';ST.q='';b.hidden=true;sync();render();inp.focus();return;}
    if(b.dataset.g){var arr=ST.f[b.dataset.g],s=b.dataset.s,ix=arr.indexOf(s);if(ix>=0)arr.splice(ix,1);else arr.push(s);sync();paintF();render();
      var nb=fl.querySelector('[data-g="'+b.dataset.g+'"][data-s="'+CSS.escape(s)+'"]');if(nb)nb.focus();return;}
    if(b.dataset.more){ST.more=b.dataset.more==='1';paintF();var f=fl.querySelector(ST.more?'.sx-less':'.sx-more');if(f)f.focus();return;}
    if(b.dataset.clear){GROUPS.forEach(function(G){ST.f[G[2]]=[];});sync();paintF();render();inp.focus();return;}
    if(b.dataset.showmore){ST.shown+=40;render(true);var a=root.querySelectorAll('.sx-a')[ST.shown-40];if(a)a.focus();return;}
    if(b.classList.contains('sx-a')){ST.y=scrollY;remember();}});
  nv.addEventListener('keydown',function(e){var a=e.target.closest&&e.target.closest('.sx-a');if(!a)return;var all=[].slice.call(root.querySelectorAll('.sx-a')),i=all.indexOf(a);
    if(e.key==='ArrowDown'&&all[i+1]){e.preventDefault();all[i+1].focus();}else if(e.key==='ArrowUp'){e.preventDefault();(all[i-1]||inp).focus();}
    else if(e.key==='Escape'){e.preventDefault();inp.focus();}});
  /* threads and Peer Intelligence join the index once their files are in (cached offline after one visit) */
  (IX&&!IX.stale?Promise.resolve(IX):ensure()).then(function(){return EXT.length?false:extLoad();}).then(function(ch){if(ch&&root===nv&&nv.isConnected){paintF();render();}}).catch(function(){});
  if(focus)inp.focus({preventScroll:true});
  else if(ST.y&&NB.searchBack){scrollTo(0,ST.y);}}
window.NBSearch={html:html,mount:mount,ensure:ensure,run:function(q,f){return run(q,f||{tp:[],rg:[],co:[],st:[],th:[]});},extLoad:extLoad,ix:function(){return IX;},docsOf:docsOf,label:label};
})();
