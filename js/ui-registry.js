// ── UI: SYSTEMS & ACTORS REGISTRY ───────────────────────

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
    var nameInp=document.createElement('input');
    nameInp.type='text'; nameInp.value=name; nameInp.placeholder='System name';
    nameInp.style.cssText='flex:1;font-size:.83rem;font-weight:600;padding:4px 8px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);outline:none';
    nameInp.addEventListener('change',function(){renameSystem(name,nameInp.value);});
    var orderInp=document.createElement('input');
    orderInp.type='number'; orderInp.min='1'; orderInp.placeholder='order';
    orderInp.style.cssText='width:58px;padding:3px 6px;font-size:.75rem';
    orderInp.title='Lane order';
    if(reg.order!==undefined) orderInp.value=reg.order;
    orderInp.addEventListener('change',function(){setSysOrder(name,orderInp.value);});
    var delBtn=document.createElement('button');
    delBtn.className='btn btn-d'; delBtn.style.cssText='padding:3px 8px;font-size:.7rem';
    delBtn.textContent='✕';
    delBtn.addEventListener('click',function(){deleteSystem(name);});
    hdr.appendChild(nameInp); hdr.appendChild(orderInp); hdr.appendChild(delBtn);
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
          'value="'+esc(a.name)+'" placeholder="Actor name" onchange="renameActor('+i+',this.value)">'+
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
  if(!name){toast('Please enter a system name','⚠');return;}
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
  if(!name){toast('Please enter an actor name','⚠');return;}
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
function setActorDesc(i,v){actorsRegistry[i].desc=v;}

// RENAME WITH CASCADE (Systems & Actors)
// events[].system/.actor and interactions[].target are plain strings with
// no ID indirection, so a rename is a find-and-replace of the old name
// across every place it's stored: events, sysOrder keys (systems only),
// filterConfig selections, knownSys (systems only), and the registry entry.
function _refreshOpenInspectorAfterRename(oldName,newName,isActor){
  if(editIdx<0||!events[editIdx]) return;
  if(!isActor){
    var se=document.getElementById('system-input');
    if(se&&se.value===oldName) se.value=newName;
    document.querySelectorAll('.iblock').forEach(function(b){
      var ti=document.getElementById('ti-'+b.dataset.id);
      if(ti&&ti.value===oldName) ti.value=newName;
    });
  } else {
    var ae=document.getElementById('actor');
    if(ae&&ae.value===oldName) ae.value=newName;
  }
}
function _cascadeRenameSystem(oldName,newName){
  var touched=0;
  events.forEach(function(ev){
    var hit=false;
    if(ev.system===oldName){ev.system=newName;hit=true;}
    (ev.interactions||[]).forEach(function(i){if(i.target===oldName){i.target=newName;hit=true;}});
    if(hit) touched++;
  });
  return touched;
}
function _cascadeRenameActor(oldName,newName){
  var touched=0;
  events.forEach(function(ev){if(ev.actor===oldName){ev.actor=newName;touched++;}});
  return touched;
}
function _swapFilterName(arr,oldName,newName){
  var fi=arr.indexOf(oldName);
  if(fi===-1) return;
  if(arr.indexOf(newName)===-1) arr[fi]=newName; else arr.splice(fi,1);
}
function _renameToast(oldName,newName,touched,isMerge){
  var suffix=isMerge?' (merged)':'';
  if(!touched){toast('Renamed "'+oldName+'" to "'+newName+'"'+suffix,'✏');return;}
  toast('Renamed "'+oldName+'" to "'+newName+'"'+suffix+' across '+touched+' event'+(touched!==1?'s':''),'✏');
}
function renameSystem(oldName,newName){
  newName=(newName||'').trim();
  if(!newName||newName===oldName){renderSystemsList();return;}
  var collision=systemsRegistry.some(function(s){return s.name===newName&&s.name!==oldName;})||
    (knownSys.has(newName)&&newName!==oldName);
  if(collision){
    showConfirm(
      'A system named "'+newName+'" already exists. Merge "'+oldName+'" into it? '+
      'All events and interactions using "'+oldName+'" will be moved to "'+newName+'", '+
      'and the "'+oldName+'" registry entry will be removed.',
      function(){_doRenameSystem(oldName,newName,true);},
      'Merge','Merge Systems');
    renderSystemsList();
    return;
  }
  _doRenameSystem(oldName,newName,false);
}
function _doRenameSystem(oldName,newName,isMerge){
  var touched=_cascadeRenameSystem(oldName,newName);
  if(sysOrder[oldName]!==undefined){
    if(!isMerge||sysOrder[newName]===undefined) sysOrder[newName]=sysOrder[oldName];
    delete sysOrder[oldName];
  }
  _swapFilterName(filterConfig.systems,oldName,newName);
  var oldReg=systemsRegistry.find(function(s){return s.name===oldName;});
  if(isMerge){
    systemsRegistry=systemsRegistry.filter(function(s){return s.name!==oldName;});
    var newReg=systemsRegistry.find(function(s){return s.name===newName;});
    if(newReg&&oldReg&&!newReg.desc) newReg.desc=oldReg.desc;
  } else if(oldReg){
    oldReg.name=newName;
  } else {
    systemsRegistry.push({name:newName,desc:'',order:undefined});
  }
  knownSys.delete(oldName); knownSys.add(newName);
  _refreshOpenInspectorAfterRename(oldName,newName,false);
  refreshDL(); refreshSysOrderUI(); renderSystemsList(); refreshFilterBar();
  render(); updateList();
  _renameToast(oldName,newName,touched,isMerge);
}
function renameActor(i,newName){
  var oldName=actorsRegistry[i].name;
  newName=(newName||'').trim();
  if(!newName||newName===oldName){renderActorsList();return;}
  var collision=actorsRegistry.some(function(a,ai){return a.name===newName&&ai!==i;});
  if(collision){
    showConfirm(
      'An actor named "'+newName+'" already exists. Merge "'+oldName+'" into it? '+
      'All events using "'+oldName+'" will be moved to "'+newName+'", '+
      'and the "'+oldName+'" registry entry will be removed.',
      function(){_doRenameActor(i,oldName,newName,true);},
      'Merge','Merge Actors');
    renderActorsList();
    return;
  }
  _doRenameActor(i,oldName,newName,false);
}
function _doRenameActor(i,oldName,newName,isMerge){
  var touched=_cascadeRenameActor(oldName,newName);
  _swapFilterName(filterConfig.actors,oldName,newName);
  if(isMerge){
    var oldDesc=actorsRegistry[i].desc;
    actorsRegistry.splice(i,1);
    var newReg=actorsRegistry.find(function(a){return a.name===newName;});
    if(newReg&&!newReg.desc) newReg.desc=oldDesc;
  } else {
    actorsRegistry[i].name=newName;
  }
  _refreshOpenInspectorAfterRename(oldName,newName,true);
  renderActorsList(); refreshActorDL(); refreshFilterBar();
  render(); updateList();
  _renameToast(oldName,newName,touched,isMerge);
}
function refreshActorDL(){
  var dl=document.getElementById('actor-dl');
  if(!dl) return;
  dl.innerHTML='';
  actorsRegistry.forEach(function(a){var o=document.createElement('option');o.value=a.name;dl.appendChild(o);});
}
function refreshLevelDL(){} // levels are fixed; select dropdown is static
