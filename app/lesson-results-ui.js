import {el,openModal,closeModal} from './ui.js';
import {cleanReturnedResults,inspectReturnedResults,planReturnedResults} from './lesson-results.js';
export function openLessonResults({snapshot,onSave}){
 let packet,rows=[],busy=false,closed=false,generation=0;
 const status=el('p',{role:'status','aria-live':'polite'}),list=el('div',{class:'lesson-return-list'});
 const file=el('input',{type:'file',accept:'.json,application/json','aria-label':'온바탕용 결과 JSON 파일'});
 const apply=el('button',{class:'btn btn-primary',type:'button',disabled:true},'선택한 결과 저장');
 const cancel=el('button',{class:'btn',type:'button',onClick:()=>{if(!busy)closeModal();}},'취소');
 const box=el('section',{class:'lesson-return',role:'dialog','aria-modal':'true','aria-label':'HTML 수업 결과 가져오기'},
  el('h2',{},'HTML 수업 결과 가져오기'),el('p',{},'HTML 수업에서 「온바탕용 결과 내려받기」로 저장한 JSON 파일을 선택하세요. 원래 슬라이드와 앱은 그대로 두고 결과만 추가해요.'),file,status,list,
  el('div',{class:'lesson-return-actions'},cancel,apply));
 const selected=()=>rows.filter(row=>row.input.checked&&!row.duplicate).map(row=>row.result.id);
 const sync=()=>{apply.disabled=busy||!selected().length;};
 file.addEventListener('change',async()=>{
  const run=++generation;packet=null;rows=[];list.replaceChildren();sync();const input=file.files[0];if(!input)return;
  try{
   if(input.size>20_000_000)throw Error('결과 파일은 20MB까지 가져올 수 있어요.');
   status.textContent='원래 활동과 결과를 확인하고 있어요…';
   const parsed=cleanReturnedResults(JSON.parse(await input.text())),checked=await inspectReturnedResults(parsed,snapshot());
   for(const row of checked.rows){const image=new Image();image.src=row.result.image;await image.decode();if(closed||run!==generation)return;}
   if(closed||run!==generation)return;packet=parsed;
   rows=checked.rows.map(row=>{
    const input=el('input',{type:'checkbox',checked:!row.duplicate,disabled:row.duplicate,'aria-label':`${row.title} 결과 ${row.result.id}`});input.addEventListener('change',sync);
    list.append(el('label',{class:'lesson-return-row'},input,el('img',{src:row.result.image,alt:`${row.title} 결과 미리보기`}),el('span',{},el('strong',{},row.title),el('span',{},row.duplicate?'이미 저장한 결과':row.result.answer||'그림 결과'))));return {...row,input};
   });status.textContent=`${packet.title} · ${rows.length}개 결과 · 이미 저장한 결과 ${rows.filter(r=>r.duplicate).length}개`;sync();
  }catch(error){if(!closed&&run===generation)status.textContent=`가져오지 않았어요. ${error.message||'파일 형식을 확인해주세요.'} 원본은 그대로예요.`;}
 });
 apply.addEventListener('click',async()=>{
  if(busy||!packet||!selected().length)return;busy=true;sync();file.disabled=cancel.disabled=true;
  const closeButton=box.parentElement?.querySelector('.modal-close');if(closeButton)closeButton.disabled=true;
  try{
   const basis=snapshot(),plan=await planReturnedResults(packet,{...basis,selected:selected()});
   await onSave({...plan,expectedDocuments:basis.records});closeModal();
  }catch(error){status.textContent=`저장하지 못했어요. ${error.message} 원본과 이전 저장본은 그대로예요.`;}
  finally{busy=false;if(!closed){file.disabled=cancel.disabled=false;if(closeButton)closeButton.disabled=false;sync();}}
 });
 const trap=event=>{
  if(event.key==='Escape'){event.preventDefault();if(!busy)closeModal();}
  if(event.key==='Tab'){const focus=[...box.parentElement.querySelectorAll('button,input')].filter(n=>!n.disabled);const at=focus.indexOf(document.activeElement);if(event.shiftKey&&at<=0){event.preventDefault();focus.at(-1)?.focus();}else if(!event.shiftKey&&at===focus.length-1){event.preventDefault();focus[0]?.focus();}}
 };
 openModal(box,{wide:true,onClose:()=>{closed=true;generation++;}});
 box.parentElement.addEventListener('keydown',trap);
 const backdrop=box.parentElement.parentElement;backdrop.addEventListener('click',event=>{if(busy&&event.target===backdrop){event.preventDefault();event.stopImmediatePropagation();}},true);file.focus();
}
