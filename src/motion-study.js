import {el} from './dom.js';
import {effectFrames,runEffectFrames} from './effect-frames.js';
import {paceFactor} from './effect-assets.js';
import {motionCues} from './motion-cues.js';
import {motionCueEditor} from './motion-cue-editor.js';

// Travels with the presenter when a lesson is opened from a single HTML file.
const studyStyle=`
.ob-study,.ob-study *{box-sizing:border-box}
.ob-study{position:relative;display:flex;flex-direction:column;gap:9px;padding:clamp(8px,2%,18px);border:1px solid #3b565a;border-radius:14px;background:#10232b;color:#e7f4ec;font:500 15px/1.35 system-ui,sans-serif;overflow:auto;overscroll-behavior:contain;text-align:left}
.obs-head,.obs-transport,.obs-points{display:flex;align-items:center;gap:8px}
.obs-head{justify-content:space-between}.obs-head strong{font-size:1.12em;font-weight:750}
.obs-art{flex:1 1 auto;min-height:74px;height:clamp(160px,27vh,280px);overflow:hidden;border:1px solid #314b54;border-radius:9px;background:radial-gradient(ellipse at 55% 65%,#253e49,#0c1727 85%)}
.ob-study button{min-height:42px;padding:4px 12px;border:1px solid #627d81;border-radius:8px;color:#e2efec;background:#1b343e;font:inherit;cursor:pointer}
.ob-study .obs-play{min-width:8em;background:#a4eed4;color:#0b2826;border-color:#a4eed4;font-weight:700}
.obs-transport input[type=range]{flex:1 1 70px;min-width:30px;width:0;min-height:44px;margin:0;padding:0;accent-color:#a4eed4;cursor:pointer}
.obs-percent{width:4ch;text-align:right;font-variant-numeric:tabular-nums}
.obs-points{flex-wrap:wrap}.obs-points button{min-height:40px;font-size:.88em}.obs-points button[aria-pressed=true]{background:#335955;border-color:#a4eed4}
.ob-study :focus-visible{outline:2px solid #ffe49b;outline-offset:2px}
.obs-note{margin:0;color:#dbebe4;font:inherit}
.obs-order{display:flex;align-items:center;justify-content:space-between;gap:6px}
.obs-order output{font-size:.82em;color:#a9c8c5;text-align:center}
.obs-author{border-top:1px solid #3a5861;padding-top:8px}
.obs-author summary{cursor:pointer;font-weight:650;padding:5px 0}
.obs-author p{margin:8px 0;color:#bdd2d0;font-size:.86em;line-height:1.5}
.obs-author-actions{display:flex;gap:8px;flex-wrap:wrap}
.obs-cue-rows{display:grid;gap:6px;list-style:none;padding:0;margin:10px 0 0}
.obs-cue-rows li{display:grid;grid-template-columns:54px minmax(50px,1fr) auto;gap:5px;align-items:center}
.obs-cue-actions{display:flex;gap:3px}
.obs-cue-rows button{padding:3px 9px}
.ob-study .obs-cue-rows input{min-width:0;width:100%;height:42px;padding:5px 8px;border:1px solid #5d777e;border-radius:7px;background:#162c37;color:#eff5ed;font:inherit}
.ob-study button:disabled{opacity:.42;cursor:default}
.obs-cue-rows .obs-cue-actions button{min-width:32px;min-height:42px}
@media(max-width:430px){.obs-cue-rows li{grid-template-columns:50px minmax(0,1fr)}.obs-cue-actions{grid-column:2;justify-content:flex-end}}
[data-effect-observation]{position:absolute;inset:0;z-index:12;pointer-events:auto;container-type:size}
[data-effect-observation]>.ob-study{height:100%;border-radius:0}
@container(max-height:240px){.ob-study{padding:4px 8px;gap:2px}.obs-art{min-height:44px}.ob-study button{min-height:30px}.obs-transport input[type=range]{min-height:32px}}
@media(max-height:480px){.ob-study{gap:4px}.ob-study button{min-height:32px}.obs-art{min-height:54px}}
`;

// Shared by the gallery, the live presenter and the exported, offline lesson.
export function mountMotionStudy(host,asset,options={},onClose,onCuesChange) {
  const frames=effectFrames(asset.id,options);
  let stops=motionCues(asset,options.stops),points=[],stop=null,progress=0,pristine=true;
  const range=el('input',{type:'range',min:0,max:100,step:1,'aria-label':'효과 재생 위치'});
  const readout=el('span',{class:'obs-percent','aria-hidden':'true'});
  const play=el('button',{type:'button',class:'obs-play'});
  const pointList=el('div',{class:'obs-points','aria-label':'관찰 지점',role:'group'});
  const previous=el('button',{type:'button',class:'obs-back',text:'← 이전 관찰',onClick:()=>step(-1)});
  const next=el('button',{type:'button',class:'obs-next',text:'다음 관찰 →',onClick:()=>step(1)});
  const order=el('output',{'aria-live':'polite'});
  const author=onCuesChange && motionCueEditor(stops,{getProgress:()=>progress,defaults:motionCues(asset),
    onSeek:seek,onChange:changed=>{pause();stops=changed;drawPoints();onCuesChange(changed);}});
  const close=onClose && el('button',{type:'button',class:'obs-close',text:'슬라이드로 돌아가기',onClick:onClose});
  const panel=el('div',{class:'ob-study',role:'group','aria-label':asset.name+' 모션 관찰대'},
    el('style',{text:studyStyle}),
    el('div',{class:'obs-head'},el('strong',{text:asset.name}),close),
    el('div',{class:'obs-art'},frames.svg),
    el('div',{class:'obs-transport'},play,range,readout),
    el('div',{class:'obs-order'},previous,order,next),pointList,
    author?.node,
    options.note && el('p',{class:'obs-note',text:options.note}));
  host.replaceChildren(panel);
  function drawPoints(){
    points=stops.map(([percent,label])=>el('button',{type:'button',text:label,
      title:percent+'%에서 멈추기',onClick:()=>seek(percent/100)}));
    pointList.replaceChildren(...points);display(progress);
  }
  function step(direction){
    const index=stops.findIndex(([at])=>at===Math.round(progress*100));
    const target=index<0?(direction>0?0:stops.length-1):index+direction;
    if(target>=0 && target<stops.length)seek(stops[target][0]/100);
  }
  function display(value){
    progress=value;
    const percent=Math.round(value*100);
    range.value=String(percent);
    range.setAttribute('aria-valuetext',percent+'%');
    readout.textContent=percent+'%';
    for(let i=0;i<points.length;i++)points[i].setAttribute('aria-pressed',String(!stop && stops[i][0]===percent));
    const index=stops.findIndex(([at])=>at===percent);
    previous.disabled=index===0;next.disabled=index===stops.length-1;
    const text=index<0?'순서 '+stops.length+'개':(index+1)+' / '+stops.length;
    if(order.textContent!==text)order.textContent=text;
    author?.refresh();
  }
  function label(){
    play.textContent=stop?'Ⅱ 멈춤':pristine?'▶ 처음부터 재생':progress>=1?'↻ 다시 재생':'▶ 이어 재생';
  }
  function pause(){
    stop?.();stop=null;
    display(progress);label();
  }
  function seek(value){
    pristine=false;
    pause();
    frames.paint(value);display(value);label();
  }
  play.onclick=()=>{
    if(stop){pause();return;}
    const start=pristine || progress>=1 ? 0 : progress;
    pristine=false;
    // Slow this view to teaching pace while preserving the original cue timings.
    stop=runEffectFrames(frames,start,Math.max(frames.duration,4000*paceFactor(options.pace)),display,pause);
    display(start);label();
  };
  range.oninput=()=>seek(Number(range.value)/100);
  panel.addEventListener('click',e=>e.stopPropagation());
  panel.addEventListener('keydown',e=>{
    if(onClose && e.key==='Escape'){e.preventDefault();onClose();}
    else if(['PageDown','PageUp'].includes(e.key)){
      e.preventDefault();if(!e.repeat)step(e.key==='PageDown'?1:-1);
    }
    e.stopPropagation();
  });
  const visibility=()=>{if(document.hidden)pause();};
  document.addEventListener('visibilitychange',visibility);
  const preference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  preference?.addEventListener?.('change',pause);
  // The editor can replace its entire property panel while the study is open.
  const removal=new MutationObserver(()=>{if(!panel.isConnected)destroy();});
  removal.observe(document.documentElement,{childList:true,subtree:true});
  // Show a representative still until the teacher explicitly starts or seeks.
  drawPoints();
  const initial=options.stops?.length?stops[0][0]/100:.5;
  frames.paint(initial);display(initial);label();
  if(onClose)play.focus({preventScroll:true});
  function destroy(){
    removal.disconnect();
    stop?.();
    document.removeEventListener('visibilitychange',visibility);
    preference?.removeEventListener?.('change',pause);
    panel.remove();
  }
  return destroy;
}
