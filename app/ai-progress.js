// AI-G 제작 진행 화면: 제작하는 동안 편집 칸을 잠그고, 무엇을 만드는지(요청 · 장 자리 · 단계)를 보여 준다.
// 서버는 단계(planning/building/reviewing)만 알려 준다. 진행률이나 중간 결과를 지어내지 않는다.
import {el} from './ui.js';
import {compositionSlides} from '../src/ai-compose.js';
import {anchorPositions,cutNames} from './compose-storyboard.js';

const STEPS=[
 ['요청 보관','요청과 지금 발표를 저장해요'],
 ['제작 대기','접수 순서대로 차례를 기다려요'],
 ['구성·디자인',''],
 ['결과 확인','형식과 글자 배치를 점검해요'],
];
const WANT_NAMES={text:'글',layout:'배치·디자인',elements:'요소 추가·삭제',motion:'움직임',notes:'발표자 노트'};
const TIPS={
 compose:['완성되면 모든 장의 글·도형·사진을 눌러 직접 고칠 수 있어요.','결과는 바로 적용되지 않아요. 미리 보고 마음에 들 때 적용해요.','발표 미리보기에서 장마다 움직임을 재생해 볼 수 있어요.','연구소 홈으로 나가도 괜찮아요. 완성되면 알림으로 알려 드려요.'],
 anchors:['세 컷이 나오면 마음에 들지 않는 컷만 골라 다시 만들 수 있어요.','세 컷의 글꼴·색·사진이 나머지 장의 기준이 돼요.','세 컷을 확정한 뒤 나머지 장을 한 번 더 요청해 채워요.','연구소 홈으로 나가도 괜찮아요. 완성되면 알림으로 알려 드려요.'],
 polish:['결과는 바로 적용되지 않아요. 바뀌는 점을 장마다 미리 보고 골라 적용해요.','적용한 뒤에도 Ctrl+Z 한 번으로 통째로 되돌릴 수 있어요.','연구소 홈으로 나가도 괜찮아요. 완성되면 알림으로 알려 드려요.'],
};
const MASCOT=new URL('../../assets/gai-cozy/thinking.webp',import.meta.url).href;
const clock=ms=>{const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const timesKey=kind=>'onbatang-ai-times-v1:'+kind;
function measured(kind){
 try{const v=JSON.parse(localStorage.getItem(timesKey(kind))||'[]');return Array.isArray(v)?v.filter(n=>Number.isFinite(n)&&n>=5&&n<=1800).slice(-8):[];}catch{return [];}
}
function remember(kind,seconds){
 if(!Number.isFinite(seconds)||seconds<5||seconds>1800)return;
 try{localStorage.setItem(timesKey(kind),JSON.stringify([...measured(kind),Math.round(seconds)].slice(-8)));}catch{/* 안내일 뿐 */}
}

// 요청(input · meta)만 보고 이번 제작의 모양을 정한다.
export function progressPlan(state){
 const input=state?.input||{},meta=state?.meta||{};
 if(input.task==='polish'){
  const base=Array.isArray(meta.base)?meta.base:[],picks=(Array.isArray(meta.picks)?meta.picks:[]).filter(i=>base[i]);
  const wants=(Array.isArray(input.want)?input.want:[]).map(id=>WANT_NAMES[id]).filter(Boolean);
  // 자료가 100장이어도 고른 장(한 번에 몇 장)만 그린다.
  return {kind:'polish',total:base.length,frames:picks.slice(0,24).map(i=>({index:i,state:'making',slide:base[i],label:''})),
   kicker:picks.length?`${picks.length}장 다듬기${wants.length?' · '+wants.join(' · '):''}`:'장 다듬기',
   title:'AI-G가 발표를 다듬고 있어요',brief:input.prompt||'',facts:[],build:'고른 장의 글과 배치를 다듬어요'};
 }
 const board=meta.storyboard,base=board?.base||input,count=Math.max(1,Math.min(24,Number(base.count)||Number(input.count)||1));
 const facts=[`${count}장 발표`];
 const reference=String(base.reference||'').trim();if(reference)facts.push(`참고 원고 ${reference.length.toLocaleString('ko-KR')}자`);
 const frames=Array.from({length:count},(_,i)=>({index:i,state:'making',label:''}));
 let kind='direct',kicker=`전체 ${count}장 한 번에`,title='AI-G가 발표를 만들고 있어요';
 if(board&&count>=3){
  const at=anchorPositions(count);
  at.forEach((page,i)=>{frames[page].label=cutNames[i];});
  if(board.phase==='anchors'){
   kind='anchors';kicker=`대표 세 컷 먼저 · ${at.map(i=>i+1).join(' · ')}장`;title='AI-G가 대표 세 컷을 만들고 있어요';
   for(const f of frames)if(!at.includes(f.index))f.state='later';
  }else{
   let kept=[];try{kept=compositionSlides(board.prior,{...base,count:board.prior?.ops?.length||3},meta.photos||[]);}catch{kept=[];}
   at.forEach((page,i)=>{frames[page].state='kept';frames[page].slide=kept[i];});
   if(board.phase==='revise'){
    const page=at[board.index]??at[0];
    kind='revise';kicker=`${cutNames[board.index]||'한'} 컷 다시 만들기 · ${page+1}장`;title=`AI-G가 ${cutNames[board.index]||'한'} 컷을 다시 만들고 있어요`;
    frames[page].state='making';for(const f of frames)if(!at.includes(f.index))f.state='later';
   }else{
    kind='expand';const rest=count-3;kicker=`나머지 ${rest}장 채우기 · 확정한 세 컷 사이`;title=`AI-G가 나머지 ${rest}장을 채우고 있어요`;
   }
  }
 }
 return {kind,total:count,frames,kicker,title,brief:base.prompt||'',facts,photos:(meta.photos||[]).filter(p=>typeof p?.url==='string').slice(0,3),build:kind==='anchors'?'도입·전환점·마무리 장면을 짜요':kind==='revise'?'주변 컷에 맞춰 한 컷을 다시 짜요':'이야기 흐름과 장별 디자인을 짜요'};
}

export function aiProgress(O,{leave,home,view=null,aspect=()=>16/9}){
 const kicker=el('p',{class:'onba-ai-kicker'}),title=el('h2'),brief=el('blockquote',{class:'onba-ai-brief'}),facts=el('ul',{class:'onba-ai-facts','aria-label':'요청 내용'});
 const mascot=el('img',{class:'onba-ai-mascot-art',src:MASCOT,alt:'',decoding:'async',draggable:'false'});
 mascot.addEventListener('error',()=>mascot.remove(),{once:true});
 const frames=el('ol',{class:'onba-ai-frames','aria-label':'만드는 장'});
 const legend=el('p',{class:'onba-ai-legend'});
 const steps=el('ol',{class:'onba-ai-steps','aria-label':'제작 단계'},...STEPS.map(([name,note],i)=>el('li',{},el('i',{'aria-hidden':'true',text:String(i+1)}),el('b',{text:name}),el('small',{text:note}))));
 const message=el('p',{class:'onba-ai-message',role:'status','aria-live':'polite'}),time=el('span',{class:'onba-ai-time'}),estimate=el('span',{class:'onba-ai-estimate'});
 const tip=el('p',{class:'onba-ai-tip'});
 const retry=el('button',{class:'btn',type:'button',hidden:true},'연결 확인하고 이어받기');
 const node=el('section',{class:'onba-ai-lock',hidden:true,'aria-label':'AI-G 제작 진행',tabindex:'-1'},
  el('div',{class:'onba-ai-stage'},
   el('header',{class:'onba-ai-head'},
    el('div',{class:'onba-ai-mascot','aria-hidden':'true'},mascot,el('span',{class:'onba-ai-think'},el('i'),el('i'),el('i'))),
    el('div',{class:'onba-ai-headline'},el('div',{class:'onba-ai-meta'},kicker,facts),title,brief)),
   el('div',{class:'onba-ai-board'},frames,legend),
   el('div',{class:'onba-ai-progress'},steps,el('div',{class:'onba-ai-status'},message,el('span',{class:'onba-ai-clock'},time,estimate)),el('div',{class:'onba-ai-bar','aria-hidden':'true'},el('span'))),
   el('footer',{class:'onba-ai-foot'},
    el('div',{class:'onba-ai-note'},el('p',{text:'완성될 때까지 이 발표의 편집을 잠가요. 다른 화면에 다녀와도 접수한 제작은 서버에서 계속됩니다.'}),tip),
    el('div',{class:'onba-ai-nav'},el('button',{class:'btn',type:'button',onClick:leave},'내 그림으로 나가기'),home&&el('button',{class:'btn btn-primary',type:'button',onClick:home},'연구소 홈으로 나가기'),retry))));
 O.shell.querySelector('.cv-work').append(node);let previous=[];
 let shownId=null,plan=null,ticker=0,tipAt=0,watched=null;
 const guard=e=>{if(O.aiWorking&&e.key!=='Tab'&&!e.target.closest?.('.onba-ai-lock button,.cv-back,.cv-brand-link,.onba-ai-task button')){e.preventDefault();e.stopImmediatePropagation();}};
 document.addEventListener('keydown',guard,true);
 function restore(){for(const [n,value] of previous)n.inert=value;previous=[];}
 function frame(f,i){
  const shot=el('div',{class:'onba-ai-shot'});
  // 다듬는 장은 지금 모습 위에 반짝임을 얹고, 새로 만드는 장은 뼈대만 그린다.
  if(f.slide&&view){try{shot.append(view(f.slide));}catch{/* 작은 그림이 없으면 빈 칸 */}}
  if(!shot.childElementCount)shot.append(...['t','l','l','m'].map(k=>el('span',{class:'onba-ai-sk-'+k})));
  const what=f.state==='making'?(plan.kind==='polish'?'다듬는 중':'만드는 중'):f.state==='kept'?'확정한 컷':f.state==='later'?'다음 단계':'그대로';
  const item=el('li',{class:'onba-ai-frame',dataset:{state:f.state,variant:String(i%3)},'aria-label':`${f.index+1}장${f.label?' '+f.label:''} · ${what}`},
   shot,el('span',{class:'onba-ai-cap'},el('b',{text:String(f.index+1)}),f.label?el('span',{text:f.label}):null));
  item.style.setProperty('--onba-ai-delay',(i%8)*.18+'s');return item;
 }
 function draw(state){
  plan=progressPlan(state);node.dataset.kind=plan.kind;
  kicker.textContent=plan.kicker;title.textContent=plan.title;
  const request=state.meta?.revisionText||plan.brief;
  brief.textContent=request;brief.hidden=!request.trim();brief.setAttribute('aria-label','내 요청');
  facts.replaceChildren(...plan.facts.map(text=>el('li',{text})),...(plan.photos?.length?[el('li',{class:'onba-ai-photos'},...plan.photos.map(p=>el('img',{src:p.url,alt:p.alt||'첨부 사진'})),el('span',{text:`사진 ${plan.photos.length}장`}))]:[]));
  facts.hidden=!facts.childElementCount;
  // 많을수록 작게: 몇 줄로 나눠도 한눈에 들어오게 한다.
  const n=plan.frames.length,cols=n<=6?n:n<=12?Math.ceil(n/2):Math.ceil(n/3);
  frames.style.setProperty('--onba-ai-cols',String(Math.max(1,cols)));
  frames.style.setProperty('--onba-ai-ratio',String(aspect()||16/9));
  frames.replaceChildren(...plan.frames.map(frame));
  const has=s=>plan.frames.some(f=>f.state===s);
  legend.replaceChildren(...[['making',plan.kind==='polish'?'다듬는 장':'지금 만드는 장'],['kept','확정한 컷'],['later','다음 단계에서 채울 장'],['still','그대로 두는 장']].filter(([s])=>has(s)).map(([s,text])=>el('span',{dataset:{state:s}},el('i',{'aria-hidden':'true'}),text)));
  steps.children[2].querySelector('small').textContent=plan.build;
  tipAt=0;showTip();
 }
 const tips=()=>TIPS[plan?.kind==='polish'?'polish':plan?.kind==='anchors'||plan?.kind==='revise'?'anchors':'compose'];
 function showTip(){const list=tips();tip.textContent=list[tipAt%list.length];}
 function tick(state){
  const ms=Date.now()-(Number(state?.createdAt)||Date.now());time.textContent='경과 '+clock(ms);
  const times=measured(plan?.kind||'direct');
  if(state?.stage==='planning'||state?.stage==='preparing'){estimate.textContent='차례가 오면 바로 시작해요';return;}
  if(times.length>=3){
   const sorted=times.slice().sort((a,b)=>a-b),high=sorted[Math.ceil((sorted.length-1)*.75)]*1.2,left=high-ms/1000;
   estimate.textContent=left>45?`이 기기 최근 기준 약 ${Math.ceil(left/60)}분 남음`:left>0?'곧 끝날 거예요':'평소보다 오래 걸리고 있어요';
  }else estimate.textContent='보통 몇 분 걸려요';
 }
 return {update(state,again){
  const busy=state?.state==='pending',was=!!O.aiWorking;O.aiWorking=busy;node.hidden=!busy;O.shell.classList.toggle('ai-working',busy);
  if(busy&&!was){
   O.editor.quiet();
   const nodes=O.shell.querySelectorAll('.cv-side,.cv-strip,.cv-properties,.cv-work>:not(.onba-ai-lock),.cv-bar input,.cv-bar button:not(.cv-back):not(.cv-brand-link),.cv-document-menu');
   previous=[...nodes].map(n=>[n,n.inert]);for(const [n] of previous)n.inert=true;node.focus({preventScroll:true});
   watched={id:state.id,from:state.createdAt};
  }else if(!busy&&was)restore();
  // 이 화면에서 끝까지 지켜본 제작만 걸린 시간으로 기억한다(나갔다 온 시간은 섞지 않는다).
  if(!busy&&state?.state==='ready'&&watched?.id===state.id&&plan)remember(plan.kind,(Date.now()-watched.from)/1000);
  if(!busy)watched=null;
  clearInterval(ticker);ticker=0;
  if(busy){
   if(shownId!==state.id||!plan){shownId=state.id;draw(state);}
   const at={preparing:0,planning:1,building:2,reviewing:3}[state?.stage]??0;
   node.dataset.stage=String(at);
   [...steps.children].forEach((n,i)=>{n.dataset.current=String(i===at);n.dataset.done=String(i<at);if(i===at)n.setAttribute('aria-current','step');else n.removeAttribute('aria-current');});
   message.textContent=state?.message||'';
   let beat=0;tick(state);ticker=setInterval(()=>{tick(state);if(++beat%9===0){tipAt++;showTip();}},1000);
  }else shownId=null;
  retry.hidden=!state?.error;retry.onclick=again;
 },destroy(){clearInterval(ticker);restore();O.aiWorking=false;document.removeEventListener('keydown',guard,true);node.remove();}};
}
