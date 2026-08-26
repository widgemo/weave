// ── FILTER BAR ───────────────────────────────────────────

// Multichoice dropdown state (open/close)
var _openFDD=null;

// Keys for each multichoice dropdown
var FDD_KEYS=[
  {key:'systems', label:'Systems'},
  {key:'actors', label:'Actors'},
  {key:'levels', label:'Level'},
  {key:'eventCodes', label:'Event Code'},
  {key:'integrationCodes', label:'Int. Code'},
  {key:'eventIds', label:'Events'}
];

// Maps filter key to the event property name
var FDD_PROP={systems:'system',actors:'actor',levels:'level',eventCodes:'eventCode',integrationCodes:'managedIntegrationCode'};

// Build option values for each dropdown from current events
function getFDDOptions(key){
  if(key==='eventIds') return events.map(function(ev){return ev._id;});
  var prop=FDD_PROP[key];
  var vals=new Set();
  events.forEach(function(ev){var v=ev[prop]||''; if(v) vals.add(v);});
  return [...vals].sort();
}

// Build/refresh the filter bar dropdowns
function refreshFilterBar(){
  FDD_KEYS.forEach(function(fd){
    var panel=document.getElementById('fdd-panel-'+fd.key);
    if(!panel) return;
    var opts=getFDDOptions(fd.key);
    var selected=filterConfig[fd.key];
    panel.innerHTML='';
    if(!opts.length){
      panel.innerHTML='<span class="fdd-empty">No options</span>';
    } else {
      opts.forEach(function(val){
        var chk=document.createElement('label');
        chk.className='fdd-opt';
        var inp=document.createElement('input');
        inp.type='checkbox';
        inp.value=val;
        inp.checked=selected.indexOf(val)!==-1;
        inp.addEventListener('change',function(){applyFDDChange(fd.key);});
        var dispVal=(fd.key==='levels'&&LEVEL_LABELS[val])?LEVEL_LABELS[val]:val;
        if(fd.key==='eventIds'){
          var event=findEventByIdIdx(val);
          dispVal=event?trunc(event.desc||'(unnamed event)',40)+' ['+(event.system||'?')+']':val;
        }
        chk.appendChild(inp);
        chk.appendChild(document.createTextNode(dispVal));
        panel.appendChild(chk);
      });
    }
    _updateFDDButton(fd.key);
  });
  _updateFilterToggleBtn();
}

function _updateFDDButton(key){
  var btn=document.getElementById('fdd-btn-'+key);
  if(!btn) return;
  var sel=filterConfig[key];
  var fd=FDD_KEYS.filter(function(f){return f.key===key;})[0];
  var label=fd?fd.label:key;
  btn.innerHTML=label+(sel.length?' <span class="fdd-count">'+sel.length+'</span>':'')+' <span class="fdd-arrow">&#x25BE;</span>';
  btn.classList.toggle('fdd-btn-active',sel.length>0);
}

function _updateFilterToggleBtn(){
  var btn=document.getElementById('filter-toggle-btn');
  if(!btn) return;
  var active=isFilterActive();
  btn.classList.toggle('filter-toggle-active',active);
  var cnt=filterConfig.systems.length+filterConfig.actors.length+filterConfig.levels.length+
      filterConfig.eventCodes.length+filterConfig.integrationCodes.length+filterConfig.eventIds.length;
  var badge=document.getElementById('filter-badge');
  if(badge){
    badge.textContent=cnt>0?String(cnt):'';
    badge.style.display=cnt>0?'inline-flex':'none';
  }
}

// Read checkboxes for a given key and update filterConfig
function applyFDDChange(key){
  var panel=document.getElementById('fdd-panel-'+key);
  if(!panel) return;
  var checked=[];
  panel.querySelectorAll('input[type=checkbox]:checked').forEach(function(cb){checked.push(cb.value);});
  filterConfig[key]=checked;
  _updateFDDButton(key);
  _updateFilterToggleBtn();
  render();
}

// Text search input handler
function applyTextFilter(){
  var inp=document.getElementById('f-text');
  filterConfig.text=inp?inp.value:'';
  _updateFilterToggleBtn();
  render();
}

// Clear all filters
function clearFilters(){
  filterConfig.text='';
  filterConfig.systems=[];
  filterConfig.actors=[];
  filterConfig.levels=[];
  filterConfig.eventCodes=[];
  filterConfig.integrationCodes=[];
  filterConfig.eventIds=[];
  filterConfig.showRelated=true;
  var inp=document.getElementById('f-text');
  if(inp) inp.value='';
  var chk=document.getElementById('f-show-related');
  if(chk) chk.checked=true;
  refreshFilterBar();
  render();
}

function isolateEvent(eventId){
  if(findEventByIdIdx(eventId)<0) return;
  filterConfig.eventIds=[eventId];
  closeEventContextMenu();
  refreshFilterBar();
  render();
}

function clearEventIsolation(){
  filterConfig.eventIds=[];
  closeEventContextMenu();
  refreshFilterBar();
  render();
}

// Show Related Items checkbox handler
function applyShowRelated(){
  var chk=document.getElementById('f-show-related');
  filterConfig.showRelated=chk?chk.checked:true;
  render();
}

// Toggle filter bar visibility
function toggleFilterBar(){
  var bar=document.getElementById('fbar');
  if(!bar) return;
  var hidden=bar.classList.toggle('fbar-hidden');
  var btn=document.getElementById('filter-toggle-btn');
  if(btn) btn.setAttribute('aria-expanded', String(!hidden));
  if(!hidden) refreshFilterBar();
}

// Toggle individual dropdown panel
function toggleFDD(key,event){
  if(event) event.stopPropagation();
  var panel=document.getElementById('fdd-panel-'+key);
  if(!panel) return;
  if(_openFDD&&_openFDD!==key){
    var prev=document.getElementById('fdd-panel-'+_openFDD);
    if(prev) prev.classList.remove('fdd-open');
  }
  var isOpen=panel.classList.toggle('fdd-open');
  _openFDD=isOpen?key:null;
}

// Close all dropdowns when clicking outside
document.addEventListener('click',function(e){
  if(!_openFDD) return;
  var container=document.getElementById('fdd-'+_openFDD);
  if(container&&!container.contains(e.target)){
    var panel=document.getElementById('fdd-panel-'+_openFDD);
    if(panel) panel.classList.remove('fdd-open');
    _openFDD=null;
  }
});
