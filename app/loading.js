// Shared, local-only brand motion. Progress is shown only when work reports it.
// Use the active document's DOM directly, including when a host supplies an iframe.
const el=(tag,attrs={},...children)=>{
  const node=document.createElement(tag);
  for(const [key,value]of Object.entries(attrs)){
    if(value===false||value==null)continue;
    if(key==='class')node.className=value;
    else if(key==='text')node.textContent=value;
    else if(key==='dataset')Object.assign(node.dataset,value);
    else node.setAttribute(key,value===true?'':value);
  }
  node.append(...children);return node;
};

// Routine local navigation is usually faster than a frame of loading UI.
// Defer the entire node (including its live announcement); a displayed notice
// stays readable briefly without delaying the completed work or blocking input.
export function deferredOnbatangLoading(host,{delay=400,minVisible=200,active=()=>true,className='',...options}={}){
  let loading=null,shownAt=0,finished=false,hideTimer;
  const showTimer=setTimeout(()=>{
    if(finished||!host.isConnected||!active())return;
    loading=onbatangLoading(options);loading.node.dataset.delayedLoading='';
    if(className)loading.node.classList.add(className);
    host.append(loading.node);shownAt=performance.now();
  },delay);
  function dispose(){finished=true;clearTimeout(showTimer);clearTimeout(hideTimer);loading?.node.remove();loading=null;}
  return {dispose,finish(){
    if(finished)return;finished=true;clearTimeout(showTimer);
    if(!loading)return;
    const remaining=Math.max(0,minVisible-(performance.now()-shownAt));
    if(remaining&&host.isConnected&&active())hideTimer=setTimeout(dispose,remaining);else dispose();
  }};
}

// 기다리는 동안 로딩 그림 아래에 돌아가며 보여 주는 온바탕의 기능 · 특징(첫 쪽 app/index.html 의 여는 화면과 같은 결).
export const ONBATANG_TIPS=Object.freeze([
  '설치 없이 브라우저에서 바로 시작해요',
  'PPTX · HTML · 영상 · GIF로 내려받아요',
  '이어 움직이기로 키노트처럼 매끄럽게',
  '연결선 · 도형 · 사진으로 나답게 꾸며요',
  '발표 모드에서 주제별로 확대해 들어가요',
  '서버 없이 이 기기에 저절로 저장돼요',
]);
const TIP_EVERY=2600;
let tipAt=0;               // 다음 로딩은 다음 문구부터(같은 문구만 되풀이해 보이지 않게)

export function onbatangLoading({title='온바탕을 준비하고 있어요',detail='잠시만 기다려주세요.',compact=false,tips=!compact}={}) {
  const heading=el('strong',{class:'onba-loading-title',text:title});
  const note=el('span',{class:'onba-loading-detail',text:detail});
  const tip=tips?el('span',{class:'onba-loading-tip','aria-hidden':'true',text:ONBATANG_TIPS[tipAt++%ONBATANG_TIPS.length]}):null;
  if(tip){
    let idle=0;
    const timer=setInterval(()=>{
      // 화면에서 걷혔으면(또는 끝내 붙지 않았으면) 멈춘다.
      if(!tip.isConnected){if(tip.dataset.shown||++idle>3)clearInterval(timer);return;}
      tip.dataset.shown='1';tip.classList.add('is-turning');
      setTimeout(()=>{tip.textContent=ONBATANG_TIPS[tipAt++%ONBATANG_TIPS.length];tip.classList.remove('is-turning');},220);
    },TIP_EVERY);
  }
  const progress=el('progress',{'aria-label':title,hidden:true});
  const art=el('span',{class:'onba-loading-art','aria-hidden':'true'});
  // Exact paths from brand/symbol.svg, split only for motion; no external asset.
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','-24 -20 180 126');svg.setAttribute('focusable','false');
  for(const [index,fill,d]of [
    [0,'#286F62','M8 17C12 7 23 3 36 3C49 3 55 10 58 22C61 34 71 37 80 44C91 53 89 64 81 72C73 81 56 81 42 81H23C10 81 4 77 3 67C1 53 2 31 8 17Z'],
    [1,'#E5AF70','M66 5C78 3 99 4 110 9C124 15 128 27 128 43V49C128 53 125 54 122 50C113 39 101 34 86 30C72 27 66 20 63 11C62 8 63 6 66 5Z'],
    [2,'#EEEADD','M62 29C68 37 77 39 90 44C104 50 113 59 113 69C113 78 104 82 89 81H83C93 74 98 65 96 56C94 45 81 41 71 36C67 34 64 32 62 29Z']
  ]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('fill',fill);path.setAttribute('d',d);path.setAttribute('class',`onba-loading-piece piece-${index}`);svg.append(path);}
  art.append(svg);
  const node=el('div',{class:`onba-loading${compact?' is-compact':''}`,role:'status','aria-live':'polite',dataset:{onbatangLoading:''}},
    art,el('div',{class:'onba-loading-copy'},heading,note,progress,tip||''));
  return {node,update({title:nextTitle,detail:nextDetail,completed,total}={}){
    if(nextTitle!==undefined)heading.textContent=nextTitle;
    if(nextDetail!==undefined)note.textContent=nextDetail;
    if(Number.isFinite(completed)&&Number.isFinite(total)&&total>0){progress.hidden=false;progress.max=total;progress.value=Math.max(0,Math.min(total,completed));}
    else progress.hidden=true;
  }};
}
