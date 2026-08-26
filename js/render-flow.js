// ── FLOW DIAGRAM ────────────────────────────────────
function renderFlow(parent,direction,showSeq,filteredEvents){
  ensureIds();
  var evList=filteredEvents||events;
  var sySet=new Set();
  evList.forEach(function(e){sySet.add(e.system);(e.interactions||[]).forEach(function(i){if(i.target)sySet.add(i.target);});});
  var sysArr=getSysArray(sySet);
  var evMap={}; evList.forEach(function(e){evMap[e._id]=e;});
  var edges=[];
  evList.forEach(function(src){
    (src.interactions||[]).forEach(function(inter){
      if(inter.triggerEventId&&evMap[inter.triggerEventId]) edges.push({from:src._id,to:inter.triggerEventId,inter:inter});
    });
  });
  // topo sort
  var inDeg={}; evList.forEach(function(e){inDeg[e._id]=0;});
  edges.forEach(function(ed){inDeg[ed.to]=(inDeg[ed.to]||0)+1;});
  var queue=evList.filter(function(e){return!inDeg[e._id];}).map(function(e){return e._id;});
  var order=[], vis=new Set();
  while(queue.length){
    var nid=queue.shift(); if(vis.has(nid)) continue; vis.add(nid); order.push(nid);
    edges.filter(function(ed){return ed.from===nid;}).forEach(function(ed){if(--inDeg[ed.to]===0)queue.push(ed.to);});
  }
  evList.forEach(function(e){if(!vis.has(e._id)) order.push(e._id);});
  var isLR=direction==='lr';
  var seqOf={}; order.forEach(function(id,i){seqOf[id]=i;});
  var rowOf={}; evList.forEach(function(e){rowOf[e._id]=sysArr.indexOf(e.system);});
  var extraRows=(displayConfig.showEventCode?1:0)+(displayConfig.showManagedIntegrationCode?1:0);
  var BW=170,BH=58+extraRows*13;
  // Apply slider multipliers: vertical slider controls Y dimension, horizontal controls X.
  // SG is always horizontal spacing (between event columns in LR mode, between system
  // lane columns in TB mode). LG is always vertical spacing (between system lane rows
  // in LR mode, between event rows in TB mode).
  var LG=Math.round((isLR?105+extraRows*13:210)*diagramVSlider);
  var SG=Math.round((isLR?215:165+extraRows*13)*diagramHSlider);
  function bC(id){
    var row=rowOf[id]!==undefined?rowOf[id]:0, seq=seqOf[id]!==undefined?seqOf[id]:0;
    return isLR?{x:seq*SG+BW/2+20,y:row*LG+BH/2+20}:{x:row*SG+BW/2+20,y:seq*LG+BH/2+20};
  }
  var mg={top:70,right:60,bottom:40,left:160};
  var pW=isLR?order.length*SG+60:sysArr.length*SG+60, pH=isLR?sysArr.length*LG+60:order.length*LG+60;
  var W=pW+mg.left+mg.right, H=pH+mg.top+mg.bottom;
  var svg=mkSVG(W,H), rid=svg._rid, g=sv('g',{transform:'translate('+mg.left+','+mg.top+')'}); svg.appendChild(g);
  // lanes
  sysArr.forEach(function(sys,i){
    var lp=isLR?i*LG:i*SG, ls=isLR?LG:SG;
    if(i%2===0) aR(g,isLR?-mg.left:lp-10,isLR?lp-10:-mg.top,isLR?pW+mg.left+mg.right:ls+20,isLR?ls+20:pH+mg.top+mg.bottom,{fill:svgColors().laneAlt});
    if(isLR) aT(g,-10,lp+BH/2+20,sys,{'text-anchor':'end','dominant-baseline':'middle','font-weight':'600','font-size':'12','fill':svgColors().label});
    else     aT(g,lp+BW/2+10,-20,sys,{'text-anchor':'middle','font-weight':'600','font-size':'12','fill':svgColors().label});
  });

  // ── Arrow grouping helpers ──
  var ARROW_OFFSET=8;
  var PAD=6, HW=BW/2+PAD, HH=BH/2+PAD;
  function pairKey(sx,sy,tx,ty){
    var a=Math.round(sx)+'_'+Math.round(sy), b=Math.round(tx)+'_'+Math.round(ty);
    return a<b?a+'|'+b:b+'|'+a;
  }
  function isFwd(sx,sy,tx,ty){
    var a=Math.round(sx)+'_'+Math.round(sy), b=Math.round(tx)+'_'+Math.round(ty);
    return a<=b;
  }
  function assignOffsets(arrows){
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
  }
  function perpOffset(sx,sy,tx,ty,off){
    var dx=tx-sx, dy=ty-sy, dist=Math.sqrt(dx*dx+dy*dy)||1;
    return {px:-dy/dist*off, py:dx/dist*off};
  }
  function clipToBox(from,to,hw,hh){
    var dx=to.x-from.x, dy=to.y-from.y;
    if(dx===0&&dy===0) return {x:from.x,y:from.y};
    var t=Math.min(hw/Math.abs(dx||1),hh/Math.abs(dy||1));
    return {x:from.x+dx*t, y:from.y+dy*t};
  }

  // ── Causal edges ──
  var sortedEdges=[...edges].sort(function(a,b){return (a.inter.order||0)-(b.inter.order||0);});
  var edgeOrderByFrom={};
  sortedEdges.forEach(function(ed){
    if(!edgeOrderByFrom[ed.from]) edgeOrderByFrom[ed.from]=0;
    ed._seqLabel=edgeOrderByFrom[ed.from]+1;
    edgeOrderByFrom[ed.from]++;
  });

  // Compute highlight sets for selected event
  var hlRelIds={}; // event IDs that are related to the selected event (targets or origins)
  var hlFromEdges={}; // edge indices FROM selected event
  var hlToEdges={};   // edge indices TO selected event
  var selFlowEv=selectedEventId?evMap[selectedEventId]:null;
  if(selFlowEv){
    sortedEdges.forEach(function(ed,i){
      if(ed.from===selectedEventId){ hlFromEdges[i]=true; hlRelIds[ed.to]=true; }
      if(ed.to===selectedEventId)  { hlToEdges[i]=true;   hlRelIds[ed.from]=true; }
    });
    // Also mark target systems of system-only interactions
    (selFlowEv.interactions||[]).forEach(function(inter){
      if(!inter.triggerEventId&&inter.target) hlRelIds['sys:'+inter.target]=true;
    });
  }

  // Collect causal arrows
  var causalArrows=[];
  sortedEdges.forEach(function(ed,edIdx){
    var src=bC(ed.from), dst=bC(ed.to);
    var color=ed.inter.nature==='push'?svgColors().accent:ed.inter.nature==='pull'?svgColors().teal:svgColors().proc;
    causalArrows.push({
      sx:src.x,sy:src.y,tx:dst.x,ty:dst.y,
      nature:ed.inter.nature,color:color,isPull:ed.inter.nature==='pull',
      label:ed.inter.label||'',seqLabel:ed._seqLabel,_offset:0,
      fromId:ed.from, toId:ed.to, edIdx:edIdx
    });
  });
  assignOffsets(causalArrows);

  // Draw causal arrows
  causalArrows.forEach(function(ar){
    var p=perpOffset(ar.sx,ar.sy,ar.tx,ar.ty,ar._offset);
    var osx=ar.sx+p.px, osy=ar.sy+p.py;
    var otx=ar.tx+p.px, oty=ar.ty+p.py;

    var p1,p2,mEnd;
    if(ar.isPull){
      p1=clipToBox({x:ar.tx,y:ar.ty},{x:osx,y:osy},HW,HH);
      p2=clipToBox({x:ar.sx,y:ar.sy},{x:otx,y:oty},HW,HH);
      mEnd='url(#arr-pull-'+rid+')';
    } else {
      p1=clipToBox({x:ar.sx,y:ar.sy},{x:otx,y:oty},HW,HH);
      p2=clipToBox({x:ar.tx,y:ar.ty},{x:osx,y:osy},HW,HH);
      mEnd='url(#arr-'+ar.nature+'-'+rid+')';
    }
    if(ar.nature==='process') mEnd='';

    var isFromSel=selFlowEv&&hlFromEdges[ar.edIdx];
    var isToSel=selFlowEv&&hlToEdges[ar.edIdx];
    var isUnrelated=selFlowEv&&!isFromSel&&!isToSel;
    var strokeColor=isFromSel?svgColors().hlSel:isToSel?svgColors().hlRel:ar.color;
    var strokeW=isFromSel||isToSel?3:2;
    var opacity=isUnrelated?0.2:1;

    aL(g,p1.x,p1.y,p2.x,p2.y,{
      stroke:strokeColor,'stroke-width':strokeW,
      'stroke-dasharray':ar.nature==='process'?'5,4':'',
      'marker-end':mEnd, opacity:opacity
    });

    var mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2;
    aT(g,mx,my-12,ar.label,
      {'text-anchor':'middle','font-size':'9','fill':strokeColor,'font-family':'DM Mono,monospace',opacity:opacity});
    aC(g,mx,my,9,{fill:strokeColor,opacity:isUnrelated?0.2:0.9});
    aT(g,mx,my+3,String(ar.seqLabel||''),{'text-anchor':'middle','font-size':'8','fill':'#fff','font-weight':'800','font-family':'DM Mono,monospace',opacity:opacity});
  });

  // ── System-only interactions ──
  var sysArrows=[];
  evList.forEach(function(srcEv){
    var src=bC(srcEv._id);
    var sortedSysI=[...(srcEv.interactions||[])].sort(function(a,b){return (a.order||0)-(b.order||0);});
    sortedSysI.forEach(function(inter,iIdx){
      if(inter.triggerEventId||!inter.target) return;
      var ti2=sysArr.indexOf(inter.target); if(ti2===-1) return;
      var color=inter.nature==='push'?svgColors().accent:inter.nature==='pull'?svgColors().teal:svgColors().proc;
      var tLP=isLR?ti2*LG+BH/2+20:ti2*SG+BW/2+10;
      var tx=isLR?src.x+60:tLP, ty=isLR?tLP:src.y+80;
      sysArrows.push({
        sx:src.x,sy:src.y,tx:tx,ty:ty,
        nature:inter.nature,color:color,isPull:inter.nature==='pull',
        label:inter.label||'',seqIdx:iIdx,_offset:0,
        srcEvId:srcEv._id, tgtSys:inter.target
      });
    });
  });
  assignOffsets(sysArrows);

  // Draw system-only arrows
  sysArrows.forEach(function(ar){
    var p=perpOffset(ar.sx,ar.sy,ar.tx,ar.ty,ar._offset);
    var osx=ar.sx+p.px, osy=ar.sy+p.py;
    var otx=ar.tx+p.px, oty=ar.ty+p.py;

    var x1,y1,x2,y2,mEnd;
    if(ar.isPull){
      x1=otx; y1=oty;
      var clip=clipToBox({x:ar.sx,y:ar.sy},{x:otx,y:oty},HW,HH);
      x2=clip.x; y2=clip.y;
      mEnd='url(#arr-pull-'+rid+')';
    } else {
      var clip=clipToBox({x:ar.sx,y:ar.sy},{x:otx,y:oty},HW,HH);
      x1=clip.x; y1=clip.y;
      x2=otx; y2=oty;
      mEnd='url(#arr-'+ar.nature+'-'+rid+')';
    }
    if(ar.nature==='process') mEnd='';

    var isSysFromSel=selFlowEv&&ar.srcEvId===selectedEventId;
    var isSysUnrelated=selFlowEv&&!isSysFromSel;
    var sysStroke=isSysFromSel?svgColors().hlSel:ar.color;
    var sysOpacity=isSysUnrelated?0.2:1;
    var sysW=isSysFromSel?2.5:1.5;

    aL(g,x1,y1,x2,y2,{stroke:sysStroke,'stroke-width':sysW,'stroke-dasharray':'4,3','marker-end':mEnd,opacity:sysOpacity});
    var lmx=(x1+x2)/2, lmy=(y1+y2)/2;
    aT(g,lmx,lmy-8,ar.label,{'text-anchor':'middle','font-size':'9','fill':sysStroke,'font-family':'DM Mono,monospace',opacity:sysOpacity});
    aC(g,lmx,lmy+4,8,{fill:sysStroke,opacity:isSysUnrelated?0.2:0.9});
    aT(g,lmx,lmy+7,String(ar.seqIdx+1),{'text-anchor':'middle','font-size':'7','fill':'#fff','font-weight':'800','font-family':'DM Mono,monospace',opacity:sysOpacity});
  });

  // New code for card interaction tooltips
  var interactionStats={};
  function interactionStat(eventId){
    if(!interactionStats[eventId]) interactionStats[eventId]={push:{visible:0,total:0},pull:{visible:0,total:0},process:{visible:0,total:0}};
    return interactionStats[eventId];
  }
  function interactionNature(inter){return inter.nature==='pull'||inter.nature==='process'?inter.nature:'push';}
  events.forEach(function(ev){
    (ev.interactions||[]).forEach(function(inter){
      var nature=interactionNature(inter);
      interactionStat(ev._id)[nature].total++;
      if(inter.triggerEventId) interactionStat(inter.triggerEventId)[nature].total++;
    });
  });
  sortedEdges.forEach(function(edge){
    var edgeNature=interactionNature(edge.inter);
    interactionStat(edge.from)[edgeNature].visible++;
    interactionStat(edge.to)[edgeNature].visible++;
  });
  sysArrows.forEach(function(arrow){interactionStat(arrow.srcEvId)[interactionNature(arrow)].visible++;});

  // event boxes
  order.forEach(function(evId,seqIdx){
    var ev=evMap[evId]; if(!ev) return;
    var c=bC(evId), bx=c.x-BW/2, by=c.y-BH/2, row=rowOf[evId]||0, color=COLORS_ARR()[row%COLORS_ARR().length];

    // Highlight state for this box
    var isBoxSel=selFlowEv&&evId===selectedEventId;
    var isBoxIsolated=filterConfig.eventIds.indexOf(evId)!==-1;
    var isBoxRel=selFlowEv&&(hlRelIds[evId]||hlRelIds['sys:'+ev.system]);
    var isBoxUnrelated=selFlowEv&&!isBoxSel&&!isBoxRel;
    var boxOpacity=isBoxUnrelated?0.25:1;

    // Highlight glow behind box
    if(isBoxSel){
      aR(g,bx-6,by-6,BW+12,BH+12,{rx:14,fill:'none',stroke:svgColors().hlSel,'stroke-width':3,opacity:.85});
    } else if(isBoxIsolated){
      aR(g,bx-6,by-6,BW+12,BH+12,{rx:14,fill:'none',stroke:svgColors().hlSel,'stroke-width':3,opacity:.85});
    } else if(isBoxRel){
      aR(g,bx-5,by-5,BW+10,BH+10,{rx:13,fill:'none',stroke:svgColors().hlRel,'stroke-width':2.5,opacity:.8});
    }

    aR(g,bx-2,by-2,BW+4,BH+4,{rx:11,fill:'none',stroke:color,'stroke-width':2,opacity:isBoxUnrelated?0.07:0.25});
    aR(g,bx,by,BW,BH,{rx:9,fill:svgColors().nodeFill,stroke:color,'stroke-width':1.5,opacity:boxOpacity});
    if(showSeq){
      aR(g,bx,by,26,BH,{rx:9,fill:color,opacity:isBoxUnrelated?0.05:0.15});
      aT(g,bx+13,c.y+4,String(seqIdx+1),{'text-anchor':'middle','font-size':'10','fill':color,'font-weight':'800','font-family':'DM Mono,monospace',opacity:boxOpacity});
    }

    // New code for card interaction tooltip
    var tx=showSeq?bx+30:bx+9;
    var sysLabel=trunc(ev.system,(displayConfig.showLevel&&ev.level)?14:20);
    aT(g,tx,by+17,sysLabel,{'font-size':'8','fill':color,'font-family':'DM Mono,monospace','font-weight':'700',opacity:boxOpacity});
    if(displayConfig.showLevel&&ev.level){
      var lc=levelColor(ev.level);
      aR(g,bx+BW-34,by+7,28,11,{rx:3,fill:lc,opacity:isBoxUnrelated?0.05:0.18});
      aT(g,bx+BW-20,by+16,ev.level.toUpperCase(),{'text-anchor':'middle','font-size':'7','fill':lc,'font-family':'DM Mono,monospace','font-weight':'800',opacity:boxOpacity});
    }
    aT(g,tx,by+32,trunc(ev.desc,22),{'font-size':'11','fill':svgColors().listDesc,'font-weight':'600',opacity:boxOpacity});
    if(displayConfig.showActor&&ev.actor) aT(g,tx,by+46,trunc(ev.actor,22),{'font-size':'9','fill':svgColors().listTs,opacity:boxOpacity});
    var ey=by+46;
    if(displayConfig.showEventCode){
      ey+=13;
      if(ev.eventCode) aT(g,tx,ey,trunc(ev.eventCode,22),{'font-size':'8','fill':svgColors().listTs,'font-family':'DM Mono,monospace',opacity:boxOpacity});
    }
    if(displayConfig.showManagedIntegrationCode){
      ey+=13;
      if(ev.managedIntegrationCode) aT(g,tx,ey,trunc(ev.managedIntegrationCode,22),{'font-size':'8','fill':svgColors().listInt,'font-family':'DM Mono,monospace',opacity:boxOpacity});
    }
    var stats=interactionStat(evId);
    var interactionCount=stats.push.total+stats.pull.total+stats.process.total;
    var countBadge=sv('g',{cursor:'help','data-event-hit':'1'});
    aC(countBadge,bx+BW-12,by+BH-12,9,{fill:color,opacity:isBoxUnrelated?0.2:0.9});
    aT(countBadge,bx+BW-12,by+BH-9,String(interactionCount),{'text-anchor':'middle','font-size':'8','fill':'#fff','font-weight':'800','font-family':'DM Mono,monospace',opacity:boxOpacity});
    var tooltipW=142, tooltipH=70, tooltipX=bx+BW+8;
    if(tooltipX+tooltipW>pW) tooltipX=bx-tooltipW-8;
    var tooltipY=Math.max(0,Math.min(pH-tooltipH,by+BH-tooltipH));
    var countTooltip=sv('g',{display:'none','pointer-events':'none'});
    aR(countTooltip,tooltipX,tooltipY,tooltipW,tooltipH,{rx:6,fill:svgColors().nodeFill,stroke:svgColors().grid,'stroke-width':1});
    aT(countTooltip,tooltipX+9,tooltipY+14,'Interactions (visible/total)',{'font-size':'8','fill':svgColors().label,'font-family':'DM Mono,monospace','font-weight':'700'});
    function addTooltipRow(label,rowY,stroke,dash,counts){
      aL(countTooltip,tooltipX+10,rowY,tooltipX+29,rowY,{stroke:stroke,'stroke-width':2,'stroke-dasharray':dash||''});
      aT(countTooltip,tooltipX+36,rowY+3,label+' '+counts.visible+'/'+counts.total,{'font-size':'9','fill':svgColors().desc,'font-family':'DM Mono,monospace'});
    }
    addTooltipRow('Push',tooltipY+29,svgColors().accent,'',stats.push);
    addTooltipRow('Pull',tooltipY+46,svgColors().teal,'',stats.pull);
    addTooltipRow('Process',tooltipY+63,svgColors().proc,'5,4',stats.process);
    // Transparent click overlay — loads event into editor and highlights
    var hitRect=sv('rect',{x:bx,y:by,width:BW,height:BH,rx:9,fill:'transparent',cursor:'pointer','data-event-hit':'1'});
    var selectEventHandler=(function(id){return function(ev2){
      if(hitRect.ownerSVGElement._didPan){hitRect.ownerSVGElement._didPan=false;return;}
      ev2.stopPropagation();
      var idx=findEventByIdIdx(id);
      if(idx>=0){
        selectedEventId=(selectedEventId===id)?null:id;
        render();
        if(selectedEventId) editEvent(findEventByIdIdx(selectedEventId));
      }
    };})(evId);
    var contextMenuHandler=(function(id){return function(ev2){showEventContextMenu(ev2,id);};})(evId);
    hitRect.addEventListener('click',selectEventHandler);
    hitRect.addEventListener('contextmenu',contextMenuHandler);
    countBadge.addEventListener('click',selectEventHandler);
    countBadge.addEventListener('contextmenu',contextMenuHandler);
    countBadge.addEventListener('mouseenter',(function(tooltip){return function(){tooltip.setAttribute('display','');};})(countTooltip));
    countBadge.addEventListener('mouseleave',(function(tooltip){return function(){tooltip.setAttribute('display','none');};})(countTooltip));
    g.appendChild(hitRect);
    g.appendChild(countBadge);
    g.appendChild(countTooltip);
  });
  // Click on SVG background deselects
  svg.addEventListener('click',function(){
    if(svg._didPan){svg._didPan=false;return;}
    if(selectedEventId){selectedEventId=null; render();}
  });
  parent.appendChild(svg);
}
