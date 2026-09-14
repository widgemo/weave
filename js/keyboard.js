// ── KEYBOARD SHORTCUTS ──────────────────────────────────
// Delete/Backspace = delete; Ctrl/Cmd+D = duplicate; arrow keys = nudge
// lane (both modes) / sequence (Flow mode only); Escape = close/cancel.
// All bail out while the user is typing in a text field (except Escape).

function _isTypingContext(){
  var el=document.activeElement;
  if(!el) return false;
  if(el.isContentEditable) return true;
  var tag=el.tagName;
  return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
}

var _KB_MODAL_IDS=['confirm-modal','export-name-modal','ds-config-modal','log-modal','about-modal'];
function _anyModalOpen(){
  return _KB_MODAL_IDS.some(function(id){
    var el=document.getElementById(id);
    return el&&el.classList.contains('open');
  });
}
function _contextMenuOpen(){
  var menu=document.getElementById('event-context-menu');
  return !!menu&&menu.style.display==='block';
}

function _handleEscape(){
  if((document.activeElement||{}).id==='export-name-input'){
    // Its own inline onkeydown already closes export-name-modal; avoid
    // double-handling Escape on the same keypress (see index.html).
    return;
  }
  for(var i=0;i<_KB_MODAL_IDS.length;i++){
    var id=_KB_MODAL_IDS[i];
    var el=document.getElementById(id);
    if(el&&el.classList.contains('open')){
      if(id==='confirm-modal') closeConfirm();
      else if(id==='export-name-modal') closeExportNameModal();
      else if(id==='ds-config-modal') dsCloseConfig();
      else if(id==='log-modal') closeLogViewer();
      else if(id==='about-modal') closeAbout();
      return;
    }
  }
  if(_contextMenuOpen()){ closeEventContextMenu(); return; }
  if(inspectorOpen) clearForm();
}

// Reassigns the selected event's lane (system) to the adjacent one in the
// current sysArr ordering — the same mutation the mouse-drag onDrop
// handlers in render-flow.js/render-timeline.js already perform.
function nudgeEventLane(idx,dir){
  var ev=events[idx]; if(!ev) return;
  var sySet=new Set();
  getActiveEvents().forEach(function(e){
    if(e.system) sySet.add(e.system);
    (e.interactions||[]).forEach(function(i){if(i.target) sySet.add(i.target);});
  });
  var sysArr=getSysArray(sySet);
  var curPos=sysArr.indexOf(ev.system);
  var newPos=dir==='prev'?curPos-1:curPos+1;
  if(curPos<0||newPos<0||newPos>=sysArr.length) return;
  var newSys=sysArr[newPos];
  events[idx].system=newSys; knownSys.add(newSys);
  if(editIdx===idx) editEvent(idx);
  render(); updateList(); refreshDL();
  toast('Moved to '+newSys,'↕');
}

// Reorders the selected event within Flow mode's current causal sequence,
// by setting layoutAfterId to the anchor that produces the swap on the
// next render (mirrors anchorForGap/currentAnchorId in render-flow.js).
function nudgeEventSequence(idx,dir){
  var ev=events[idx]; if(!ev) return;
  var order=_lastFlowOrder;
  var pos=order.indexOf(ev._id); if(pos<0) return;
  var anchor;
  if(dir==='later'){
    if(pos>=order.length-1) return;
    anchor=order[pos+1];
  } else {
    if(pos<=0) return;
    anchor=(pos-2>=0)?order[pos-2]:'';
  }
  events[idx].layoutAfterId=anchor;
  if(editIdx===idx) editEvent(idx);
  render(); updateList(); refreshDL();
  toast('Order updated','↕');
}

// Clones the selected event: new id, independent interactions copy,
// inserted immediately after the original (and anchored after it in Flow
// mode's sequence too).
var _dupSeq=0;
function duplicateEvent(idx){
  var src=events[idx]; if(!src) return;
  var clone={
    _id:'evt-'+Date.now()+'-dup'+(_dupSeq++),
    desc:src.desc,system:src.system,actor:src.actor,level:src.level,
    eventCode:src.eventCode,managedIntegrationCode:src.managedIntegrationCode,
    timestamp:src.timestamp,timestampStr:src.timestampStr,
    interactions:(src.interactions||[]).map(function(i){return Object.assign({},i);}),
    mode:src.mode,layoutAfterId:src._id
  };
  events.splice(idx+1,0,clone);
  selectedEventId=clone._id;
  render();
  editEvent(idx+1);
  updateList(); refreshFilterBar();
  toast('Duplicated','📋');
}

function handleGlobalKeydown(e){
  if(e.key==='Escape'){ _handleEscape(); return; }
  if(_isTypingContext()) return;
  if(_anyModalOpen()||_contextMenuOpen()) return;

  if(appMode==='table'){
    if(e.key==='Delete'||e.key==='Backspace'){
      if(tableSelection.size){ e.preventDefault(); deleteSelectedTableRows(); }
    }
    return;
  }
  if(appMode!=='timeline'&&appMode!=='flow') return;
  if(!selectedEventId) return;
  var idx=findEventByIdIdx(selectedEventId); if(idx<0) return;

  if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); deleteEvent(idx); return; }
  if((e.key==='d'||e.key==='D')&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); duplicateEvent(idx); return; }

  var laneKeys, seqKeys=[];
  if(appMode==='timeline'){
    var isH=(document.getElementById('orientation')||{}).value==='horizontal';
    laneKeys=isH?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];
  } else {
    var isLR=(document.getElementById('flow-dir')||{}).value==='lr';
    laneKeys=isLR?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];
    seqKeys=isLR?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
  }
  if(laneKeys.indexOf(e.key)!==-1){
    e.preventDefault();
    nudgeEventLane(idx,(e.key==='ArrowUp'||e.key==='ArrowLeft')?'prev':'next');
    return;
  }
  if(seqKeys.indexOf(e.key)!==-1){
    e.preventDefault();
    nudgeEventSequence(idx,(e.key==='ArrowUp'||e.key==='ArrowLeft')?'earlier':'later');
  }
}

function initKeyboardShortcuts(){
  document.addEventListener('keydown',handleGlobalKeydown);
}
