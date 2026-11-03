import {el} from './dom.js';
import {effectFrames,runEffectFrames} from './effect-frames.js';
import {paceFactor} from './effect-assets.js';
import {cinemaCues} from './cinema-cues.js';

const states=new WeakMap();
export const cinemaStepState=panel=>states.get(panel)||null;
function sceneCues(frames,options){
  return cinemaCues([...frames.svg.querySelectorAll('[data-cinema-track]')].map(n=>({
    key:n.dataset.cinemaTrack,label:n.dataset.trackLabel,text:n.dataset.trackText,
    teacherNote:options.sceneTracks?.find(t=>t.key===n.dataset.cinemaTrack)?.teacherNote||'',
    editable:n.dataset.trackEditable==='true',start:+n.dataset.trackStart,duration:+n.dataset.trackDuration})),paceFactor(options.pace));
}
function snapshot(asset,options,cues,index,phase){
  const phrase=c=>c?{key:c.key,label:c.label,text:c.text,note:c.teacherNote}:null;
  return {scene:options.cueScene||asset.id,title:asset.name,index,total:cues.length,phase,
    current:phrase(cues[index-1]),next:phrase(cues[index])};
}
export function cinemaStepPreview(asset,options){
  return snapshot(asset,options,sceneCues(effectFrames(asset.id,options),options),0,'ready');
}

const style=`
.ob-cinema-steps{position:absolute;inset:0;z-index:12;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:8px;padding:12px;box-sizing:border-box;background:#10242c;color:#eff9f3;font:500 clamp(12px,1.7cqw,19px)/1.4 system-ui;pointer-events:auto;overflow:auto;container-type:size}
.cs-head,.cs-controls{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.cs-head{grid-row:1}.cs-head strong{font-size:1em}.cs-controls{grid-row:3;justify-content:center}
.ob-cinema-steps button{font:inherit;min-height:40px;border:1px solid #668b8b;border-radius:9px;background:#19373e;color:#eff9f3;padding:6px 12px;cursor:pointer}.ob-cinema-steps button:disabled{opacity:.4;cursor:default}
.ob-cinema-steps .cs-next{background:#a9efd7;color:#113c32;font-weight:750}.ob-cinema-steps :focus-visible{outline:3px solid #ffe3a0;outline-offset:2px}
.ob-cinema-steps .cs-art{grid-row:2;width:100%;min-height:60px;padding:0;border:0;border-radius:10px;overflow:hidden;display:block;background:#152b32;position:relative;touch-action:manipulation}
.cs-art svg{display:block;width:100%;height:100%}.cs-order{font-size:.85em;color:#bbd8d0;font-variant-numeric:tabular-nums}.cs-progress{height:3px;background:#30524e;border-radius:4px;overflow:hidden;flex:1 1 100%}.cs-progress i{display:block;height:100%;background:#a9efd7;width:0}
.cs-compact-count{display:none}
@container(max-height:280px){
 .cs-head{position:absolute;right:8px;top:8px;z-index:2}.cs-head strong{display:none}
 .ob-cinema-steps .cs-close{min-height:28px;padding:3px 7px;font-size:10px;background:#19373ee6}
 .cs-controls{gap:5px;flex-wrap:nowrap}.cs-controls button{min-height:34px;padding:4px 7px;font-size:11px}
 .cs-controls .cs-order{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
 .cs-compact-count{display:inline;font-size:10px}.cs-progress{display:none}
}
@media(max-width:700px){.ob-cinema-steps{padding:6px;gap:4px}}
@media(max-height:450px){.ob-cinema-steps{padding:6px;gap:4px}.ob-cinema-steps button{min-height:34px;padding:4px 8px}}
`;

// Each phrase samples its own authored clock. Future text and associated route
// paths/pins remain hidden even when their original time windows overlap.
export function mountCinemaSteps(host,asset,options,onClose,{start=false}={}){
  const frames=effectFrames(asset.id,options),cues=sceneCues(frames,options);
  const groups=[...frames.svg.querySelectorAll('[data-cinema-cue]')];
  let count=0,progress=0,busy=false,stop=null,background=0,destroyed=false,lastState='';
  const action=(text,cls,fn)=>el('button',{type:'button',class:cls,text,onClick:fn});
  const art=action('','cs-art',()=>next()),readout=el('output',{class:'cs-order','aria-live':'polite'}),compact=el('span',{class:'cs-compact-count','aria-hidden':'true'});
  art.setAttribute('aria-label','화면을 눌러 다음 구절 공개');art.append(frames.svg);
  const back=action('이전 구절','cs-back',()=>previous());
  const forward=action('첫 구절 보기','cs-next',()=>next());
  const reset=action('처음부터','cs-reset',()=>{halt();count=0;busy=false;progress=0;background=0;paint();});
  const close=action('슬라이드로 돌아가기','cs-close',onClose),bar=el('i');
  const panel=el('section',{class:'ob-cinema-steps',dataset:{cinemaSteps:'',step:0},role:'group','aria-label':asset.name+' 하나씩 공개'},
    el('style',{text:style}),el('div',{class:'cs-head'},el('strong',{},asset.name),close),art,
    el('div',{class:'cs-controls'},readout,compact,back,forward,reset,el('div',{class:'cs-progress','aria-hidden':'true'},bar)));
  host.append(panel);
  function halt(){stop?.();stop=null;}
  function paint(){
    const active=cues[count-1],times={};
    for(const [i,cue] of cues.entries()){
      const elapsed=i===count-1&&busy?Math.max(0,progress*(cue.wait+cue.duration)-cue.wait):cue.duration;
      times[cue.key]=i<count?cue.start+elapsed:0;
    }
    frames.paintCues(times,background);
    for(const group of groups){const index=cues.findIndex(c=>c.key===group.dataset.cinemaCue);if(index<0)continue;
      const visible=index<count&&!(index===count-1&&busy&&progress*(active.wait+active.duration)<active.wait);
      group.style.visibility=visible?'visible':'hidden';group.setAttribute('aria-hidden',String(!visible));
    }
    panel.dataset.step=String(count);panel.dataset.busy=String(busy);panel.dataset.paused=String(busy&&!stop);
    back.disabled=count===0;reset.disabled=count===0;
    const label=busy?(stop?'재생 중 · 누르면 완성':'멈춤 · 이어 재생'):count===cues.length?'모두 공개했어요':'다음 입력을 기다려요';
    const message=count+' / '+cues.length+' · '+label;
    if(readout.textContent!==message)readout.textContent=message;
    compact.textContent=count+' / '+cues.length;
    forward.textContent=busy?(stop?'현재 구절 완성':'이어 재생'):count===cues.length?'슬라이드로 돌아가기':count?'다음 구절 보기':'첫 구절 보기';
    bar.style.width=(cues.length?(count-(busy?1-progress:0))/cues.length*100:0)+'%';
    const waiting=busy&&progress*(active.wait+active.duration)<active.wait;
    const state=snapshot(asset,options,cues,count-(waiting?1:0),busy?(!stop?'paused':waiting?'waiting':'playing'):count===cues.length?'complete':'ready');
    const signature=JSON.stringify(state);
    if(signature!==lastState){
      lastState=signature;states.set(panel,state);
      panel.dispatchEvent(new CustomEvent('onbatang-cinema-change',{bubbles:true}));
    }
  }
  function animate(){
    const cue=cues[count-1],duration=cue.wait+cue.duration;
    const segment={svg:frames.svg,paint(p){progress=p;background=Math.max(background,cue.start-cue.wait+p*duration);paint();}};
    stop=runEffectFrames(segment,progress,duration,null,finished=>{
      stop=null;if(finished){progress=1;busy=false;}paint();
    });paint();
  }
  function next(){
    if(destroyed)return;
    if(busy){if(!stop){animate();return;}halt();progress=1;busy=false;background=Math.max(background,cues[count-1].start+cues[count-1].duration);paint();return;}
    if(count===cues.length){onClose();return;}
    count++;progress=0;busy=true;animate();
  }
  function previous(){halt();if(count>0)count--;busy=false;progress=1;background=Math.max(0,...cues.slice(0,count).map(c=>c.start+c.duration));paint();}
  panel.addEventListener('click',event=>event.stopPropagation());
  panel.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const key=event.key;
    if(['ArrowRight','PageDown','ArrowLeft','PageUp','Escape'].includes(key)){
      event.preventDefault();if(!event.repeat){if(key==='Escape')onClose();else if(key==='ArrowLeft'||key==='PageUp'){if(count)previous();else onClose();}else next();}
    }
    // Space/Enter activate the focused native button exactly once.
    event.stopPropagation();
  });
  const visibility=()=>{if(document.hidden&&busy){halt();paint();}};
  document.addEventListener('visibilitychange',visibility);
  paint();if(start)next();forward.focus({preventScroll:true});
  const destroy=()=>{destroyed=true;halt();document.removeEventListener('visibilitychange',visibility);states.delete(panel);panel.remove();host.dispatchEvent(new CustomEvent('onbatang-cinema-change',{bubbles:true}));};
  destroy.pause=()=>{halt();paint();};
  return destroy;
}
