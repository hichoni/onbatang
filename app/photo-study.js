import { el } from '../src/dom.js';
import { newPixelActivity, PIXEL_ART_PALETTE } from '../src/pixel-art.js';

const rasterImage = async url => {
  const image=new Image(); image.src=url;
  await image.decode();
  return image;
};

// Sample the exact bitmap that travels with the lesson (including any JPEG
// compression). The stored location identifies one pixel, even at the edge.
export async function studyBitmap(canvas) {
  const thumb=document.createElement('canvas'), ctx=thumb.getContext('2d',{willReadFrequently:true});
  const edge=Math.max(canvas.width,canvas.height);
  for(const limit of [768,512,320]){
    const k=Math.min(1,limit/edge);
    thumb.width=Math.max(1,Math.round(canvas.width*k));thumb.height=Math.max(1,Math.round(canvas.height*k));
    ctx.fillStyle='#fff';ctx.fillRect(0,0,thumb.width,thumb.height);
    ctx.drawImage(canvas,0,0,thumb.width,thumb.height);
    let image=thumb.toDataURL('image/png');
    if(image.length>160000)image=thumb.toDataURL('image/jpeg',.82);
    if(image.length>160000)continue;
    ctx.drawImage(await rasterImage(image),0,0);
    return {canvas:thumb,image};
  }
  throw Error('이 사진의 미리보기를 만들지 못했어요.');
}

const rgbText = hex => hex.slice(1).match(/../g).map(n=>parseInt(n,16));
export function photoStudySetup(bitmap,{start,onApply,onCancel,applyLabel='다음에 수업 장 넣기'}) {
  const {canvas,image}=bitmap,{width,height}=canvas;
  let x,y,color,busy=false;
  const marker=el('span',{class:'ps-marker','aria-hidden':'true'});
  const surface=el('button',{type:'button',class:'ps-picker','aria-label':'사진에서 확대할 점 고르기. 방향키로 한 픽셀씩 이동'},canvas,marker);
  const readout=el('output',{class:'ps-readout','aria-live':'polite'});
  const message=el('p',{role:'status',class:'pixel-status'});
  const save=el('button',{type:'button',class:'pixel-primary',text:applyLabel,onclick:async()=>{
    if(busy)return;
    busy=true;surface.disabled=save.disabled=cancel.disabled=true;
    try {
      const cells=Array(64).fill(-1);cells[0]=0;
      const cover=document.createElement('canvas'),scale=Math.min(1,320/Math.max(width,height));
      cover.width=Math.max(1,Math.round(width*scale));cover.height=Math.max(1,Math.round(height*scale));
      cover.getContext('2d').drawImage(canvas,0,0,cover.width,cover.height);
      await onApply(newPixelActivity({title:'사진 속으로 들어가기',instructions:'사진에서 찾은 색으로 나만의 8×8 픽셀아트를 그려요.',
        photoStudy:{x,y,width,height,image},palette:[color,...PIXEL_ART_PALETTE.filter(v=>v!==color)],cells}),cover.toDataURL('image/jpeg',.76));
    }catch(error){message.textContent=error.message || '저장하지 못했어요. 다시 시도해주세요.';}
    finally{busy=false;surface.disabled=save.disabled=cancel.disabled=false;}
  }});
  const cancel=el('button',{type:'button',text:'취소',onclick:onCancel});
  function pick(nx,ny){
    x=Math.max(0,Math.min(width-1,Math.floor(nx)));y=Math.max(0,Math.min(height-1,Math.floor(ny)));
    const rgb=canvas.getContext('2d').getImageData(x,y,1,1).data;
    color='#'+[...rgb].slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join('');
    marker.style.left=(x+.5)/width*100+'%';marker.style.top=(y+.5)/height*100+'%';
    readout.textContent='선택한 점 ('+(x+1)+', '+(y+1)+') · RGB '+rgbText(color).join(', ');
  }
  surface.addEventListener('click',e=>{if(e.detail){const b=canvas.getBoundingClientRect();pick((e.clientX-b.left)/b.width*width,(e.clientY-b.top)/b.height*height);}});
  surface.addEventListener('keydown',e=>{
    const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(dir){e.preventDefault();e.stopPropagation();pick(x+dir[0],y+dir[1]);}
  });
  pick(width*(start?.x??50)/100,height*(start?.y??50)/100);
  return el('section',{class:'pixel-setup ps-setup','aria-label':'사진 속으로 들어가기'},
    el('h2',{text:'사진 속으로 들어가기'}),el('p',{text:'확대할 점을 누르세요. 발표에서는 질문에서 잠시 멈췄다가 RGB를 공개하고, 같은 색으로 그림을 시작해요.'}),
    surface,readout,el('div',{class:'pixel-actions'},cancel,save),message);
}

const ns='http://www.w3.org/2000/svg';
function svg(tag,attrs){
  const n=document.createElementNS(ns,tag);
  for(const [a,v] of Object.entries(attrs))n.setAttribute(a,v);
  return n;
}
// One camera stays attached to the same pixel from the photograph through the
// magnified lattice. Only the teacher's next command advances a teaching beat.
export function photoStudyIntro(root,activity,startBoard) {
  const {width:w,height:h,x,y,image}=activity.photoStudy,color=activity.palette[0];
  const px=x+.5,py=y+.5,z=Math.max(3,Math.min(w,h)/6);
  const stage=svg('svg',{viewBox:'0 0 '+w+' '+h,role:'img','aria-label':'선택한 사진과 관찰할 점'});
  const camera=svg('g',{}), pic=svg('image',{width:w,height:h,href:image,preserveAspectRatio:'none'});
  const mesh=svg('g',{class:'ps-grid'}),mark=svg('rect',{x,y,width:1,height:1,fill:'none',stroke:'#fff','stroke-width':3,'vector-effect':'non-scaling-stroke'});
  let lines='';
  const rx=Math.ceil(w/z/2)+1,ry=Math.ceil(h/z/2)+1;
  for(let i=Math.max(0,x-rx);i<=Math.min(w,x+rx+1);i++)lines+='M'+i+' '+Math.max(0,y-ry)+'V'+Math.min(h,y+ry+1);
  for(let i=Math.max(0,y-ry);i<=Math.min(h,y+ry+1);i++)lines+='M'+Math.max(0,x-rx)+' '+i+'H'+Math.min(w,x+rx+1);
  mesh.append(svg('path',{d:lines,fill:'none',stroke:'#9bb8bf','stroke-opacity':.75,'stroke-width':1,'vector-effect':'non-scaling-stroke'}),mark);
  const ring=svg('circle',{cx:px,cy:py,r:Math.max(2,Math.min(w,h)*.035),fill:'none',stroke:'#ffffff','stroke-width':3,'vector-effect':'non-scaling-stroke'});
  camera.append(pic,mesh,ring);stage.append(camera);
  const title=el('h2',{}), detail=el('p',{}), controls=el('div',{class:'ps-controls'}), next=el('button',{type:'button',class:'pixel-primary'}), prev=el('button',{type:'button',text:'이전 단서'});
  const swatch=el('span',{class:'ps-swatch','aria-hidden':'true'});swatch.style.background=color;
  const rgb=el('div',{class:'ps-values'},swatch,...rgbText(color).map((v,i)=>el('span',{},el('small',{text:['R','G','B'][i]}),el('b',{text:v}))));
  const head=el('header',{'aria-live':'polite'},el('span',{class:'pixel-kicker',text:'사진 관찰실 · 8 × 8'}),title,detail);
  const body=el('section',{class:'pixel-app ps-intro'},head,el('div',{class:'ps-stage'},stage),
    el('div',{class:'ps-footer'},rgb,controls));
  let phase=0,finished=false;
  function render(){
    body.dataset.phase=String(phase);
    camera.style.transform=phase?`matrix(${z},0,0,${z},${w/2-z*px},${h/2-z*py})`:'none';
    title.textContent=['이 점을 가까이서 볼까요?','이 한 칸의 색을 숫자로 어떻게 나타낼까요?','세 수가 한 가지 색을 만들어요'][phase];
    detail.textContent=['사진에 표시한 곳을 살펴보세요.','생각할 시간을 주세요. 다음을 누르면 RGB가 열려요.','이 색이 픽셀아트의 첫 칸과 첫 번째 물감이 됩니다.'][phase];
    rgb.hidden=phase!==2;prev.disabled=!phase;
    next.textContent=['선택한 점 확대','RGB 공개','이 색으로 그리기'][phase];
  }
  function step(){
    if(finished)return false;
    if(phase<2){phase++;render();return true;}
    const from=swatch.getBoundingClientRect();
    finished=true;startBoard(from);return true;
  }
  function back(){if(finished||!phase)return false;phase--;render();return true;}
  next.onclick=step;prev.onclick=back;
  body.addEventListener('click',e=>e.stopPropagation());
  body.addEventListener('keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    if(['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(e.key)){
      const used=e.key==='ArrowRight'||e.key==='PageDown'?step():back();
      if(used){e.preventDefault();e.stopPropagation();}
    }
  });
  controls.append(prev,next);root.replaceChildren(body);render();
  return {step,back,destroy:()=>{finished=true;body.remove();}};
}
