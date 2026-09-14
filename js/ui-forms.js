// ── UI: EVENT / INTERACTION FORM ────────────────────────

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
          '<button class="reorder-btn" onclick="moveI(\''+id+'\',\'up\')" title="Move up">▴</button>'+
          '<button class="reorder-btn" onclick="moveI(\''+id+'\',\'down\')" title="Move down">▾</button>'+
        '</div>'+
        '<span class="seq-badge" id="sbadge-'+id+'">?</span>'+
        '<span class="il">Interaction</span>'+
      '</div>'+
      '<button class="btn btn-d" onclick="removeI('+id+')">✕ Remove</button>'+
    '</div>'+
    '<div class="fg"><label class="fl">Target System <span class="req">*</span></label>'+
    '<input type="text" id="ti-'+id+'" list="tdl-'+id+'" placeholder="Type or pick a system…" autocomplete="off" oninput="refreshTriggerDD('+id+');refreshDelayRequired('+id+')">'+
    '<datalist id="tdl-'+id+'"></datalist></div>'+
    '<div class="fg"><label class="fl">Label</label>'+
    '<input type="text" id="ilbl-'+id+'" placeholder="Describe this interaction…"></div>'+
    '<div class="mgrid">'+
    '<div class="fg"><label class="fl">Type <span class="req">*</span></label>'+
    '<select id="nt-'+id+'">'+
    '<option value="push"'+(nature==='push'?' selected':'')+'>push →</option>'+
    '<option value="pull"'+(nature==='pull'?' selected':'')+'>pull ←</option>'+
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
  if(!desc){toast('Please enter a description','⚠');return;}
  var sys=(document.getElementById('system-input').value||'').trim();
  if(!sys){toast('Please specify a system / context','⚠');return;}
  var ts=null, tsStr='';
  if(appMode==='timeline'){
    var v=document.getElementById('ts').value;
    if(!v){toast('Please select a timestamp','⚠');return;}
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
    if(!btval){toast('Please specify a Target System for each interaction','⚠');bti&&bti.focus();return;}
    if(appMode==='timeline'&&btval===sys){
      var dlEl=document.getElementById('dl-'+bid);
      if(!dlEl||dlEl.value===''){toast('Delay is required when the interaction target is the same as the event system','⚠');dlEl&&dlEl.focus();return;}
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
  if(editIdx>=0){events[editIdx]=ev;toast('Event updated','✏');}
  else{events.push(ev);toast('Event saved','✓');}
  refreshDL(); clearForm(); render(); updateList(); refreshFilterBar(); refreshLevelDL();
}
function editEvent(idx){
  var e=events[idx]; editIdx=idx; inspectorOpen=true; switchTab('add');
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
  _updateInspectorEmptyState();
  updateList();
}
function deleteEvent(idx){
  showConfirm('Delete this event?',function(){
    var evId=events[idx]&&events[idx]._id;
    events.splice(idx,1);
    if(evId) tableSelection.delete(evId);
    if(evId&&selectedEventId===evId) selectedEventId=null;
    if(editIdx===idx) clearForm(); else if(editIdx>idx) editIdx--;
    render(); updateList(); refreshFilterBar(); toast('Deleted','🗑');
  },'Delete','Delete Event');
}
// Pure field reset — blanks inputs, clears interaction blocks, resets editIdx.
// Does not touch selectedEventId, inspectorOpen, or panel visibility.
function _resetFormFields(){
  document.getElementById('desc').value='';
  document.getElementById('actor').value='';
  document.getElementById('system-input').value='';
  document.getElementById('ts').value='';
  document.getElementById('event-level').value='';
  document.getElementById('event-code').value='';
  document.getElementById('managed-integration-code').value='';
  clearI(); editIdx=-1;
  document.getElementById('cancel-edit').style.display='none';
}
// Shows the event form (blank if idx omitted) instead of the inspector's empty state.
function _updateInspectorEmptyState(){
  var empty=document.getElementById('inspector-empty');
  var form=document.getElementById('inspector-form');
  if(!empty||!form) return;
  empty.style.display=inspectorOpen?'none':'flex';
  form.style.display=inspectorOpen?'flex':'none';
}
function clearForm(){
  _resetFormFields();
  inspectorOpen=false;
  if(selectedEventId){selectedEventId=null; render();}
  _updateInspectorEmptyState();
  updateList();
}
function newEvent(){
  if(selectedEventId){selectedEventId=null; render();}
  _resetFormFields();
  inspectorOpen=true;
  switchTab('add');
  _updateInspectorEmptyState();
  updateList();
}
function saveScenario(){
  scenName=document.getElementById('scenario-name').value.trim();
  scenDesc=document.getElementById('scenario-desc').value.trim();
  render(); toast('Scenario saved','✓');
}
function clearAll(){
  showConfirm('Delete ALL events? This cannot be undone.',function(){
    events=[]; editIdx=-1; tableSelection.clear(); clearForm(); clearFilters(); render(); updateList(); toast('Cleared','X');
  },'Delete All','Delete All Events');
}

// NEW DIAGRAM — resets diagram data and settings, keeps data source/query config
var DIAGRAM_SETTING_KEYS=['weave-vslider','weave-hslider','weave-timeline-reverse',
  'weave-date-format','weave-time-format','weave-table-col-widths'];

function newDiagram(){
  showConfirm(
    'Start a new diagram? All events, systems, actors and diagram settings will be permanently deleted, '+
    'including the copy saved in this browser. Export your work first if you want to keep it. '+
    'Data source and query settings are not affected.',
    _resetToNewDiagram,'Delete & Start New','New Diagram');
}

function _resetToNewDiagram(){
  events=[]; sysOrder={}; systemsRegistry=[]; actorsRegistry=[];
  levelsRegistry=FIXED_LEVELS.slice(); knownSys.clear();
  scenName=''; scenDesc='';
  editIdx=-1; selectedEventId=null; tableSelection.clear();

  diagramZoom=1.0; diagramVSlider=1.0; diagramHSlider=1.0;
  timelineCompact=true; timelineReverse=false;
  displayConfig.showLevel=true; displayConfig.showEventCode=true;
  displayConfig.showManagedIntegrationCode=true; displayConfig.showActor=true;
  displayConfig.showDate=true; displayConfig.showSeq=true;
  displayConfig.dateFormat='YYYY-MM-DD'; displayConfig.timeFormat='HH:mm:ss';
  tableSortCol=null; tableSortDir='asc';

  try{
    localStorage.removeItem(WEAVE_APP_STATE_KEY);
    DIAGRAM_SETTING_KEYS.forEach(function(k){localStorage.removeItem(k);});
  }catch(e){}

  function setVal(id,val){var el=document.getElementById(id); if(el) el.value=val;}
  function setChk(id,val){var el=document.getElementById(id); if(el) el.checked=val;}
  setVal('scenario-name',''); setVal('scenario-desc','');
  setVal('orientation','vertical'); setVal('flow-dir','lr');
  setVal('dc-date-format','YYYY-MM-DD'); setVal('dc-time-format','HH:mm:ss');
  setChk('dc-level',true); setChk('dc-event-code',true); setChk('dc-managed-integration-code',true);
  setChk('dc-actor',true); setChk('dc-show-date',true); setChk('dc-show-seq',true);

  clearForm();
  clearFilters();
  initDiagSliders();
  applyTimelineReverseState();
  switchAppMode('timeline');
  refreshDL(); refreshActorDL(); refreshLevelDL();
  refreshSysOrderUI(); refreshSystemsUI();
  refreshFilterBar(); render(); updateList();
  toast('New diagram started','✨');
}
