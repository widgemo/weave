// ── LIBRARY (localStorage-backed saved diagrams / connections / query configs) ──
// Lets the user save named copies of the three things Weave can otherwise
// only import/export as files, then load/export/rename/delete them from a
// single modal. Everything here lives entirely in localStorage — no server.

var WEAVE_LIBRARY_KEY='weave-library';
var LIB_TYPE_LABELS={diagrams:'diagram',connections:'connection',queries:'query config'};

function _libGenId(){
  return 'lib-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
}

function libLoad(){
  try{
    var raw=localStorage.getItem(WEAVE_LIBRARY_KEY);
    var lib=raw?JSON.parse(raw):{};
    return {diagrams:lib.diagrams||[], connections:lib.connections||[], queries:lib.queries||[]};
  }catch(e){
    appLog('error','Failed to read Library from localStorage',e&&e.message?e.message:String(e));
    return {diagrams:[],connections:[],queries:[]};
  }
}

function libSaveAll(lib){
  try{
    localStorage.setItem(WEAVE_LIBRARY_KEY,JSON.stringify(lib));
    return true;
  }catch(e){
    toast('Could not save to Library (storage full?)','!');
    appLog('error','Failed to write Library to localStorage',e&&e.message?e.message:String(e));
    return false;
  }
}

function libSave(type,name,dataObj){
  var lib=libLoad();
  lib[type].push({id:_libGenId(), name:name, savedAt:new Date().toISOString(), type:type, data:dataObj});
  if(libSaveAll(lib)){
    toast('Saved to Library','✓');
    appLog('info','Saved '+LIB_TYPE_LABELS[type]+' "'+name+'" to Library');
    renderLibraryList(type);
  }
}

function libDelete(type,id){
  var lib=libLoad();
  var entry=lib[type].find(function(e){return e.id===id;});
  if(!entry) return;
  showConfirm(
    'Remove "'+entry.name+'" from the Library? This cannot be undone.',
    function(){
      lib[type]=lib[type].filter(function(e){return e.id!==id;});
      if(libSaveAll(lib)){
        toast('Removed from Library','✓');
        renderLibraryList(type);
      }
    },
    'Remove','Remove from Library'
  );
}

function libRename(type,id,newName){
  newName=(newName||'').trim();
  if(!newName) return;
  var lib=libLoad();
  var entry=lib[type].find(function(e){return e.id===id;});
  if(!entry||entry.name===newName) return;
  entry.name=newName;
  libSaveAll(lib);
}

function libExport(type,id){
  var lib=libLoad();
  var entry=lib[type].find(function(e){return e.id===id;});
  if(!entry) return;
  promptExportFilename(entry.name+'.json','Export',function(filename){
    var blob=new Blob([JSON.stringify(entry.data,null,2)],{type:'application/json'});
    triggerDownload(blob,filename);
    toast('Exported','↓');
  });
}

// ── SAVE-CURRENT DISPATCHERS ─────────────────────────────────────────────
function libSaveCurrentDiagram(){
  var data=_buildDiagramData();
  promptLibraryName(scenName||'Untitled Diagram','diagram',function(name){ libSave('diagrams',name,data); });
}
function libSaveCurrentConnection(){
  var data=_buildConnectionData();
  if(!data){ toast('No data source configuration to save','!'); return; }
  var cfg=dsLoadConfig();
  promptLibraryName(cfg.label||cfg.baseUrl||'Untitled Connection','connection',function(name){ libSave('connections',name,data); });
}
function libSaveCurrentQuery(){
  var data=_buildQueryData();
  if(!data){ toast('No query to save','!'); return; }
  var q=dsReadQueryForm();
  promptLibraryName(q.endpoint||'Untitled Query','query config',function(name){ libSave('queries',name,data); });
}

// ── LOAD DISPATCHERS ─────────────────────────────────────────────────────
function libLoadDiagram(id){
  var entry=libLoad().diagrams.find(function(e){return e.id===id;});
  if(!entry) return;
  showConfirm(
    'Load "'+entry.name+'"? Your current diagram will be replaced. Export or save it to the Library first if you want to keep it.',
    function(){
      _applyDiagramData(entry.data);
      clearFilters();
      closeLibrary();
      toast('Diagram loaded','📂');
      appLog('info','Loaded diagram "'+entry.name+'" from Library');
    },
    'Load Diagram','Load from Library'
  );
}
function libLoadConnection(id){
  var entry=libLoad().connections.find(function(e){return e.id===id;});
  if(!entry) return;
  dsSaveConfig({
    label:     entry.data.label     || '',
    baseUrl:   entry.data.baseUrl   || '',
    clientId:  entry.data.clientId  || '',
    scope:     entry.data.scope     || '',
    authPath:  entry.data.authPath  || '/oauth_auth.do',
    tokenPath: entry.data.tokenPath || '/oauth_token.do'
  });
  dsClearToken();
  dsUpdateBannerBtn();
  dsUpdatePanelStatus();
  closeLibrary();
  toast('Connection loaded — please log in again','🔑');
  appLog('info','Loaded connection "'+entry.name+'" from Library (token cleared)');
  dsOpenConfig('connection');
}
function libLoadQuery(id){
  var entry=libLoad().queries.find(function(e){return e.id===id;});
  if(!entry) return;
  _applyQueryData(entry.data);
  closeLibrary();
  toast('Query config loaded','📂');
  appLog('info','Loaded query config "'+entry.name+'" from Library');
}

// ── LIBRARY MODAL ────────────────────────────────────────────────────────
function libSwitchTab(tab){
  ['diagrams','connections','queries'].forEach(function(t){
    document.getElementById('libtab-'+t).classList.toggle('active', t===tab);
    document.getElementById('libpanel-'+t).classList.toggle('active', t===tab);
  });
}
function openLibrary(tab){
  libSwitchTab(tab||'diagrams');
  renderLibraryList('diagrams'); renderLibraryList('connections'); renderLibraryList('queries');
  document.getElementById('library-modal').classList.add('open');
}
function closeLibrary(){
  document.getElementById('library-modal').classList.remove('open');
}

function renderLibraryList(type){
  var el=document.getElementById('library-'+type+'-list'); if(!el) return;
  var entries=libLoad()[type];
  if(!entries.length){ el.innerHTML='<span class="hint">No saved '+LIB_TYPE_LABELS[type]+'s yet.</span>'; return; }
  el.innerHTML='';
  entries.slice().reverse().forEach(function(entry){
    var row=document.createElement('div'); row.className='reg-row';

    var hdr=document.createElement('div'); hdr.style.cssText='display:flex;align-items:center;gap:6px';
    var nameInp=document.createElement('input');
    nameInp.type='text'; nameInp.value=entry.name; nameInp.placeholder='Name';
    nameInp.style.cssText='flex:1;font-size:.83rem;font-weight:600;padding:4px 8px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);outline:none';
    nameInp.addEventListener('change',function(){ libRename(type,entry.id,nameInp.value); });
    var delBtn=document.createElement('button');
    delBtn.className='btn btn-d'; delBtn.style.cssText='padding:3px 8px;font-size:.7rem'; delBtn.textContent='✕';
    delBtn.addEventListener('click',function(){ libDelete(type,entry.id); });
    hdr.appendChild(nameInp); hdr.appendChild(delBtn);

    var meta=document.createElement('div'); meta.className='hint';
    meta.textContent='Saved '+new Date(entry.savedAt).toLocaleString();

    var actions=document.createElement('div'); actions.style.cssText='display:flex;gap:6px';
    var loadBtn=document.createElement('button'); loadBtn.className='btn btn-p btn-sm'; loadBtn.textContent='Load';
    loadBtn.addEventListener('click',function(){
      if(type==='diagrams') libLoadDiagram(entry.id);
      else if(type==='connections') libLoadConnection(entry.id);
      else libLoadQuery(entry.id);
    });
    var exportBtn=document.createElement('button'); exportBtn.className='btn btn-outline btn-sm'; exportBtn.textContent='Export…';
    exportBtn.addEventListener('click',function(){ libExport(type,entry.id); });
    actions.appendChild(loadBtn); actions.appendChild(exportBtn);

    row.appendChild(hdr); row.appendChild(meta); row.appendChild(actions);
    el.appendChild(row);
  });
}

// ── "SAVE TO LIBRARY" NAMING PROMPT ──────────────────────────────────────
var _libSaveCb=null;
function promptLibraryName(defaultName,itemTypeLabel,onSave){
  var input=document.getElementById('library-name-input');
  input.value=defaultName||'';
  input.placeholder='Name this '+itemTypeLabel+'…';
  _libSaveCb=onSave;
  document.getElementById('library-name-modal').classList.add('open');
  setTimeout(function(){ input.focus(); input.select(); },80);
}
function closeLibraryNameModal(){
  document.getElementById('library-name-modal').classList.remove('open');
  _libSaveCb=null;
}
function acceptLibraryName(){
  var input=document.getElementById('library-name-input');
  var name=(input.value||'').trim();
  if(!name){ input.focus(); return; }
  var cb=_libSaveCb;
  closeLibraryNameModal();
  if(cb) cb(name);
}

// ── SPLIT-BUTTON (Save to Library / Export…) ─────────────────────────────
function toggleSplitMenu(id,e){
  if(e) e.stopPropagation();
  var menu=document.getElementById(id); if(!menu) return;
  var wasOpen=menu.classList.contains('open');
  document.querySelectorAll('.split-btn-menu.open').forEach(function(m){ m.classList.remove('open'); });
  if(!wasOpen) menu.classList.add('open');
}
function closeSplitMenu(id){
  var m=document.getElementById(id); if(m) m.classList.remove('open');
}
document.addEventListener('click',function(e){
  if(e.target.closest && e.target.closest('.split-btn')) return;
  document.querySelectorAll('.split-btn-menu.open').forEach(function(m){ m.classList.remove('open'); });
});
