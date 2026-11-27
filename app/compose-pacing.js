import {planMotion, playDesign} from '../src/motion.js';
import {el} from './ui.js';

// A centered number and its backing shape read as one object. Keep ambiguous
// layouts and free-standing numbers as authored. Work only on newly made slides.
export function pairNumberBadges(slide) {
  const items = slide.items;
  const numbers = items.filter(it => it.aw && it.t === 'text' && it.align === 'c' && /^\d{1,2}[.)]?$/.test(it.text.trim()));
  const sharesCenter = (a,b) => Math.abs(a.x-b.x) <= 1 && Math.abs(a.y-b.y) <= 1;
  let group = 0;
  for (const label of numbers) {
    if (numbers.some(other => other !== label && sharesCenter(other,label))) continue;
    const backs = items.slice(0,items.indexOf(label)).filter(it => it.aw && it.t === 'shape'
      && ['circle','rect','round'].includes(it.shape) && it.w <= 16 && it.h <= 30 && sharesCenter(it,label));
    if (backs.length === 1 && !backs[0].awGroup && !label.awGroup && group < 12) {
      backs[0].awGroup = label.awGroup = ++group;
    }
  }
}

export function setComposePace(slide, together) {
  for (const item of slide.items) {
    if (together && item.aw) item.awGroup = 1;
    else delete item.awGroup;
  }
  if (!together) pairNumberBadges(slide);
}

export function rehearsalButton(slide,card,activate) {
  const count = planMotion(slide).beats.length;
  const start = el('button',{class:'btn',type:'button',text:'리허설 · 누름 '+count+'회'});
  const end = el('button',{class:'btn',type:'button',hidden:true,text:'리허설 닫기'});
  let player = null;
  let observer = null;
  const onVisibility = () => { if (document.hidden) activate(null); };
  function stop() {
    observer?.disconnect();
    document.removeEventListener('visibilitychange',onVisibility);
    player?.restore();
    player = null;
    start.textContent = '리허설 · 누름 '+count+'회';
    end.hidden = true;
  }
  start.onclick = () => {
    if (!player || !player.left()) {
      activate(stop);
      player = playDesign(card,slide);
      observer = new IntersectionObserver(entries => {
        if (player && entries.some(entry => !entry.isIntersecting)) activate(null);
      });
      observer.observe(card);
      document.addEventListener('visibilitychange',onVisibility);
      end.hidden = false;
    } else {
      player.finish();
      player.next();
    }
    start.textContent = player.left() ? '다음 누름 '+(count-player.left()+1)+' / '+count : '다시 보기';
  };
  end.onclick = () => activate(null);
  return el('div',{class:'story-actions'},start,end);
}
