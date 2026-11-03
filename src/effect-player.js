import { cleanEffect, playEffectArt, EFFECT_ASSETS, paceFactor } from './effect-assets.js';
import { sceneContent } from './effect-scenes.js';
import {cinemaEnd} from './cinema-layout.js';
import { mountMotionStudy } from './motion-study.js';

const labelOf = id => EFFECT_ASSETS.find(asset => asset.id === id)?.name || '';

// Presenter buttons, keyboard and remote use the same controls as a tap.
// At either end, return to the slide before the next navigation command.
export function stepOpenQuestion(stage,direction) {
  const study=stage?.querySelector('[data-effect-observation]');
  if(study){
    const button=study.querySelector(direction>0?'.obs-next':'.obs-back');
    if(button.disabled)study.querySelector('.obs-close').click();
    else button.click();
    return true;
  }
  const panel=stage?.querySelector('[data-question-panel]:not([inert])');
  if(!panel)return false;
  const button=panel.querySelector(direction>0?'[data-question-next]':'[data-question-back]');
  if(button.disabled || (direction>0 && panel.dataset.last==='true'))panel.querySelector('[data-question-close]').click();
  else button.click();
  return true;
}

// A question covers its answer even before the presenter opens the large view.
function mountQuestion(host, {node,content,slide}, effect, asset, data, activate,onQuestionChange) {
  const cover=document.createElement('button');
  cover.type='button'; cover.textContent=asset.name;
  cover.dataset.effectTrigger=effect.id;
  cover.setAttribute('aria-label',asset.name+' 시작');
  cover.setAttribute('aria-expanded','false');
  const w=node.offsetWidth, h=node.offsetHeight;
  Object.assign(cover.style,{position:'absolute',left:node.style.left,top:node.style.top,
    width:node.style.width,height:node.style.height || (h/Math.max(1,host.clientHeight)*100)+'%',
    transform:node.style.transform,background:'#172b37',color:'#b2f2df',border:'1px solid #6b9c9b',
    borderRadius:'2px',margin:'0',padding:'0',cursor:'pointer',lineHeight:'1.1',fontWeight:'750',fontSize:'clamp(11px,2.2cqw,30px)',overflow:'hidden',pointerEvents:'auto'});
  // Preserve the box rotation, without mirroring the label on flipped photos.
  cover.style.transform=cover.style.transform.replace(/scale\([^)]+\)/g,'');
  const opacity=node.style.opacity, priority=node.style.getPropertyPriority('opacity'), ariaHidden=node.getAttribute('aria-hidden');
  // Independent enter/idle animations can otherwise expose a moving answer.
  node.style.setProperty('opacity','0','important');
  node.setAttribute('aria-hidden','true');
  node.after(cover);
  let panel;
  const close=()=>{if(!panel)return;panel.remove();panel=null;cover.setAttribute('aria-expanded','false');onQuestionChange?.(false);};
  cover.onclick=event=>{
    event.stopPropagation();
    if (panel) { close(); return; }
    activate(close);
    cover.setAttribute('aria-expanded','true');
    let step=0;
    const last=asset.last(data,effect);
    panel=document.createElement('div');
    panel.dataset.effectPlaying=effect.id;
    panel.dataset.questionPanel='';
    panel.setAttribute('role','group');panel.setAttribute('aria-label',asset.name);
    Object.assign(panel.style,{position:'absolute',inset:'0',zIndex:12,background:'#101f2b',color:'white',
      display:'grid',gridTemplateRows:'minmax(0,1fr) auto',overflow:'hidden',pointerEvents:'auto'});
    panel.onclick=e=>e.stopPropagation();
    const art=document.createElement('div'), bar=document.createElement('div');
    art.style.cssText='min-height:0;min-width:0';
    bar.style.cssText='display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 10px;padding:3px 6px;background:#172d39';
    const advance=document.createElement('button'), dismiss=document.createElement('button'), info=document.createElement('span');
    const back=document.createElement('button'),skip=document.createElement('button');
    back.dataset.questionBack='';back.textContent='이전 단계';
    advance.dataset.questionNext='';dismiss.dataset.questionClose='';
    for (const button of [back,advance,skip,dismiss]) {
      button.type='button';button.dataset.effectTrigger='control';
      button.style.cssText='min-height:36px;padding:4px 12px;font:600 clamp(12px,2cqw,20px)/1.2 system-ui;border:1px solid #66868c;border-radius:9px;cursor:pointer';
    }
    advance.style.background='#a0e9d1'; advance.style.color='#10242d';
    skip.textContent='정답 바로 보기';skip.onclick=()=>{step=last;draw();advance.focus({preventScroll:true});};
    dismiss.style.background='transparent';dismiss.style.color='#eef5f2';dismiss.textContent='닫기';
    info.setAttribute('role','status');
    info.style.cssText='font:500 clamp(11px,1.8cqw,19px)/1.3 system-ui;max-width:100%;overflow:auto;max-height:3.9em;overflow-wrap:anywhere';
    function draw() {
      let photo;
      if(effect.id==='lens'){
        if(slide){
          const sw=slide.picture.naturalWidth || host.clientWidth, sh=slide.picture.naturalHeight || host.clientHeight;
          photo={url:slide.picture.src,width:sw*slide.w/100,height:sh*slide.h/100,slide:{w:sw,h:sh,x:sw*slide.x/100,y:sh*slide.y/100,rot:slide.rot}};
        } else photo={...content,width:node.offsetWidth || w || 1,height:node.offsetHeight || h || 1};
      }
      playEffectArt(art,effect.id,{...effect,content:data,photo,step});
      panel.dataset.step=String(step);
      panel.dataset.last=String(step===last);
      back.disabled=step===0;
      skip.hidden=effect.id!=='cluecard'||step>=last-1;
      advance.textContent=step===last?'처음부터':asset.next(step,data,effect);
      info.textContent=step===last && effect.note ? effect.note : (step+1)+' / '+(last+1);
    }
    advance.onclick=()=>{step=step===last?0:step+1;draw();};
    back.onclick=()=>{if(step){step--;draw();}};
    const leave=()=>{close();cover.focus({preventScroll:true});};
    dismiss.onclick=leave;
    panel.onkeydown=e=>{
      if(e.key==='Escape'){e.stopPropagation();e.preventDefault();leave();}
      else if(['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(e.key)){
        e.stopPropagation();e.preventDefault();if(!e.repeat)stepOpenQuestion(host,e.key==='ArrowRight'||e.key==='PageDown'?1:-1);
      }
      else if(e.key===' '||e.key==='Enter')e.stopPropagation();
    };
    bar.append(info,back,advance,skip,dismiss);panel.append(art,bar);host.append(panel);
    draw();onQuestionChange?.(true);advance.focus({preventScroll:true});
  };
  const restore=()=>{
    close();cover.remove();node.style.setProperty('opacity',opacity,priority);
    if(ariaHidden===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',ariaHidden);
  };
  const dispose=freeze=>{
    if(!freeze){restore();return;}
    // The departing slide is still on screen while a transition runs.
    cover.inert=true;if(panel)panel.inert=true;
    return restore;
  };
  return {open:()=>cover.click(),dispose};
}

// The live player binds the actual piece. Offline lessons supply the same
// player with a transparent target measured against the exported picture.
export function mountEffectPlayer(host, bindings, { delay = 0,onQuestionChange } = {}) {
  const cleanups = [];
  let closeNote = null, closeScene = null, nextSceneAt = delay;
  const queuedScenes = new Set();
  let hasOpeningQuestion=false;
  for (const binding of bindings) {
    const {node,content}=binding;
    const effect = cleanEffect(binding.effect);
    if (!node || !effect) continue;
    const asset = EFFECT_ASSETS.find(a => a.id === effect.id);
    const scene = asset.example;
    const data = scene && sceneContent(effect.id,content,effect.sceneText);
    if (scene && !data) continue;
    if(asset.last){
      const question=mountQuestion(host,binding,effect,asset,data,close=>{
        for(const timer of queuedScenes)clearTimeout(timer);
        queuedScenes.clear();closeNote?.();closeScene?.();closeScene=close;
      },onQuestionChange);
      cleanups.push(question.dispose);
      if(effect.when==='open'&&!hasOpeningQuestion){
        hasOpeningQuestion=true;
        const timer=setTimeout(question.open,delay);
        queuedScenes.add(timer);
        cleanups.push(()=>{clearTimeout(timer);queuedScenes.delete(timer);});
      }
      continue;
    }
    const sceneDuration=effect.id==='fieldroute' && effect.legMs?Math.max(4600,3*effect.legMs+1250):4600;
    const duration=(scene ? Math.max(sceneDuration,cinemaEnd(effect.id,effect)+700) : 1450)*paceFactor(effect.pace);
    let graphic, caption, timer, opening, stopStudy;
    const automatic = effect.when === 'open';
    function clear() {
      clearTimeout(timer);
      stopStudy?.();stopStudy=null;
      graphic?.remove();
      caption?.remove();
      graphic = caption = null;
      if (closeNote === clear) closeNote = null;
      if (closeScene === clear) closeScene = null;
      if (!automatic && (scene || effect.note || effect.observe)) node.setAttribute('aria-expanded', 'false');
    }
    function play() {
      const wasOpen = !!caption || ((scene || effect.observe) && !!graphic);
      clear();
      if (wasOpen && !automatic) return;
      if(effect.observe){
        for(const pending of queuedScenes)clearTimeout(pending);
        queuedScenes.clear();closeScene?.();closeNote?.();closeScene=clear;
        graphic=document.createElement('div');
        graphic.dataset.effectPlaying=effect.id;graphic.dataset.effectObservation='';
        host.append(graphic);
        stopStudy=mountMotionStudy(graphic,asset,{...effect,content:data},()=>{
          clear();node.focus({preventScroll:true});
        });
        node.setAttribute('aria-expanded','true');
        return;
      }
      const frame = host.getBoundingClientRect(), rect = node.getBoundingClientRect();
      if (!frame.width || !frame.height || !rect.width || !rect.height) return;
      const x = (rect.left + rect.width / 2 - frame.left) / frame.width * 100;
      const y = (rect.top + rect.height / 2 - frame.top) / frame.height * 100;
      const width = Math.max(19, Math.min(58, rect.width / frame.width * 125));
      graphic = document.createElement('div');
      graphic.dataset.effectPlaying = effect.id;
      Object.assign(graphic.style, { position:'absolute', pointerEvents:'none', zIndex:8, left:x+'%', top:y+'%',
        width:width+'%', aspectRatio:'10 / 7', transform:'translate(-50%, -50%)',
        filter:'drop-shadow(0 1px 2px #17213988)' });
      host.append(graphic);
      const art=playEffectArt(graphic,effect.id,{...effect,content:data});
      if (scene) {
        if (!automatic) { for (const timer of queuedScenes) clearTimeout(timer); queuedScenes.clear(); }
        closeScene?.(); closeScene=clear;
        Object.assign(graphic.style,{left:'5%',top:'6%',width:'90%',height:effect.note?'70%':'88%',aspectRatio:'auto',transform:'none',
          zIndex:10,filter:'drop-shadow(0 8px 18px #06131d66)'});
        const dismiss=document.createElement('button');
        dismiss.type='button'; dismiss.textContent='닫기'; dismiss.setAttribute('aria-label','강조 화면 닫기');
        dismiss.dataset.effectTrigger='close';
        Object.assign(dismiss.style,{position:'absolute',right:'1%',top:'1%',minHeight:'44px',border:'1px solid #57747e',
          borderRadius:'999px',background:'#18343d',color:'white',padding:'3px 12px',pointerEvents:'auto',cursor:'pointer'});
        dismiss.addEventListener('click',e=>{e.stopPropagation();clear();if(!automatic)node.focus({preventScroll:true});});
        graphic.append(dismiss);
        if (!automatic) node.setAttribute('aria-expanded','true');
      } else if (effect.id==='underline') {
        Object.assign(graphic.style,{top:(rect.bottom-frame.top)/frame.height*100+'%',width:rect.width/frame.width*100+'%',
          height:'2.5%',aspectRatio:'auto',transform:'translate(-50%, -10%)'});
        art.setAttribute('viewBox','-100 30 200 24'); art.setAttribute('preserveAspectRatio','none');
      }
      if (effect.note) {
        closeNote?.();
        closeNote = clear;
        caption = document.createElement('div');
        caption.dataset.effectNote = '';
        caption.setAttribute('role', 'status');
        caption.textContent = effect.note;
        Object.assign(caption.style, { position:'absolute', pointerEvents:'none', zIndex:11,
          left:'5%', right:'5%', [scene || y < 50 ? 'bottom' : 'top']:'5%', margin:'auto', width:'fit-content',
          maxWidth:'90%', maxHeight:scene?'20%':'44%', overflow:'auto', boxSizing:'border-box', borderRadius:'.6em',
          padding:'.5em .9em', background:'#16242df2', color:'white', textAlign:'center',
          font:'600 clamp(12px,2.6cqw,36px)/1.45 system-ui,sans-serif', overflowWrap:'anywhere' });
        host.append(caption);
        if (!automatic) node.setAttribute('aria-expanded', 'true');
      }
      if (scene && automatic) timer=setTimeout(clear,duration);
      if (!scene) timer=setTimeout(() => { graphic?.remove(); graphic=null; },duration);
    }
    if (automatic) {
      opening = setTimeout(() => { queuedScenes.delete(opening); play(); }, scene?nextSceneAt:delay);
      if (scene) { queuedScenes.add(opening); nextSceneAt+=duration+160; }
      cleanups.push(() => { clearTimeout(opening); clear(); });
      continue;
    }
    const attrs = ['role','tabindex','aria-label','aria-expanded','data-effect-trigger'];
    const original = attrs.map(name => node.getAttribute(name));
    const { pointerEvents, cursor } = node.style;
    node.setAttribute('data-effect-trigger', effect.id);
    node.style.pointerEvents = 'auto';
    node.style.cursor = 'pointer';
    node.setAttribute('role','button');
    node.setAttribute('tabindex','0');
    node.setAttribute('aria-label', [node.getAttribute('aria-label') || node.getAttribute('alt') || node.textContent?.trim().slice(0,60),
      effect.note ? '설명 열기 또는 닫기' : labelOf(effect.id) + ' 재생'].filter(Boolean).join(' · '));
    if (scene || effect.note || effect.observe) node.setAttribute('aria-expanded','false');
    const click = event => { event.stopPropagation(); play(); };
    const key = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) play();
    };
    node.addEventListener('click',click);
    node.addEventListener('keydown',key);
    cleanups.push(() => {
      clear();
      node.removeEventListener('click',click);
      node.removeEventListener('keydown',key);
      Object.assign(node.style, {pointerEvents,cursor});
      attrs.forEach((name,i) => original[i] === null ? node.removeAttribute(name) : node.setAttribute(name,original[i]));
    });
  }
  return (freeze=false) => {
    for (const cleanup of cleanups.splice(0)) {
      const restore=cleanup(freeze);
      if(restore)cleanups.push(restore);
    }
  };
}

export function cleanEffectTargets(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0,160).flatMap(row => {
    const effect = cleanEffect(row?.effect);
    if (!effect || !['x','y','w','h','rot'].every(key => Number.isFinite(row[key])) ||
        Math.abs(row.x) > 550 || Math.abs(row.y) > 550 || row.w <= 0 || row.h <= 0 ||
        row.w > 1500 || row.h > 1500 || Math.abs(row.rot) > 180) return [];
    const content=sceneContent(effect.id,row.content,effect.sceneText);
    if (EFFECT_ASSETS.find(a=>a.id===effect.id).example && !content) return [];
    return [{ x:row.x, y:row.y, w:row.w, h:row.h, rot:row.rot, effect, ...(content ? {content} : {}),
      label:typeof row.label === 'string' ? row.label.slice(0,60) : '' }];
  });
}

export function mountOfflineEffects(host, targets, options) {
  const bindings = targets.map(row => {
    const node = document.createElement('span');
    Object.assign(node.style, { position:'absolute', left:row.x+'%', top:row.y+'%', width:row.w+'%',
      height:row.h+'%', transform:`translate(-50%,-50%) rotate(${row.rot}deg)`, pointerEvents:'none' });
    if (row.label) node.setAttribute('aria-label',row.label);
    host.append(node);
    return { node, effect:row.effect, content:row.content,slide:{...row,picture:host.querySelector('.lesson-slide')} };
  });
  const stop = mountEffectPlayer(host,bindings,options);
  return () => { stop(); for (const {node} of bindings) node.remove(); };
}
