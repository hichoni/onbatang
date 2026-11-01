import {el,openModal,closeModal} from './ui.js';
import {designView} from '../src/render.js';
import {matchItems,playTransition} from '../src/motion.js';
import {cleanCamera,cleanTravel,cameraAllowed,connectFlowItems} from '../src/slide-flow.js';
import {newId} from '../src/document.js';

const CSS=`
.modal-panel.flow-panel{width:min(1320px,calc(100vw - 24px));max-width:1320px;padding:0;max-height:calc(100dvh - 24px);overflow:auto;background:#f6f5f0;border-radius:18px;color:#213b36}
.flow-panel *{box-sizing:border-box}.flow-panel>.modal-close{z-index:5;top:18px;right:20px}.sf{padding:26px;display:grid;gap:20px;font:15px/1.5 system-ui,sans-serif}.sf h2,.sf h3,.sf p{margin:0}.sf h2{font-size:27px;letter-spacing:-.06em}.sf h3{font-size:16px}.sf-kicker{font-size:11px;letter-spacing:.15em;color:#317365;font-weight:750}.sf-lead{color:#64756f;font-size:13px;max-width:800px}
.sf [hidden]{display:none!important}.sf button,.sf select,.sf input{font:inherit}.sf button{cursor:pointer;min-height:42px;border:1px solid #d2dad4;border-radius:8px;padding:8px 13px;background:#fff;color:#284c42}.sf button:disabled{opacity:.4;cursor:default}.sf button[aria-pressed=true]{background:#286f60;color:#fff;border-color:#286f60}.sf :focus-visible{outline:3px solid #be7928;outline-offset:2px}
.sf-route{display:flex;gap:9px;overflow-x:auto;padding:3px 2px 10px;scrollbar-width:thin}.sf-route button{flex:0 0 112px;padding:6px;text-align:left}.sf-route .fe-card{width:100%;pointer-events:none}.sf-route small{display:block;font-size:11px;margin-top:5px}.sf-route button[aria-current=true]{outline:2px solid #286f60;background:#e4eee8}.sf-route button[aria-current=true] small{font-weight:750}
.sf-work{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start}.sf-boards{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sf-board-label{display:flex;justify-content:space-between;font-size:12px;font-weight:750;margin-bottom:8px}.sf-board{position:relative;overflow:hidden;border:1px solid #c4d3cb;border-radius:8px;background:#eee;touch-action:none}.sf-board>.fe-card{width:100%;border-radius:0!important}.sf-board .fi{cursor:crosshair}.sf-board .fi *{pointer-events:none}.sf-board .fi.sf-picked{outline:3px solid #ec9e41;outline-offset:3px}.sf-board .fi.sf-linked{box-shadow:0 0 0 1px #2c8d76}.sf-frame{position:absolute;border:2px solid #ffd281;box-shadow:0 0 0 100vmax #10271d66;pointer-events:none;display:grid;place-items:center;border-radius:3px}.sf-frame:after{content:'+';color:#fff;font-size:26px;text-shadow:0 1px 3px #333}
.sf-preview-wrap{margin-top:18px;background:#102b2a;border-radius:12px;padding:15px;color:#e6f2eb}.sf-preview-label{display:flex;align-items:center;justify-content:space-between;font-size:12px;margin-bottom:10px}.sf-stage{position:relative;width:100%;aspect-ratio:var(--sf-aspect);overflow:hidden;border-radius:6px;background:#172d29}.sf-stage>.fe-card{position:absolute;inset:0;width:100%;height:100%;border-radius:0!important}.sf-transport{display:flex;align-items:center;gap:12px;padding-top:12px}.sf-transport input{flex:1;min-width:30px;accent-color:#9edfbe}.sf-transport output{width:4ch;font-size:12px;font-variant-numeric:tabular-nums}.sf .sf-play{background:#b8e3d0;border:0;color:#123e32}
.sf-settings{display:grid;gap:16px}.sf-box{background:#fff;border:1px solid #dbe3db;border-radius:12px;padding:16px;display:grid;gap:12px}.sf-modes{display:flex;gap:5px}.sf-modes button{flex:1;padding:7px}.sf-note{font-size:12px;color:#60746b}.sf-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sf label{display:grid;gap:5px;font-size:12px;font-weight:650}.sf input[type=number],.sf select{width:100%;min-height:40px;border:1px solid #cad5cb;border-radius:6px;padding:5px 8px;background:#fdfdfa;color:#284c42}.sf input[type=range]{width:100%;min-height:32px;accent-color:#28705c}.sf-actions{display:grid;gap:8px}.sf-status{min-height:1.4em;color:#a15125;font-size:13px}.sf-footer{position:sticky;bottom:-1px;background:#f6f5f0ed;backdrop-filter:blur(8px);border-top:1px solid #d6dfd5;padding-top:14px;display:flex;gap:10px;justify-content:flex-end;align-items:center}.sf-footer .sf-note{margin-right:auto}.sf .sf-save{background:#276b59;color:white;border-color:#276b59;font-weight:700;min-width:160px}.sf-preview-wrap .sf-note{color:#b6cec4}
@media(min-width:851px){.modal-panel.flow-panel{overflow:hidden}.sf{height:calc(100dvh - 24px);grid-template-rows:auto auto minmax(0,1fr) auto auto;gap:12px;padding:20px 26px}.sf-work{min-height:0;overflow:hidden;align-items:stretch}.sf-work>div{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr)}.sf-board{width:min(100%,calc(17vh * var(--sf-aspect)));margin:auto}.sf-preview-wrap{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;margin-top:12px}.sf-preview-stagewrap{container-type:size;min-height:0;display:grid;place-items:center}.sf-stage{width:min(100cqw,calc(100cqh * var(--sf-aspect)))}.sf-settings{overflow:auto;min-height:0;align-content:start}.sf-route button{flex-basis:88px}.sf-status:empty{display:none}}
@media(max-width:850px){.sf-work{grid-template-columns:1fr}.sf-settings{grid-template-columns:1fr 1fr}.sf{padding:20px}.sf-preview-wrap{margin-top:12px}}@media(max-width:520px){.sf{padding:18px 12px;gap:14px}.sf h2{font-size:23px}.sf-settings{grid-template-columns:1fr}.sf-boards{gap:8px}.sf-route button{flex-basis:90px}.sf-footer{flex-wrap:wrap}.sf-footer .sf-note{flex-basis:100%}.sf-preview-wrap{padding:10px}.sf-transport{gap:7px}.sf button{padding:7px 10px}}
`;
const label=it=>it?.t==='text'?String(it.text).slice(0,22):({image:'사진',shape:'도형',art:'꾸밈',emoji:'그림 문자',chart:'차트',math:'수식',link:'연결선'})[it?.t]||'조각';

export function openSlideFlowPanel({slides,at=1,aspect=16/9,onApply,scope='전체 자료'}={}){
  let draft=structuredClone(slides),destination=Math.max(1,Math.min(slides.length-1,at)),mode='link',selected=[null,null],turn=null,raf=0,alive=true,busy=false,previewDone=false,cameraTimer=0;
  const history=[];
  const root=el('section',{class:'sf'}),route=el('nav',{class:'sf-route','aria-label':'모션을 편집할 도착 슬라이드'});
  root.style.setProperty('--sf-aspect',String(aspect));
  const boardHosts=[el('div',{class:'sf-board',dataset:{flowSource:''}}),el('div',{class:'sf-board',dataset:{flowTarget:''}})];
  const caption=[el('span'),el('span')],stage=el('div',{class:'sf-stage',dataset:{flowPreview:''}}),count=el('span'),message=el('p',{class:'sf-status',role:'status'});
  const scrub=el('input',{type:'range',min:0,max:100,value:0,'aria-label':'모핑 전환 위치'}),progress=el('output',{text:'0%'});
  const play=el('button',{class:'sf-play',type:'button',text:'▶ 전환 재생',onClick:()=>playPreview()});
  const connect=el('button',{type:'button',text:'선택한 두 요소 연결',onClick:()=>{
    try{checkpoint();draft=connectFlowItems(draft,destination-1,selected[0],destination,selected[1],newId('m'));draft[destination].tr='move';refresh();message.textContent='두 요소를 연결했어요. 아래에서 움직임을 확인하세요.';}catch(e){message.textContent=e.message;}
  }});
  const disconnect=el('button',{type:'button',text:'고른 도착 요소 연결 끊기',onClick:()=>{
    checkpoint();draft[destination].items=draft[destination].items.map(it=>it.id===selected[1]?{...it,morphKey:'off'}:it);refresh();
  }});
  const auto=el('button',{type:'button',text:'이 두 장 자동 연결로',onClick:()=>{
    checkpoint();for(const p of [destination-1,destination])draft[p].items=draft[p].items.map(({morphKey,...it})=>it);refresh();
  }});
  const linkNote=el('p',{class:'sf-note'});
  const modeButtons=['link','camera'].map((id,i)=>el('button',{type:'button',text:i?'카메라 구도':'요소 연결',onClick:()=>{mode=id;refresh();}}));
  const zoom=el('input',{type:'range',min:1,max:4,step:.05,'aria-label':'카메라 확대'}),zoomLabel=el('span');
  const x=el('input',{type:'number',min:0,max:100,step:1,'aria-label':'카메라 가로 중심'}),y=el('input',{type:'number',min:0,max:100,step:1,'aria-label':'카메라 세로 중심'});
  const duration=el('select',{'aria-label':'모핑 이동 시간'},...[600,1000,1600,2400,3200].map(ms=>el('option',{value:ms,text:(ms/1000)+'초'})));
  const easing=el('select',{'aria-label':'모핑 이동 리듬'},el('option',{value:'smooth',text:'천천히 출발하고 부드럽게 도착'}),el('option',{value:'direct',text:'빠르게 다가와 부드럽게 멈춤'}));
  const cameraNote=el('p',{class:'sf-note'});
  const cameraBox=el('div',{class:'sf-actions'},cameraNote,el('label',{},zoomLabel,zoom),el('div',{class:'sf-fields'},el('label',{},'가로 중심 (%)',x),el('label',{},'세로 중심 (%)',y)),el('button',{type:'button',text:'전체 화면으로',onClick:()=>{checkpoint();delete draft[cameraIndex()].camera;refresh();}}));
  const linkBox=el('div',{class:'sf-actions'},linkNote,connect,disconnect,auto);
  const undo=el('button',{type:'button',text:'되돌리기',onClick:()=>{if(history.length){draft=history.pop();refresh();message.textContent='직전 편집으로 돌아왔어요.';}}});
  const save=el('button',{type:'button',class:'sf-save',text:'자료에 적용·저장',onClick:async()=>{
    if(busy)return;busy=true;stopPreview();save.disabled=true;message.textContent='연결과 카메라 구도를 저장하고 있어요…';
    try{await onApply(structuredClone(draft));if(alive)closeModal();}catch(e){message.textContent=e.message||'저장하지 못했어요. 다시 시도하세요.';}finally{busy=false;save.disabled=false;}
  }});
  root.append(el('style',{text:CSS}),el('header',{},el('p',{class:'sf-kicker',text:'MOTION PATH / 이어지는 장면'}),el('h2',{text:'모핑 · 카메라 편집'}),el('p',{class:'sf-lead',text:'같은 조각을 연결하고, 전체에서 세부로 다가가는 구도를 만드세요. 적용하기 전까지 원래 자료는 그대로예요.'})),route,
    el('div',{class:'sf-work'},el('div',{},el('div',{class:'sf-boards'},...boardHosts.map((board,i)=>el('div',{},el('div',{class:'sf-board-label'},caption[i],el('small',{text:'원래 배치'})),board))),
      el('div',{class:'sf-preview-wrap'},el('div',{class:'sf-preview-label'},el('strong',{text:'실제 전환 미리보기'}),count),el('div',{class:'sf-preview-stagewrap'},stage),el('div',{class:'sf-transport'},play,scrub,progress))),
      el('aside',{class:'sf-settings'},el('div',{class:'sf-box'},el('div',{class:'sf-modes'},...modeButtons),linkBox,cameraBox),el('div',{class:'sf-box'},el('h3',{text:'전환의 리듬'}),el('label',{},'이동 시간',duration),el('label',{},'출발과 도착',easing),el('p',{class:'sf-note',text:'전체 자료의 장 순서대로 연결돼요. 첫 장의 구도는 두 번째 장에서 ‘앞 장 카메라’로 편집하세요.'}),el('button',{type:'button',text:'앞 장 카메라 편집',onClick:()=>{cameraSide=0;mode='camera';refresh();}}),el('button',{type:'button',text:'도착 장 카메라 편집',onClick:()=>{cameraSide=1;mode='camera';refresh();}})))),
    message,el('footer',{class:'sf-footer'},el('span',{class:'sf-note',text:`${scope} · ${slides.length}장`}),undo,el('button',{type:'button',text:'취소',onClick:closeModal}),save));
  let cameraSide=1;
  function checkpoint(){if(history.length>=30)history.shift();history.push(structuredClone(draft));message.textContent='';}
  function cameraIndex(){return destination-1+cameraSide;}
  function camera(){return cleanCamera(draft[cameraIndex()].camera)||{x:50,y:50,z:1};}
  function setCamera(next){
    draft[cameraIndex()].camera=cleanCamera(next);draft[destination].tr='move';cameraFields();
    const c=camera(),w=100/c.z,frame=boardHosts[cameraSide].querySelector('.sf-frame');
    if(frame)Object.assign(frame.style,{left:(c.x-w/2)+'%',top:(c.y-w/2)+'%',width:w+'%',height:w+'%'});
    clearTimeout(cameraTimer);cameraTimer=setTimeout(()=>{if(alive)buildPreview();},80);
  }
  function cameraFields(){const c=camera(),allowed=cameraAllowed(draft[cameraIndex()]);zoom.value=c.z;zoomLabel.textContent=`${cameraSide?'도착':'앞'} 장 · ${c.z.toFixed(2)}배`;x.value=c.x;y.value=c.y;for(const el of [zoom,x,y])el.disabled=!allowed;cameraNote.textContent=allowed?`${cameraSide?'도착':'앞'} 장을 드래그해 중심을 옮기세요. 원래 요소 배치는 유지하고 발표·내려받기의 구도만 바꿔요.`:'활동·영상·웹 화면은 전체 화면으로 실행돼요. 일반 글·도형·사진 슬라이드에서 카메라 구도를 편집할 수 있어요.';}
  for(const input of [zoom,x,y]){input.addEventListener('pointerdown',checkpoint);input.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key))checkpoint();});input.oninput=()=>setCamera({x:Number(x.value),y:Number(y.value),z:Number(zoom.value)});}
  for(const input of [duration,easing])input.onchange=()=>{checkpoint();draft[destination].tr='move';draft[destination].travel={ms:Number(duration.value),ease:easing.value};buildPreview();};
  function stopPreview(){clearTimeout(cameraTimer);cancelAnimationFrame(raf);turn?.finish();turn=null;play.textContent='▶ 전환 재생';}
  function buildPreview(){
    stopPreview();const from=draft[destination-1],to=draft[destination];
    const old=view(from),next=view(to);stage.replaceChildren(old,next);
    turn=playTransition(old,next,'move',1,{from,to,manual:true});turn.seek?.(0);scrub.value=0;progress.textContent='0%';
    previewDone=false;const active=turn;turn.done.then(()=>{if(turn===active)previewDone=true;});
    for(const i of[destination-1,destination]){const thumb=route.children[i]?.querySelector('.fe-card');if(thumb)thumb.replaceWith(view(draft[i]));}
    count.textContent=`${matchItems(from.items,to.items).length}개 요소 연결`;
  }
  function playPreview(){
    buildPreview();const active=turn,started=performance.now();play.textContent='재생 중';active.resume?.();
    const update=()=>{if(!alive||turn!==active)return;const percent=Math.min(100,Math.round((performance.now()-started)/active.ms*100));scrub.value=percent;progress.textContent=percent+'%';if(percent<100)raf=requestAnimationFrame(update);else play.textContent='↻ 다시 재생';};raf=requestAnimationFrame(update);
  }
  scrub.oninput=()=>{const value=Number(scrub.value);cancelAnimationFrame(raf);if(previewDone||!turn?.seek)buildPreview();turn.seek?.(value/100);scrub.value=value;progress.textContent=value+'%';play.textContent='▶ 전환 재생';};
  function view(page){const card=designView(page);card.style.setProperty('--fe-ratio',String(aspect));card.style.aspectRatio=String(aspect);return card;}
  function drawBoards(){
    const pairs=matchItems(draft[destination-1].items,draft[destination].items);
    boardHosts.forEach((host,side)=>{
      const page=draft[destination-1+side];caption[side].textContent=`${side?'도착':'앞'} 장 · ${destination+side}쪽`;
      const card=view({...page,camera:undefined});host.replaceChildren(card);
      [...card.children].filter(n=>n.classList.contains('fi')).forEach((node,i)=>{
        node.classList.toggle('sf-picked',page.items[i].id===selected[side]);node.classList.toggle('sf-linked',pairs.some(pair=>pair[side]===i));
        node.tabIndex=mode==='link'?0:-1;node.setAttribute('role','button');node.setAttribute('aria-label',`${side?'도착':'앞'} 장 ${label(page.items[i])} 선택`);node.setAttribute('aria-pressed',String(page.items[i].id===selected[side]));
        const pick=e=>{if(mode!=='link')return;e.stopPropagation();selected[side]=page.items[i].id;drawBoards();linkFields();if(e.type==='keydown')boardHosts[side].querySelectorAll('.fi')[i]?.focus();};
        node.addEventListener('click',pick);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e);}});
      });
      if(mode==='camera'&&side===cameraSide&&cameraAllowed(page)){
        const c=camera(),w=100/c.z;host.append(el('div',{class:'sf-frame',style:{left:(c.x-w/2)+'%',top:(c.y-w/2)+'%',width:w+'%',height:w+'%'}}));
      }
    });
  }
  boardHosts.forEach((host,side)=>host.addEventListener('pointerdown',e=>{
    if(mode!=='camera'||!cameraAllowed(draft[destination-1+side])||e.button!==0||busy)return;
    cameraSide=side;checkpoint();drawBoards();e.preventDefault();host.setPointerCapture(e.pointerId);
    const box=host.getBoundingClientRect(),move=event=>setCamera({...camera(),x:(event.clientX-box.left)/box.width*100,y:(event.clientY-box.top)/box.height*100});
    const end=()=>{host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',end);host.removeEventListener('pointercancel',end);};host.addEventListener('pointermove',move);host.addEventListener('pointerup',end);host.addEventListener('pointercancel',end);move(e);
  }));
  function linkFields(){const a=draft[destination-1].items.find(it=>it.id===selected[0]),b=draft[destination].items.find(it=>it.id===selected[1]);linkNote.textContent=a||b?`${a?label(a):'앞 장에서 선택'} → ${b?label(b):'도착 장에서 선택'}`:'앞 장과 도착 장에서 같은 역할의 요소를 하나씩 누르세요.';connect.disabled=!a||!b||a.t!==b.t;disconnect.disabled=!b;}
  function refresh(){
    modeButtons.forEach((btn,i)=>btn.setAttribute('aria-pressed',String(mode===(i?'camera':'link'))));linkBox.hidden=mode!=='link';cameraBox.hidden=mode!=='camera';
    route.replaceChildren(...draft.map((page,i)=>el('button',{type:'button','aria-label':`${i+1}쪽으로 이어지는 모션`,disabled:i===0,'aria-current':String(i===destination),onClick:()=>{destination=i;selected=[null,null];cameraSide=1;refresh();}},view(page),el('small',{text:`${i+1}쪽${page.source?.pageNumber?' · 원본 '+page.source.pageNumber:''}`}))));
    const travel=cleanTravel(draft[destination].travel)||{ms:1000,ease:'smooth'};
    if(![...duration.options].some(o=>Number(o.value)===travel.ms))duration.append(el('option',{value:travel.ms,text:travel.ms/1000+'초'}));
    duration.value=travel.ms;easing.value=travel.ease;undo.disabled=!history.length;drawBoards();linkFields();cameraFields();buildPreview();
  }
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!busy)closeModal();e.stopPropagation();});
  openModal(root,{onClose:()=>{alive=false;stopPreview();}});root.parentElement.classList.add('flow-panel');refresh();
  return {close:()=>{if(alive)closeModal();}};
}
