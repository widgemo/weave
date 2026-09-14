// ── UI: BANNER & SIDEBAR CHROME ─────────────────────────

// FILE MENU (navbar)
function fileMenuClick(){
  var menu=document.getElementById('file-menu');
  if(!menu) return;
  if(menu.style.display==='block'){
    fileMenuClose();
  } else {
    menu.style.display='block';
  }
}
function fileMenuClose(){
  var menu=document.getElementById('file-menu');
  if(menu) menu.style.display='none';
}


// THEME TOGGLE
function toggleTheme(){
  var isDark=document.documentElement.classList.toggle('dark');
  document.getElementById('theme-icon-sun').style.display=isDark?'none':'block';
  document.getElementById('theme-icon-moon').style.display=isDark?'block':'none';
  localStorage.setItem('weave-theme',isDark?'dark':'light');
  render();
}
function applyStoredTheme(){
  var t=localStorage.getItem('weave-theme')||'dark';
  if(t==='light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
  document.getElementById('theme-icon-sun').style.display=t==='dark'?'none':'block';
  document.getElementById('theme-icon-moon').style.display=t==='dark'?'block':'none';
}


// LEGEND TOGGLE
function updateLegendColors(){
  var c=svgColors();
  var lp=document.getElementById('leg-push');
  var ll=document.getElementById('leg-pull');
  var lc=document.getElementById('leg-proc');
  if(lp) lp.style.borderColor=c.accent;
  if(ll) ll.style.borderColor=c.teal;
  if(lc) lc.style.borderColor=c.proc;
  // Task 1: force-hide legend in table mode
  var leg=document.getElementById('diagram-legend');
  if(!leg) return;
  leg.classList.toggle('legend-table-hidden', appMode==='table');
  // Task 2: dim legend when no interactions are rendered (timeline/flow only)
  if(appMode!=='table'){
    var active=getActiveEvents();
    var hasInteractions=active.some(function(ev){return (ev.interactions||[]).some(function(i){return i.target;});});
    leg.classList.toggle('legend-dim', !hasInteractions);
  } else {
    leg.classList.remove('legend-dim');
  }
}
function toggleLegend(){
  var leg=document.getElementById('diagram-legend');
  var btn=document.getElementById('legend-toggle-btn');
  var hidden=leg.classList.toggle('legend-hidden');
  btn.classList.toggle('active',!hidden);
  localStorage.setItem('weave-legend-hidden',hidden?'1':'0');
}
function initLegend(){
  var hidden=localStorage.getItem('weave-legend-hidden')==='1';
  var leg=document.getElementById('diagram-legend');
  var btn=document.getElementById('legend-toggle-btn');
  leg.classList.toggle('legend-hidden',hidden);
  btn.classList.toggle('active',!hidden);
  updateLegendColors();
}


// MODE SWITCH
function switchAppMode(m){
  appMode=m;
  document.getElementById('banner-tab-timeline').classList.toggle('active',m==='timeline');
  document.getElementById('banner-tab-flow').classList.toggle('active',m==='flow');
  document.getElementById('banner-tab-table').classList.toggle('active',m==='table');
  document.getElementById('ts-fg').classList.toggle('hidden',m==='flow');
  document.getElementById('tl-ctrl').style.display=m==='timeline'?'flex':'none';
  document.getElementById('fl-ctrl').style.display=m==='flow'?'flex':'none';
  var zc=document.getElementById('zoom-ctrl');
  if(zc) zc.style.display=(m==='timeline'||m==='flow')?'flex':'none';
  document.getElementById('mode-badge').innerHTML=m==='timeline'
    ?'<span class="mind tl"><span class="mdot"></span>Timeline</span>'
    :m==='table'
      ?'<span class="mind tb"><span class="mdot"></span>Table</span>'
      :'<span class="mind fl"><span class="mdot"></span>Causal Flow</span>';
  document.querySelectorAll('.iblock').forEach(function(b){
    var id=b.dataset.id;
    var dr=document.getElementById('dr-'+id), tr=document.getElementById('tr-'+id);
    if(dr) dr.style.display=m==='flow'?'none':'';
    if(tr) tr.style.display=m==='flow'?'':'none';
  });
  _updateDiagSlidersVisibility();
  render();
}

function switchTab(tab){
  if(tab==='scenario') setTimeout(refreshSysOrderUI,50);
  if(tab==='systems') setTimeout(refreshSystemsUI,50);
  if(tab==='datasource') setTimeout(dsUpdatePanelStatus,50);
  ['add','events','scenario','systems','datasource'].forEach(function(t){
    document.getElementById('stab-'+t).classList.toggle('active',t===tab);
    document.getElementById('panel-'+t).classList.toggle('active',t===tab);
  });
}

// SYSTEM DATALIST
function refreshDL(){
  var sorted=[...knownSys].sort();
  function fill(dl){dl.innerHTML='';sorted.forEach(function(s){var o=document.createElement('option');o.value=s;dl.appendChild(o);});}
  var main=document.getElementById('system-dl'); if(main) fill(main);
  document.querySelectorAll('[id^="tdl-"]').forEach(function(dl){fill(dl);});
}

// EVENT LIST
function updateList(){
  var el=document.getElementById('elist'), n=events.length;
  document.getElementById('ecount').textContent=n+' event'+(n!==1?'s':'');
  if(!n){el.innerHTML='<p class="hint" style="text-align:center;padding:18px 0">No events yet.</p>';return;}
  var sorted=appMode==='timeline'?[...events].sort(function(a,b){return(a.timestamp||0)-(b.timestamp||0);}):events;
  el.innerHTML='';
  sorted.forEach(function(e,si){
    var ri=events.indexOf(e), div=document.createElement('div');
    div.className='eitem'+(ri===editIdx?' sel':'');
    var meta='<span class="etag">'+esc(e.system||'?')+'</span>';
    if(e.level) meta+='<span class="etag elevel-'+esc(e.level)+'">'+(LEVEL_LABELS[e.level]||esc(e.level))+'</span>';
    if(appMode==='timeline'&&e.timestamp) meta+='<span class="etag">'+fmtTs(e.timestamp,false)+'</span>';
    if(appMode==='flow') meta+='<span class="etag">#'+(si+1)+'</span>';
    if(e.actor) meta+='<span class="etag">'+esc(e.actor)+'</span>';
    var dragHandle=appMode==='flow'?'<span class="drag-handle" title="Drag to reorder">&#x2630;</span>':'';
    div.innerHTML='<div class="edesc">'+dragHandle+esc(e.desc)+'</div>'+
      '<div class="emeta">'+meta+'</div>'+
      '<div class="emeta" style="margin-top:3px">'+((e.interactions||[]).length?'↔ '+e.interactions.length+' interaction(s)':'No interactions')+'</div>'+
      '<div class="eacts"><button class="btn btn-g btn-sm" onclick="editEvent('+ri+');event.stopPropagation()">Edit</button>'+
      '<button class="btn btn-d btn-sm" onclick="deleteEvent('+ri+');event.stopPropagation()">Delete</button></div>';
    if(appMode==='flow'){
      div.draggable=true;
      div.dataset.ri=ri;
      div.addEventListener('dragstart',function(ev){ev.dataTransfer.setData('text/plain',String(ri));div.classList.add('dragging');});
      div.addEventListener('dragend',function(){div.classList.remove('dragging');});
      div.addEventListener('dragover',function(ev){ev.preventDefault();div.classList.add('drag-over');});
      div.addEventListener('dragleave',function(){div.classList.remove('drag-over');});
      div.addEventListener('drop',function(ev){
        ev.preventDefault();div.classList.remove('drag-over');
        var fromIdx=parseInt(ev.dataTransfer.getData('text/plain'));
        var toIdx=parseInt(div.dataset.ri);
        if(fromIdx===toIdx||isNaN(fromIdx)||isNaN(toIdx)) return;
        var moved=events.splice(fromIdx,1)[0];
        events.splice(toIdx,0,moved);
        if(editIdx===fromIdx) editIdx=toIdx;
        else if(editIdx>fromIdx&&editIdx<=toIdx) editIdx--;
        else if(editIdx<fromIdx&&editIdx>=toIdx) editIdx++;
        render();updateList();
      });
    }
    div.onclick=function(){editEvent(ri);}; el.appendChild(div);
  });
}


// TIMEZONE SELECTOR
function initTimezone(){
  var tz=localStorage.getItem('weave-timezone')||(Intl&&Intl.DateTimeFormat?Intl.DateTimeFormat().resolvedOptions().timeZone:'')||'UTC';
  _displayTZ=tz;
  var sel=document.getElementById('tz-select');
  if(!sel) return;
  var zones=[];
  try{if(Intl.supportedValuesOf) zones=Intl.supportedValuesOf('timeZone');}catch(e){}
  if(!zones.length) zones=['UTC'];
  sel.innerHTML='';
  zones.forEach(function(z){var o=document.createElement('option');o.value=z;o.textContent=z;sel.appendChild(o);});
  sel.value=tz;
}
function setDisplayTZ(tz){
  _displayTZ=tz;
  localStorage.setItem('weave-timezone',tz);
  render(); updateList();
}
function resetToMyTZ(){
  var myTZ=(Intl&&Intl.DateTimeFormat?Intl.DateTimeFormat().resolvedOptions().timeZone:'')||'UTC';
  _displayTZ=myTZ;
  localStorage.setItem('weave-timezone',myTZ);
  var sel=document.getElementById('tz-select');
  if(sel) sel.value=myTZ;
  render(); updateList();
}

// TIMELINE DIRECTION TOGGLE
function toggleTimelineReverse(){
  timelineReverse=!timelineReverse;
  localStorage.setItem('weave-timeline-reverse',timelineReverse?'1':'0');
  var btn=document.getElementById('tl-reverse-btn');
  if(btn) btn.classList.toggle('active',timelineReverse);
  render();
}
function applyTimelineReverseState(){
  var btn=document.getElementById('tl-reverse-btn');
  if(btn) btn.classList.toggle('active',timelineReverse);
}

// DIAGRAM SLIDERS
function onDiagSlider(){
  var vs=document.getElementById('diag-vslider');
  var hs=document.getElementById('diag-hslider');
  if(vs) diagramVSlider=parseInt(vs.value,10)/100;
  if(hs) diagramHSlider=parseInt(hs.value,10)/100;
  localStorage.setItem('weave-vslider',String(diagramVSlider));
  localStorage.setItem('weave-hslider',String(diagramHSlider));
  render();
}
function initDiagSliders(){
  var vs=document.getElementById('diag-vslider');
  var hs=document.getElementById('diag-hslider');
  if(vs) vs.value=String(Math.round(diagramVSlider*100));
  if(hs) hs.value=String(Math.round(diagramHSlider*100));
  _updateDiagSlidersVisibility();
}
function _updateDiagSlidersVisibility(){
  var hide=appMode==='table';
  var vw=document.getElementById('diag-vslider-wrap');
  var hw=document.getElementById('diag-hslider-wrap');
  if(vw) vw.classList.toggle('diag-slider-hidden',hide);
  if(hw) hw.classList.toggle('diag-slider-hidden',hide);
}

// INIT
document.addEventListener('DOMContentLoaded',function(){
  applyStoredTheme();
  initTimezone();
  switchAppMode('timeline'); refreshDL(); refreshActorDL(); refreshLevelDL(); updateList(); render();
  initLegend();
  applyTimelineReverseState();
  initDiagSliders();
  document.getElementById('dc-level').checked=displayConfig.showLevel;
  document.getElementById('dc-event-code').checked=displayConfig.showEventCode;
  document.getElementById('dc-managed-integration-code').checked=displayConfig.showManagedIntegrationCode;
  document.getElementById('dc-actor').checked=displayConfig.showActor;
  document.getElementById('dc-show-date').checked=displayConfig.showDate;
  document.getElementById('dc-show-seq').checked=displayConfig.showSeq;
  document.getElementById('dc-date-format').value=displayConfig.dateFormat||'YYYY-MM-DD';
  document.getElementById('dc-time-format').value=displayConfig.timeFormat||'HH:mm:ss';
  document.getElementById('about-modal').addEventListener('click',function(e){
    if(e.target===this) closeAbout();
  });
  document.getElementById('confirm-modal').addEventListener('click',function(e){
    if(e.target===this) closeConfirm();
  });
  document.getElementById('export-name-modal').addEventListener('click',function(e){
    if(e.target===this) closeExportNameModal();
  });
  // Close file menu when clicking outside
  document.addEventListener('click',function(e){
    var menu=document.getElementById('file-menu');
    if(!menu) return;
    var btn=document.getElementById('file-menu-btn');
    if(menu.style.display==='block'&&!menu.contains(e.target)&&btn&&!btn.contains(e.target)){
      fileMenuClose();
    }
  });
  // Restore persisted app state (runs after all default init so it overwrites defaults)
  if(typeof loadAppState==='function') loadAppState();
});
