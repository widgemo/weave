// IMPORT / EXPORT
function exportData(){
  var defaultName=(scenName||'eventflow')+'-'+appMode+'-'+new Date().toISOString().slice(0,10)+'.json';
  promptExportFilename(defaultName,'Export Data',function(filename){
    var data={version:3,appMode:appMode,scenarioName:scenName,scenarioDesc:scenDesc,sysOrder:sysOrder,systemsRegistry:systemsRegistry,actorsRegistry:actorsRegistry,levelsRegistry:levelsRegistry,
      displayConfig:displayConfig,
      settings:{orientation:document.getElementById('orientation').value,
                showDate:displayConfig.showDate,
                flowDirection:document.getElementById('flow-dir').value,
                showSeq:displayConfig.showSeq,
                timezone:getDisplayTZ()},events:events};
    var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    triggerDownload(blob,filename);
    toast('Exported','\u2193');
  });
}
function importClick(){document.getElementById('import-file').click();}
function importData(e){
  var file=e.target.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(ev){
    try{
      var data=JSON.parse(ev.target.result);
      scenName=data.scenarioName||''; scenDesc=data.scenarioDesc||'';
      document.getElementById('scenario-name').value=scenName;
      document.getElementById('scenario-desc').value=scenDesc;
      // Backward compat: old exports stored viewMode='table' under appMode='timeline'
      var importedMode=data.appMode||'timeline';
      if(importedMode==='timeline'&&data.settings&&data.settings.viewMode==='table') importedMode='table';
      switchAppMode(importedMode);
      if(data.settings){
        document.getElementById('orientation').value=data.settings.orientation||'vertical';
        document.getElementById('flow-dir').value=data.settings.flowDirection||'lr';
      }
      events=data.events||[]; sysOrder=data.sysOrder||{}; systemsRegistry=data.systemsRegistry||[]; actorsRegistry=data.actorsRegistry||[]; knownSys.clear();
      // Levels are fixed; normalize any non-standard values from imported events
      levelsRegistry=FIXED_LEVELS.slice();
      events.forEach(function(ev){ev.level=normalizeLevel(ev.level);});
      if(data.displayConfig){
        displayConfig.showLevel=data.displayConfig.showLevel!==false;
        displayConfig.showEventCode=data.displayConfig.showEventCode!==false;
        displayConfig.showManagedIntegrationCode=data.displayConfig.showManagedIntegrationCode!==false;
        displayConfig.showActor=data.displayConfig.showActor!==false;
        displayConfig.showDate=data.displayConfig.showDate!==false;
        displayConfig.showSeq=data.displayConfig.showSeq!==false;
        document.getElementById('dc-level').checked=displayConfig.showLevel;
        document.getElementById('dc-event-code').checked=displayConfig.showEventCode;
        document.getElementById('dc-managed-integration-code').checked=displayConfig.showManagedIntegrationCode;
        document.getElementById('dc-actor').checked=displayConfig.showActor;
        document.getElementById('dc-show-date').checked=displayConfig.showDate;
        document.getElementById('dc-show-seq').checked=displayConfig.showSeq;
      } else if(data.settings){
        displayConfig.showDate=data.settings.showDate!==false;
        displayConfig.showSeq=data.settings.showSeq!==false;
        document.getElementById('dc-show-date').checked=displayConfig.showDate;
        document.getElementById('dc-show-seq').checked=displayConfig.showSeq;
      }
      events.forEach(function(ev){
        if(ev.system) knownSys.add(ev.system);
        (ev.interactions||[]).forEach(function(i){if(i.target) knownSys.add(i.target);});
      });
      refreshDL(); refreshLevelDL(); clearFilters(); render(); updateList(); toast('Imported','\u2191');
    }catch(err){toast('Invalid file','X'); appLog('error','Invalid import file', err&&err.message?err.message:String(err));}
  };
  reader.readAsText(file); e.target.value='';
}

// LOCAL STORAGE PERSISTENCE
var WEAVE_APP_STATE_KEY='weave-app-state';
var WEAVE_APP_STATE_MAX_BYTES=4*1024*1024; // 4 MB — skip data if larger

function persistAppState(){
  try{
    var data={version:3,appMode:appMode,scenarioName:scenName,scenarioDesc:scenDesc,
      sysOrder:sysOrder,systemsRegistry:systemsRegistry,actorsRegistry:actorsRegistry,
      displayConfig:{
        showLevel:displayConfig.showLevel,
        showEventCode:displayConfig.showEventCode,
        showManagedIntegrationCode:displayConfig.showManagedIntegrationCode,
        showActor:displayConfig.showActor,
        showDate:displayConfig.showDate,
        showSeq:displayConfig.showSeq
      },
      settings:{
        orientation:(document.getElementById('orientation')||{}).value||'vertical',
        flowDirection:(document.getElementById('flow-dir')||{}).value||'lr'
      },
      events:events};
    var json=JSON.stringify(data);
    if(json.length>WEAVE_APP_STATE_MAX_BYTES){
      appLog('info','App state too large for localStorage ('+Math.round(json.length/1024)+'KB), skipping persistence');
      return;
    }
    localStorage.setItem(WEAVE_APP_STATE_KEY,json);
  }catch(e){
    // Quota exceeded or other storage error — silently skip
  }
}

function loadAppState(){
  try{
    var raw=localStorage.getItem(WEAVE_APP_STATE_KEY);
    if(!raw) return false;
    var data=JSON.parse(raw);
    scenName=data.scenarioName||''; scenDesc=data.scenarioDesc||'';
    var nameEl=document.getElementById('scenario-name');
    var descEl=document.getElementById('scenario-desc');
    if(nameEl) nameEl.value=scenName;
    if(descEl) descEl.value=scenDesc;
    var importedMode=data.appMode||'timeline';
    switchAppMode(importedMode);
    if(data.settings){
      var orientEl=document.getElementById('orientation');
      var flowEl=document.getElementById('flow-dir');
      if(orientEl) orientEl.value=data.settings.orientation||'vertical';
      if(flowEl) flowEl.value=data.settings.flowDirection||'lr';
    }
    events=data.events||[]; sysOrder=data.sysOrder||{};
    systemsRegistry=data.systemsRegistry||[]; actorsRegistry=data.actorsRegistry||[];
    knownSys.clear();
    levelsRegistry=FIXED_LEVELS.slice();
    events.forEach(function(ev){ev.level=normalizeLevel(ev.level);});
    if(data.displayConfig){
      displayConfig.showLevel=data.displayConfig.showLevel!==false;
      displayConfig.showEventCode=data.displayConfig.showEventCode!==false;
      displayConfig.showManagedIntegrationCode=data.displayConfig.showManagedIntegrationCode!==false;
      displayConfig.showActor=data.displayConfig.showActor!==false;
      displayConfig.showDate=data.displayConfig.showDate!==false;
      displayConfig.showSeq=data.displayConfig.showSeq!==false;
      var dcLevel=document.getElementById('dc-level');
      var dcCode=document.getElementById('dc-event-code');
      var dcMic=document.getElementById('dc-managed-integration-code');
      var dcActor=document.getElementById('dc-actor');
      var dcDate=document.getElementById('dc-show-date');
      var dcSeq=document.getElementById('dc-show-seq');
      if(dcLevel) dcLevel.checked=displayConfig.showLevel;
      if(dcCode) dcCode.checked=displayConfig.showEventCode;
      if(dcMic) dcMic.checked=displayConfig.showManagedIntegrationCode;
      if(dcActor) dcActor.checked=displayConfig.showActor;
      if(dcDate) dcDate.checked=displayConfig.showDate;
      if(dcSeq) dcSeq.checked=displayConfig.showSeq;
    }
    events.forEach(function(ev){
      if(ev.system) knownSys.add(ev.system);
      (ev.interactions||[]).forEach(function(i){if(i.target) knownSys.add(i.target);});
    });
    refreshDL(); refreshLevelDL(); render(); updateList();
    return true;
  }catch(e){
    appLog('error','Failed to restore app state from localStorage',e&&e.message?e.message:String(e));
    return false;
  }
}
