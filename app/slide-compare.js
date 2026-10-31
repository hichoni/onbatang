import {el} from '../src/dom.js';

// The two hosts supply a static preview for each visible page. Only the selected
// pair is mounted, even when a large PPT spans several storage parts.
export function openSlideCompare(root, {pages, current, preview, memory = {}, onClose, onCurtain}) {
  if (pages.length < 2) return null;
  const button = (text, onclick) => el('button', {type:'button', text, onclick});
  const dialog = el('dialog', {class:'ob-compare', 'aria-label':'두 장 비교'});
  const byKey = new Map(pages.map(page => [page.key,page]));
  const at = pages.findIndex(page => page.index >= current);
  const rightIndex = at < 0 ? pages.length - 1 : Math.max(1,at);
  const anchor = pages.find(page => page.index === current)?.key ?? current;
  if (memory.anchor !== anchor || !byKey.has(memory.left) || !byKey.has(memory.right)) {
    Object.assign(memory, {anchor, left:pages[rightIndex-1].key, right:pages[rightIndex].key, position:50, mode:'wipe', marks:[]});
  }
  const select = (name, side) => {
    const node = el('select', {'aria-label':name}, pages.map(page => el('option', {value:page.key, text:page.label})));
    node.value = memory[side];
    node.onchange = () => {
      const other = side === 'left' ? 'right' : 'left';
      if (node.value === memory[other]) memory[other] = memory[side];
      memory[side] = node.value;
      memory.position = 50; memory.marks = [];
      renderPair();
    };
    return node;
  };
  const left = select('기준 장','left'), right = select('비교할 장','right');
  const layers = [el('div',{class:'obc-layer'}), el('div',{class:'obc-layer'})];
  layers.forEach(node => { node.inert = true; });
  const seam = el('span',{class:'obc-seam','aria-hidden':'true'}, el('b',{text:'‹ ›'}));
  const badges = [el('span',{class:'obc-badge first'}),el('span',{class:'obc-badge second'})];
  const stage = el('div',{class:'obc-stage',role:'img'}, ...layers,seam,...badges);
  const range = el('input',{type:'range',min:0,max:100,step:1,'aria-label':'비교 위치'});
  const reading = el('output',{class:'obc-value'});
  const status = el('span',{class:'obc-status',role:'status'});
  const modes = [['wipe','커튼'],['blend','포개기'],['side','나란히']].map(([id,label])=>{
    const b = button(label,()=>{memory.mode=id;paint();}); b.dataset.mode=id;return b;
  });
  const marks = el('div',{class:'obc-marks','aria-label':'기억한 비교 위치'});
  const remember = button('이 위치 기억',()=>{
    if (memory.marks.includes(memory.position) || memory.marks.length >= 3) return;
    memory.marks.push(memory.position); renderMarks(); paint();
    status.textContent = memory.marks.length+'번 위치를 기억했어요.';
  });
  const clear = button('위치 지우기',()=>{memory.marks=[];renderMarks();paint();status.textContent='기억한 위치를 지웠어요.';});
  const foot = el('div',{class:'obc-foot'},range,reading,remember,marks,clear);
  let closed=false;
  function dismiss() {
    if(closed)return;
    closed=true;
    dialog.close();dialog.remove();onClose?.();
  }
  const close = button('비교 닫기',dismiss);
  const guide = el('span',{});
  dialog.append(el('style',{text:STYLE}),el('div',{class:'obc-shell'},
    el('header',{class:'obc-head'},el('div',{},el('small',{text:'온바탕 관찰실'}),el('h2',{text:'두 장 비교'})),close),
    el('div',{class:'obc-tools'},el('label',{},'기준 장',left),el('label',{},'비교할 장',right),
      el('div',{class:'obc-modes',role:'group','aria-label':'보기 방식'},...modes)),stage,foot,
    el('div',{class:'obc-guide'},guide,status)));
  function paint() {
    const side = memory.mode === 'side';
    stage.dataset.mode = memory.mode;
    stage.style.setProperty('--cut',memory.position+'%');
    stage.style.setProperty('--mix',String(memory.position/100));
    for (const b of modes) b.setAttribute('aria-pressed',String(b.dataset.mode===memory.mode));
    foot.hidden = side;
    guide.textContent = side ? '두 장의 같은 부분을 찾아보세요. 좁은 화면에서는 위아래로 보여요.'
      : (memory.mode==='blend'?'밀어서 비교할 장의 진하기를 바꿔 보세요.':'경계선을 밀어서 달라진 곳을 찾아보세요.')+' 이 두 장의 위치를 세 곳까지 기억해요.';
    range.value = memory.position;
    range.setAttribute('aria-label',memory.mode==='blend'?'비교할 장의 불투명도':'커튼 위치');
    reading.textContent = memory.position+'%';
    remember.disabled = memory.marks.length>=3 || memory.marks.includes(memory.position);
    clear.hidden = !memory.marks.length;
    for (const b of marks.children) b.setAttribute('aria-pressed',String(Number(b.dataset.position)===memory.position));
  }
  function move(value) {
    memory.position = Math.max(0,Math.min(100,Math.round(value)));paint();
  }
  function renderMarks() {
    marks.replaceChildren(...memory.marks.map((v,i)=>{
      const b=button((i+1)+'번 · '+v+'%',()=>move(v));b.dataset.position=v;return b;
    }));
  }
  function renderPair() {
    [left.value,right.value]=[memory.left,memory.right];
    for (const [i,key] of [memory.left,memory.right].entries()) {
      const page=byKey.get(key);
      const sheet=el('div',{class:'obc-sheet'},preview(page.index));
      sheet.style.setProperty('--paper',String(page.ratio));
      layers[i].replaceChildren(sheet);
      layers[i].dataset.page=String(page.index+1);
      badges[i].textContent=(i?'비교':'기준')+' · '+(page.index+1)+'쪽';
    }
    stage.setAttribute('aria-label',badges.map(b=>b.textContent).join(', '));
    renderMarks();paint();status.textContent='';
  }
  range.oninput=()=>move(Number(range.value));
  const slideAt=e=>{const r=stage.getBoundingClientRect();if(r.width)move((e.clientX-r.left)*100/r.width);};
  stage.onpointerdown=e=>{
    if (memory.mode==='side'||!e.isPrimary||e.button!==0) return;
    e.preventDefault();stage.setPointerCapture(e.pointerId);slideAt(e);
  };
  stage.onpointermove=e=>{if(stage.hasPointerCapture(e.pointerId))slideAt(e);};
  function step(dir) {
    if (memory.mode==='side') return;
    const ordered = [...new Set([0,...memory.marks,100])].sort((a,b)=>a-b);
    const stop = dir>0 ? ordered.find(v=>v>memory.position) : ordered.reverse().find(v=>v<memory.position);
    move(memory.marks.length ? stop??memory.position : memory.position+dir*10);
  }
  dialog.onkeydown=e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Escape'||(e.code==='KeyD'&&!e.target.matches('select'))){e.preventDefault();dismiss();}
    else if(onCurtain&&!e.target.matches('select')&&['KeyB','KeyW'].includes(e.code)){e.preventDefault();onCurtain(e.code==='KeyB'?'black':'white');}
    else if(['PageUp','PageDown'].includes(e.key)){e.preventDefault();step(e.key==='PageDown'?1:-1);}
    else if(!e.target.matches('input,select')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowRight'?1:-1);}
    e.stopPropagation();
  };
  for(const type of ['click','pointerdown','pointerup'])dialog.addEventListener(type,e=>e.stopPropagation());
  dialog.oncancel=e=>{e.preventDefault();dismiss();};
  dialog.onclose=dismiss;
  renderPair();root.append(dialog);dialog.showModal();
  return {close:dismiss,step};
}

const STYLE = `
.ob-compare{--mint:#a8f0cf;box-sizing:border-box;position:fixed;inset:0;width:min(1220px,96vw);height:min(880px,94dvh);max-width:100%;max-height:100%;margin:auto;padding:0;border:1px solid #516263;border-radius:16px;background:#152529;color:#f3f4e9;font:500 15px/1.4 system-ui,sans-serif;text-align:start;cursor:auto;color-scheme:dark}
.ob-compare::backdrop{background:#061113dd}.ob-compare *{box-sizing:border-box}.ob-compare [hidden]{display:none!important}
.obc-shell{height:100%;display:grid;grid-template-rows:auto auto minmax(100px,1fr) auto auto;gap:12px;padding:clamp(10px,2.5vw,28px);overflow:auto}
.obc-head,.obc-tools,.obc-foot,.obc-guide,.obc-marks,.obc-modes{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.obc-head,.obc-guide{justify-content:space-between}.obc-head{border:0;padding:0}.obc-head small{color:var(--mint);font-size:12px;letter-spacing:.12em}.obc-head h2{font:750 clamp(20px,3vw,34px)/1.2 system-ui;margin:2px 0 0;color:#f4f2df}
.ob-compare button,.ob-compare select{font:650 14px/1.2 system-ui;min-height:42px;border:1px solid #627679;border-radius:8px;background:#22363a;color:#f4f4e9;padding:7px 12px;cursor:pointer}.ob-compare button:disabled{opacity:.45}.ob-compare button[aria-pressed=true]{background:var(--mint);color:#12332c;border-color:var(--mint)}
.ob-compare :focus-visible{outline:3px solid #ffce7d;outline-offset:2px}.obc-tools label{display:grid;gap:3px;min-width:0;flex:1;font:600 12px system-ui;color:#b8d0c7}.obc-tools select{min-width:0;width:100%}
.obc-stage{position:relative;isolation:isolate;min-height:100px;overflow:hidden;background:#0a1619;border-radius:8px;touch-action:none;user-select:none;cursor:ew-resize}
.obc-layer{position:absolute;inset:0;display:grid;place-items:center;container-type:size;overflow:hidden;pointer-events:none;background:#0a1619}
.obc-sheet{aspect-ratio:var(--paper);width:min(100cqw,calc(100cqh * var(--paper)));min-width:0;overflow:hidden}
.obc-sheet>*{display:block;width:100%;height:100%;object-fit:contain;--fe-card-radius:0}
.obc-stage[data-mode=wipe] .obc-layer:nth-child(2){clip-path:inset(0 0 0 var(--cut))}
.obc-stage[data-mode=blend] .obc-layer:nth-child(2){opacity:var(--mix)}
.obc-stage[data-mode=side]{cursor:default;touch-action:pan-y}
.obc-stage[data-mode=side] .obc-layer:first-child{right:50%;border-right:1px solid #566c6e}.obc-stage[data-mode=side] .obc-layer:nth-child(2){left:50%}
.obc-seam{display:none;position:absolute;top:0;bottom:0;left:clamp(1px,var(--cut),calc(100% - 1px));width:2px;background:var(--mint);box-shadow:0 0 3px #11252b;pointer-events:none}.obc-stage[data-mode=wipe] .obc-seam{display:block}
.obc-seam b{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:2px 7px;border-radius:20px;background:var(--mint);color:#142b2c;white-space:nowrap;font-size:18px}
.obc-badge{position:absolute;pointer-events:none;top:6px;padding:3px 8px;border:1px solid #829994;border-radius:5px;background:#142628e8;color:#fff;font:650 11px system-ui}.obc-badge.first{left:6px}.obc-badge.second{right:6px}
@media(max-width:620px){.obc-stage[data-mode=side] .obc-badge.second{top:calc(50% + 6px);left:6px;right:auto}}
.obc-foot input{flex:1;min-width:100px;accent-color:var(--mint);min-height:42px;padding:0}.obc-value{min-width:4ch;text-align:end;font-variant-numeric:tabular-nums}.obc-guide{color:#b8cbc9;font-size:13px}
@media(max-width:620px){.ob-compare{width:100vw;height:100dvh;border-radius:0}.obc-shell{gap:8px}.obc-tools{display:grid;grid-template-columns:1fr 1fr}.obc-modes{grid-column:1/-1}.obc-modes button{flex:1}.obc-stage[data-mode=side] .obc-layer:first-child{inset:0 0 50%;border:0;border-bottom:1px solid #566c6e}.obc-stage[data-mode=side] .obc-layer:nth-child(2){inset:50% 0 0}.obc-guide{font-size:12px}}
@media(max-height:480px){.ob-compare{height:100dvh;width:100vw;border-radius:0}.obc-shell{padding:6px 10px;gap:4px}.obc-head small,.obc-guide{display:none}.obc-head h2{font-size:19px}.obc-tools label{display:flex;align-items:center;white-space:nowrap}.obc-head button,.obc-tools select,.obc-modes button{min-height:32px}}
`;
