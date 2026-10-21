// A crop is a rectangle in the original image (0..1). Original bytes stay intact.
const round = n => Math.round(n * 1e6) / 1e6;
export const FULL_CROP = Object.freeze({x:0,y:0,w:1,h:1});
export function cleanCrop(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['x','y','w','h'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]))
    || Object.keys(value).some(k => !['x','y','w','h'].includes(k))
    || value.x < 0 || value.y < 0 || value.w < .01 || value.h < .01
    || value.x + value.w > 1.000001 || value.y + value.h > 1.000001) throw new Error('INVALID_IMAGE_CROP');
  const out = Object.fromEntries(['x','y','w','h'].map(k => [k,round(value[k])]));
  out.w=Math.min(out.w,round(1-out.x));out.h=Math.min(out.h,round(1-out.y));
  return out.x===0 && out.y===0 && out.w===1 && out.h===1 ? null : out;
}
// Match object-fit:cover on old photos before the first explicit crop.
export function coverCrop(sourceAspect, frameAspect) {
  if (!(sourceAspect>0 && frameAspect>0)) throw new Error('INVALID_IMAGE_SIZE');
  const w=Math.min(1,frameAspect/sourceAspect),h=Math.min(1,sourceAspect/frameAspect);
  return {x:(1-w)/2,y:(1-h)/2,w,h};
}
// Keep the selected pixels at their current scale and slide position, including
// rotation and flips. All slide geometry uses width units during the rotation.
export function cropImage(item, rectangle, {base=item.crop||FULL_CROP,aspect=1}={}) {
  const next=cleanCrop(rectangle)||FULL_CROP,old=cleanCrop(base)||FULL_CROP;
  const dx=((next.x+next.w/2)-(old.x+old.w/2))*item.w/old.w*(item.fx?-1:1);
  const dy=((next.y+next.h/2)-(old.y+old.h/2))*item.h/old.h/aspect*(item.fy?-1:1);
  const angle=(item.rot||0)*Math.PI/180;
  return {...item,x:item.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:item.y+(dx*Math.sin(angle)+dy*Math.cos(angle))*aspect,
    w:round(item.w*next.w/old.w),h:round(item.h*next.h/old.h),crop:cleanCrop(next)||undefined};
}
// Drag the source inside a fixed crop frame. Clamp to source pixels (no empty
// edges) and compensate in slide coordinates, including rotation and flips.
export function panCrop(full, rectangle, dx, dy, {aspect=1}={}) {
  const rect={...rectangle,x:Math.max(0,Math.min(1-rectangle.w,rectangle.x-dx)),y:Math.max(0,Math.min(1-rectangle.h,rectangle.y-dy))};
  const before=cropImage(full,rectangle,{base:FULL_CROP,aspect}),after=cropImage(full,rect,{base:FULL_CROP,aspect});
  return {rect,full:{...full,x:full.x+before.x-after.x,y:full.y+before.y-after.y}};
}
