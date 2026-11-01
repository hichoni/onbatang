// Presentation framing is separate from the editable artwork and its provenance.
const bound=(n,a,b,f)=>Number.isFinite(n)?Math.max(a,Math.min(b,n)):f;
const round=n=>Math.round(n*10000)/10000;
export function cleanCamera(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return null;
  const z=round(bound(raw.z,1,4,1)),half=50/z;
  return {x:round(bound(raw.x,half,100-half,50)),y:round(bound(raw.y,half,100-half,50)),z};
}
export function cleanTravel(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return null;
  return {ms:Math.round(bound(raw.ms,400,4000,1200)),ease:raw.ease==='direct'?'direct':'smooth'};
}
export const travelEase=travel=>travel?.ease==='direct'?'cubic-bezier(.2,.7,.3,1)':'cubic-bezier(.65,0,.35,1)';
export const cleanMorphKey=value=>typeof value==='string' && /^(?:off|m[a-z0-9]{6,48})$/.test(value)?value:'';
export function flowFields(slide){
  const camera=cleanCamera(slide?.camera),travel=cleanTravel(slide?.travel);
  return {...(camera?{camera}:{}),...(travel?{travel}:{})};
}
export function cameraAllowed(slide){return !slide?.activity && !slide?.video && !slide?.web && !slide?.live;}
export function projectCamera(slide){
  const camera=cameraAllowed(slide)&&cleanCamera(slide?.camera);
  if(!camera)return slide;
  const {camera:_,...out}=slide,{x,y,z}=camera;
  return {...out,items:slide.items.map(item=>{
    const next={...item,x:round(50+(item.x-x)*z),y:round(50+(item.y-y)*z)};
    for(const k of ['w','h','size','line','vh'])if(Number.isFinite(item[k]))next[k]=round(item[k]*z);
    // Connector control points are coordinates inside its own scaled box.
    if(item.pts)next.pts=item.pts.map(v=>v*z);
    return next;
  })};
}
// One-to-one explicit matches take precedence over auto identity/content matching.
export function connectFlowItems(pages,leftPage,leftId,rightPage,rightId,key){
  const a=pages[leftPage]?.items.find(it=>it.id===leftId),b=pages[rightPage]?.items.find(it=>it.id===rightId);
  if(!a||!b||a.t!==b.t||leftPage===rightPage||!cleanMorphKey(key)||key==='off')throw Error('같은 종류의 조각을 양쪽에서 골라 주세요.');
  const previous=new Set([a.morphKey,b.morphKey].filter(v=>v&&v!=='off'));
  if(pages.some((page,p)=>p!==leftPage&&p!==rightPage&&page.items.filter(it=>previous.has(it.morphKey)).length>1))throw Error('다른 장에 두 연결이 겹쳐 있어요. 그 장의 연결을 먼저 끊고 다시 연결해 주세요.');
  return pages.map((page,p)=>({...page,items:page.items.map(it=>{
    const selected=p===leftPage&&it.id===leftId || p===rightPage&&it.id===rightId;
    if(selected)return {...it,morphKey:key};
    if(previous.has(it.morphKey)){
      // A page cannot contain two elements in the same connection chain.
      return {...it,morphKey:p===leftPage||p===rightPage?'off':key};
    }
    return it;
  })}));
}
