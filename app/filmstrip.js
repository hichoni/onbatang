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
