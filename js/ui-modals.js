// ── UI: MODALS & CONTEXT MENU ──────────────────────────

// EVENT CONTEXT MENU
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
  if(appMode==='flow'){
    var flIdx=findEventByIdIdx(eventId);
    if(flIdx>=0&&events[flIdx].layoutAfterId!==undefined){
      addItem('Reset Order to Automatic',function(){resetEventOrderOverride(eventId);});
    }
  }
  menu.style.display='block';
  menu.style.left=Math.min(e.clientX,window.innerWidth-menu.offsetWidth-8)+'px';
  menu.style.top=Math.min(e.clientY,window.innerHeight-menu.offsetHeight-8)+'px';
}
function resetEventOrderOverride(eventId){
  var idx=findEventByIdIdx(eventId); if(idx<0) return;
  delete events[idx].layoutAfterId;
  closeEventContextMenu();
  render(); updateList();
  toast('Order reset to automatic','↺');
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


// KEYBOARD SHORTCUTS HELP MODAL
function openShortcutsHelp(){
  document.getElementById('shortcuts-modal').classList.add('open');
}
function closeShortcutsHelp(){
  document.getElementById('shortcuts-modal').classList.remove('open');
}


// DIAGRAM SETTINGS MODAL
function openDiagramSettings(){
  document.getElementById('diagram-settings-modal').classList.add('open');
}
function closeDiagramSettings(){
  document.getElementById('diagram-settings-modal').classList.remove('open');
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
      '“'+name+'” was already exported this session. Export again with this name?',
      function(){_exportedNames.add(name.toLowerCase());if(cb) cb(name);},
      'Export','File Already Exported'
    );
  } else {
    closeExportNameModal();
    _exportedNames.add(name.toLowerCase());
    if(cb) cb(name);
  }
}
