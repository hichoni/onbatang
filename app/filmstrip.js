// Native horizontal scrolling stays separate from slide sorting. A thumbnail
// can be dragged with a mouse; its grip also supports touch/pointer sorting.
export function bindFilmstrip(list,{reorder,busy=()=>false}={}){
  let job=null,frame=0;
  const controller=new AbortController(),on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:controller.signal});
  const tiles=()=>[...list.querySelectorAll('.cv-slide:not(.add)')];
  const clearMark=()=>list.querySelectorAll('.drop-before,.drop-after').forEach(node=>node.classList.remove('drop-before','drop-after'));
  function mark(x){
    if(!job)return;job.x=x;clearMark();
    const nodes=tiles();let slot=nodes.length;
    for(let i=0;i<nodes.length;i++){const box=nodes[i].getBoundingClientRect();if(x<box.left+box.width/2){slot=i;break;}}
    job.to=Math.max(0,Math.min(nodes.length-1,slot-(slot>job.from?1:0)));
    if(slot<nodes.length)nodes[slot].classList.add('drop-before');else nodes.at(-1)?.classList.add('drop-after');
  }
  function autoScroll(){
    if(!job||!list.isConnected){stop();return;}
    const box=list.getBoundingClientRect(),delta=job.x<box.left+38?-12:job.x>box.right-38?12:0;
    if(delta){list.scrollLeft+=delta;mark(job.x);}frame=requestAnimationFrame(autoScroll);
  }
  function start(node,x){if(busy())return false;stop();job={from:tiles().indexOf(node),to:tiles().indexOf(node),x,node};node.classList.add('sorting');list.classList.add('is-sorting');frame=requestAnimationFrame(autoScroll);return true;}
  function stop(){cancelAnimationFrame(frame);clearMark();job?.node.classList.remove('sorting');job=null;list.classList.remove('is-sorting');}
  function finish(){const value=job;stop();if(value&&value.from!==value.to)reorder(value.from,value.to);}
  for(const node of tiles()){
    node.draggable=true;
    on(node,'dragstart',event=>{if(!start(node,event.clientX)){event.preventDefault();return;}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','onbatang-slide');});
    on(node,'dragend',stop);
    on(node,'keydown',event=>{if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();const from=tiles().indexOf(node),to=from+(event.key==='ArrowLeft'?-1:1);if(!busy()&&to>=0&&to<tiles().length)reorder(from,to);}});
    const grip=document.createElement('span');grip.className='cv-slide-grip';grip.textContent='⠿';grip.title='끌어서 순서 변경 · Alt+←/→';grip.setAttribute('aria-hidden','true');node.append(grip);
    on(grip,'click',event=>{event.preventDefault();event.stopPropagation();});
    on(grip,'pointerdown',event=>{
      if(event.button>0||!start(node,event.clientX))return;
      event.preventDefault();event.stopPropagation();grip.setPointerCapture(event.pointerId);
      const move=e=>{if(e.pointerId===event.pointerId)mark(e.clientX);};
      const end=e=>{if(e.pointerId!==event.pointerId)return;cleanup();if(e.type==='pointercancel')stop();else finish();};
      const cleanup=()=>{grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',end);grip.removeEventListener('pointercancel',end);};
      on(grip,'pointermove',move);on(grip,'pointerup',end);on(grip,'pointercancel',end);
    });
  }
  on(list,'dragover',event=>{if(!job)return;event.preventDefault();event.dataTransfer.dropEffect='move';mark(event.clientX);});
  on(list,'drop',event=>{if(!job)return;event.preventDefault();mark(event.clientX);finish();});
  on(list,'keydown',event=>{if(event.key==='Escape')stop();});
  on(list,'wheel',event=>{
    if(event.ctrlKey||list.scrollWidth<=list.clientWidth)return;
    const by=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*(event.deltaMode===1?16:event.deltaMode===2?list.clientWidth:1);
    const old=list.scrollLeft;list.scrollLeft+=by;if(list.scrollLeft!==old)event.preventDefault();
  },{passive:false});
  on(list,'pointerdown',event=>{
    if(event.button>0||event.target.closest('.cv-slide'))return;
    const x=event.clientX,left=list.scrollLeft;list.setPointerCapture(event.pointerId);
    const move=e=>{if(e.pointerId===event.pointerId)list.scrollLeft=left+x-e.clientX;};
    const end=()=>{list.removeEventListener('pointermove',move);list.removeEventListener('pointerup',end);list.removeEventListener('pointercancel',end);};
    on(list,'pointermove',move);on(list,'pointerup',end);on(list,'pointercancel',end);
  });
  return {stop,destroy(){stop();controller.abort();}};
}

// Device-only workspace preferences. Folding/resizing never changes a drawing,
// selected page, undo history or the native horizontal slide rail.
export function bindSlideTray(strip,{key,sizeKey,navigation=()=>({}),step=()=>{}}={}){
  const compact=window.matchMedia('(min-width:900px) and (min-height:520px) and (max-height:740px)');
  const controller=new AbortController(),on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:controller.signal});
  let choice=null,height=92,drag=null;
  try{const value=localStorage.getItem(key);if(value==='closed'||value==='open')choice=value==='closed';height=Math.max(64,Math.min(152,Number(localStorage.getItem(sizeKey))||92));}catch{}
  const closed=()=>choice??compact.matches;
  const save=()=>{try{localStorage.setItem(key,closed()?'closed':'open');localStorage.setItem(sizeKey,String(height));}catch{}};
  function refresh(){
    const collapsed=closed(),body=strip.querySelector('.cv-tray-body'),toggle=strip.querySelector('.cv-tray-toggle'),grip=strip.querySelector('.cv-tray-grip');
    const wasClosed=strip.classList.contains('cv-tray-collapsed');
    if(collapsed&&body?.contains(document.activeElement))toggle?.focus({preventScroll:true});
    strip.classList.toggle('cv-tray-collapsed',collapsed);strip.style.setProperty('--cv-thumb-height',`${height}px`);
    if(body)body.hidden=collapsed;
    if(wasClosed&&!collapsed){
      const list=strip.querySelector('.cv-slide-list'),selected=list?.querySelector('.cv-slide.on');
      if(selected){const box=list.getBoundingClientRect(),r=selected.getBoundingClientRect();list.scrollLeft+=r.left<box.left+8?r.left-box.left-8:r.right>box.right-8?r.right-box.right+8:0;}
    }
    if(toggle){toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',`슬라이드 목록 ${collapsed?'펼치기':'접기'}`);toggle.querySelector('span').textContent=collapsed?'목록 펼치기':'목록 접기';}
    if(grip){grip.setAttribute('aria-valuenow',String(collapsed?0:height));grip.setAttribute('aria-valuetext',collapsed?'접힘':`미리보기 높이 ${height}px`);}
    const size=strip.querySelector('.cv-strip-size input');if(size)size.value=String(height);
    const state=navigation();for(const button of strip.querySelectorAll('[data-tray-step]'))button.disabled=Number(button.dataset.trayStep)<0?!state.previous:!state.next;
  }
  const fold=value=>{choice=value;refresh();save();};
  on(strip,'click',event=>{
    if(event.target.closest('.cv-tray-toggle'))fold(!closed());
    const button=event.target.closest('[data-tray-step]');if(button&&!button.disabled)step(Number(button.dataset.trayStep));
  });
  on(strip,'input',event=>{if(event.target.matches('.cv-strip-size input')){height=Number(event.target.value);refresh();save();}});
  on(strip,'keydown',event=>{
    if(!event.target.closest('.cv-tray-grip'))return;
    if(!['ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(event.key==='Home')choice=true;
    else if(['Enter',' '].includes(event.key))choice=!closed();
    else if(event.key==='End'){choice=false;height=152;}
    else if(event.key==='ArrowUp'){height=closed()?64:Math.min(152,height+8);choice=false;}
    else if(height<=64)choice=true;else height-=8;
    refresh();save();
  });
  const finish=(cancel=false)=>{
    if(!drag)return;const before=drag;drag=null;
    strip.classList.remove('is-resizing');
    if(cancel){choice=before.choice;height=before.height;}
    else if(!before.moved)choice=!before.closed;
    refresh();if(!cancel)save();
    try{strip.releasePointerCapture(before.id);}catch{}
  };
  on(strip,'pointerdown',event=>{
    if(event.button>0||drag||!event.target.closest('.cv-tray-grip'))return;
    event.preventDefault();drag={id:event.pointerId,y:event.clientY,height,choice,closed:closed(),moved:false};
    strip.querySelector('.cv-tray-grip').focus({preventScroll:true});strip.setPointerCapture(event.pointerId);
  });
  on(strip,'pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const dy=drag.y-event.clientY;if(!drag.moved&&Math.abs(dy)<6)return;
    drag.moved=true;strip.classList.add('is-resizing');
    const wanted=(drag.closed?0:drag.height)+dy;choice=wanted<40;
    if(!choice)height=Math.max(64,Math.min(152,wanted));refresh();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(strip,type,event=>{if(drag&&event.pointerId===drag.id)finish(type==='pointercancel'||type==='lostpointercapture');});
  on(window,'blur',()=>finish(true));on(compact,'change',refresh);
  return {refresh,destroy(){finish(true);controller.abort();}};
}
