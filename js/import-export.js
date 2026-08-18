// IMPORT / EXPORT
function exportData(){
  var data={version:3,appMode:appMode,scenarioName:scenName,scenarioDesc:scenDesc,sysOrder:sysOrder,systemsRegistry:systemsRegistry,actorsRegistry:actorsRegistry,levelsRegistry:levelsRegistry,
    displayConfig:displayConfig,
    settings:{orientation:document.getElementById('orientation').value,
              showDate:displayConfig.showDate,
              flowDirection:document.getElementById('flow-dir').value,
              showSeq:displayConfig.showSeq,
              timezone:getDisplayTZ()},events:events};
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;
  a.download=(scenName||'eventflow')+'-'+appMode+'-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(url); toast('Exported','\u2193');
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

