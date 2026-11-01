import {el} from './dom.js';
import {cleanMotionCues,MAX_MOTION_CUES,MOTION_CUE_LABEL_LENGTH} from './motion-cues.js';

export function motionCueEditor(initial,{getProgress,onChange,onSeek,defaults}) {
  let cues=cleanMotionCues(initial);
  const rows=el('ol',{class:'obs-cue-rows'});
  const add=el('button',{type:'button',text:'지금 순간 담기'});
  const reset=el('button',{type:'button',text:'기본 순서로'});
  const node=el('details',{class:'obs-author'},
    el('summary',{text:'관찰 순서 만들기'}),
    el('p',{text:'시간 막대를 움직여 최대 6개 순간을 담고, 보여 줄 순서대로 배치하세요.'}),
    el('div',{class:'obs-author-actions'},add,reset),rows);
  function notify(){onChange(cleanMotionCues(cues));refresh();}
  function draw(){
    rows.replaceChildren(...cues.map(([at,label],index)=>{
      const name=el('input',{type:'text',value:label,maxlength:MOTION_CUE_LABEL_LENGTH,
        'aria-label':(index+1)+'번 관찰 이름'});
      name.oninput=()=>{cues[index][1]=name.value;notify();};
      const jump=el('button',{type:'button',text:at+'%','aria-label':(index+1)+'번 관찰로 이동',
        onClick:()=>onSeek(at/100)});
      const move=delta=>{
        [cues[index],cues[index+delta]]=[cues[index+delta],cues[index]];
        draw();notify();
        rows.children[index+delta].querySelector('input').focus({preventScroll:true});
      };
      const back=el('button',{type:'button',text:'↑',disabled:index===0,
        'aria-label':(index+1)+'번 관찰 앞으로',onClick:()=>move(-1)});
      const next=el('button',{type:'button',text:'↓',disabled:index===cues.length-1,
        'aria-label':(index+1)+'번 관찰 뒤로',onClick:()=>move(1)});
      const remove=el('button',{type:'button',text:'×',disabled:cues.length===1,
        'aria-label':(index+1)+'번 관찰 삭제',onClick:()=>{
          cues.splice(index,1);draw();notify();
          rows.children[Math.min(index,cues.length-1)].querySelector('input').focus({preventScroll:true});
        }});
      return el('li',{},jump,name,el('span',{class:'obs-cue-actions'},back,next,remove));
    }));
  }
  function refresh(){
    const at=Math.round(getProgress()*100);
    add.disabled=cues.length>=MAX_MOTION_CUES || cues.some(row=>row[0]===at);
    add.textContent=cues.length>=MAX_MOTION_CUES?'6개 순간을 담았어요':'지금 순간 담기 · '+at+'%';
  }
  add.onclick=()=>{
    cues.push([Math.round(getProgress()*100),'관찰 '+(cues.length+1)]);
    draw();notify();rows.lastChild.querySelector('input').focus({preventScroll:true});
  };
  reset.onclick=()=>{cues=cleanMotionCues(defaults);draw();notify();};
  draw();refresh();
  return {node,refresh};
}
