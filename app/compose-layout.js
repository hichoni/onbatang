import {itemView, placeItem} from '../src/render.js';
import {cleanItem} from '../src/model.js';
import {fitComposeTitles} from './compose-title-fit.js';
import {fitComposeArrows} from '../src/compose-arrow-fit.js';

const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const contains = (a, b) => a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom;
const round = value => Math.round(value * 100) / 100;

// Use line fragments, not the text box. A short label in a wide box can sit
// alongside another label without their visible text touching.
function lineRects(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects()).filter(rect => rect.width && rect.height);
}

function measurePage(card, page, review) {
  const bounds = card.getBoundingClientRect();
  const regions = page.items.map(item => {
    const normalized = cleanItem(item, {keepSpaces:true});
    // Only geometry is needed for non-text obstacles. Do not decode photos.
    const node = item.t === 'text' ? itemView(normalized) : document.createElement('div');
    if (item.t !== 'text') {
      node.className = 'fi';
      Object.assign(node.style, {left:item.x+'%', top:item.y+'%', width:item.w+'%', height:item.h+'%',
        transform:'translate(-50%, -50%) rotate('+(item.rot || 0)+'deg)'});
    }
    card.append(node);
    return {item, node, normalized};
  });
  for (const region of regions) {
    region.rects = region.item.t === 'text' ? lineRects(region.node) : [region.node.getBoundingClientRect()];
  }
  function tryPlace(region, patch) {
    placeItem(region.node, {...region.normalized, ...patch});
    const rects = lineRects(region.node);
    const fits = rects.length && rects.every(rect => contains(bounds, rect)) && regions.every(other => {
      if (other === region) return true;
      if (other.item.t !== 'text') {
        const frame = other.rects[0];
        // Preserve intentional labels on photos and shapes, inside the same frame.
        if (region.rects.every(rect => contains(frame, rect))) return rects.every(rect => contains(frame, rect));
        // A design may already place text across the edge of a decorative shape.
        if (region.rects.some(rect => intersects(frame, rect))) return true;
      }
      return !rects.some(rect => other.rects.some(obstacle => intersects(rect, obstacle)));
    });
    if (fits) {
      Object.assign(region.normalized, patch);
      region.item = {...region.item, ...patch};
      region.rects = rects;
    } else placeItem(region.node, region.normalized);
    return fits;
  }
  const text = regions.filter(r => r.item.t === 'text' && !r.item.rot).sort((a,b) => a.item.size - b.item.size);
  // Widen the headline before moving anything underneath it.
  for (const region of [...text].reverse()) {
    const item = region.item;
    if (tryPlace(region, {})) continue;
    const anchor = item.align === 'l' ? 0.5 : item.align === 'r' ? -0.5 : 0;
    const room = anchor > 0 ? 100-item.x-item.w/2 : anchor < 0 ? item.x-item.w/2 : 2*Math.min(item.x,100-item.x)-item.w;
    const extra = Math.max(0, Math.min(32, room, 100-item.w));
    let placed = false;
    for (let delta = 4; extra > 0; delta += 4) {
      const growth = Math.min(delta, extra);
      placed = tryPlace(region, {w:round(item.w+growth), x:round(item.x+anchor*growth)});
      if (placed || growth === extra) break;
    }
  }
  for (const region of text) {
    if (tryPlace(region, {})) continue;
    const item = region.item;
    let placed = false;
    // Only small vertical moves, in the original column, at the original size.
    for (const dy of [-2,2,-4,4,-6,6,-8,8]) {
      const y = round(item.y+dy);
      if (y > 0 && y < 100 && tryPlace(region, {y})) { placed = true; break; }
    }
    if (placed) continue;
    // Keep readable type. If the local variants do not fit, retain the design.
    for (const scale of [0.95,0.9,0.85,0.8]) {
      if (tryPlace(region, {size:Math.max(1.8,round(item.size*scale))})) break;
    }
  }
  const arrows = fitComposeArrows(regions, bounds);
  for (const {index,y} of arrows.moves) {
    const region=regions[index];
    region.item={...region.item,y};
    region.normalized={...region.normalized,y};
    region.node.style.top=y+'%';
    region.rects=[region.node.getBoundingClientRect()];
  }
  if (arrows.review || regions.some(r => r.item.t === 'text' && !tryPlace(r, {}))) review();
  return {...page, items:regions.map(r => r.item)};
}

export async function fitRenderedPages(pages, aspect) {
  const review = [];
  const card = document.createElement('div');
  card.className = 'fe-card';
  card.setAttribute('aria-hidden', 'true');
  Object.assign(card.style, {position:'fixed', left:'0', top:'0', visibility:'hidden',
    pointerEvents:'none', width:'1200px', height:(1200/aspect)+'px', maxWidth:'none'});
  document.body.append(card);
  try {
    if (!card.getBoundingClientRect().width || !document.createRange().getClientRects) {
      return {pages:fitComposeTitles(pages, aspect), review:pages.map((_,i)=>i+1)};
    }
    // Load only faces and glyphs this deck uses, including unicode-range subsets.
    const faces = new Map();
    for (const page of pages) for (const item of page.items) {
      if (item.t !== 'text') continue;
      const node = itemView(cleanItem(item,{keepSpaces:true}));
      card.append(node);
      const style = getComputedStyle(node);
      const face = style.fontWeight+' 32px '+style.fontFamily;
      faces.set(face, (faces.get(face) || '') + item.text);
      node.remove();
    }
    let fontsReady = false;
    if (document.fonts) {
      let timeout;
      try {
        fontsReady = await Promise.race([Promise.allSettled([...faces].map(([face,text]) =>
          document.fonts.load(face, [...new Set(text)].join('')))).then(results=>results.every(r=>r.status==='fulfilled')),
          new Promise(resolve => {timeout=setTimeout(()=>resolve(false),4000);})]);
      } finally { clearTimeout(timeout); }
    }
    const fitted = pages.map((page,i) => {
      card.replaceChildren();
      return measurePage(card, page, () => review.push(i+1));
    });
    return {pages:fitted, review:fontsReady ? review : pages.map((_,i)=>i+1)};
  } finally { card.remove(); }
}
