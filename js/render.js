// ── SVG BUILDER ─────────────────────────────────────────
var NS='http://www.w3.org/2000/svg';
function sv(tag,attrs,txt){
  var el=document.createElementNS(NS,tag);
  for(var k in attrs) if(attrs.hasOwnProperty(k)) el.setAttribute(k,String(attrs[k]));
  if(txt!=null) el.textContent=txt; return el;
}
var _renderId=0;
function mkSVG(W,H){
  _renderId++;
  var rid=_renderId;
  var svg=sv('svg',{width:W,height:H,viewBox:'0 0 '+W+' '+H,'data-nat-w':W,'data-nat-h':H});
  var defs=sv('defs');

  // Standard arrowhead marker.
  // viewBox '0 0 10 10', tip at (10,5).
  // refX=10,refY=5 anchors the tip exactly to the line endpoint.
  // markerUnits=strokeWidth: marker scales with line width automatically.
  // markerWidth/Height=6: arrowhead = 6× strokeWidth in size.
  // orient=auto: rotates to match line direction.
  [
    ['push',    svgColors().accent, 'arr-push-'+rid],
    ['pull',    svgColors().teal,   'arr-pull-'+rid],
    ['process', svgColors().proc,   'arr-process-'+rid],
  ].forEach(function(p){
    var m=sv('marker',{
      id:p[2],
      viewBox:'0 0 10 10',
      refX:10, refY:5,
      markerUnits:'strokeWidth',
      markerWidth:6, markerHeight:6,
      orient:'auto'
    });
    m.appendChild(sv('path',{d:'M0,0 L10,5 L0,10 Z', fill:p[1], stroke:'none'}));
    defs.appendChild(m);
  });

  svg.appendChild(defs);
  svg.appendChild(sv('rect',{width:W,height:H,fill:svgColors().bg}));
  svg._rid=rid;
  return svg;
}
function scale1d(d0,d1,r0,r1){var f=(d1===d0)?0:(r1-r0)/(d1-d0);return function(v){return r0+(v-d0)*f;};}
function levelColor(level){
  if(level==='error')     return svgColors().accent;
  if(level==='warning')   return '#f5a623';
  if(level==='info')      return svgColors().teal;
  if(level==='debug')     return svgColors().debug;
  if(level==='comment')   return svgColors().cmnt;
  if(level==='work_note') return svgColors().note;
  return svgColors().label;
}
function drawLevelIcon(g,cx,cy,level,color){
  var sw={'stroke':color,'stroke-width':'2','stroke-linecap':'round','fill':'none'};
  var sw3={'stroke':color,'stroke-width':'2.5','stroke-linecap':'round','fill':'none'};
  if(level==='info'){
    aC(g,cx,cy-5,1.5,{fill:color,stroke:'none'});
    aL(g,cx,cy-2,cx,cy+6,sw);
  }else if(level==='warning'){
    aL(g,cx,cy-5,cx,cy+1,sw);
    aC(g,cx,cy+5,1.5,{fill:color,stroke:'none'});
  }else if(level==='error'){
    aL(g,cx-5,cy-5,cx+5,cy+5,sw3);
    aL(g,cx+5,cy-5,cx-5,cy+5,sw3);
  }else if(level==='debug'){
    aP(g,'M '+cx+' '+(cy-7)+' L '+(cx+6)+' '+cy+' L '+cx+' '+(cy+7)+' L '+(cx-6)+' '+cy+' Z',{fill:color,stroke:'none'});
  }else if(level==='comment'){
    aC(g,cx-4,cy,1.5,{fill:color,stroke:'none'});
    aC(g,cx,cy,1.5,{fill:color,stroke:'none'});
    aC(g,cx+4,cy,1.5,{fill:color,stroke:'none'});
  }else if(level==='work_note'){
    aL(g,cx-5,cy-4,cx+5,cy-4,sw);
    aL(g,cx-5,cy,cx+5,cy,sw);
    aL(g,cx-5,cy+4,cx+5,cy+4,sw);
  }else{
    aT(g,cx,cy+5,'?',{'text-anchor':'middle','font-size':'14','fill':color,'font-weight':'700','font-family':'DM Mono,monospace'});
  }
}
function aT(p,x,y,t,a){var e=sv('text',Object.assign({x:x,y:y},a));e.textContent=t;p.appendChild(e);return e;}
function aL(p,x1,y1,x2,y2,a){p.appendChild(sv('line',Object.assign({x1:x1,y1:y1,x2:x2,y2:y2},a)));return p;}
function aC(p,cx,cy,r,a){p.appendChild(sv('circle',Object.assign({cx:cx,cy:cy,r:r},a)));return p;}
function aR(p,x,y,w,h,a){p.appendChild(sv('rect',Object.assign({x:x,y:y,width:w,height:h},a)));return p;}
function aP(p,d,a){p.appendChild(sv('path',Object.assign({d:d},a)));return p;}

// ── RENDER DISPATCH ─────────────────────────────────────
function render(){
  var ca=document.getElementById('chart'); ca.innerHTML='';
  var te=document.getElementById('stitle');
  te.innerHTML=scenName?'<div class="sbanner">'+esc(scenName)+'<span class="ssub">'+esc(scenDesc)+'</span></div>':'';
  var active=getActiveEvents();
  if(!active.length){
    if(!events.length){
      ca.innerHTML='<div class="estate"><div class="estate-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div>'+
        '<h3>No events yet</h3><p>Add events in the sidebar, then they will appear here as a diagram.</p></div>';
    } else {
      ca.innerHTML='<div class="estate"><div class="estate-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>'+
        '<h3>No events match filters</h3><p>Adjust or clear the active filters to see events.</p></div>';
    }
    if(typeof updateLegendColors==='function') updateLegendColors();
    updateScrollArrows();
    if(typeof persistAppState==='function') persistAppState();
    return;
  }
  var sorted=[...active].sort(function(a,b){return(a.timestamp||0)-(b.timestamp||0);});
  if(appMode==='table'){
    renderTable(ca,sorted);
  } else if(appMode==='timeline'){
    renderTimeline(ca,sorted,document.getElementById('orientation').value);
    applyDiagramZoom(diagramZoom);
    _setupWheelZoom();
    _setupPan();
    var _dsvg=_getSvg(); if(_dsvg) _dsvg.setAttribute('cursor','grab');
  }else{
    renderFlow(ca,document.getElementById('flow-dir').value,displayConfig.showSeq,active);
    applyDiagramZoom(diagramZoom);
    _setupWheelZoom();
    _setupPan();
    var _dsvg=_getSvg(); if(_dsvg) _dsvg.setAttribute('cursor','grab');
  }
  if(typeof updateLegendColors==='function') updateLegendColors();
  _setupScrollArrows();
  updateScrollArrows();
  if(typeof persistAppState==='function') persistAppState();
}

// ── DIAGRAM ZOOM ─────────────────────────────────────────
var ZOOM_MIN=0.05, ZOOM_MAX=5, ZOOM_STEP=1.2, ZOOM_WHEEL_STEP=1.1;
function _getSvg(){return document.querySelector('#chart>svg');}
function applyDiagramZoom(z){
  diagramZoom=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,z));
  var svg=_getSvg(); if(!svg) return;
  var natW=parseFloat(svg.getAttribute('data-nat-w'));
  var natH=parseFloat(svg.getAttribute('data-nat-h'));
  svg.setAttribute('width',natW*diagramZoom);
  svg.setAttribute('height',natH*diagramZoom);
  var zd=document.getElementById('zoom-level');
  if(zd) zd.textContent=Math.round(diagramZoom*100)+'%';
  updateScrollArrows();
}
function getDiagramFitZoom(){
  var vp=document.querySelector('.cvport'), svg=_getSvg();
  if(!svg||!vp) return 1.0;
  var natW=parseFloat(svg.getAttribute('data-nat-w'));
  var natH=parseFloat(svg.getAttribute('data-nat-h'));
  if(!natW||!natH) return 1.0;
  var st=document.getElementById('stitle');
  var vpW=vp.clientWidth-40, vpH=vp.clientHeight-40-(st?st.offsetHeight:0);
  return Math.min(vpW/natW, vpH/natH);
}
function zoomToFit(){applyDiagramZoom(getDiagramFitZoom());}
function zoomToNormal(){
  applyDiagramZoom(1.0);
  var vp=document.querySelector('.cvport'); if(vp){vp.scrollTop=0;vp.scrollLeft=0;}
}
function zoomIn(){applyDiagramZoom(diagramZoom*ZOOM_STEP);}
function zoomOut(){applyDiagramZoom(diagramZoom/ZOOM_STEP);}
function _setupWheelZoom(){
  var vp=document.querySelector('.cvport');
  if(!vp||vp._wzBound) return;
  vp._wzBound=true;
  vp.addEventListener('wheel',function(e){
    var svg=_getSvg(); if(!svg||appMode==='table') return;
    e.preventDefault();
    var oldZ=diagramZoom;
    var factor=e.deltaY<0?ZOOM_WHEEL_STEP:(1/ZOOM_WHEEL_STEP);
    var newZ=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,oldZ*factor));
    // Focal point: mouse position mapped to SVG natural coordinates
    var svgRect=svg.getBoundingClientRect();
    var vpRect=vp.getBoundingClientRect();
    var mxOnSvg=e.clientX-svgRect.left;
    var myOnSvg=e.clientY-svgRect.top;
    var natX=mxOnSvg/oldZ, natY=myOnSvg/oldZ;
    var svgInScrollX=svgRect.left-vpRect.left+vp.scrollLeft;
    var svgInScrollY=svgRect.top-vpRect.top+vp.scrollTop;
    applyDiagramZoom(newZ);
    vp.scrollLeft=svgInScrollX+natX*newZ-(e.clientX-vpRect.left);
    vp.scrollTop=svgInScrollY+natY*newZ-(e.clientY-vpRect.top);
  },{passive:false});
}

function _setupPan(){
  var vp=document.querySelector('.cvport');
  if(!vp||vp._panBound) return;
  vp._panBound=true;
  var panning=false, panSvg=null, startX, startY, startScrollX, startScrollY;
  var panCursorStyle=document.getElementById('_pan-cursor-style');
  if(!panCursorStyle){
    panCursorStyle=document.createElement('style');
    panCursorStyle.id='_pan-cursor-style';
    document.head.appendChild(panCursorStyle);
  }

  vp.addEventListener('mousedown',function(e){
    if(e.button!==0) return;
    var svg=_getSvg(); if(!svg||appMode==='table') return;
    // Walk up from target to SVG root; bail out if an event hit area is found
    var t=e.target;
    while(t&&t!==svg){
      if(t.getAttribute&&t.getAttribute('data-event-hit')) return;
      t=t.parentNode;
    }
    if(t!==svg) return; // click was outside the SVG entirely
    panning=true;
    panSvg=svg;
    svg._didPan=false;
    startX=e.clientX; startY=e.clientY;
    startScrollX=vp.scrollLeft; startScrollY=vp.scrollTop;
    panCursorStyle.textContent='*{cursor:grabbing!important;user-select:none!important}';
    e.preventDefault();
  });

  document.addEventListener('mousemove',function(e){
    if(!panning||!panSvg) return;
    if(Math.abs(e.clientX-startX)>3||Math.abs(e.clientY-startY)>3) panSvg._didPan=true;
    vp.scrollLeft=startScrollX-(e.clientX-startX);
    vp.scrollTop=startScrollY-(e.clientY-startY);
  });

  document.addEventListener('mouseup',function(){
    if(!panning) return;
    panning=false;
    panCursorStyle.textContent='';
  });
}

// ── CANVAS SCROLL ARROWS ─────────────────────────────────
var SCROLL_ARROW_SPEED=7; // px per animation frame while hovering
var SCROLL_ARROW_TOL=2;   // ignore sub-pixel scroll remainders
var _scrollArrowRaf=null;
var SCROLL_ARROW_DIRS=['up','down','left','right'];

function _scrollArrowEl(dir){return document.getElementById('scroll-arrow-'+dir);}

function updateScrollArrows(){
  var vp=document.querySelector('.cvport');
  if(!vp) return;
  var hide=appMode==='table';
  var maxX=vp.scrollWidth-vp.clientWidth, maxY=vp.scrollHeight-vp.clientHeight;
  var shown={
    up:   vp.scrollTop>SCROLL_ARROW_TOL,
    down: vp.scrollTop<maxY-SCROLL_ARROW_TOL,
    left: vp.scrollLeft>SCROLL_ARROW_TOL,
    right:vp.scrollLeft<maxX-SCROLL_ARROW_TOL
  };
  SCROLL_ARROW_DIRS.forEach(function(dir){
    var el=_scrollArrowEl(dir);
    if(el) el.classList.toggle('scroll-arrow-hidden',hide||!shown[dir]);
  });
}

function _stopArrowScroll(){
  if(_scrollArrowRaf){cancelAnimationFrame(_scrollArrowRaf);_scrollArrowRaf=null;}
}

function _startArrowScroll(dir){
  _stopArrowScroll();
  var vp=document.querySelector('.cvport'); if(!vp) return;
  var dx=dir==='left'?-SCROLL_ARROW_SPEED:dir==='right'?SCROLL_ARROW_SPEED:0;
  var dy=dir==='up'?-SCROLL_ARROW_SPEED:dir==='down'?SCROLL_ARROW_SPEED:0;
  function step(){
    var prevX=vp.scrollLeft, prevY=vp.scrollTop;
    vp.scrollLeft=prevX+dx; vp.scrollTop=prevY+dy;
    // Edge reached — the arrow hides itself, so no mouseleave would arrive
    if(vp.scrollLeft===prevX&&vp.scrollTop===prevY){_stopArrowScroll();return;}
    _scrollArrowRaf=requestAnimationFrame(step);
  }
  _scrollArrowRaf=requestAnimationFrame(step);
}

function _jumpToScrollEdge(dir){
  var vp=document.querySelector('.cvport'); if(!vp) return;
  if(dir==='up') vp.scrollTop=0;
  else if(dir==='down') vp.scrollTop=vp.scrollHeight;
  else if(dir==='left') vp.scrollLeft=0;
  else vp.scrollLeft=vp.scrollWidth;
  updateScrollArrows();
}

function _setupScrollArrows(){
  var vp=document.querySelector('.cvport');
  if(!vp||vp._arrowsBound) return;
  vp._arrowsBound=true;
  SCROLL_ARROW_DIRS.forEach(function(dir){
    var el=_scrollArrowEl(dir); if(!el) return;
    el.addEventListener('mouseenter',function(){_startArrowScroll(dir);});
    el.addEventListener('mouseleave',_stopArrowScroll);
    el.addEventListener('click',function(){_stopArrowScroll();_jumpToScrollEdge(dir);});
  });
  vp.addEventListener('scroll',updateScrollArrows);
  window.addEventListener('resize',updateScrollArrows);
}

// ── LIST VIEW ───────────────────────────────────────────
function renderList(parent,sorted){
  var wrap=document.createElement('div'); wrap.style.cssText='max-width:680px;margin:0 auto';
  var tz=getDisplayTZ();
  sorted.forEach(function(e){
    var d=document.createElement('div');
    var c=svgColors();d.style.cssText='background:'+c.listBg+';border:1px solid '+c.listBdr+';border-radius:10px;padding:13px 15px;margin-bottom:10px;border-left:3px solid '+c.accent;
    var ts=fmtTs(e.timestamp,displayConfig.showDate);
    var levelHtml='';
    if(displayConfig.showLevel&&e.level){
      var lc=levelColor(e.level);
      levelHtml='<span style="display:inline-block;font-family:DM Mono,monospace;font-size:.65rem;font-weight:800;padding:1px 6px;border-radius:4px;background:'+lc+'22;color:'+lc+';margin-left:6px;vertical-align:middle">'+esc(e.level.toUpperCase())+'</span>';
    }
    var h='<div style="font-family:DM Mono,monospace;font-size:.7rem;color:'+c.listTs+';margin-bottom:5px">'+esc(ts)+' <span style="opacity:.6">'+esc(tz)+'</span></div>'+
      '<div style="font-size:.93rem;font-weight:600;color:'+c.listDesc+';margin-bottom:3px">'+esc(e.desc)+levelHtml+'</div>'+
      '<div style="font-size:.77rem;color:'+c.listSys+'">'+esc(e.system||'')+(displayConfig.showActor&&e.actor?' &middot; '+esc(e.actor):'')+'</div>';
    if(displayConfig.showEventCode&&e.eventCode){
      h+='<div style="font-family:DM Mono,monospace;font-size:.72rem;color:'+c.listTs+';margin-top:3px">'+esc(e.eventCode)+(displayConfig.showManagedIntegrationCode&&e.managedIntegrationCode?' &middot; '+esc(e.managedIntegrationCode):'')+'</div>';
    } else if(displayConfig.showManagedIntegrationCode&&e.managedIntegrationCode){
      h+='<div style="font-family:DM Mono,monospace;font-size:.72rem;color:'+c.listTs+';margin-top:3px">'+esc(e.managedIntegrationCode)+'</div>';
    }
    if((e.interactions||[]).length){
      h+='<div style="margin-top:7px;font-size:.78rem;color:'+c.listInt+'">';
      e.interactions.forEach(function(i){h+='<span style="margin-right:9px">&rarr; '+esc(i.nature)+' '+esc(i.target)+(i.delay?' +'+i.delay+'ms':'')+'</span>';});
      h+='</div>';
    }
    d.innerHTML=h; wrap.appendChild(d);
  });
  parent.appendChild(wrap);
}

// ── TABLE SORT STATE ────────────────────────────────────────
var tableSortCol=null;  // null = use incoming order (timestamp asc); otherwise event field key
var tableSortDir='asc';

// ── TABLE VIEW ───────────────────────────────────────────
function renderTable(parent,sorted){
  var c=svgColors();
  var tz=getDisplayTZ();

  // Column definitions: key, header label, sort field, default width (px)
  var COLS=[
    {key:'sel',    label:'',                  sortKey:null,                     def:32 },
    {key:'expand', label:'',                  sortKey:null,                     def:26 },
    {key:'ts',     label:'Timestamp ('+tz+')',sortKey:'timestamp',              def:160},
    {key:'desc',   label:'Description',        sortKey:'desc',                  def:280},
    {key:'level',  label:'Level',              sortKey:'level',                 def:80 },
    {key:'sys',    label:'System',             sortKey:'system',                def:140},
    {key:'actor',  label:'Actor',              sortKey:'actor',                 def:120},
    {key:'ec',     label:'Event Code',         sortKey:'eventCode',             def:120},
    {key:'ic',     label:'Integration Code',   sortKey:'managedIntegrationCode',def:140},
  ];

  // Load saved column widths from localStorage
  var savedWidths={};
  try{ savedWidths=JSON.parse(localStorage.getItem('weave-table-col-widths')||'{}'); }catch(e){}
  var colWidths=COLS.map(function(col){ return savedWidths[col.key]||col.def; });

  // Sort rows
  var rows=sorted.slice();
  if(tableSortCol){
    rows.sort(function(a,b){
      if(tableSortCol==='timestamp'){
        var av=a.timestamp||0, bv=b.timestamp||0;
        return tableSortDir==='asc'?av-bv:bv-av;
      }
      var av=String(a[tableSortCol]||'').toLowerCase();
      var bv=String(b[tableSortCol]||'').toLowerCase();
      if(av<bv) return tableSortDir==='asc'?-1:1;
      if(av>bv) return tableSortDir==='asc'?1:-1;
      return 0;
    });
  }

  // Selection action bar
  var selCount=0;
  rows.forEach(function(e){if(tableSelection.has(e._id)) selCount++;});
  if(selCount>0){
    var selBar=document.createElement('div');
    selBar.className='tbl-sel-bar';
    var selLabel=document.createElement('span');
    selLabel.className='tbl-sel-count';
    selLabel.textContent=selCount+' selected';
    var delSelBtn=document.createElement('button');
    delSelBtn.className='btn btn-d btn-sm';
    delSelBtn.textContent='\uD83D\uDDD1 Delete Selected';
    delSelBtn.onclick=function(){
      var ids=[...tableSelection];
      showConfirm(
        'Delete '+ids.length+' selected event'+(ids.length!==1?'s':'')+' ? This cannot be undone.',
        function(){
          var editEvId=editIdx>=0&&events[editIdx]?events[editIdx]._id:'';
          var editWasDeleted=editEvId&&tableSelection.has(editEvId);
          var remaining=events.filter(function(ev){return !tableSelection.has(ev._id);});
          events.length=0; remaining.forEach(function(ev){events.push(ev);});
          tableSelection.clear();
          if(editWasDeleted){
            clearForm();
          } else if(editEvId){
            editIdx=findEventByIdIdx(editEvId);
            if(editIdx<0) clearForm();
          }
          render(); updateList(); refreshFilterBar();
          toast('Deleted '+ids.length+' event'+(ids.length!==1?'s':''),'\uD83D\uDDD1');
        },
        'Delete '+ids.length,
        'Delete Selected Events'
      );
    };
    var clearSelBtn=document.createElement('button');
    clearSelBtn.className='btn btn-s btn-sm';
    clearSelBtn.textContent='Clear selection';
    clearSelBtn.onclick=function(){tableSelection.clear();render();};
    selBar.appendChild(selLabel);
    selBar.appendChild(delSelBtn);
    selBar.appendChild(clearSelBtn);
    parent.appendChild(selBar);
  }

  var wrap=document.createElement('div');
  wrap.style.cssText='overflow-x:auto;width:100%;padding:10px 0';

  var totalW=colWidths.reduce(function(s,w){return s+w;},0);
  var tbl=document.createElement('table');
  tbl.style.cssText='border-collapse:collapse;font-size:.83rem;table-layout:fixed;width:'+Math.max(totalW,400)+'px';

  // Colgroup so widths are respected with table-layout:fixed
  var cg=document.createElement('colgroup');
  COLS.forEach(function(col,ci){
    var ce=document.createElement('col');
    ce.style.width=colWidths[ci]+'px';
    cg.appendChild(ce);
  });
  tbl.appendChild(cg);

  // Header
  var thead=document.createElement('thead');
  var hrow=document.createElement('tr');
  COLS.forEach(function(col,ci){
    var th=document.createElement('th');
    th.style.cssText='padding:8px 10px;text-align:left;font-family:DM Mono,monospace;font-size:.68rem;font-weight:700;'+
      'color:'+c.label+';border-bottom:2px solid '+c.grid+';white-space:nowrap;text-transform:uppercase;letter-spacing:.06em;'+
      'position:relative;user-select:none;overflow:hidden;box-sizing:border-box';

    if(col.key==='sel'){
      // Select-all checkbox
      var chkAll=document.createElement('input');
      chkAll.type='checkbox';
      chkAll.title='Select all';
      chkAll.style.cssText='cursor:pointer;accent-color:var(--accent)';
      var allIds=rows.map(function(r){return r._id;});
      chkAll.checked=allIds.length>0&&allIds.every(function(id){return tableSelection.has(id);});
      chkAll.indeterminate=!chkAll.checked&&allIds.some(function(id){return tableSelection.has(id);});
      chkAll.onchange=function(e2){
        e2.stopPropagation();
        if(chkAll.checked) allIds.forEach(function(id){tableSelection.add(id);});
        else allIds.forEach(function(id){tableSelection.delete(id);});
        render();
      };
      th.appendChild(chkAll);
    } else if(col.label){
      if(col.sortKey){
        // Sortable header
        th.style.cursor='pointer';
        var labelSpan=document.createElement('span');
        labelSpan.textContent=col.label;
        var ind=document.createElement('span');
        ind.style.cssText='margin-left:4px;font-size:.65rem';
        if(tableSortCol===col.sortKey){
          ind.textContent=tableSortDir==='asc'?'\u25b2':'\u25bc';
          ind.style.color=c.accent;
          ind.style.opacity='1';
        }else{
          ind.textContent='\u25b4';
          ind.style.opacity='.28';
        }
        th.appendChild(labelSpan);
        th.appendChild(ind);
        th.onclick=(function(sk){return function(e){
          // ignore if click was on the resize handle
          if(e.target&&e.target.classList.contains('tbl-rh')) return;
          if(tableSortCol===sk){
            tableSortDir=tableSortDir==='asc'?'desc':'asc';
          }else{
            tableSortCol=sk;
            tableSortDir='asc';
          }
          render();
        };})(col.sortKey);
      }else{
        th.textContent=col.label;
      }
    }

    // Resize handle (not on sel/expand columns or last column)
    if(col.key!=='sel' && col.key!=='expand' && ci<COLS.length-1){
      var rh=document.createElement('div');
      rh.className='tbl-rh';
      rh.style.cssText='position:absolute;top:0;right:0;width:5px;height:100%;cursor:col-resize;z-index:2';
      rh.addEventListener('mousedown',(function(colIdx){
        return function(ev){
          ev.preventDefault(); ev.stopPropagation();
          var startX=ev.clientX, startW=colWidths[colIdx];
          function onMove(me){
            var newW=Math.max(40,Math.round(startW+(me.clientX-startX)));
            colWidths[colIdx]=newW;
            var cols=tbl.querySelectorAll('col');
            if(cols[colIdx]) cols[colIdx].style.width=newW+'px';
            var tw=colWidths.reduce(function(s,w){return s+w;},0);
            tbl.style.width=Math.max(tw,400)+'px';
          }
          function onUp(){
            document.removeEventListener('mousemove',onMove);
            document.removeEventListener('mouseup',onUp);
            // Persist widths
            var wObj={};
            COLS.forEach(function(c,i){ wObj[c.key]=colWidths[i]; });
            try{ localStorage.setItem('weave-table-col-widths',JSON.stringify(wObj)); }catch(e){}
          }
          document.addEventListener('mousemove',onMove);
          document.addEventListener('mouseup',onUp);
        };
      })(ci));
      th.appendChild(rh);
    }

    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  tbl.appendChild(thead);

  // Description clamp/expand style strings (captured for closures)
  var clampSty='display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'+
    'font-weight:400;color:'+c.tableDesc+';word-break:break-word';
  var expandSty='display:block;overflow:visible;font-weight:400;color:'+c.tableDesc+';word-break:break-word';

  var tbody=document.createElement('tbody');
  // Track desc inner+btn pairs for post-render overflow check
  var descPairs=[];

  rows.forEach(function(e,idx){
    var hasInts=(e.interactions||[]).length>0;
    var rowId='tbl-row-'+(e._id||idx);
    var isSel=tableSelection.has(e._id);
    var isOdd=idx%2===1;
    var rowBg=isSel?'':(isOdd?c.laneAlt:'transparent');

    var tr=document.createElement('tr');
    tr.style.cssText='border-bottom:1px solid '+c.grid+';background:'+rowBg+';cursor:pointer';
    if(isSel) tr.classList.add('tbl-row-sel');

    // Row click → edit event (ignore clicks on interactive elements)
    tr.addEventListener('click',(function(evId){return function(ev){
      if(ev.target.tagName==='INPUT'||ev.target.tagName==='BUTTON') return;
      var evIdx=findEventByIdIdx(evId);
      if(evIdx>=0) editEvent(evIdx);
    };})(e._id));

    // Checkbox cell
    var tdSel=document.createElement('td');
    tdSel.style.cssText='padding:8px 6px;text-align:center;overflow:hidden';
    var chk=document.createElement('input');
    chk.type='checkbox';
    chk.checked=isSel;
    chk.style.cssText='cursor:pointer;accent-color:var(--accent)';
    chk.onchange=(function(evId){return function(ev2){
      ev2.stopPropagation();
      if(chk.checked) tableSelection.add(evId); else tableSelection.delete(evId);
      render();
    };})(e._id);
    tdSel.appendChild(chk);
    tr.appendChild(tdSel);

    // Expand toggle cell (interactions)
    var tdTgl=document.createElement('td');
    tdTgl.style.cssText='padding:8px 6px;text-align:center;overflow:hidden';
    if(hasInts){
      var btn=document.createElement('button');
      btn.textContent='+';
      btn.title='Show interactions';
      btn.style.cssText='background:none;border:1px solid '+c.accent+';color:'+c.accent+
        ';border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:.8rem;line-height:1;padding:0;'+
        'display:inline-flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0';
      btn.onclick=(function(id,b){return function(ev2){
        ev2.stopPropagation();
        var sub=document.getElementById(id+'-sub');
        if(!sub) return;
        var open=sub.style.display!=='none';
        sub.style.display=open?'none':'';
        b.textContent=open?'+':'\u2212';
        b.title=open?'Show interactions':'Hide interactions';
      };})(rowId,btn);
      tdTgl.appendChild(btn);
    }
    tr.appendChild(tdTgl);

    // Timestamp
    var tdTs=document.createElement('td');
    tdTs.style.cssText='padding:8px 10px;font-family:DM Mono,monospace;font-size:.7rem;color:'+c.listTs+
      ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    tdTs.textContent=e.timestamp?fmtTs(e.timestamp,displayConfig.showDate):'—';
    tr.appendChild(tdTs);

    // Description — 2-line clamp with per-row expand toggle
    var tdDesc=document.createElement('td');
    tdDesc.style.cssText='padding:8px 10px;overflow:hidden';
    var descInner=document.createElement('div');
    descInner.style.cssText=clampSty;
    descInner.textContent=e.desc||'';
    tdDesc.appendChild(descInner);
    var descBtn=document.createElement('button');
    descBtn.textContent='more';
    descBtn.style.cssText='display:none;background:none;border:none;padding:0 0 0 2px;cursor:pointer;'+
      'font-size:.68rem;color:'+c.accent+';font-family:DM Mono,monospace;font-weight:600;line-height:1.6';
    descBtn.onclick=(function(inner,dbtn,cs,es){return function(ev){
      ev.stopPropagation();
      var expanded=inner.style.overflow==='visible';
      inner.style.cssText=expanded?cs:es;
      dbtn.textContent=expanded?'more':'less';
    };})(descInner,descBtn,clampSty,expandSty);
    tdDesc.appendChild(descBtn);
    descPairs.push({inner:descInner,btn:descBtn});
    tr.appendChild(tdDesc);

    // Level
    var tdLvl=document.createElement('td');
    tdLvl.style.cssText='padding:8px 10px;white-space:nowrap;overflow:hidden';
    if(e.level){
      var lc=levelColor(e.level);
      var lb=document.createElement('span');
      lb.textContent=e.level.toUpperCase();
      lb.style.cssText='font-family:DM Mono,monospace;font-size:.65rem;font-weight:800;padding:1px 6px;border-radius:4px;'+
        'background:'+lc+'22;color:'+lc;
      tdLvl.appendChild(lb);
    }else{
      tdLvl.style.color=c.label;
      tdLvl.textContent='—';
    }
    tr.appendChild(tdLvl);

    // System
    var tdSys=document.createElement('td');
    tdSys.style.cssText='padding:8px 10px;color:'+c.listSys+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    tdSys.textContent=e.system||'—';
    tr.appendChild(tdSys);

    // Actor
    var tdAct=document.createElement('td');
    tdAct.style.cssText='padding:8px 10px;color:'+c.listSys+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    tdAct.textContent=e.actor||'—';
    tr.appendChild(tdAct);

    // Event Code
    var tdEc=document.createElement('td');
    tdEc.style.cssText='padding:8px 10px;font-family:DM Mono,monospace;font-size:.72rem;color:'+c.listTs+
      ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    tdEc.textContent=e.eventCode||'—';
    tr.appendChild(tdEc);

    // Integration Code
    var tdIc=document.createElement('td');
    tdIc.style.cssText='padding:8px 10px;font-family:DM Mono,monospace;font-size:.72rem;color:'+c.listTs+
      ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    tdIc.textContent=e.managedIntegrationCode||'—';
    tr.appendChild(tdIc);

    tbody.appendChild(tr);

    // Interactions sub-row (hidden by default)
    if(hasInts){
      var subTr=document.createElement('tr');
      subTr.id=rowId+'-sub';
      subTr.style.display='none';
      var subTd=document.createElement('td');
      subTd.colSpan=COLS.length;
      subTd.style.cssText='padding:4px 10px 10px 36px;background:'+c.subRowBg;

      var subTbl=document.createElement('table');
      subTbl.style.cssText='width:100%;border-collapse:collapse;font-size:.77rem';
      var subThead=document.createElement('thead');
      var subHrow=document.createElement('tr');
      ['#','Target','Type','Delay','Label'].forEach(function(h){
        var th=document.createElement('th');
        th.textContent=h;
        th.style.cssText='padding:5px 8px;text-align:left;font-family:DM Mono,monospace;font-size:.65rem;font-weight:700;'+
          'color:'+c.listInt+';border-bottom:1px solid '+c.grid+';text-transform:uppercase;letter-spacing:.05em';
        subHrow.appendChild(th);
      });
      subThead.appendChild(subHrow);
      subTbl.appendChild(subThead);

      var subTbody=document.createElement('tbody');
      var sortedInts=[...(e.interactions||[])].sort(function(a,b){return(a.order||0)-(b.order||0);});
      sortedInts.forEach(function(i,ii){
        var itr=document.createElement('tr');
        itr.style.cssText='border-bottom:1px solid '+c.grid+'33';
        var natColor=i.nature==='push'?c.accent:i.nature==='pull'?c.teal:c.proc;
        [
          {text:String(ii+1),style:'font-family:DM Mono,monospace;font-size:.65rem;color:'+c.label+';width:24px'},
          {text:i.target||'—',style:'color:'+c.listSys+';font-weight:600'},
          {text:i.nature||'—',style:'font-family:DM Mono,monospace;color:'+natColor+';font-weight:700'},
          {text:i.delay?i.delay+'ms':'—',style:'font-family:DM Mono,monospace;color:'+c.listTs},
          {text:i.label||'—',style:'color:'+c.tableDesc}
        ].forEach(function(cell){
          var td=document.createElement('td');
          td.textContent=cell.text;
          td.style.cssText='padding:5px 8px;'+cell.style;
          itr.appendChild(td);
        });
        subTbody.appendChild(itr);
      });
      subTbl.appendChild(subTbody);
      subTd.appendChild(subTbl);
      subTr.appendChild(subTd);
      tbody.appendChild(subTr);
    }
  });

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  parent.appendChild(wrap);

  // Post-render: show expand button only where description actually overflows 2 lines
  descPairs.forEach(function(p){
    if(p.inner.scrollHeight>p.inner.clientHeight+2){
      p.btn.style.display='inline-block';
    }
  });
}
