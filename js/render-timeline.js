// ── COMPACT TIMELINE SCALE ──────────────────────────────

// Format a duration (ms) into a human-readable compressed-gap label.
function fmtDuration(ms){
  if(ms<60000)       return Math.round(ms/1000)+'s compressed';
  if(ms<3600000)     return parseFloat((ms/60000).toFixed(1))+'m compressed';
  if(ms<86400000)    return parseFloat((ms/3600000).toFixed(1))+'h compressed';
  return parseFloat((ms/86400000).toFixed(1))+'d compressed';
}

// Build a compact (non-linear) 1-D scale from timestamps.
// EH   = event height in pixels (visual footprint of one event node).
// minGap = shortest non-zero time gap (ms) between same-system events.
// Scale: normal gaps map proportionally at pxPerMs = EH / minGap, so the
// smallest gap always occupies exactly EH pixels (one event footprint).
// Large gaps (> 3*EH at natural scale, i.e. > 3*minGap ms) are compressed
// to EH pixels so events at their boundaries are also exactly EH apart.
// This guarantees adjacent events are never closer than EH px (no overlap).
// The total pixel extent is computed from the segments and exposed as sc._totalPx.
// Returns a function sc(t) -> visual position, with sc._breakpoints and sc._totalPx.
function buildCompactScale(allTs, EH, minGap){
  var n=allTs.length;
  var fallbackPx=EH*10;
  if(n<=1||minGap<=0){
    var sc=scale1d(allTs[0]||0,(allTs[0]||0)+60000,0,fallbackPx);
    sc._breakpoints=null; sc._totalPx=fallbackPx; return sc;
  }

  // px per ms at natural (uncompressed) scale — minimum gap maps to exactly EH px
  var pxPerMs=EH/minGap;
  // A gap is "large" when it would occupy more than 3*EH pixels at natural scale
  var compressThreshMs=3*EH/pxPerMs; // = 3*minGap
  // Compressed gaps are allocated exactly EH pixels so no two adjacent events
  // are ever closer than EH px (matching the event visual footprint).
  var compactGapPx=EH;

  var gaps=[];
  for(var i=1;i<n;i++) gaps.push(allTs[i]-allTs[i-1]);
  var largeMask=gaps.map(function(g){return g>compressThreshMs;});
  var numLarge=largeMask.filter(Boolean).length;

  if(numLarge===0){
    // No large gaps — fully proportional scale
    var totalPx=(allTs[n-1]-allTs[0])*pxPerMs;
    var sc=scale1d(allTs[0],allTs[n-1],0,totalPx);
    sc._breakpoints=null; sc._totalPx=totalPx; return sc;
  }

  // Build breakpoints: normal gaps proportional, large gaps compressed
  var breakpoints=[],curV=0;
  for(var i=0;i<n-1;i++){
    var g=gaps[i];
    var segPx=largeMask[i]?compactGapPx:g*pxPerMs;
    breakpoints.push({t0:allTs[i],t1:allTs[i+1],v0:curV,v1:curV+segPx,compressed:largeMask[i],gapMs:g});
    curV+=segPx;
  }
  var totalPx=curV;

  // Scale function — linearly interpolates within each breakpoint segment
  function compactScale(t){
    if(t<=allTs[0]) return 0;
    if(t>=allTs[n-1]) return totalPx;
    for(var i=0;i<breakpoints.length;i++){
      var bp=breakpoints[i];
      if(t>=bp.t0&&t<=bp.t1){
        if(bp.t1===bp.t0) return bp.v0;
        return bp.v0+(t-bp.t0)/(bp.t1-bp.t0)*(bp.v1-bp.v0);
      }
    }
    return totalPx;
  }
  compactScale._breakpoints=breakpoints;
  compactScale._totalPx=totalPx;
  return compactScale;
}

// ── TIMELINE MULTI-LANE ──────────────────────────────
function renderTimeline(parent,sorted,orientation){
  var sySet=new Set();
  sorted.forEach(function(e){sySet.add(e.system);(e.interactions||[]).forEach(function(i){if(i.target)sySet.add(i.target);});});
  var sysArr=getSysArray(sySet), N=sysArr.length, isH=orientation==='horizontal';
  // Scale is based on event timestamps only so events are positioned by their
  // actual timestamps, not distorted by interaction delays.
  var minT=sorted[0].timestamp, maxT=sorted[0].timestamp;
  sorted.forEach(function(e){
    minT=Math.min(minT,e.timestamp); maxT=Math.max(maxT,e.timestamp);
  });
  // Separately track the furthest interaction endpoint for plot sizing.
  var intMaxT=maxT;
  sorted.forEach(function(e){
    (e.interactions||[]).forEach(function(i){intMaxT=Math.max(intMaxT,e.timestamp+(i.delay||0));});
  });
  if(minT===maxT) maxT=minT+60000;
  // Apply slider multipliers: vertical slider controls Y dimension, horizontal controls X.
  // In vertical mode (isH=false): time axis is Y (EH), lanes are X (LANE).
  // In horizontal mode (isH=true): time axis is X (EH), lanes are Y (LANE).
  var LANE=isH?Math.round(140*diagramVSlider):Math.round(185*diagramHSlider);
  var mg={top:80,right:100,bottom:80,left:195};
  var basePlotW=isH?Math.max(1200,N*LANE*2):N*LANE, basePlotH=isH?N*LANE:Math.max(600,sorted.length*100);

  // Ensure intMaxT is never less than maxT (maxT may have been bumped above by
  // +60 000 ms to handle the single-event case; intMaxT must follow suit so
  // scale1d/buildCompactScale always receives a non-zero range).
  if(intMaxT<maxT) intMaxT=maxT;

  // EH — event height in pixels: visual footprint of one event node.
  // Vertical: circle (r=17) + all label text below ~130 px (prevents overlap when
  //   all optional fields are shown: desc, level, eventCode, managedIntegrationCode).
  // Horizontal: needs wider clearance for text labels alongside the axis ~200 px.
  var EH=isH?Math.round(200*diagramHSlider):Math.round(130*diagramVSlider);

  // Compute minimum non-zero time gap between same-system events (used for scale
  // proportioning) and build a stack-index map for simultaneous same-system events.
  var _syBuckets={};
  sorted.forEach(function(e){if(!_syBuckets[e.system])_syBuckets[e.system]=[];_syBuckets[e.system].push(e.timestamp);});
  var minSameSysGap=0;
  Object.keys(_syBuckets).forEach(function(sys){
    var ts=_syBuckets[sys].sort(function(a,b){return a-b;});
    for(var _si=1;_si<ts.length;_si++){var _g=ts[_si]-ts[_si-1];if(_g>0&&(minSameSysGap===0||_g<minSameSysGap))minSameSysGap=_g;}
  });

  // Assign a stack index to each event: events sharing (system, timestamp) are
  // rendered offset by EH in the time direction so they never overlap.
  var _syTsMap={};
  sorted.forEach(function(e){
    var key=e.system+'|||'+e.timestamp;
    if(!_syTsMap[key])_syTsMap[key]=[];
    _syTsMap[key].push(e);
  });
  var eventStack={}; // _id -> stackIndex (0 for first, 1 for second, …)
  var maxStackIndex=0;
  Object.keys(_syTsMap).forEach(function(key){
    _syTsMap[key].forEach(function(e,idx){
      eventStack[e._id]=idx;
      if(idx>maxStackIndex) maxStackIndex=idx;
    });
  });

  // Build scale — compact or linear depending on user preference
  var sc, plotW, plotH;
  if(timelineCompact){
    // Compact: build scale from event timestamps only so event positions are not
    // distorted by interaction delays. If any interaction endpoint extends beyond
    // the last event, append intMaxT so the scale covers the full time range.
    var tsSet={};
    tsSet[minT]=true; tsSet[maxT]=true;
    sorted.forEach(function(e){tsSet[e.timestamp]=true;});
    var allTs=Object.keys(tsSet).map(Number).sort(function(a,b){return a-b;});
    if(intMaxT>allTs[allTs.length-1]) allTs.push(intMaxT);
    sc=buildCompactScale(allTs,EH,minSameSysGap);
    // Plot size: scale range + room for the deepest simultaneous stack
    var scTimeDim=sc._totalPx+maxStackIndex*EH;
    if(isH){plotW=Math.max(N*LANE*2,scTimeDim); plotH=basePlotH;}
    else    {plotW=basePlotW; plotH=Math.max(N*LANE,scTimeDim);}
  } else {
    // Linear: scale covers [minT, scMax] where scMax is the furthest interaction
    // endpoint (or maxT if no interactions). This makes delays proportionally
    // visible — an arrow ending at timestamp+delay appears further along the axis
    // than the source event, with visual distance proportional to the delay.
    var scMax=intMaxT>maxT?intMaxT:maxT;
    // Expand plot so same-system events are at least MIN_SEP pixels apart.
    var MIN_SEP=isH?200:70;
    if(minSameSysGap>0){
      var _lSpan=scMax-minT;
      if(_lSpan>0){
        var _lNeeded=Math.ceil(MIN_SEP*_lSpan/minSameSysGap);
        if(isH) basePlotW=Math.max(basePlotW,_lNeeded);
        else basePlotH=Math.max(basePlotH,_lNeeded);
      }
    }
    sc=scale1d(minT,scMax,0,isH?basePlotW:basePlotH);
    sc._breakpoints=null;
    // Add room for simultaneous-event stacks beyond the scale range
    if(isH){plotW=basePlotW+maxStackIndex*EH; plotH=basePlotH;}
    else    {plotW=basePlotW; plotH=basePlotH+maxStackIndex*EH;}
  }

  // If timelineReverse: wrap the scale so newer timestamps map to smaller positions
  // (newer events appear at top in vertical mode, at left in horizontal mode).
  if(timelineReverse){
    var _origSc=sc, _tPx=sc._totalPx, _bps=sc._breakpoints;
    sc=function(t){return _tPx-_origSc(t);};
    sc._totalPx=_tPx;
    if(_bps){
      sc._breakpoints=_bps.slice().reverse().map(function(bp){
        return {t0:bp.t1,t1:bp.t0,v0:_tPx-bp.v1,v1:_tPx-bp.v0,compressed:bp.compressed,gapMs:bp.gapMs};
      });
    } else {
      sc._breakpoints=null;
    }
  }

  // evPos — visual position of event e along the time axis, accounting for stacking.
  // Stack offset always adds in the positive (forward) direction so simultaneous
  // same-system events spread toward larger pixel values (toward the older-time
  // side), preventing overlap with events at newer timestamps regardless of whether
  // the timeline is reversed or not.
  function evPos(e){
    return sc(e.timestamp)+(eventStack[e._id]||0)*EH;
  }
  var W=plotW+mg.left+mg.right, H=plotH+mg.top+mg.bottom;
  function lp(i){return i*LANE+LANE/2;}
  var svg=mkSVG(W,H), rid=svg._rid, g=sv('g',{transform:'translate('+mg.left+','+mg.top+')'});
  svg.appendChild(g);
  var showDate=displayConfig.showDate;
  // timezone indicator — shown near the time axis corner
  var tzLabel=getDisplayTZ();
  if(isH){
    aT(g,-10,-10,tzLabel,{'text-anchor':'end','font-size':'10','fill':svgColors().label,'font-family':'DM Mono,monospace','opacity':'.75'});
  }else{
    aT(g,-10,-40,tzLabel,{'text-anchor':'end','font-size':'10','fill':svgColors().label,'font-family':'DM Mono,monospace','opacity':'.75'});
  }
  // grid ticks — one per unique event timestamp so each event node aligns with
  // a labelled gridline showing its exact time (not a linear interpolation).
  var tsSeen={};
  sorted.forEach(function(e){
    if(tsSeen[e.timestamp]) return;
    tsSeen[e.timestamp]=true;
    var sp=sc(e.timestamp), lbl=fmtTs(e.timestamp,showDate);
    if(isH){aL(g,sp,0,sp,plotH,{stroke:svgColors().grid,'stroke-width':1,'stroke-dasharray':'4,4'});
      aT(g,sp,plotH+20,lbl,{'text-anchor':'middle','font-size':'13','fill':svgColors().label,'font-family':'DM Mono,monospace'});}
    else{aL(g,0,sp,plotW,sp,{stroke:svgColors().grid,'stroke-width':1,'stroke-dasharray':'4,4'});
      aT(g,-10,sp,lbl,{'text-anchor':'end','dominant-baseline':'middle','font-size':'13','fill':svgColors().label,'font-family':'DM Mono,monospace'});}
  });
  // lanes
  sysArr.forEach(function(sys,i){
    var pos=lp(i);
    if(i%2===0) aR(g,isH?-mg.left:pos-LANE/2,isH?pos-LANE/2:-mg.top,isH?plotW+mg.left+mg.right:LANE,isH?LANE:plotH+mg.top+mg.bottom,{fill:svgColors().laneAlt});
    if(isH){aT(g,-10,pos,sys,{'text-anchor':'end','dominant-baseline':'middle','font-weight':'600','font-size':'15','fill':svgColors().label});}
    else{aT(g,pos,-20,sys,{'text-anchor':'middle','font-weight':'600','font-size':'15','fill':svgColors().label});}
    if(isH) aL(g,0,pos,plotW,pos,{stroke:svgColors().grid,'stroke-width':1});
    else     aL(g,pos,0,pos,plotH,{stroke:svgColors().grid,'stroke-width':1});
  });
  // compressed gap indicators (compact mode only)
  if(timelineCompact&&sc._breakpoints){
    sc._breakpoints.forEach(function(bp){
      if(!bp.compressed) return;
      // Mid-position of the compressed stub
      var mid=(bp.v0+bp.v1)/2;
      if(isH){
        // Vertical stripe across all lanes
        aR(g,bp.v0,-mg.top,bp.v1-bp.v0,plotH+mg.top+mg.bottom,{fill:'rgba(128,128,128,0.08)'});
        aR(g,bp.v0,0,bp.v1-bp.v0,plotH,{fill:'rgba(128,128,128,0.15)',stroke:'rgba(128,128,128,0.25)','stroke-width':1});
        // Label centred in the stripe
        aT(g,mid,plotH/2,fmtDuration(bp.gapMs),{
          'text-anchor':'middle','dominant-baseline':'middle',
          'font-size':'11','fill':'#888','font-family':'DM Mono,monospace',
          'transform':'rotate(-90,'+mid+','+(plotH/2)+')'
        });
      } else {
        // Horizontal stripe across all lanes
        aR(g,-mg.left,bp.v0,plotW+mg.left+mg.right,bp.v1-bp.v0,{fill:'rgba(128,128,128,0.08)'});
        aR(g,0,bp.v0,plotW,bp.v1-bp.v0,{fill:'rgba(128,128,128,0.15)',stroke:'rgba(128,128,128,0.25)','stroke-width':1});
        // Label centred in the stripe
        aT(g,plotW/2,mid+5,fmtDuration(bp.gapMs),{
          'text-anchor':'middle','font-size':'11','fill':'#888','font-family':'DM Mono,monospace'
        });
      }
    });
  }

  // interactions (drawn under nodes, sorted by order)
  var NODE_R=17, ARROW_OFFSET=10;

  // Compute highlight sets when an event is selected
  var hlSrcIds={}; // arrows FROM selected event: srcEvId -> true
  var hlInIds={};  // source event IDs of arrows pointing TO selected event's system at ~selected time
  var hlTgtSystems={}; // target systems of FROM arrows
  var selEv=selectedEventId?sorted.filter(function(e){return e._id===selectedEventId;})[0]:null;
  if(selEv){
    // FROM selected: collect target systems
    (selEv.interactions||[]).forEach(function(inter){
      if(inter.target) hlTgtSystems[inter.target]=true;
    });
    hlSrcIds[selEv._id]=true;
    // TO selected: find events whose interactions target the selected event's system
    // and whose arrow endpoint time (~e.timestamp+delay) is near selectedEvent's timestamp
    var SEL_TS=selEv.timestamp, TOL=60000; // 60s tolerance
    sorted.forEach(function(e){
      if(e._id===selEv._id) return;
      (e.interactions||[]).forEach(function(inter){
        if(inter.target===selEv.system){
          var endTs=e.timestamp+(inter.delay||0);
          if(Math.abs(endTs-SEL_TS)<=TOL) hlInIds[e._id]=true;
        }
      });
    });
  }

  // 1. Collect all arrows
  var arrows=[];
  sorted.forEach(function(e){
    var si=sysArr.indexOf(e.system), tp=evPos(e), bp=lp(si);
    var sortedI=[...(e.interactions||[])].sort(function(a,b){return (a.order||0)-(b.order||0);});
    sortedI.forEach(function(inter,iIdx){
      var ti2=sysArr.indexOf(inter.target); if(ti2===-1) return;
      var tLane=lp(ti2), tTP=sc(e.timestamp+(inter.delay||0));
      var ic=inter.nature==='push'?svgColors().accent:inter.nature==='pull'?svgColors().teal:svgColors().proc;
      var sx,sy,tx,ty;
      if(inter.nature==='pull'){
        // Pull: arrow points FROM target lane TO originating event; tTP displaces the far end by delay
        sx=isH?tTP:tLane; sy=isH?tLane:tTP;
        tx=isH?tp:bp;     ty=isH?bp:tp;
      } else {
        sx=isH?tp:bp; sy=isH?bp:tp;
        tx=isH?tTP:tLane; ty=isH?tLane:tTP;
      }
      arrows.push({
        sx:sx,sy:sy,tx:tx,ty:ty,
        nature:inter.nature,color:ic,
        label:inter.label||(appMode==='timeline'&&inter.delay?inter.nature+' +'+inter.delay+'ms':''),
        seqIdx:iIdx,_offset:0,
        srcEvId:e._id, tgtSystem:inter.target
      });
    });
  });

  // 2. Group by source/target pair and compute lateral offsets
  function pairKey(sx,sy,tx,ty){
    var a=Math.round(sx)+'_'+Math.round(sy), b=Math.round(tx)+'_'+Math.round(ty);
    return a<b?a+'|'+b:b+'|'+a;
  }
  function isFwd(sx,sy,tx,ty){
    var a=Math.round(sx)+'_'+Math.round(sy), b=Math.round(tx)+'_'+Math.round(ty);
    return a<=b;
  }
  var groups={};
  arrows.forEach(function(ar){
    var k=pairKey(ar.sx,ar.sy,ar.tx,ar.ty);
    if(!groups[k]) groups[k]=[];
    groups[k].push(ar);
  });
  Object.keys(groups).forEach(function(k){
    var grp=groups[k];
    if(grp.length<=1) return;
    var fwd=grp.filter(function(a){return isFwd(a.sx,a.sy,a.tx,a.ty);});
    var rev=grp.filter(function(a){return !isFwd(a.sx,a.sy,a.tx,a.ty);});
    if(fwd.length>0&&rev.length>0){
      fwd.forEach(function(a,i){a._offset=(i-(fwd.length-1)/2)*ARROW_OFFSET+ARROW_OFFSET/2;});
      rev.forEach(function(a,i){a._offset=(i-(rev.length-1)/2)*ARROW_OFFSET-ARROW_OFFSET/2;});
    } else {
      grp.forEach(function(a,i){a._offset=(i-(grp.length-1)/2)*ARROW_OFFSET;});
    }
  });

  // 3. Draw arrows with offsets applied
  function clipCircle(cx,cy,ox,oy,r){
    var dx=ox-cx, dy=oy-cy, dist=Math.sqrt(dx*dx+dy*dy)||1;
    return {x:cx+dx/dist*r, y:cy+dy/dist*r};
  }
  arrows.forEach(function(ar){
    // Compute perpendicular offset
    var dx=ar.tx-ar.sx, dy=ar.ty-ar.sy, dist=Math.sqrt(dx*dx+dy*dy)||1;
    var px=-dy/dist, py=dx/dist;
    var off=ar._offset;
    var osx=ar.sx+px*off, osy=ar.sy+py*off;
    var otx=ar.tx+px*off, oty=ar.ty+py*off;

    var x1,y1,x2,y2,mEnd;
    var p1=clipCircle(ar.sx,ar.sy,otx,oty,NODE_R+2);
    var p2=clipCircle(ar.tx,ar.ty,osx,osy,NODE_R+2);
    x1=p1.x; y1=p1.y; x2=p2.x; y2=p2.y;
    mEnd=ar.nature==='process'?'':'url(#arr-'+ar.nature+'-'+rid+')';

    // Determine highlight state
    var isFromSel=selEv&&hlSrcIds[ar.srcEvId];
    var isToSel=selEv&&hlInIds[ar.srcEvId];
    var isUnrelated=selEv&&!isFromSel&&!isToSel;
    var strokeW=isFromSel||isToSel?3.5:2;
    var strokeColor=isFromSel?svgColors().hlSel:isToSel?svgColors().hlRel:ar.color;
    var opacity=isUnrelated?0.25:1;

    aL(g,x1,y1,x2,y2,{stroke:strokeColor,'stroke-width':strokeW,'stroke-dasharray':ar.nature==='process'?'5,3':'','marker-end':mEnd,opacity:opacity});
    var mx=(x1+x2)/2+(isH?0:5), my=(y1+y2)/2-18;
    aT(g,mx,my,ar.label,{'text-anchor':'middle','font-size':'11','fill':strokeColor,'font-family':'DM Mono,monospace',opacity:opacity});
    var bmx=(x1+x2)/2, bmy=(y1+y2)/2;
    aC(g,bmx,bmy,11,{fill:strokeColor,opacity:isUnrelated?0.2:0.9});
    aT(g,bmx,bmy+5,String(ar.seqIdx+1),{'text-anchor':'middle','font-size':'10','fill':'#fff','font-weight':'800','font-family':'DM Mono,monospace',opacity:opacity});
  });

  // nodes
  sorted.forEach(function(e){
    var si=sysArr.indexOf(e.system), tp=evPos(e), bp=lp(si);
    var cx=isH?tp:bp, cy=isH?bp:tp, color=COLORS_ARR()[si%COLORS_ARR().length];
    // Level icon inside circle (icon shape + level color)
    var lc=e.level?levelColor(e.level):null;
    var strokeColor=lc||color;

    // Highlight state for this node
    var isSel=selEv&&e._id===selEv._id;
    var isIsolated=filterConfig.eventIds.indexOf(e._id)!==-1;
    var isRelIn=selEv&&hlInIds[e._id];         // source of an incoming arrow
    var isRelTgt=selEv&&hlTgtSystems[e.system]; // in a target system of a FROM arrow
    var isRelated=isRelIn||isRelTgt;
    var isUnrelated=selEv&&!isSel&&!isRelated;
    var nodeOpacity=isUnrelated?0.3:1;

    // Draw highlight glow ring behind node
    if(isSel){
      aC(g,cx,cy,26,{fill:'none',stroke:svgColors().hlSel,'stroke-width':3,opacity:.85});
    } else if(isIsolated){
      aC(g,cx,cy,26,{fill:'none',stroke:svgColors().hlSel,'stroke-width':3,opacity:.85});
    } else if(isRelated){
      aC(g,cx,cy,24,{fill:'none',stroke:svgColors().hlRel,'stroke-width':2.5,opacity:.8});
    }

    aC(g,cx,cy,17,{fill:svgColors().nodeFill,stroke:strokeColor,'stroke-width':'2.5',opacity:nodeOpacity});
    if(lc) drawLevelIcon(g,cx,cy,e.level,lc);
    // Text labels below/beside node
    var textX=isH?cx:cx+21, textAnchor=isH?'middle':'start';
    var textY=isH?cy+34:cy+5;
    aT(g,textX,textY,trunc(e.desc,30),{'text-anchor':textAnchor,'font-size':'14','fill':svgColors().label,opacity:nodeOpacity});
    textY+=16;
    if(displayConfig.showActor&&e.actor){
      aT(g,textX,textY,trunc(e.actor,25),{'text-anchor':textAnchor,'font-size':'12','fill':svgColors().actor,'font-family':'DM Mono,monospace',opacity:nodeOpacity});
      textY+=16;
    }
    if(displayConfig.showEventCode&&e.eventCode){
      aT(g,textX,textY,trunc(e.eventCode,20),{'text-anchor':textAnchor,'font-size':'12','fill':svgColors().listTs,'font-family':'DM Mono,monospace',opacity:nodeOpacity});
      textY+=16;
    }
    if(displayConfig.showManagedIntegrationCode&&e.managedIntegrationCode){
      aT(g,textX,textY,trunc(e.managedIntegrationCode,20),{'text-anchor':textAnchor,'font-size':'12','fill':svgColors().listInt,'font-family':'DM Mono,monospace',opacity:nodeOpacity});
    }
    // Transparent click overlay — loads event into editor and highlights
    var hitCircle=sv('circle',{cx:cx,cy:cy,r:19,fill:'transparent',cursor:'pointer','data-event-hit':'1'});
    hitCircle.addEventListener('click',(function(evId){return function(ev2){
      if(hitCircle.ownerSVGElement._didPan){hitCircle.ownerSVGElement._didPan=false;return;}
      ev2.stopPropagation();
      var idx=findEventByIdIdx(evId);
      if(idx>=0){
        selectedEventId=(selectedEventId===evId)?null:evId;
        render();
        if(selectedEventId) editEvent(findEventByIdIdx(selectedEventId));
      }
    };})(e._id));
    hitCircle.addEventListener('contextmenu',(function(evId){return function(ev2){showEventContextMenu(ev2,evId);};})(e._id));
    g.appendChild(hitCircle);
  });
  // Click on SVG background deselects
  svg.addEventListener('click',function(){
    if(svg._didPan){svg._didPan=false;return;}
    if(selectedEventId){selectedEventId=null; render();}
  });
  parent.appendChild(svg);
}
