import { cleanEffect, effectArt, EFFECT_ASSETS, paceFactor } from './effect-assets.js';
import { sceneContent } from './effect-scenes.js';

const labelOf = id => EFFECT_ASSETS.find(asset => asset.id === id)?.name || '';

// The live player binds the actual piece. Offline lessons supply the same
// player with a transparent target measured against the exported picture.
export function mountEffectPlayer(host, bindings, { delay = 0 } = {}) {
  const cleanups = [];
  let closeNote = null, closeScene = null, nextSceneAt = delay;
  const queuedScenes = new Set();
  for (const { node, effect: rawEffect, content } of bindings) {
    const effect = cleanEffect(rawEffect);
    if (!node || !effect) continue;
    const scene = EFFECT_ASSETS.find(a => a.id === effect.id).example;
    const data = scene && sceneContent(effect.id,content);
    if (scene && !data) continue;
    const duration=(scene ? 4600 : 1450)*paceFactor(effect.pace);
    let graphic, caption, timer, opening;
    const automatic = effect.when === 'open';
    function clear() {
      clearTimeout(timer);
      graphic?.remove();
      caption?.remove();
      graphic = caption = null;
      if (closeNote === clear) closeNote = null;
      if (closeScene === clear) closeScene = null;
      if (!automatic && (scene || effect.note)) node.setAttribute('aria-expanded', 'false');
    }
    function play() {
      const wasOpen = !!caption || (scene && !!graphic);
      clear();
      if (wasOpen && !automatic) return;
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
      const art=effectArt(effect.id,true,{...effect,content:data});
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
      graphic.append(art);
      host.append(graphic);
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
    if (scene || effect.note) node.setAttribute('aria-expanded','false');
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
  return () => { for (const cleanup of cleanups.splice(0)) cleanup(); };
}

export function cleanEffectTargets(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0,160).flatMap(row => {
    const effect = cleanEffect(row?.effect);
    if (!effect || !['x','y','w','h','rot'].every(key => Number.isFinite(row[key])) ||
        Math.abs(row.x) > 550 || Math.abs(row.y) > 550 || row.w <= 0 || row.h <= 0 ||
        row.w > 1500 || row.h > 1500 || Math.abs(row.rot) > 180) return [];
    const content=sceneContent(effect.id,row.content);
    if (EFFECT_ASSETS.find(a=>a.id===effect.id).example && !content) return [];
    return [{ x:row.x, y:row.y, w:row.w, h:row.h, rot:row.rot, effect, ...(content ? {content} : {}),
      label:typeof row.label === 'string' ? row.label.slice(0,60) : '' }];
  });
}

export function mountOfflineEffects(host, targets) {
  const bindings = targets.map(row => {
    const node = document.createElement('span');
    Object.assign(node.style, { position:'absolute', left:row.x+'%', top:row.y+'%', width:row.w+'%',
      height:row.h+'%', transform:`translate(-50%,-50%) rotate(${row.rot}deg)`, pointerEvents:'none' });
    if (row.label) node.setAttribute('aria-label',row.label);
    host.append(node);
    return { node, effect:row.effect, content:row.content };
  });
  const stop = mountEffectPlayer(host,bindings);
  return () => { stop(); for (const {node} of bindings) node.remove(); };
}
