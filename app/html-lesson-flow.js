import {isId} from '../src/document.js';
import {cleanMorphKey,cleanTravel,cameraAllowed} from '../src/slide-flow.js';
import {playTransition} from '../src/motion.js';
import {reducedMotion} from '../src/motion-preference.js';
import {el} from '../src/dom.js';

const png = value => typeof value==='string' && value.length<=4_000_000 && /^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(value);
const types = ['text','image','shape','emoji','art','link','chart','math'];
const fail = () => {throw Error('수업의 모핑 그림을 확인해 주세요.');};
export function cleanHtmlFlow(raw) {
  if(!raw || raw.version!==1 || !/^#[a-f\d]{6}$/i.test(raw.bg) || !Array.isArray(raw.items) || raw.items.length>160)fail();
  const seen = new Set();
  const items = raw.items.map(it=>{
    if(!it || !isId(it.id) || seen.has(it.id) || !types.includes(it.t) || !png(it.image))fail();
    seen.add(it.id);
    if(!['x','y','w','h','rot','op'].every(k=>Number.isFinite(it[k])) || Math.abs(it.x)>10000 || Math.abs(it.y)>10000 || it.w<=0 || it.h<=0 || it.w>10000 || it.h>10000 || Math.abs(it.rot)>360 || it.op<0 || it.op>100)fail();
    const out={id:it.id,t:it.t,image:it.image,x:it.x,y:it.y,w:it.w,h:it.h,rot:it.rot,op:it.op,fx:it.fx===true,fy:it.fy===true};
    for(const k of ['text','ch','art','shape','color','url','bgc'])if(it[k]!==undefined){if(typeof it[k]!=='string' || it[k].length>(k==='text'?4096:160))fail();out[k]=it[k];}
    if(it.morphKey!==undefined){if(!cleanMorphKey(it.morphKey))fail();out.morphKey=it.morphKey;}
    if(it.origin!==undefined){if(!isId(it.origin?.elementId))fail();out.origin={elementId:it.origin.elementId};}
    return out;
  });
  if(raw.tr!==undefined && raw.tr!=='move')fail();
  const travel=cleanTravel(raw.travel);
  return {version:1,bg:raw.bg.toLowerCase(),items,...(raw.tr?{tr:'move'}:{}),...(travel?{travel}:{})};
}

// Only pages adjoining a real morph need extra bitmaps. Hidden slides have
// already been filtered, so this also works across saved PPT parts.
export function htmlFlowPages(pages) {
  const chosen=new Set();
  const supported=p=>cameraAllowed(p) && !p.items?.some(it=>['web','yt'].includes(it.t));
  pages.forEach((page,i)=>{if(i && page.tr==='move' && supported(page) && supported(pages[i-1])){chosen.add(i-1);chosen.add(i);}});
  return chosen;
}

function view(flow) {
  const card=el('div',{class:'lesson-flow-card','aria-hidden':'true'});
  card.style.setProperty('--fe-bg',flow.bg);
  for(const it of flow.items){
    const node=el('img',{class:'fi',src:it.image,alt:'',draggable:'false'});
    Object.assign(node.style,{left:it.x+'%',top:it.y+'%',width:it.w+'%',height:it.h+'%',opacity:String(it.op/100),transform:`translate(-50%,-50%) rotate(${it.rot}deg) scale(${it.fx?-1:1},${it.fy?-1:1})`});
    card.append(node);
  }
  return card;
}

// Keep the outgoing PNG until all embedded pieces decode. At rest the original
// PNG stays authoritative. Cancellation/resize/reduced motion always settles on
// the destination, and late decode/animation callbacks cannot revive old slides.
export function playHtmlFlow(frame,picture,from,to,dir,onDone) {
  const transition=(dir<0?from:to)?.flow;
  if(!from?.flow || !to.flow || from.aspect!==to.aspect || transition.tr!=='move' || reducedMotion(frame) || typeof frame.animate!=='function')return null;
  const overlay=el('div',{class:'lesson-flow-stage'}),old=view(from.flow),next=view(to.flow);
  overlay.append(old,next);
  let live=true,turn=null,timer=0;
  const media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finish=()=>{
    if(!live)return;live=false;clearTimeout(timer);turn?.finish();overlay.remove();
    frame.removeAttribute('data-flow-playing');picture.src=to.image;picture.style.visibility='';
    window.removeEventListener('resize',finish);media?.removeEventListener?.('change',changed);onDone();
  };
  const changed=()=>{if(reducedMotion(frame))finish();};
  window.addEventListener('resize',finish);media?.addEventListener?.('change',changed);
  picture.src=from.image;frame.dataset.flowPlaying='loading';
  timer=setTimeout(finish,5000);
  Promise.all([...overlay.querySelectorAll('img')].map(img=>img.decode())).then(()=>{
    if(!live)return;clearTimeout(timer);frame.append(overlay);picture.style.visibility='hidden';
    frame.dataset.flowPlaying='playing';
    turn=playTransition(old,next,'move',dir,{from:from.flow,to:to.flow});
    turn.done.then(finish,finish);
  }).catch(finish);
  return {finish};
}
