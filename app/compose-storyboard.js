import {cleanComposeRequest, COMPOSE_LIMITS} from '../src/ai-compose.js';

export const cutNames = ['도입', '전환점', '마무리'];
export function anchorPositions(count) {
  return [0, Math.floor((count-1)/2), count-1];
}
function designNotes(page) {
  const headline=page.items.filter(it=>it.t==='text').reduce((largest,it)=>
    !largest||it.size>largest.size?it:largest,null);
  // Only native asset IDs and authoring data go to the AI service. Image URLs
  // and original uploads stay in the editor.
  return {
    title:page.title, bg:page.bg, tr:page.tr,
    headline:headline && {x:headline.x,y:headline.y,w:headline.w,size:headline.size},
    copy:page.items.filter(it=>it.t==='text').map(it=>it.text).join(' / ').slice(0,360),
    speech:page.notes.slice(0,240),
    fonts:[...new Set(page.items.map(it=>it.font).filter(Boolean))],
    ink:[...new Set(page.items.map(it=>it.color).filter(Boolean))],
    visuals:page.items.filter(it=>it.t==='image'||it.morphKey||it.t==='shape').map(it=>({
      subject:it.asset||it.shape||it.text?.slice(0,30), key:it.morphKey, x:it.x, y:it.y,w:it.w,h:it.h,
      enter:it.an, wait:it.aw, idle:it.lp
    }))
  };
}

export function storyboardRequest(board, wish='') {
  const {base,phase,index}=board, positions=anchorPositions(base.count);
  const missing=Array.from({length:base.count},(_,i)=>i).filter(i=>!positions.includes(i));
  let count, instruction;
  if (phase==='anchors') {
    count=3;
    instruction=`전체 ${base.count}장 발표 중 ${positions.map(i=>i+1).join(', ')}장에 들어갈 도입·전환점·마무리만 순서대로 제작한다. 도입은 구체적인 질문이나 장면, 전환점은 달라지는 대상이나 근거, 마무리는 청중이 가져갈 행동이나 한 문장으로 구성한다. 같은 시각 소재가 세 컷에서 어떻게 변하는지 보여 준다. 전체 발표 제목을 붙인다.`;
  } else if(phase==='revise') {
    count=1;
    instruction=`${base.count}장 발표의 ${positions[index]+1}장(${cutNames[index]}) 한 컷만 다시 디자인한다. 주변 컷과 이어지는 글꼴·색·공유 객체와 발화 흐름을 살리고, 아래 수정 요청을 우선한다.\n수정 요청: ${wish}`;
  } else {
    count=missing.length;
    instruction=`전체 ${base.count}장 중 이미 확정한 세 컷 사이를 채운다. 지금 반환할 페이지 번호는 ${missing.map(i=>i+1).join(', ')}이다. 이 순서로 정확히 ${count}장만 만든다. 확정한 컷을 반복하지 않는다. 앞뒤 논지와 발화가 자연스럽게 이어지도록 원고의 남은 내용을 배분한다. 확정한 글꼴·팔레트·사진·박자를 따르고 같은 대상을 이어갈 때만 같은 morphKey를 쓴다.`;
  }
  const anchors=board.prior?.ops.map((page,i)=>({page:positions[i]+1,role:cutNames[i],
    pace:board.together?.[i]?'클릭 한 번에 함께 공개':undefined,...designNotes(page)}));
  // Split across the existing production compose fields. Preserve the author's
  // full source even when it occupies the entire reference allowance.
  const brief=base.prompt, source=base.reference;
  const capacity=COMPOSE_LIMITS.prompt+COMPOSE_LIMITS.reference;
  let notes=anchors ? JSON.stringify(anchors) : '';
  if(anchors && instruction.length+notes.length+brief.length+source.length+8>capacity){
    notes=JSON.stringify(anchors.map(({page,title,bg,fonts,ink,visuals,pace,headline})=>({page,title,bg,fonts,ink,pace,headline,
      objects:visuals.filter(v=>v.key||v.subject?.startsWith('photo')).map(v=>[v.subject,v.key])})));
  }
  const direction=[instruction,brief,notes].filter(Boolean).join('\n\n');
  // Keep the original manuscript together in the reference field. Only split
  // the design brief, preferring a paragraph/word boundary where space allows.
  let split=Math.min(COMPOSE_LIMITS.prompt,direction.length);
  if(split<direction.length){
    const boundary=direction.slice(0,split).search(/\s\S*$/u);
    if(boundary>0 && direction.length-boundary+source.length+2<=COMPOSE_LIMITS.reference)split=boundary;
    if(/[\uD800-\uDBFF]/u.test(direction.charAt(split-1)))split--;
  }
  const prompt=direction.slice(0,split),reference=[direction.slice(split).trim(),source].filter(Boolean).join('\n\n');
  if(reference.length>COMPOSE_LIMITS.reference)throw Error('원고와 세 컷 정보를 함께 보낼 공간이 부족해요. 전체 한 번에 만들기를 이용하거나 원고를 줄여 주세요. 질문권은 사용하지 않았어요.');
  return cleanComposeRequest({...base,count,prompt,reference});
}

export function assembleStoryboard(board, result, review) {
  const positions=anchorPositions(board.base.count);
  const together=board.together||[false,false,false];
  if(board.phase==='anchors')return {result,review,together, board:{base:board.base}};
  if(board.phase==='revise') {
    const ops=board.prior.ops.slice();
    ops[board.index]=result.ops[0];
    const updated=(board.review||[]).filter(n=>n!==board.index+1);
    if(review.length)updated.push(board.index+1);
    return {result:{...board.prior,ops},review:updated,together,board:{base:board.base}};
  }
  let next=0;
  const flags=[], warnings=[];
  const ops=Array.from({length:board.base.count},(_,i)=>{
    const cut=positions.indexOf(i);
    flags[i]=cut>=0 ? !!together[cut] : together.every(Boolean);
    if(cut>=0){
      if(board.review?.includes(cut+1))warnings.push(i+1);
      return board.prior.ops[cut];
    }
    if(review.includes(next+1))warnings.push(i+1);
    return result.ops[next++];
  });
  return {result:{...result,title:board.prior.title,ops},review:warnings,together:flags};
}
