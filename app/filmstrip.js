// Native horizontal scrolling stays separate from slide sorting. A thumbnail
// can be dragged with a mouse; its grip also supports touch/pointer sorting.
export function bindFilmstrip(list,{reorder,busy=()=>false,vertical=false}={}){
  const point=event=>vertical?event.clientY:event.clientX;
  const edge=vertical?'top':'left',end=vertical?'bottom':'right',length=vertical?'height':'width',scroll=vertical?'scrollTop':'scrollLeft';
  let job=null,frame=0;
  const controller=new AbortController(),on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:controller.signal});
  const tiles=()=>[...list.querySelectorAll('.cv-slide:not(.add)')];
  const clearMark=()=>list.querySelectorAll('.drop-before,.drop-after').forEach(node=>node.classList.remove('drop-before','drop-after'));
  function mark(x){
    if(!job)return;job.x=x;clearMark();
    const nodes=tiles();let slot=nodes.length;
    for(let i=0;i<nodes.length;i++){const box=nodes[i].getBoundingClientRect();if(x<box[edge]+box[length]/2){slot=i;break;}}
    job.to=Math.max(0,Math.min(nodes.length-1,slot-(slot>job.from?1:0)));
    if(slot<nodes.length)nodes[slot].classList.add('drop-before');else nodes.at(-1)?.classList.add('drop-after');
  }
  function autoScroll(){
    if(!job||!list.isConnected){stop();return;}
    const box=list.getBoundingClientRect(),delta=job.x<box[edge]+38?-12:job.x>box[end]-38?12:0;
    if(delta){list[scroll]+=delta;mark(job.x);}frame=requestAnimationFrame(autoScroll);
  }
  function start(node,x){if(busy())return false;stop();job={from:tiles().indexOf(node),to:tiles().indexOf(node),x,node};node.classList.add('sorting');list.classList.add('is-sorting');frame=requestAnimationFrame(autoScroll);return true;}
  function stop(){cancelAnimationFrame(frame);clearMark();job?.node.classList.remove('sorting');job=null;list.classList.remove('is-sorting');}
  function finish(){const value=job;stop();if(value&&value.from!==value.to)reorder(value.from,value.to);}
  for(const node of tiles()){
    node.draggable=true;
    on(node,'dragstart',event=>{if(!start(node,point(event))){event.preventDefault();return;}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','onbatang-slide');});
    on(node,'dragend',stop);
    on(node,'keydown',async event=>{
      if(!event.altKey||!(vertical?['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']:['ArrowLeft','ArrowRight']).includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const from=tiles().indexOf(node),to=from+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1),rail=list.closest('.cv-strip');
      if(busy()||to<0||to>=tiles().length)return;
      await reorder(from,to);
      // Rebuilding thumbnails must not strand the keyboard on document.body.
      if(rail?.isConnected&&(document.activeElement===document.body||document.activeElement===node))rail.querySelectorAll('.cv-slide:not(.add)')[to]?.focus({preventScroll:true});
    });
    const grip=document.createElement('span');grip.className='cv-slide-grip';grip.textContent='⠿';grip.title=vertical?'끌어서 순서 변경 · Alt+↑/↓':'끌어서 순서 변경 · Alt+←/→';grip.setAttribute('aria-hidden','true');node.append(grip);
    on(grip,'click',event=>{event.preventDefault();event.stopPropagation();});
    on(grip,'pointerdown',event=>{
      if(event.button>0||!start(node,point(event)))return;
      event.preventDefault();event.stopPropagation();grip.setPointerCapture(event.pointerId);
      // Browsers may enlarge a touch hit onto this grip. A tap still selects
      // its slide; only an intentional movement sorts it.
      let moved=false;
      const move=e=>{if(e.pointerId!==event.pointerId)return;if(Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY)>=6)moved=true;if(moved)mark(point(e));};
      const end=e=>{if(e.pointerId!==event.pointerId)return;cleanup();if(e.type==='pointercancel')stop();else if(moved)finish();else{stop();node.click();}};
      const cleanup=()=>{grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',end);grip.removeEventListener('pointercancel',end);};
      on(grip,'pointermove',move);on(grip,'pointerup',end);on(grip,'pointercancel',end);
    });
  }
  on(list,'dragover',event=>{if(!job)return;event.preventDefault();event.dataTransfer.dropEffect='move';mark(point(event));});
  on(list,'drop',event=>{if(!job)return;event.preventDefault();mark(point(event));finish();});
  on(list,'keydown',event=>{if(event.key==='Escape')stop();});
  on(list,'wheel',event=>{
    if(vertical||event.ctrlKey||list.scrollWidth<=list.clientWidth)return;
    const by=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*(event.deltaMode===1?16:event.deltaMode===2?list.clientWidth:1);
    const old=list.scrollLeft;list.scrollLeft+=by;if(list.scrollLeft!==old)event.preventDefault();
  },{passive:false});
  on(list,'pointerdown',event=>{
    if(event.button>0||event.target.closest('.cv-slide'))return;
    if(vertical)return; // Vertical rails keep native touch scrolling.
    const x=event.clientX,left=list.scrollLeft;list.setPointerCapture(event.pointerId);
    const move=e=>{if(e.pointerId===event.pointerId)list.scrollLeft=left+x-e.clientX;};
    const end=()=>{list.removeEventListener('pointermove',move);list.removeEventListener('pointerup',end);list.removeEventListener('pointercancel',end);};
    on(list,'pointermove',move);on(list,'pointerup',end);on(list,'pointercancel',end);
  });
  return {stop,destroy(){stop();controller.abort();}};
}

/** 고른 장이 목록에서 안 보이면 그 장까지 목록만 넘긴다(쪽은 움직이지 않는다). 접어 두거나 서랍을 닫아 둔 사이에
 * 이전 · 다음으로 넘긴 뒤 다시 펼칠 때 쓴다: 숨겨 둔 목록은 크기가 없어 그동안의 넘김 계산이 소용없다. */
export function revealSelected(strip){
  const list=strip?.querySelector('.cv-slide-list'),selected=list?.querySelector('.cv-slide.on');
  if(!selected||!list.clientHeight)return;
  const box=list.getBoundingClientRect(),r=selected.getBoundingClientRect();
  list.scrollTop+=r.top<box.top+8?r.top-box.top-8:r.bottom>box.bottom-8?r.bottom-box.bottom+8:0;
}

/** Page-centered workspace: the same navigation/actions in a vertical rail. */
export function bindPageRail(strip,{key,navigation=()=>({}),step=()=>{}}={}){
  const shell=strip.closest('.cv-page-workspace'),controller=new AbortController();
  const on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:controller.signal});
  let width=196,collapsed=false,drag=null;
  try{const saved=JSON.parse(localStorage.getItem(key));if(saved){width=Math.max(152,Math.min(300,Number(saved.width)||196));collapsed=!!saved.collapsed;}}catch{}
  const save=()=>{try{localStorage.setItem(key,JSON.stringify({width,collapsed}));}catch{}};
  const closeMenu=()=>{const menu=strip.querySelector('.cv-tray-menu');if(menu)menu.open=false;};
  function refresh(){
    const wasCollapsed=strip.classList.contains('cv-tray-collapsed');
    shell.style.setProperty('--cv-pages-width',`${collapsed?48:width}px`);
    shell.classList.toggle('pages-collapsed',collapsed);
    strip.classList.toggle('cv-tray-collapsed',collapsed);
    const body=strip.querySelector('.cv-tray-body'),toggle=strip.querySelector('.cv-tray-toggle');
    if(collapsed&&body?.contains(document.activeElement))toggle?.focus({preventScroll:true});
    if(body)body.hidden=collapsed;
    if(toggle){toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',`장 목록 ${collapsed?'펼치기':'접기'}`);toggle.querySelector('span').textContent=collapsed?'장 목록 펼치기':'장 목록';}
    const grip=strip.querySelector('.cv-tray-grip');
    if(grip){grip.setAttribute('aria-valuenow',String(collapsed?48:width));grip.setAttribute('aria-valuetext',collapsed?'접힘':`목록 너비 ${width}px`);}
    const size=strip.querySelector('[data-tray-width]');if(size)size.value=String(width);
    const state=navigation();
    for(const button of strip.querySelectorAll('[data-tray-step]'))button.disabled=Number(button.dataset.trayStep)<0?!state.previous:!state.next;
    const count=strip.querySelector('.cv-slide-count');
    const label=shell.querySelector('.cv-canvas-label');if(label&&count)label.textContent=`${count.textContent} · 편집 캔버스`;
    if(wasCollapsed&&!collapsed)revealSelected(strip);
  }
  on(strip,'click',event=>{
    if(event.target.closest('.cv-tray-toggle')){collapsed=!collapsed;closeMenu();refresh();save();}
    if(event.target.closest('[data-tray-reset]')){width=196;collapsed=false;refresh();save();}
    const button=event.target.closest('[data-tray-step]');if(button&&!button.disabled)step(Number(button.dataset.trayStep));
    if(event.target.closest('.cv-slide-tool,.cv-activity-add,.cv-activity-edit'))closeMenu();
  });
  on(strip,'input',event=>{if(event.target.matches('[data-tray-width]')){width=Number(event.target.value);collapsed=false;refresh();save();}});
  on(strip,'keydown',event=>{
    if(event.key==='Escape'&&strip.querySelector('.cv-tray-menu[open]')){event.preventDefault();closeMenu();strip.querySelector('.cv-tray-menu>summary').focus();return;}
    if(!event.target.closest('.cv-tray-grip')||!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(['Enter',' '].includes(event.key))collapsed=!collapsed;
    else if(event.key==='Home')collapsed=true;
    else{width=event.key==='End'?300:Math.max(152,Math.min(300,width+(event.key==='ArrowLeft'?-16:16)));collapsed=false;}
    refresh();save();
  });
  on(strip,'pointerdown',event=>{
    if(event.button>0||!event.target.closest('.cv-tray-grip'))return;
    event.preventDefault();closeMenu();drag={id:event.pointerId,x:event.clientX,width,collapsed};strip.setPointerCapture(event.pointerId);
  });
  on(strip,'pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;width=Math.round(Math.max(152,Math.min(300,drag.width+event.clientX-drag.x)));collapsed=false;refresh();});
  const finish=cancel=>{if(!drag)return;const before=drag;drag=null;if(cancel){width=before.width;collapsed=before.collapsed;}refresh();save();try{strip.releasePointerCapture(before.id);}catch{}};
  on(strip,'pointerup',()=>finish(false));on(strip,'pointercancel',()=>finish(true));on(strip,'lostpointercapture',()=>finish(true));on(window,'blur',()=>finish(true));
  on(document,'pointerdown',event=>{if(!strip.contains(event.target))closeMenu();},{capture:true});
  return {refresh,destroy(){finish(true);controller.abort();}};
}

// Device-only workspace preferences. Folding/resizing never changes a drawing,
// selected page, undo history or the native horizontal slide rail.
export function bindSlideTray(strip,{key,navigation=()=>({}),step=()=>{}}={}){
  const compact=window.matchMedia('(min-width:900px) and (min-height:520px) and (max-height:740px)');
  const desktop=window.matchMedia('(min-width:900px) and (min-height:520px)');
  const controller=new AbortController(),on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:controller.signal});
  let choice=null,panelHeight=null,drag=null,navButton=null,navCount='';
  const heightKey=key+'.height';
  try{
    const value=localStorage.getItem(key);if(value==='closed'||value==='open')choice=value==='closed';
    const savedHeight=Number(localStorage.getItem(heightKey));if(Number.isFinite(savedHeight)&&savedHeight>=88&&savedHeight<=2000)panelHeight=savedHeight;
  }catch{}
  const closed=()=>choice??compact.matches;
  const save=()=>{try{localStorage.setItem(key,closed()?'closed':'open');if(panelHeight!==null)localStorage.setItem(heightKey,String(Math.round(panelHeight)));else localStorage.removeItem(heightKey);}catch{}};
  function limits(){
    const min=window.matchMedia('(pointer:coarse)').matches?104:88,work=strip.closest('.cv-work'),tools=work?.querySelector('.cv-tools');
    const available=desktop.matches&&work?.clientHeight?work.clientHeight-(tools?.offsetHeight||0)-180:innerHeight*.65;
    return {min,max:Math.max(min,Math.floor(Math.min(innerHeight*.65,available)))};
  }
  const closeMenu=()=>{const menu=strip.querySelector('.cv-tray-menu');if(menu)menu.open=false;};
  function refresh(){
    const collapsed=closed(),body=strip.querySelector('.cv-tray-body'),toggle=strip.querySelector('.cv-tray-toggle'),grip=strip.querySelector('.cv-tray-grip');
    const wasClosed=strip.classList.contains('cv-tray-collapsed');
    if(collapsed&&body?.contains(document.activeElement))toggle?.focus({preventScroll:true});
    const range=limits();strip.classList.toggle('cv-tray-collapsed',collapsed);
    // Keep the user's preferred pixels even if a smaller viewport temporarily
    // clamps them. Only an intentional resize replaces the stored preference.
    strip.style.height=!collapsed&&panelHeight!==null?`${Math.max(range.min,Math.min(range.max,panelHeight))}px`:'';
    strip.style.maxHeight=!collapsed&&panelHeight!==null?`${range.max}px`:'';
    if(body)body.hidden=collapsed;
    let preview=64;
    if(!collapsed&&panelHeight!==null){
      const css=getComputedStyle(strip),header=strip.querySelector('.cv-strip-header');
      preview=Math.max(24,Math.floor(Math.max(range.min,Math.min(range.max,panelHeight))-(header?.offsetHeight||28)-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)-(parseFloat(css.rowGap)||0)-14));
    }
    strip.style.setProperty('--cv-thumb-height',`${preview}px`);
    if(wasClosed&&!collapsed){
      const list=strip.querySelector('.cv-slide-list'),selected=list?.querySelector('.cv-slide.on');
      if(selected){const box=list.getBoundingClientRect(),r=selected.getBoundingClientRect();list.scrollLeft+=r.left<box.left+8?r.left-box.left-8:r.right>box.right-8?r.right-box.right+8:0;}
    }
    if(toggle){toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',`슬라이드 목록 ${collapsed?'펼치기':'접기'}`);toggle.querySelector('span').textContent=collapsed?'목록 펼치기':'목록 접기';}
    if(grip){const actual=Math.round(strip.getBoundingClientRect().height);grip.setAttribute('aria-valuemax',String(range.max));grip.setAttribute('aria-valuenow',String(collapsed?0:actual));grip.setAttribute('aria-valuetext',collapsed?'접힘':`목록 창 높이 ${actual}px`);}
    const size=strip.querySelector('[data-tray-height]');if(size){size.min=String(range.min);size.max=String(range.max);size.value=String(collapsed?(panelHeight??120):Math.round(strip.getBoundingClientRect().height));}
    const first=strip.querySelector('[data-tray-step]'),count=strip.querySelector('.cv-slide-count')?.textContent;
    if(first!==navButton||count!==navCount){
      navButton=first;navCount=count;const state=navigation();
      for(const button of strip.querySelectorAll('[data-tray-step]'))button.disabled=Number(button.dataset.trayStep)<0?!state.previous:!state.next;
    }
  }
  const fold=value=>{choice=value;closeMenu();refresh();save();};
  on(strip,'click',event=>{
    if(event.target.closest('.cv-tray-toggle'))fold(!closed());
    if(event.target.closest('[data-tray-reset]')){panelHeight=null;choice=false;refresh();save();}
    const button=event.target.closest('[data-tray-step]');if(button&&!button.disabled)step(Number(button.dataset.trayStep));
    if(event.target.closest('.cv-slide-tool,.cv-activity-add,.cv-activity-edit'))closeMenu();
  });
  on(strip,'input',event=>{if(event.target.matches('[data-tray-height]')){panelHeight=Number(event.target.value);choice=false;refresh();save();}});
  on(strip,'keydown',event=>{
    if(event.key==='Escape'&&strip.querySelector('.cv-tray-menu[open]')){event.preventDefault();closeMenu();strip.querySelector('.cv-tray-menu>summary').focus();return;}
    if(!event.target.closest('.cv-tray-grip'))return;
    if(!['ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    closeMenu();const range=limits(),actual=strip.getBoundingClientRect().height;
    if(event.key==='Home')choice=true;
    else if(['Enter',' '].includes(event.key))choice=!closed();
    else if(event.key==='End'){choice=false;panelHeight=range.max;}
    else if(event.key==='ArrowUp'){panelHeight=closed()?(panelHeight??range.min):Math.min(range.max,actual+16);choice=false;}
    else if(!closed()){if(actual<=range.min+1)choice=true;else panelHeight=Math.max(range.min,actual-16);}
    refresh();save();
  });
  const finish=(cancel=false)=>{
    if(!drag)return;const before=drag;drag=null;
    strip.classList.remove('is-resizing');
    if(cancel){choice=before.choice;panelHeight=before.height;}
    else if(!before.moved)choice=!before.closed;
    refresh();if(!cancel)save();
    try{strip.releasePointerCapture(before.id);}catch{}
  };
  on(strip,'pointerdown',event=>{
    if(event.button>0||drag||!event.target.closest('.cv-tray-grip'))return;
    event.preventDefault();closeMenu();drag={id:event.pointerId,y:event.clientY,height:panelHeight,actual:strip.getBoundingClientRect().height,choice,closed:closed(),moved:false};
    strip.querySelector('.cv-tray-grip').focus({preventScroll:true});strip.setPointerCapture(event.pointerId);
  });
  on(strip,'pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const dy=drag.y-event.clientY;if(!drag.moved&&Math.abs(dy)<6)return;
    drag.moved=true;strip.classList.add('is-resizing');
    const wanted=drag.actual+dy,range=limits();choice=wanted<64;
    if(!choice)panelHeight=Math.round(Math.max(range.min,Math.min(range.max,wanted)));refresh();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(strip,type,event=>{if(drag&&event.pointerId===drag.id)finish(type==='pointercancel'||type==='lostpointercapture');});
  on(document,'pointerdown',event=>{if(!strip.contains(event.target))closeMenu();}, {capture:true});
  on(window,'blur',()=>finish(true));on(window,'resize',()=>refresh());on(compact,'change',()=>refresh());
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>refresh()):null;
  const work=strip.closest('.cv-work');if(work){observer?.observe(work);const tools=work.querySelector('.cv-tools');if(tools)observer?.observe(tools);}
  return {refresh,destroy(){finish(true);observer?.disconnect();controller.abort();}};
}
