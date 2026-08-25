// ── STATE ───────────────────────────────────────────────
var APP_VERSION = '2026.08.25.214406';
var events=[], editIdx=-1, iCount=0, scenName='', scenDesc='', appMode='timeline';
var selectedEventId=null; // _id of currently selected/highlighted event
var diagramZoom=1.0;
var timelineCompact = true;
var timelineReverse = localStorage.getItem('weave-timeline-reverse')==='1';
var diagramVSlider = parseFloat(localStorage.getItem('weave-vslider'))||1.0;
var diagramHSlider = parseFloat(localStorage.getItem('weave-hslider'))||1.0;
var sysOrder={}; // { systemName: orderNumber } — lower = earlier in diagram
var systemsRegistry=[]; // [{name,desc,order}]
var actorsRegistry=[];  // [{name,desc}]
var FIXED_LEVELS=['info','warning','error','debug','comment','work_note','other'];
var LEVEL_LABELS={info:'Info',warning:'Warning',error:'Error',debug:'Debug',comment:'Comment',work_note:'Work Note',other:'Other'};
var levelsRegistry=FIXED_LEVELS.slice(); // fixed event levels
function normalizeLevel(val){var v=(val||'').toString().trim().toLowerCase();if(!v)return '';return FIXED_LEVELS.indexOf(v)!==-1?v:'other';}
var knownSys=new Set();
var displayConfig={showLevel:true,showEventCode:true,showManagedIntegrationCode:true,showActor:true,showDate:true,showSeq:true,
  dateFormat:localStorage.getItem('weave-date-format')||'YYYY-MM-DD',
  timeFormat:localStorage.getItem('weave-time-format')||'HH:mm:ss'};
var filterConfig={text:'',systems:[],actors:[],levels:[],eventCodes:[],integrationCodes:[],showRelated:true};
var COLORS_L=['#e8604a','#3cbfbf','#f5a623','#7755cc','#c04535','#2a9d8f','#e76f51'];
var COLORS_D=['#f07060','#45d0d0','#f5b030','#8888cc','#e05050','#35b8b8','#f09070'];
function COLORS_ARR(){return document.documentElement.classList.contains('dark')?COLORS_D:COLORS_L;}

// THEME-AWARE SVG COLORS
function svgColors(){
  var dark=document.documentElement.classList.contains('dark');
  return {
    bg:       dark?'#13111e':'#fdf3e3',
    nodeFill: dark?'#1c1a2e':'#fff8f0',
    laneAlt:  dark?'rgba(240,112,96,0.04)':'rgba(232,96,74,0.03)',
    grid:     dark?'#2a2545':'#e8c990',
    label:    dark?'#a8a0cc':'#7a5c3a',
    desc:     dark?'#e8e2ff':'#5a3e28',
    listBg:   dark?'#1c1a2e':'#fff8f0',
    listBdr:  dark?'#3a3560':'#e8c990',
    listTs:   dark?'#7870aa':'#b08050',
    listDesc: dark?'#ccc8e8':'#3d2b1a',
    listSys:  dark?'#a8a0cc':'#7a5c3a',
    listInt:  dark?'#7870aa':'#b08050',
    tableDesc:dark?'#9e96c8':'#8a6a4a',  // softer description colour for table mode
    accent:   dark?'#f07060':'#e8604a',
    teal:     dark?'#45d0d0':'#3cbfbf',
    proc:     dark?'#8888dd':'#1c8080',
    actor:    dark?'#fff':'#5a3e28',
    debug:    dark?'#99aacc':'#5566aa',
    subRowBg: dark?'rgba(30,26,50,.6)':'rgba(255,248,240,.9)',
    cmnt:     dark?'#60a8d0':'#2880b8',
    note:     dark?'#d4a060':'#9a6c30',
    hlSel:    dark?'#ffe066':'#f5b800',   // selected event highlight (yellow/gold)
    hlRel:    dark?'#80e8b0':'#22b566',   // related target/origin event highlight (green)
  };
}

// TIMEZONE
var _displayTZ='';
function getDisplayTZ(){
  if(!_displayTZ){
    var stored=localStorage.getItem('weave-timezone');
    _displayTZ=stored||(Intl&&Intl.DateTimeFormat?Intl.DateTimeFormat().resolvedOptions().timeZone:'')||'UTC';
  }
  return _displayTZ;
}
// Returns the offset in ms between UTC and the given timezone at the given UTC date.
// Positive means the TZ is behind UTC (e.g. UTC-5 → +18000000).
function _tzOffsetMs(utcDate,tz){
  var parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(utcDate);
  var p={}; parts.forEach(function(pt){p[pt.type]=pt.value;});
  var tzAsUTC=new Date(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');
  return utcDate.getTime()-tzAsUTC.getTime();
}

// UTILS
function toast(msg,icon){
  document.getElementById('tmsg').textContent=msg;
  document.getElementById('ticon').textContent=icon||'\u2713';
  var t=document.getElementById('toast'); t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},3000);
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function initials(s){return (s||'?').split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,3);}
function trunc(s,n){s=s||'';return s.length>n?s.slice(0,n-1)+'\u2026':s;}
// Format a UTC ms timestamp for display using the currently selected timezone and format options.
function fmtTs(ms,showDate){
  var tz=getDisplayTZ();
  var df=displayConfig.dateFormat||'YYYY-MM-DD';
  var tf=displayConfig.timeFormat||'HH:mm:ss';
  var d=new Date(ms);
  var parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
  var p={}; parts.forEach(function(pt){p[pt.type]=pt.value;});
  // Month abbreviation for named-month formats
  var mabbr='';
  if(df==='DD MMM YYYY'||df==='MMM DD, YYYY'){
    var mparts=new Intl.DateTimeFormat('en-US',{timeZone:tz,month:'short'}).formatToParts(d);
    mparts.forEach(function(pt){if(pt.type==='month') mabbr=pt.value;});
  }
  // Build date string
  var dateStr;
  if(df==='MM/DD/YYYY') dateStr=p.month+'/'+p.day+'/'+p.year;
  else if(df==='DD/MM/YYYY') dateStr=p.day+'/'+p.month+'/'+p.year;
  else if(df==='DD MMM YYYY') dateStr=p.day+' '+mabbr+' '+p.year;
  else if(df==='MMM DD, YYYY') dateStr=mabbr+' '+p.day+', '+p.year;
  else dateStr=p.year+'-'+p.month+'-'+p.day;
  // Build time string
  var timeStr, h24=parseInt(p.hour,10), ampm, h12;
  if(tf==='h:mm:ss a'||tf==='h:mm a'){
    ampm=h24>=12?'pm':'am'; h12=h24%12||12;
    timeStr=tf==='h:mm a'?(h12+':'+p.minute+' '+ampm):(h12+':'+p.minute+':'+p.second+' '+ampm);
  }else if(tf==='HH:mm'){
    timeStr=p.hour+':'+p.minute;
  }else{
    timeStr=p.hour+':'+p.minute+':'+p.second;
  }
  return showDate?dateStr+' '+timeStr:timeStr;
}
// Interpret a datetime-local string as a wall-clock time in the display timezone and return UTC ms.
function fromDTL(v){
  if(!v) return null;
  var tz=getDisplayTZ();
  if(tz==='UTC') return new Date(v+'Z').getTime();
  // First-pass: treat the string as UTC to get a rough epoch for offset lookup
  var approx=new Date(v+'Z');
  var off1=_tzOffsetMs(approx,tz);
  // Second-pass: apply the offset to get a better epoch, then recompute (handles DST boundary)
  var off2=_tzOffsetMs(new Date(approx.getTime()+off1),tz);
  return approx.getTime()+off2;
}
// Convert a UTC ISO string to a datetime-local value showing the time in the display timezone.
function toDTL(iso){
  if(!iso) return '';
  var d=new Date(iso);
  var tz=getDisplayTZ();
  var parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
  var p={}; parts.forEach(function(pt){p[pt.type]=pt.value;});
  return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second;
}

// SYSTEM ARRAY — sorted by sysOrder, then alphabetically
function getSysArray(sySet){
  var arr=[...sySet];
  arr.sort(function(a,b){
    var oa=sysOrder[a]!==undefined?sysOrder[a]:9999;
    var ob=sysOrder[b]!==undefined?sysOrder[b]:9999;
    if(oa!==ob) return oa-ob;
    return a<b?-1:a>b?1:0;
  });
  return arr;
}

// ENSURE IDS
function ensureIds(){events.forEach(function(ev,i){if(!ev._id) ev._id='evt-'+Date.now()+'-'+i;});}

// Find index in events[] by _id
function findEventByIdIdx(id){for(var i=0;i<events.length;i++){if(events[i]._id===id) return i;}return -1;}

// ACTIVE (FILTERED) EVENTS
function _matchesFilter(ev){
  var q=(filterConfig.text||'').trim().toLowerCase();
  if(q){
    var hay=[ev.desc,ev.system,ev.actor,ev.eventCode,ev.managedIntegrationCode,ev.level].join(' ').toLowerCase();
    if(hay.indexOf(q)===-1) return false;
  }
  if(filterConfig.systems.length&&filterConfig.systems.indexOf(ev.system)===-1) return false;
  if(filterConfig.actors.length&&filterConfig.actors.indexOf(ev.actor||'')===-1) return false;
  if(filterConfig.levels.length&&filterConfig.levels.indexOf(ev.level||'')===-1) return false;
  if(filterConfig.eventCodes.length&&filterConfig.eventCodes.indexOf(ev.eventCode||'')===-1) return false;
  if(filterConfig.integrationCodes.length&&filterConfig.integrationCodes.indexOf(ev.managedIntegrationCode||'')===-1) return false;
  return true;
}
function getActiveEvents(){
  if(!isFilterActive()) return events.slice();
  var matched=events.filter(_matchesFilter);
  if(!filterConfig.showRelated) return matched;
  // Expand with related events: events linked via interactions to/from matched events
  var matchedIds=new Set(matched.map(function(ev){return ev._id;}));
  // Build a map of all events by _id for fast lookup
  var evMap={};
  events.forEach(function(ev){evMap[ev._id]=ev;});
  // Build set of related IDs: for each matched event, add its interaction targets (by triggerEventId)
  // and also add any event that has an interaction pointing to a matched event
  var relatedIds=new Set();
  events.forEach(function(ev){
    (ev.interactions||[]).forEach(function(inter){
      if(inter.triggerEventId){
        // ev → triggerEventId: if either end is matched, include the other
        if(matchedIds.has(ev._id)) relatedIds.add(inter.triggerEventId);
        if(matchedIds.has(inter.triggerEventId)) relatedIds.add(ev._id);
      }
    });
  });
  // Merge matched + related (preserving original order)
  var result=[];
  events.forEach(function(ev){
    if(matchedIds.has(ev._id)||(relatedIds.has(ev._id)&&evMap[ev._id])) result.push(ev);
  });
  return result;
}
function isFilterActive(){
  return !!(filterConfig.text.trim()||filterConfig.systems.length||filterConfig.actors.length||
    filterConfig.levels.length||filterConfig.eventCodes.length||filterConfig.integrationCodes.length);
}
