import {el} from './dom.js';
import {effectFrames,runEffectFrames} from './effect-frames.js';
import {paceFactor} from './effect-assets.js';

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
[data-effect-observation]{position:absolute;inset:0;z-index:12;pointer-events:auto;container-type:size}
[data-effect-observation]>.ob-study{height:100%;border-radius:0}
@container(max-height:240px){.ob-study{padding:4px 8px;gap:2px}.obs-art{min-height:44px}.ob-study button{min-height:30px}.obs-transport input[type=range]{min-height:32px}}
@media(max-height:480px){.ob-study{gap:4px}.ob-study button{min-height:32px}.obs-art{min-height:54px}}
`;

// Shared by the gallery, the live presenter and the exported, offline lesson.
export function mountMotionStudy(host,asset,options={},onClose) {
  const frames=effectFrames(asset.id,options);
  const stops=asset.stops || [[25,'앞부분'],[50,'가운데'],[75,'뒷부분']];
  const range=el('input',{type:'range',min:0,max:100,step:1,'aria-label':'효과 재생 위치'});
  const readout=el('span',{class:'obs-percent','aria-hidden':'true'});
  const play=el('button',{type:'button',class:'obs-play'});
  const points=stops.map(([percent,label])=>el('button',{type:'button',text:label,
    title:percent+'%에서 멈추기',onClick:()=>seek(percent/100)}));
  const close=onClose && el('button',{type:'button',class:'obs-close',text:'슬라이드로 돌아가기',onClick:onClose});
  const panel=el('div',{class:'ob-study',role:'group','aria-label':asset.name+' 모션 관찰대'},
    el('style',{text:studyStyle}),
    el('div',{class:'obs-head'},el('strong',{text:asset.name}),close),
    el('div',{class:'obs-art'},frames.svg),
    el('div',{class:'obs-transport'},play,range,readout),
    el('div',{class:'obs-points','aria-label':'관찰 지점',role:'group'},...points),
    options.note && el('p',{class:'obs-note',text:options.note}));
  host.replaceChildren(panel);
  let stop=null, progress=0, pristine=true;
  function display(value){
    progress=value;
    const percent=Math.round(value*100);
    range.value=String(percent);
    range.setAttribute('aria-valuetext',percent+'%');
    readout.textContent=percent+'%';
    for(let i=0;i<points.length;i++)points[i].setAttribute('aria-pressed',String(!stop && stops[i][0]===percent));
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
    e.stopPropagation();
  });
  const visibility=()=>{if(document.hidden)pause();};
  document.addEventListener('visibilitychange',visibility);
  const preference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  preference?.addEventListener?.('change',pause);
  // Show a representative still until the teacher explicitly starts or seeks.
  frames.paint(.5);display(.5);label();
  if(onClose)play.focus({preventScroll:true});
  return ()=>{
    stop?.();
    document.removeEventListener('visibilitychange',visibility);
    preference?.removeEventListener?.('change',pause);
    panel.remove();
  };
}
