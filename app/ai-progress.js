import {el} from './ui.js';
export function aiProgress(O,{leave,home}){
 const title=el('h2'),message=el('p'),steps=el('ol',{class:'onba-ai-steps'},...['요청 보관','제작 대기','구성·디자인','결과 확인'].map(text=>el('li',{text})));
 const retry=el('button',{class:'btn',type:'button',hidden:true},'연결 확인하고 이어받기');
 const node=el('section',{class:'onba-ai-lock',hidden:true,'aria-label':'AI-G 제작 진행',tabindex:'-1'},
  el('div',{class:'onba-ai-orbit','aria-hidden':'true'},'✦'),title,steps,message,
  el('p',{text:'완성될 때까지 이 발표의 편집을 잠가요. 다른 화면을 다녀와도 접수한 제작은 계속됩니다.'}),
  el('div',{class:'onba-ai-nav'},el('button',{class:'btn',type:'button',onClick:leave},'내 그림으로 나가기'),home&&el('button',{class:'btn btn-primary',type:'button',onClick:home},'연구소 홈으로 나가기'),retry));
 O.shell.querySelector('.cv-work').append(node);let previous=[];
 const guard=e=>{if(O.aiWorking&&e.key!=='Tab'&&!e.target.closest?.('.onba-ai-lock button,.cv-back,.cv-brand-link,.onba-ai-task button')){e.preventDefault();e.stopImmediatePropagation();}};
 document.addEventListener('keydown',guard,true);
 function restore(){for(const [n,value] of previous)n.inert=value;previous=[];}
 return {update(state,again){
  const busy=state?.state==='pending',was=!!O.aiWorking;O.aiWorking=busy;node.hidden=!busy;O.shell.classList.toggle('ai-working',busy);
  if(busy&&!was){
   O.editor.quiet();
   const nodes=O.shell.querySelectorAll('.cv-side,.cv-strip,.cv-properties,.cv-work>:not(.onba-ai-lock),.cv-bar input,.cv-bar button:not(.cv-back):not(.cv-brand-link),.cv-document-menu');
   previous=[...nodes].map(n=>[n,n.inert]);for(const [n] of previous)n.inert=true;node.focus({preventScroll:true});
  }else if(!busy&&was)restore();
  title.textContent=state?.input?.task==='polish'?'AI-G가 발표를 다듬고 있어요':'AI-G가 발표를 만들고 있어요';message.textContent=busy?(state?.message||''):'';
  const at={preparing:0,planning:1,building:2,reviewing:3}[state?.stage]??0;
  [...steps.children].forEach((n,i)=>{n.dataset.current=String(i===at);n.dataset.done=String(i<at);});
  retry.hidden=!state?.error;retry.onclick=again;
 },destroy(){restore();O.aiWorking=false;document.removeEventListener('keydown',guard,true);node.remove();}};
}
