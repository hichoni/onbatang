// A deck can span bounded documents. Page IDs define display order without
// moving page payloads or changing their original source/page references.
export function validatePageOrder(ids, available) {
  if(!Array.isArray(ids)||ids.length!==available.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!available.includes(id)))
    throw Object.assign(new Error('슬라이드 목록이 달라졌어요. 자료를 다시 열어 순서를 확인해주세요.'),{code:'INVALID_PAGE_ORDER'});
  return [...ids];
}
export function orderPages(pages,ids,{strict=false}={}) {
  if(ids===undefined)return [...pages];
  const id=value=>value.page?.id??value.id,available=pages.map(id);
  if(strict)validatePageOrder(ids,available);
  const rank=new Map(ids.map((id,index)=>[id,index]));
  return [...pages].sort((a,b)=>(rank.get(id(a))??ids.length+available.indexOf(id(a)))-(rank.get(id(b))??ids.length+available.indexOf(id(b))));
}
export function movePage(ids,from,to){const next=[...ids];if(from<0||from>=next.length||to<0||to>=next.length)return next;next.splice(to,0,...next.splice(from,1));return next;}
