import {el} from './dom.js';
import {effectArt,paceFactor} from './effect-assets.js';
import {effectFrames,runEffectFrames} from './effect-frames.js';
import {cleanCinemaTracks} from './cinema-layout.js';

// A local editing transaction: Cancel never changes a slide or a saved style.
export function openCinemaStudio(asset,initial,content,apply,{commit=false}={}){
  let draft=structuredClone(initial),selected='',tracks=[],frames,stop,drag,playing=false;
  let lastTap;
  const history=[],future=[],opener=document.activeElement,overlays=new Map();
  const factor=paceFactor(initial.pace),options=()=>({...draft,content});
  const button=(text,fn,cls='')=>el('button',{type:'button',class:'ce-button '+cls,text,onClick:fn});
  const preview=el('div',{class:'ce-picture'}),hits=el('div',{class:'ce-hits'});
  const inline=el('textarea',{class:'ce-inline',hidden:true,'aria-label':'화면에서 문구 수정',maxlength:144});
  const stage=el('div',{class:'ce-stage'},preview,hits,inline);
  const status=el('span',{class:'ce-status',role:'status'});
  const time=el('output',{class:'ce-time'});
  const scrub=el('input',{type:'range',min:0,max:1000,step:1,value:1000,'aria-label':'장면 재생 위치'});
  const rows=el('div',{class:'ce-tracks','aria-label':'등장 타임라인'});
  const fields={},field=(name,label,min,max,step=1)=>{
    const input=el('input',{type:'number',min,max,step,'aria-label':label});fields[name]=input;
    input.onchange=()=>{
      if(!input.value||!Number.isFinite(input.valueAsNumber)){fillFields();return;}
      const track=current();if(!track)return;
      let value=Math.max(min,Math.min(max,input.valueAsNumber));
      if(name==='scale')value/=100;
      if(name==='start'||name==='duration')value=value*1000/factor;
      if(name==='dx')value=value*7.2-track.cx;
      if(name==='dy')value=value*3.6-track.cy;
      change(()=>patch({[name]:value}));
    };
    return el('label',{},label,input);
  };
  const words=el('textarea',{rows:3,maxlength:144,'aria-label':'선택한 문구'});
  const wordLabel=el('label',{},'문구 · 화면을 두 번 눌러도 고쳐요',words);
  const selectedName=el('h3');
  const undo=button('실행 취소',()=>restore(history,future)),redo=button('다시 실행',()=>restore(future,history));
  const play=button('▶ 재생',()=>{
    if(stop){halt();return;}
    finishInline();playing=true;hits.hidden=true;frames=effectFrames(asset.id,options());
    preview.replaceChildren(frames.svg);const start=Number(scrub.value)>=1000?0:Number(scrub.value)/1000;
    scrub.value=Math.round(start*1000);showTime(start);
    play.textContent='Ⅱ 멈춤';
    stop=runEffectFrames(frames,start,frames.duration,p=>{scrub.value=Math.round(p*1000);showTime(p);},()=>{stop=null;play.textContent='▶ 다시 재생';});
  },'primary');
  const edit=button('배치 편집',()=>{finishInline();render();});
  const reset=button('선택한 부분 초기화',()=>change(()=>{draft.sceneTracks=(draft.sceneTracks||[]).filter(t=>t.key!==selected);}));
  const save=button(commit?'슬라이드에 적용':'꾸미기에 반영',()=>{
    finishInline();if(save.disabled)return;
    const result={...draft,sceneTracks:cleanCinemaTracks(asset.id,draft.sceneTracks)};
    if(!result.sceneTracks.length)delete result.sceneTracks;
    close();apply(result);
  },'primary');
  const cancel=button('취소',close);
  const placementTab=button('글 · 배치',()=>setMobileView('fields'));
  const timelineTab=button('타임라인',()=>setMobileView('timeline'));
  const mobileTabs=el('nav',{class:'ce-mobile-tabs','aria-label':'장면 편집 도구'},placementTab,timelineTab);
  const controls=el('aside',{class:'ce-inspector'},selectedName,wordLabel,
    el('div',{class:'ce-values'},field('dx','가로 위치 (%)',-50,150,.1),field('dy','세로 위치 (%)',-50,150,.1)),
    field('scale','크기 (%)',40,250),
    el('div',{class:'ce-values'},field('start','등장 (초)',0,30*factor,.1),field('duration','움직임 (초)',.2*factor,10*factor,.1)),
    el('p',{class:'ce-help'},'등장 뒤에는 그대로 남아요. 순서 화살표는 겹침 없이 차례대로 맞춰요.'),reset,status);
  const dialog=el('dialog',{class:'fe-cinema-studio','aria-labelledby':'ce-title',dataset:{mobileView:'fields'}},
    el('header',{class:'ce-header'},el('div',{},el('h2',{id:'ce-title'},asset.name+' 편집'),
      el('p',{},'화면에서 끌어 배치하고, 아래에서 등장 순서와 시간을 맞추세요.')),
      el('div',{class:'ce-actions'},cancel,save)),mobileTabs,
    el('div',{class:'ce-workspace'},el('section',{class:'ce-visual'},
      el('div',{class:'ce-actions'},undo,redo,el('small',{},'두 번 눌러 글 수정 · 모서리로 크기 조절')),el('div',{class:'ce-board'},stage)),controls),
    el('section',{class:'ce-timeline'},el('div',{class:'ce-transport'},play,edit,scrub,time),rows,
      el('small',{class:'ce-help'},'막대를 끌면 등장 시점, 오른쪽 끝을 끌면 움직이는 시간이 바뀌어요.')));

  function current(){return tracks.find(t=>t.key===selected);}
  function setMobileView(view){
    dialog.dataset.mobileView=view;placementTab.setAttribute('aria-pressed',String(view==='fields'));
    timelineTab.setAttribute('aria-pressed',String(view==='timeline'));render();
  }
  function record(){return JSON.stringify(draft);}
  function remember(before){if(before===record())return;history.push(before);if(history.length>60)history.shift();future.length=0;}
  function restore(from,to){if(!from.length)return;to.push(record());draft=JSON.parse(from.pop());inline.hidden=true;render();}
  function patch(values){
    const entries=(draft.sceneTracks||[]).filter(t=>t.key!==selected);
    const old=(draft.sceneTracks||[]).find(t=>t.key===selected)||{key:selected};
    entries.push({...old,...values});draft.sceneTracks=cleanCinemaTracks(asset.id,entries);
  }
  function change(fn){const before=record();halt();fn();remember(before);render();}
  function halt(){stop?.();stop=null;play.textContent='▶ 재생';}
  function close(){halt();dialog.close();dialog.remove();opener?.focus({preventScroll:true});}
  function showTime(p){time.textContent=(p*frames.duration/1000).toFixed(1)+' / '+(frames.duration/1000).toFixed(1)+'초';}
  function validWords(text){return selected!=='number'||!text.trim()||/^[+−-]?\d[\d,]*(?:\.\d+)?[%％]?$/.test(text.trim())&&text.replace(/\D/g,'').length<=8;}
  function setWords(value){
    const valid=validWords(value);save.disabled=!valid;words.setAttribute('aria-invalid',String(!valid));
    inline.setAttribute('aria-invalid',String(!valid));status.textContent=valid?'':'숫자판에는 8자리 이내의 수치와 부호·소수점·%를 넣어 주세요.';
    if(!valid)return;
    const text=Array.from(value.trim()).slice(0,72).join('');
    const before=record();patch({text});remember(before);render(false);
  }
  words.oninput=()=>setWords(words.value);
  inline.oninput=()=>{words.value=inline.value;setWords(inline.value);};
  function beginInline(){
    if(current()?.editable!==true)return;
    const hit=overlays.get(selected);inline.style.cssText=hit.style.cssText;
    inline.hidden=false;inline.value=current().text;inline.focus();inline.select();
  }
  function finishInline(){inline.hidden=true;}
  inline.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finishInline();}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();finishInline();}};
  function fillFields(){
    const track=current();if(!track)return;
    const edit=(draft.sceneTracks||[]).find(t=>t.key===selected)||{};
    selectedName.textContent=track.label;wordLabel.hidden=!track.editable;
    words.value=track.text;
    const values={dx:(track.cx+(edit.dx||0))/7.2,dy:(track.cy+(edit.dy||0))/3.6,scale:(edit.scale??1)*100,
      start:track.start*factor/1000,duration:track.duration*factor/1000};
    for(const [key,value] of Object.entries(values))fields[key].value=Math.round(value*100)/100;
    undo.disabled=!history.length;redo.disabled=!future.length;
  }
  function select(key){
    if(!save.disabled){selected=key;finishInline();fillFields();updateSelection();}
  }
  function updateSelection(){
    for(const [key,hit] of overlays)hit.setAttribute('aria-pressed',String(key===selected));
    for(const row of rows.children)row.classList.toggle('selected',row.dataset.track===selected);
  }
  function render(fill=true){
    halt();playing=false;hits.hidden=false;
    if(fill){save.disabled=false;words.setAttribute('aria-invalid','false');inline.setAttribute('aria-invalid','false');status.textContent='';}
    const art=effectArt(asset.id,false,options());preview.replaceChildren(art);
    const area=stage.getBoundingClientRect();tracks=[];
    for(const group of art.querySelectorAll('[data-cinema-track]')){
      const d=group.dataset,track={key:d.cinemaTrack,label:d.trackLabel,text:d.trackText,editable:d.trackEditable==='true',
        cx:+d.trackCx,cy:+d.trackCy,start:+d.trackStart,duration:+d.trackDuration};tracks.push(track);
      let hit=overlays.get(track.key);
      if(!hit){
        hit=el('div',{class:'ce-hit',role:'button',tabindex:0,dataset:{track:track.key},'aria-label':track.label+' 선택'},
          el('span',{class:'ce-hit-label'},track.label),el('span',{class:'ce-size-handle',dataset:{size:''},'aria-hidden':'true'}));
        hit.onclick=()=>select(track.key);hit.ondblclick=()=>{select(track.key);beginInline();};
        hit.onkeydown=e=>{
          if(e.key==='Enter'){select(track.key);beginInline();return;}
          if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
          e.preventDefault();select(track.key);const v=(draft.sceneTracks||[]).find(t=>t.key===selected)||{};
          const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
          change(()=>patch({dx:(v.dx||0)+dx,dy:(v.dy||0)+dy}));
        };
        overlays.set(track.key,hit);hits.append(hit);
      }
      // Reels contain off-screen digits; select the visible window, not all glyphs.
      let box=group.getBoundingClientRect();
      if(track.key==='number'){
        const matrix=group.getScreenCTM(),a=new DOMPoint(35,88).matrixTransform(matrix),b=new DOMPoint(685,245).matrixTransform(matrix);
        box={x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};
      }
      const x=Math.max(0,Math.min(area.width-24,box.x-area.x-5)),y=Math.max(0,Math.min(area.height-24,box.y-area.y-5));
      hit.style.cssText=`left:${x/area.width*100}%;top:${y/area.height*100}%;width:${Math.max(24,Math.min(area.width-x,box.width+10))/area.width*100}%;height:${Math.max(24,Math.min(area.height-y,box.height+10))/area.height*100}%`;
    }
    for(const [key,hit] of overlays)if(!tracks.some(t=>t.key===key)){hit.remove();overlays.delete(key);}
    if(!current())selected=tracks.find(t=>t.editable)?.key||tracks[0]?.key;
    frames=effectFrames(asset.id,options());scrub.value=1000;showTime(1);
    renderTimeline();if(fill)fillFields();
    undo.disabled=!history.length;redo.disabled=!future.length;updateSelection();
  }
  function reorder(key,direction){
    const ordered=[...tracks].sort((a,b)=>a.start-b.start),index=ordered.findIndex(t=>t.key===key),target=index+direction;
    if(target<0||target>=ordered.length)return;
    [ordered[index],ordered[target]]=[ordered[target],ordered[index]];
    change(()=>{let start=0;for(const track of ordered){selected=track.key;patch({start,duration:track.duration});start+=track.duration+150;}selected=key;});
  }
  function renderTimeline(){
    rows.replaceChildren(...[...tracks].sort((a,b)=>a.start-b.start).map((t,i,ordered)=>{
      const earlier=button('↑',()=>reorder(t.key,-1)),later=button('↓',()=>reorder(t.key,1));
      earlier.setAttribute('aria-label',t.label+' 먼저');later.setAttribute('aria-label',t.label+' 나중');
      earlier.disabled=i===0;later.disabled=i===ordered.length-1;
      const lane=el('div',{class:'ce-lane'},el('button',{type:'button',class:'ce-bar',dataset:{bar:t.key},
        'aria-label':t.label+' 시간 막대',style:`left:${t.start*factor/frames.duration*100}%;width:${Math.max(2,t.duration*factor/frames.duration*100)}%`,onClick:()=>select(t.key)},
        el('span',{},(t.start*factor/1000).toFixed(1)+'초'),el('span',{class:'ce-bar-end',dataset:{end:''},'aria-hidden':'true'})));
      return el('div',{class:'ce-track',dataset:{track:t.key}},button(t.label,()=>select(t.key)),lane,earlier,later);
    }));
  }
  scrub.oninput=()=>{
    halt();finishInline();playing=true;hits.hidden=true;frames=effectFrames(asset.id,options());preview.replaceChildren(frames.svg);
    frames.paint(Number(scrub.value)/1000);showTime(Number(scrub.value)/1000);
  };
  function startDrag(event,kind,key,container){
    if(event.button!==0||save.disabled)return;
    event.preventDefault();finishInline();selected=key;if(playing)render();select(key);
    const value=(draft.sceneTracks||[]).find(t=>t.key===key)||{},track=current();
    drag={kind,key,container,pointer:event.pointerId,x:event.clientX,y:event.clientY,before:record(),value:{...value},track:{...track},
      width:kind==='move'||kind==='size'?stage.clientWidth:event.target.closest('.ce-lane').clientWidth,duration:frames.duration};
    if(kind==='size'){
      const box=overlays.get(key).getBoundingClientRect(),area=stage.getBoundingClientRect();
      drag.boxWidth=box.width;drag.left=(box.x-area.x)/area.width*720;drag.top=(box.y-area.y)/area.width*720;
    }
    container.setPointerCapture(event.pointerId);
  }
  hits.onpointerdown=e=>{
    const hit=e.target.closest('.ce-hit');if(hit)startDrag(e,e.target.closest('[data-size]')?'size':'move',hit.dataset.track,hits);
  };
  rows.onpointerdown=e=>{
    const bar=e.target.closest('[data-bar]');if(bar)startDrag(e,e.target.closest('[data-end]')?'length':'time',bar.dataset.bar,rows);
  };
  function move(event){
    if(!drag||drag.pointer!==event.pointerId)return;
    const {kind,value,track,width}=drag,dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(kind==='move')patch({dx:(value.dx||0)+dx/width*720,dy:(value.dy||0)+dy/width*720});
    else if(kind==='size'){
      const scale=Math.max(.4,Math.min(2.5,(value.scale??1)*(1+dx/Math.max(24,drag.boxWidth))));
      const ratio=scale/(value.scale??1);
      patch({scale,dx:(value.dx||0)+(drag.left-track.cx-(value.dx||0))*(1-ratio),
        dy:(value.dy||0)+(drag.top-track.cy-(value.dy||0))*(1-ratio)});
    }
    else if(kind==='time')patch({start:Math.round((track.start+dx/width*drag.duration/factor)/50)*50,duration:track.duration});
    else patch({start:track.start,duration:Math.round((track.duration+dx/width*drag.duration/factor)/50)*50});
    render();
  }
  function end(event){
    if(!drag||drag.pointer!==event.pointerId)return;
    const tap=drag.kind==='move'&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4&&event.type==='pointerup';
    if(event.type==='pointercancel')draft=JSON.parse(drag.before);else remember(drag.before);
    drag.container.releasePointerCapture(event.pointerId);drag=null;render();
    if(tap){
      const now=performance.now();
      if(lastTap?.key===selected&&now-lastTap.at<400){beginInline();lastTap=null;}
      else lastTap={key:selected,at:now};
    }else lastTap=null;
  }
  for(const target of [hits,rows]){target.onpointermove=move;target.onpointerup=end;target.onpointercancel=end;}
  // Native modal focus/inertness; do not send typing/arrow shortcuts to the editor.
  dialog.addEventListener('keydown',e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.target.matches('input,textarea')){e.preventDefault();restore(e.shiftKey?future:history,e.shiftKey?history:future);}});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  document.body.append(dialog);dialog.showModal();setMobileView('fields');save.focus();
  const resize=new ResizeObserver(()=>{if(!playing&&!drag&&inline.hidden)render();});resize.observe(stage);
  dialog.addEventListener('close',()=>resize.disconnect(),{once:true});
}
