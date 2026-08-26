// ── UI ──────────────────────────────────────────────

// TABLE SELECTION — persists across re-renders
var tableSelection=new Set();

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

function showEventContextMenu(e,eventId){
  e.preventDefault();
  e.stopPropagation();
  var menu=document.getElementById('event-context-menu');
  if(!menu) return;
  menu.innerHTML='';
  var isFiltered=filterConfig.eventIds.indexOf(eventId)!==-1;
  function addItem(label,action){
    var item=document.createElement('button');
    item.className='event-context-item';
    item.textContent=label;
    item.onclick=action;
    menu.appendChild(item);
  }
  if(filterConfig.eventIds.length){
    if(isFiltered) addItem('Remove Event from Filter',function(){removeEventFromFilter(eventId);});
    else addItem('Add Event to Filter',function(){addEventToFilter(eventId);});
    addItem('Show All Events',clearEventIsolation);
  } else {
    addItem('Isolate Event',function(){isolateEvent(eventId);});
  }
  menu.style.display='block';
  menu.style.left=Math.min(e.clientX,window.innerWidth-menu.offsetWidth-8)+'px';
  menu.style.top=Math.min(e.clientY,window.innerHeight-menu.offsetHeight-8)+'px';
}
function addEventToFilter(eventId){
  if(findEventByIdIdx(eventId)<0||filterConfig.eventIds.indexOf(eventId)!==-1) return;
  filterConfig.eventIds.push(eventId);
  closeEventContextMenu();
  refreshFilterBar();
  render();
}
function removeEventFromFilter(eventId){
  var idx=filterConfig.eventIds.indexOf(eventId);
  if(idx===-1) return;
  filterConfig.eventIds.splice(idx,1);
  closeEventContextMenu();
  refreshFilterBar();
  render();
}
function closeEventContextMenu(){
  var menu=document.getElementById('event-context-menu');
  if(menu) menu.style.display='none';
}
document.addEventListener('click',closeEventContextMenu);
document.addEventListener('contextmenu',function(e){
  if(!e.target.closest||!e.target.closest('[data-event-hit]')) closeEventContextMenu();
});


// ABOUT MODAL
function openAbout(){
  document.getElementById('about-version-num').textContent=APP_VERSION;
  document.getElementById('about-year').textContent=new Date().getFullYear();
  document.getElementById('about-modal').classList.add('open');
}
function closeAbout(){
  document.getElementById('about-modal').classList.remove('open');
}


// CONFIRM MODAL
var _confirmCb=null;
function showConfirm(msg,onOk,okLabel,title){
  document.getElementById('confirm-title').textContent=title||'Confirm';
  document.getElementById('confirm-msg').textContent=msg;
  document.getElementById('confirm-ok-btn').textContent=okLabel||'Confirm';
  _confirmCb=onOk;
  document.getElementById('confirm-modal').classList.add('open');
}
function closeConfirm(){
  document.getElementById('confirm-modal').classList.remove('open');
  _confirmCb=null;
}
function acceptConfirm(){
  document.getElementById('confirm-modal').classList.remove('open');
  var cb=_confirmCb; _confirmCb=null;
  if(cb) cb();
}


// EXPORT FILENAME MODAL
var _exportedNames=new Set(); // tracks filenames exported this session
var _exportNameCb=null;
function triggerDownload(blob,filename){
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download=filename;
  a.click(); URL.revokeObjectURL(url);
}
function promptExportFilename(defaultName,title,onExport){
  document.getElementById('export-name-title').textContent=title||'Export';
  var input=document.getElementById('export-name-input');
  input.value=defaultName||'export.json';
  _exportNameCb=onExport;
  document.getElementById('export-name-modal').classList.add('open');
  setTimeout(function(){input.focus();input.select();},80);
}
function closeExportNameModal(){
  document.getElementById('export-name-modal').classList.remove('open');
  _exportNameCb=null;
}
function acceptExportName(){
  var input=document.getElementById('export-name-input');
  var name=(input.value||'').trim();
  if(!name){input.focus();return;}
  var cb=_exportNameCb;
  if(_exportedNames.has(name.toLowerCase())){
    // File was already exported this session — confirm overwrite
    closeExportNameModal();
    showConfirm(
      '\u201C'+name+'\u201D was already exported this session. Export again with this name?',
      function(){_exportedNames.add(name.toLowerCase());if(cb) cb(name);},
      'Export','File Already Exported'
    );
  } else {
    closeExportNameModal();
    _exportedNames.add(name.toLowerCase());
    if(cb) cb(name);
  }
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

// TRIGGER DROPDOWN
function fillTD(sel,cur,filterSystem){
  sel.innerHTML='<option value="">None (root event)</option>';
  events.forEach(function(ev){
    // If a target system is specified, only show events from that system
    if(filterSystem && ev.system !== filterSystem) return;
    var o=document.createElement('option'); o.value=ev._id||'';
    o.textContent=(filterSystem?'':('['+esc(ev.system||'?')+'] '))+trunc(ev.desc||'',40);
    if(ev._id===cur) o.selected=true; sel.appendChild(o);
  });
  // If current selection is no longer valid, reset it
  if(cur && sel.value==='' && cur!=='') sel.value='';
}

// INTERACTION FIELDS
var SAVE_EVENT_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
function updateSaveBtnLabel(){
  var btn=document.getElementById('save-event-btn');
  if(!btn) return;
  var hasInts=document.querySelectorAll('.iblock').length>0;
  btn.innerHTML=SAVE_EVENT_SVG+(hasInts?'Save Event &amp; Interactions':'Save Event');
}

function addIField(tgt,delay,nature,trigEvt,order,label){
  tgt=tgt||'';
  if(delay===undefined||delay===null||delay==='') delay='';
  nature=nature||'push'; trigEvt=trigEvt||'';
  iCount++; var id=iCount;
  var c=document.getElementById('ic'), b=document.createElement('div');
  b.className='iblock'; b.id='ib-'+id; b.dataset.id=id;
  b.innerHTML=
    '<div class="ih">'+
      '<div class="iblock-header-left">'+
        '<div class="reorder-btns">'+
          '<button class="reorder-btn" onclick="moveI(\''+id+'\',\'up\')" title="Move up">\u25B4</button>'+
          '<button class="reorder-btn" onclick="moveI(\''+id+'\',\'down\')" title="Move down">\u25BE</button>'+
        '</div>'+
        '<span class="seq-badge" id="sbadge-'+id+'">?</span>'+
        '<span class="il">Interaction</span>'+
      '</div>'+
      '<button class="btn btn-d" onclick="removeI('+id+')">\u2715 Remove</button>'+
    '</div>'+
    '<div class="fg"><label class="fl">Target System <span class="req">*</span></label>'+
    '<input type="text" id="ti-'+id+'" list="tdl-'+id+'" placeholder="Type or pick a system\u2026" autocomplete="off" oninput="refreshTriggerDD('+id+');refreshDelayRequired('+id+')">'+
    '<datalist id="tdl-'+id+'"></datalist></div>'+
    '<div class="fg"><label class="fl">Label</label>'+
    '<input type="text" id="ilbl-'+id+'" placeholder="Describe this interaction\u2026"></div>'+
    '<div class="mgrid">'+
    '<div class="fg"><label class="fl">Type <span class="req">*</span></label>'+
    '<select id="nt-'+id+'">'+
    '<option value="push"'+(nature==='push'?' selected':'')+'>push \u2192</option>'+
    '<option value="pull"'+(nature==='pull'?' selected':'')+'>pull \u2190</option>'+
    '<option value="process"'+(nature==='process'?' selected':'')+'>process</option>'+
    '</select></div>'+
    '<div class="fg" id="dr-'+id+'" style="'+(appMode==='flow'?'display:none':'')+'">'+
    '<label class="fl" id="dlbl-'+id+'">Delay (ms)</label>'+
    '<input type="number" id="dl-'+id+'" value="'+delay+'" min="0" placeholder="0"></div>'+
    '</div>'+
    '<div class="fg" id="tr-'+id+'" style="'+(appMode==='timeline'?'display:none':'')+'">'+
    '<label class="fl">Triggers Event (Flow mode)</label>'+
    '<select id="te-'+id+'"></select>'+
    '<span class="hint" style="margin-top:3px">Which event does this interaction trigger?</span></div>';
  c.appendChild(b);
  if(tgt) document.getElementById('ti-'+id).value=tgt;
  if(label) document.getElementById('ilbl-'+id).value=label;
  var tdl=document.getElementById('tdl-'+id);
  [...knownSys].sort().forEach(function(s){var o=document.createElement('option');o.value=s;tdl.appendChild(o);});
  // Populate trigger dropdown filtered to the target system
  var tSys=tgt||'';
  fillTD(document.getElementById('te-'+id),trigEvt,tSys||null);
  renumberIBlocks();
  refreshDelayRequired(id);
  updateSaveBtnLabel();
}

function refreshTriggerDD(id){
  var ti=document.getElementById('ti-'+id);
  var te=document.getElementById('te-'+id);
  if(!ti||!te) return;
  var sys=ti.value.trim();
  var cur=te.value;
  fillTD(te,cur,sys||null);
}

function refreshDelayRequired(id){
  if(appMode!=='timeline') return;
  var ti=document.getElementById('ti-'+id);
  var dlbl=document.getElementById('dlbl-'+id);
  if(!ti||!dlbl) return;
  var evSys=(document.getElementById('system-input')||{}).value||'';
  var tgt=ti.value.trim();
  var isRequired=tgt!==''&&tgt===evSys.trim();
  dlbl.innerHTML='Delay (ms)'+(isRequired?' <span class="req">*</span>':'');
}

function renumberIBlocks(){
  document.querySelectorAll('.iblock').forEach(function(b,i){
    var badge=document.getElementById('sbadge-'+b.dataset.id);
    if(badge) badge.textContent=String(i+1);
  });
}

function moveI(id,dir){
  var c=document.getElementById('ic'), block=document.getElementById('ib-'+id);
  if(!block) return;
  if(dir==='up'&&block.previousElementSibling) c.insertBefore(block,block.previousElementSibling);
  else if(dir==='down'&&block.nextElementSibling) c.insertBefore(block.nextElementSibling,block);
  renumberIBlocks();
}

function removeI(id){var b=document.getElementById('ib-'+id);if(b)b.remove();renumberIBlocks();updateSaveBtnLabel();}
function clearI(){document.getElementById('ic').innerHTML='';iCount=0;updateSaveBtnLabel();}

// SAVE / EDIT / DELETE
function saveDisplayConfig(){
  displayConfig.showLevel=document.getElementById('dc-level').checked;
  displayConfig.showEventCode=document.getElementById('dc-event-code').checked;
  displayConfig.showManagedIntegrationCode=document.getElementById('dc-managed-integration-code').checked;
  displayConfig.showActor=document.getElementById('dc-actor').checked;
  displayConfig.showDate=document.getElementById('dc-show-date').checked;
  displayConfig.showSeq=document.getElementById('dc-show-seq').checked;
  displayConfig.dateFormat=document.getElementById('dc-date-format').value;
  displayConfig.timeFormat=document.getElementById('dc-time-format').value;
  localStorage.setItem('weave-date-format',displayConfig.dateFormat);
  localStorage.setItem('weave-time-format',displayConfig.timeFormat);
  render();
}
function saveEvent(){
  var desc=(document.getElementById('desc').value||'').trim();
  if(!desc){toast('Please enter a description','\u26a0');return;}
  var sys=(document.getElementById('system-input').value||'').trim();
  if(!sys){toast('Please specify a system / context','\u26a0');return;}
  var ts=null, tsStr='';
  if(appMode==='timeline'){
    var v=document.getElementById('ts').value;
    if(!v){toast('Please select a timestamp','\u26a0');return;}
    ts=fromDTL(v); tsStr=new Date(ts).toISOString();
  } else {
    var v=document.getElementById('ts').value;
    if(v){ts=fromDTL(v); tsStr=new Date(ts).toISOString();}
    else if(editIdx>=0&&events[editIdx]){ts=events[editIdx].timestamp||null; tsStr=events[editIdx].timestampStr||'';}
  }
  // Validate interaction fields
  var intBlocks=document.querySelectorAll('.iblock');
  for(var bi=0;bi<intBlocks.length;bi++){
    var bid=intBlocks[bi].dataset.id;
    var bti=document.getElementById('ti-'+bid);
    var btval=(bti?bti.value:'').trim();
    if(!btval){toast('Please specify a Target System for each interaction','\u26a0');bti&&bti.focus();return;}
    if(appMode==='timeline'&&btval===sys){
      var dlEl=document.getElementById('dl-'+bid);
      if(!dlEl||dlEl.value===''){toast('Delay is required when the interaction target is the same as the event system','\u26a0');dlEl&&dlEl.focus();return;}
    }
  }
  knownSys.add(sys);
  var ints=[];
  var iOrder=0;
  document.querySelectorAll('.iblock').forEach(function(block){
    var id=block.dataset.id;
    var ti=document.getElementById('ti-'+id); var tval=(ti?ti.value:'').trim();
    var dl=parseInt((document.getElementById('dl-'+id)||{}).value)||0;
    var nt=(document.getElementById('nt-'+id)||{}).value||'push';
    var te=(document.getElementById('te-'+id)||{}).value||'';
    var ilbl=(document.getElementById('ilbl-'+id)||{}).value||'';
    if(tval){knownSys.add(tval);ints.push({target:tval,delay:dl,nature:nt,triggerEventId:te,order:iOrder++,label:ilbl.trim()});}
  });
  var ev={
    _id:editIdx>=0?events[editIdx]._id:'evt-'+Date.now(),
    desc:desc,system:sys,actor:(document.getElementById('actor').value||'').trim(),
    level:(document.getElementById('event-level').value||'')||null,
    eventCode:(document.getElementById('event-code').value||'').trim()||null,
    managedIntegrationCode:(document.getElementById('managed-integration-code').value||'').trim()||null,
    timestamp:ts,timestampStr:tsStr,interactions:ints,mode:appMode
  };
  if(editIdx>=0){events[editIdx]=ev;toast('Event updated','\u270f');}
  else{events.push(ev);toast('Event saved','\u2713');}
  refreshDL(); clearForm(); render(); updateList(); refreshFilterBar(); refreshLevelDL();
}
function editEvent(idx){
  var e=events[idx]; editIdx=idx; switchTab('add');
  document.getElementById('desc').value=e.desc||'';
  document.getElementById('actor').value=e.actor||'';
  document.getElementById('system-input').value=e.system||'';
  document.getElementById('event-level').value=e.level||'';
  document.getElementById('event-code').value=e.eventCode||'';
  document.getElementById('managed-integration-code').value=e.managedIntegrationCode||'';
  if(e.timestampStr||e.timestamp) document.getElementById('ts').value=toDTL(e.timestampStr||new Date(e.timestamp).toISOString());
  clearI();
  var sortedInts=[...( e.interactions||[])].sort(function(a,b){return (a.order||0)-(b.order||0);});
  sortedInts.forEach(function(i,idx){addIField(i.target,i.delay||0,i.nature,i.triggerEventId||'',idx,i.label||'');});
  document.getElementById('cancel-edit').style.display='inline-flex';
  updateList();
}
function deleteEvent(idx){
  showConfirm('Delete this event?',function(){
    var evId=events[idx]&&events[idx]._id;
    events.splice(idx,1);
    if(evId) tableSelection.delete(evId);
    if(evId&&selectedEventId===evId) selectedEventId=null;
    if(editIdx===idx) clearForm(); else if(editIdx>idx) editIdx--;
    render(); updateList(); refreshFilterBar(); toast('Deleted','\uD83D\uDDD1');
  },'Delete','Delete Event');
}
function clearForm(){
  document.getElementById('desc').value='';
  document.getElementById('actor').value='';
  document.getElementById('system-input').value='';
  document.getElementById('ts').value='';
  document.getElementById('event-level').value='';
  document.getElementById('event-code').value='';
  document.getElementById('managed-integration-code').value='';
  clearI(); editIdx=-1;
  document.getElementById('cancel-edit').style.display='none';
  if(selectedEventId){selectedEventId=null; render();}
  updateList();
}
function saveScenario(){
  scenName=document.getElementById('scenario-name').value.trim();
  scenDesc=document.getElementById('scenario-desc').value.trim();
  render(); toast('Scenario saved','\u2713');
}
function clearAll(){
  showConfirm('Delete ALL events? This cannot be undone.',function(){
    events=[]; editIdx=-1; tableSelection.clear(); clearForm(); clearFilters(); render(); updateList(); toast('Cleared','X');
  },'Delete All','Delete All Events');
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
      '<div class="emeta" style="margin-top:3px">'+((e.interactions||[]).length?'\u2194 '+e.interactions.length+' interaction(s)':'No interactions')+'</div>'+
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


// SYSTEM ORDER UI
function refreshSysOrderUI(){
  var container=document.getElementById('sys-order-list');
  if(!container) return;
  // Collect all known systems from events
  var sySet=new Set();
  events.forEach(function(e){
    if(e.system) sySet.add(e.system);
    (e.interactions||[]).forEach(function(i){if(i.target) sySet.add(i.target);});
  });
  [...knownSys].forEach(function(s){sySet.add(s);});
  var arr=[...sySet].sort();
  container.innerHTML='';
  if(!arr.length){
    container.innerHTML='<span class="hint">No systems yet — add events first.</span>';
    return;
  }
  arr.forEach(function(sys){
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px';
    var lbl=document.createElement('span');
    lbl.style.cssText='flex:1;font-size:.83rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    lbl.textContent=sys;
    var inp=document.createElement('input');
    inp.type='number'; inp.min='1'; inp.step='1';
    inp.style.cssText='width:64px;flex-shrink:0;padding:5px 8px;font-size:.8rem';
    inp.placeholder='#';
    if(sysOrder[sys]!==undefined) inp.value=sysOrder[sys];
    inp.addEventListener('change',function(){
      var v=inp.value.trim();
      if(v==='') delete sysOrder[sys];
      else sysOrder[sys]=parseInt(v)||0;
      render();
    });
    row.appendChild(lbl); row.appendChild(inp);
    container.appendChild(row);
  });
}


// SYSTEMS & ACTORS REGISTRY

function refreshSystemsUI(){
  renderSystemsList();
  renderActorsList();
}

function renderSystemsList(){
  var el=document.getElementById('systems-list'); if(!el) return;
  var allSys=new Set([...knownSys]);
  systemsRegistry.forEach(function(s){allSys.add(s.name);});
  var arr=[...allSys].sort();
  if(!arr.length){el.innerHTML='<span class="hint">No systems yet.</span>';return;}
  el.innerHTML='';
  arr.forEach(function(name){
    var reg=systemsRegistry.find(function(s){return s.name===name;})||{name:name,desc:'',order:undefined};
    var row=document.createElement('div');
    row.style.cssText='background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:6px';
    // Header row
    var hdr=document.createElement('div');
    hdr.style.cssText='display:flex;align-items:center;gap:6px';
    var lbl=document.createElement('span');
    lbl.style.cssText='flex:1;font-size:.83rem;font-weight:600;color:var(--text)';
    lbl.textContent=name;
    var orderInp=document.createElement('input');
    orderInp.type='number'; orderInp.min='1'; orderInp.placeholder='order';
    orderInp.style.cssText='width:58px;padding:3px 6px;font-size:.75rem';
    orderInp.title='Lane order';
    if(reg.order!==undefined) orderInp.value=reg.order;
    orderInp.addEventListener('change',function(){setSysOrder(name,orderInp.value);});
    var delBtn=document.createElement('button');
    delBtn.className='btn btn-d'; delBtn.style.cssText='padding:3px 8px;font-size:.7rem';
    delBtn.textContent='\u2715';
    delBtn.addEventListener('click',function(){deleteSystem(name);});
    hdr.appendChild(lbl); hdr.appendChild(orderInp); hdr.appendChild(delBtn);
    // Desc input
    var descInp=document.createElement('input');
    descInp.type='text'; descInp.placeholder='Description (optional)';
    descInp.style.cssText='font-size:.78rem;padding:5px 8px;width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;color:var(--text);outline:none';
    descInp.value=reg.desc||'';
    descInp.addEventListener('change',function(){setSysDesc(name,descInp.value);});
    row.appendChild(hdr); row.appendChild(descInp);
    el.appendChild(row);
  });
}

function renderActorsList(){
  var el=document.getElementById('actors-list'); if(!el) return;
  if(!actorsRegistry.length){el.innerHTML='<span class="hint">No actors defined yet.</span>';return;}
  el.innerHTML='';
  actorsRegistry.forEach(function(a,i){
    var row=document.createElement('div');
    row.style.cssText='background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:6px';
    row.innerHTML=
      '<div style="display:flex;align-items:center;gap:6px">'+
        '<input type="text" style="flex:1;font-size:.83rem;font-weight:600;padding:4px 8px" '+
          'value="'+esc(a.name)+'" placeholder="Actor name" onchange="setActorName('+i+',this.value)">'+
        '<button class="btn btn-d" style="padding:3px 8px;font-size:.7rem" onclick="deleteActor('+i+')">&#x2715;</button>'+
      '</div>'+
      '<input type="text" placeholder="Description (optional)" style="font-size:.78rem;padding:5px 8px" '+
        'value="'+esc(a.desc||'')+'" onchange="setActorDesc('+i+',this.value)">';
    el.appendChild(row);
  });
}

function toggleSysForm(){
  var form=document.getElementById('sys-add-form');
  if(!form) return;
  var visible=form.style.display!=='none';
  form.style.display=visible?'none':'';
  if(!visible) setTimeout(function(){var n=document.getElementById('sys-add-name');if(n)n.focus();},50);
}
function saveNewSystem(){
  var name=(document.getElementById('sys-add-name').value||'').trim();
  var desc=(document.getElementById('sys-add-desc').value||'').trim();
  if(!name){toast('Please enter a system name','\u26a0');return;}
  if(!systemsRegistry.find(function(s){return s.name===name;}))
    systemsRegistry.push({name:name,desc:desc,order:undefined});
  knownSys.add(name);
  document.getElementById('sys-add-name').value='';
  document.getElementById('sys-add-desc').value='';
  toggleSysForm();
  refreshDL(); renderSystemsList();
}
function addSystem(){toggleSysForm();}

function toggleActorForm(){
  var form=document.getElementById('actor-add-form');
  if(!form) return;
  var visible=form.style.display!=='none';
  form.style.display=visible?'none':'';
  if(!visible) setTimeout(function(){var n=document.getElementById('actor-add-name');if(n)n.focus();},50);
}
function saveNewActor(){
  var name=(document.getElementById('actor-add-name').value||'').trim();
  var desc=(document.getElementById('actor-add-desc').value||'').trim();
  if(!name){toast('Please enter an actor name','\u26a0');return;}
  actorsRegistry.push({name:name,desc:desc});
  document.getElementById('actor-add-name').value='';
  document.getElementById('actor-add-desc').value='';
  toggleActorForm();
  renderActorsList(); refreshActorDL();
}
function addActor(){toggleActorForm();}
function deleteSystem(name){
  showConfirm('Remove "'+name+'" from the registry? (Does not delete events using it.)',function(){
    systemsRegistry=systemsRegistry.filter(function(s){return s.name!==name;});
    knownSys.delete(name); refreshDL(); renderSystemsList();
  },'Remove','Remove System');
}
function setSysOrder(name,val){
  var reg=systemsRegistry.find(function(s){return s.name===name;});
  if(!reg){reg={name:name,desc:''};systemsRegistry.push(reg);}
  reg.order=val.trim()===''?undefined:parseInt(val)||0;
  sysOrder[name]=reg.order!==undefined?reg.order:9999;
  render();
}
function setSysDesc(name,val){
  var reg=systemsRegistry.find(function(s){return s.name===name;});
  if(!reg){reg={name:name,order:undefined};systemsRegistry.push(reg);}
  reg.desc=val;
}
function deleteActor(i){
  actorsRegistry.splice(i,1); renderActorsList(); refreshActorDL();
}
function setActorName(i,v){actorsRegistry[i].name=v.trim();refreshActorDL();}
function setActorDesc(i,v){actorsRegistry[i].desc=v;}
function refreshActorDL(){
  var dl=document.getElementById('actor-dl');
  if(!dl) return;
  dl.innerHTML='';
  actorsRegistry.forEach(function(a){var o=document.createElement('option');o.value=a.name;dl.appendChild(o);});
}
function refreshLevelDL(){} // levels are fixed; select dropdown is static
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
