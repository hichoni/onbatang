const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const contains = (a,b) => a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom;
const shift = (r,dy) => ({left:r.left,right:r.right,top:r.top+dy,bottom:r.bottom+dy});
const arrow = item => item.t === 'shape' && ['arrow','arrow2'].includes(item.shape);

// Rectangles are measured after fonts load, including the arrow's rotation.
// Move only the arrow, locally in its own column. Background shapes and labels
// inside an arrow remain intentional; a title crossed by an arrow does not.
export function fitComposeArrows(regions,bounds) {
  const moves=[];
  let review=false;
  const headlineSize=Math.max(0,...regions.filter(r=>r.item.t==='text').map(r=>r.item.size||0));
  for (const [index,region] of regions.entries()) {
    if (!arrow(region.item)) continue;
    const frame=region.rects[0];
    const obstacles=regions.filter(r=>r.item.t==='text' && ((r.item.size||0)>=headlineSize || !r.rects.every(rect=>contains(frame,rect))))
      .flatMap(r=>r.rects);
    if (!obstacles.some(rect=>overlaps(frame,rect))) continue;
    const gap=bounds.height*.01;
    const candidates=obstacles.flatMap(rect=>[rect.top-gap-frame.bottom,rect.bottom+gap-frame.top])
      .sort((a,b)=>Math.abs(a)-Math.abs(b));
    let found=false;
    for (const dy of candidates) {
      const y=Math.round((region.item.y+dy/bounds.height*100)*100)/100;
      const actual=(y-region.item.y)/100*bounds.height;
      const next=shift(frame,actual);
      if (Math.abs(actual)>bounds.height*.08 || !contains(bounds,next) || obstacles.some(rect=>overlaps(next,rect))) continue;
      moves.push({index,y});found=true;break;
    }
    if (!found) review=true;
  }
  return {moves,review};
}
